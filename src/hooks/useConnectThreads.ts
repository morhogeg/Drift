import { useState, useRef, useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import { haptics } from '../lib/haptics'
import type { DriftLabels } from '../lib/driftPanel'
import type { Message } from '../components/DriftPanel'
import type { LensKey } from '../types/chat'

interface ConnectThreadsDeps {
  /** Whether the panel is open (gates the notify-parent effect). */
  isOpen: boolean
  /** One-tap workflow type — Connect logic only runs when this is `'connect'`. */
  templateType?: LensKey
  /** The term the drift is exploring (one side of every bridge). */
  selectedText: string
  /** Localized drift scaffolding — supplies the bridge-question phrasing. */
  driftLabels: DriftLabels
  /** The drift-only conversation (the source the card parser / chip sync read). */
  driftOnlyMessages: Message[]
  /** Whether a request is streaming — the parser waits until it settles. */
  isTyping: boolean
  /** Restore Connect to a previously active bridge question (breadcrumb nav). */
  initialConnectQuestion?: string | null
  /** Restore the Connect chips so they don't need re-fetching from AI. */
  initialConnectCards?: string[]
  /** Restore the visited-question answer cache so re-tapping a chip skips the LLM. */
  initialConnectAnswers?: Record<string, Message[]>
  /** Lets App.tsx persist the active question + chips for navigation. */
  onConnectStateChange?: (question: string | null, cards: string[] | null) => void
  /** Lets App.tsx persist a cached chip conversation to driftInfos. */
  onConnectAnswerSaved?: (question: string, messages: Message[]) => void
  setMessages: Dispatch<SetStateAction<Message[]>>
  setDriftOnlyMessages: Dispatch<SetStateAction<Message[]>>
  /** Shared auto-send guard — openConnectThread arms/disarms it like the panel does. */
  autoSentRef: MutableRefObject<boolean>
}

/**
 * Connect-mode logic for DriftPanel, extracted verbatim. Owns the Connect state
 * (chips, active bridge question, visited-answer cache) and exposes:
 *  • `bridgeQuestion` — frame the link between the term and a concept; doubles as
 *    the displayed label and the prompt sent to the model.
 *  • `openConnectThread` — open (or restore from cache) a focused thread for a
 *    bridge question.
 *  • `initConnectState` — reset/restore the Connect cluster on each panel open
 *    (called from the panel's init effect); also arms the stale-card-parse skip.
 *
 * Carries the subtle stale-render guards (`skipStaleCardParseRef` + the
 * `!raw.startsWith('[')` prose guard) that keep card parsing from keying a
 * previous thread's JSON onto the newly-selected term — comments preserved
 * verbatim. The chip-session ref + persist-on-return effect cache each visited
 * bridge so re-tapping a chip never re-fetches.
 *
 * Behavior-preserving: panel-owned message setters + the shared auto-send guard
 * are passed in via deps so the functions read/write exactly what the inline
 * implementation did.
 */
export function useConnectThreads({
  isOpen,
  templateType,
  selectedText,
  driftLabels,
  driftOnlyMessages,
  isTyping,
  initialConnectQuestion,
  initialConnectCards,
  initialConnectAnswers,
  onConnectStateChange,
  onConnectAnswerSaved,
  setMessages,
  setDriftOnlyMessages,
  autoSentRef,
}: ConnectThreadsDeps) {
  const [connectCards, setConnectCards] = useState<string[] | null>(null)
  const [connectQuestion, setConnectQuestion] = useState<string | null>(null)
  const connectAnswersRef = useRef<Map<string, Message[]>>(new Map())
  // When the panel re-initializes for a new thread (term switch / lens switch),
  // `driftChatId` flips immediately but the PREVIOUS thread's `driftOnlyMessages`
  // linger in state for one render until the init effect's queued reset commits.
  // The Connect-card parser must not parse that stale render's JSON — doing so
  // keys the previous drift's cards onto the newly-selected term (the "Connect
  // shows the wrong drift" bug). The init effect arms this flag so the parser
  // skips exactly that one stale pass; it clears once consumed.
  const skipStaleCardParseRef = useRef(false)
  const [connectVisitedVersion, setConnectVisitedVersion] = useState(0)
  /** Tracks the active chip session {question, messages} via ref so it survives React batching. */
  const chipSessionRef = useRef<{ question: string; messages: Message[] } | null>(null)

  // Reset/restore the Connect cluster for a fresh panel open. Arms the
  // stale-parse skip (the about-to-be-reset messages may still hold the previous
  // thread's Connect JSON for one render — see parser below), then restores any
  // cached chips / visited answers passed down for breadcrumb navigation.
  const initConnectState = () => {
    skipStaleCardParseRef.current = true
    connectAnswersRef.current = initialConnectAnswers
      ? new Map(Object.entries(initialConnectAnswers))
      : new Map()
    chipSessionRef.current = null
    setConnectCards(initialConnectCards != null ? initialConnectCards : null)
    setConnectQuestion(initialConnectQuestion != null ? initialConnectQuestion : null)
  }

  // Notify parent whenever Connect state changes so it can persist for navigation
  useEffect(() => {
    if (isOpen && templateType === 'connect') {
      onConnectStateChange?.(connectQuestion, connectCards)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectQuestion, connectCards, isOpen])

  // Parse Connect AI response into cards once streaming finishes (only in chips mode)
  useEffect(() => {
    if (templateType !== 'connect') return
    // Stale-window guard: when switching terms/lenses, this effect can fire on the
    // render where driftChatId already points at the NEW thread but
    // driftOnlyMessages still holds the PREVIOUS thread's streamed JSON (the init
    // effect's reset is queued, not yet committed). Parsing that would key the
    // previous drift's cards onto the newly-selected term — the "Connect shows the
    // wrong drift" bug. The init effect arms a skip for exactly that stale pass;
    // we consume it here (before the isTyping/question early-returns) so it can
    // never linger and swallow the next thread's legitimate first parse.
    if (skipStaleCardParseRef.current) {
      skipStaleCardParseRef.current = false
      return
    }
    if (isTyping || connectQuestion) return
    const aiMsg = driftOnlyMessages.find(m => !m.isUser && !m.id.startsWith('drift-system-'))
    if (!aiMsg?.text) return
    const raw = aiMsg.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    // Only treat this as connect cards if it actually looks like a JSON array. When
    // switching lenses (Connect → Deep dive → Connect), this effect can fire on a
    // render where driftOnlyMessages still holds the PREVIOUS lens's prose answer;
    // parsing that and wiping to [] is what caused "No connections found" after the
    // cards had already been restored. Prose → leave the restored cards intact.
    if (!raw.startsWith('[')) return
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setConnectCards(parsed.filter((x: unknown) => typeof x === 'string').slice(0, 5))
      }
    } catch {
      // Malformed JSON — keep whatever cards we have rather than blanking the view.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateType, isTyping, driftOnlyMessages, selectedText])

  // Keep chipSessionRef in sync with the active chip conversation in real-time.
  // Using a ref (not state) means React batching can't lose the messages before we save them.
  useEffect(() => {
    if (connectQuestion !== null && driftOnlyMessages.length > 0) {
      chipSessionRef.current = { question: connectQuestion, messages: driftOnlyMessages }
    }
  }, [driftOnlyMessages, connectQuestion])

  // A bridge question frames the connection between the term and a concept —
  // it doubles as the displayed label and the prompt sent to the model.
  const bridgeQuestion = (concept: string) => driftLabels.bridge(selectedText, concept)

  // Open (or restore) a focused Connect thread for a given question/bridge.
  const openConnectThread = (question: string) => {
    haptics.selection()
    const cached = connectAnswersRef.current.get(question)
    setConnectQuestion(question)
    if (cached) {
      autoSentRef.current = true
      setMessages(cached)
      setDriftOnlyMessages(cached)
    } else {
      autoSentRef.current = false
      const systemMsg: Message = { id: 'drift-system-' + Date.now(), text: question, isUser: false, timestamp: new Date() }
      setMessages([systemMsg])
      setDriftOnlyMessages([systemMsg])
    }
  }

  // When returning to chips view (connectQuestion → null), persist the last chip session.
  // This fires after React commits the batch, so we read from the ref which was already updated.
  useEffect(() => {
    if (connectQuestion === null && chipSessionRef.current) {
      const { question, messages } = chipSessionRef.current
      chipSessionRef.current = null
      if (messages.length > 1) {
        connectAnswersRef.current.set(question, messages)
        setConnectVisitedVersion(v => v + 1)
        onConnectAnswerSaved?.(question, messages)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectQuestion])

  return {
    connectCards,
    connectQuestion,
    setConnectQuestion,
    connectVisitedVersion,
    connectAnswersRef,
    bridgeQuestion,
    openConnectThread,
    initConnectState,
  }
}
