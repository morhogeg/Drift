/**
 * sampleExploration — a pre-baked, zero-cost "wow" for brand-new users.
 *
 * On first run we seed one finished exploration so a keyless visitor immediately
 * experiences the whole loop — a rich answer with clickable drift terms, a
 * constellation in the Drift Map, and a Synthesis — without spending a single
 * API call or pasting a key. Everything here is static text.
 *
 * Shapes mirror real data exactly (see src/types/chat.ts):
 *   • the root is a normal chat whose assistant message carries `hasDrift` +
 *     `driftInfos`, so the drifted terms render as inline links (each
 *     `selectedText` appears verbatim in the answer body);
 *   • each drift is a `metadata.isDrift` chat parented to the root;
 *   • the closing `synth-` message renders through the existing Synthesis UI.
 * Every seeded chat is flagged `metadata.isSample` so it can be badged and
 * cleared in one tap.
 */

import type { ChatSession, Message } from '@/types/chat'
import { useChatStore } from '@/store/chatStore'

/** localStorage flag — set once the sample has been seeded so we never re-seed. */
export const SAMPLE_SEEDED_FLAG = 'drift_sample_seeded'

export const SAMPLE_ROOT_ID = 'sample-root'
const SAMPLE_AI_ID = 'sample-ai-1'

const DRIFT_CRISIS_ID = 'sample-drift-crisis'
const DRIFT_CURRENCY_ID = 'sample-drift-currency'
const DRIFT_BORDERS_ID = 'sample-drift-borders'

/** Verbatim phrases that must appear in the root answer for the inline links to render. */
const TERM_CRISIS = 'Crisis of the Third Century'
const TERM_CURRENCY = 'debased the currency'
const TERM_BORDERS = 'overextended its borders'

/** True for any chat that is part of the seeded sample exploration. */
export function isSampleChat(c: Pick<ChatSession, 'metadata'>): boolean {
  return !!c.metadata?.isSample
}

const ROOT_ANSWER = `Rome didn't fall in a single dramatic moment — it unravelled over centuries through a tangle of reinforcing pressures. A few of the deepest threads:

- **It ${TERM_BORDERS}.** At its height the Empire stretched from Britain to the Euphrates, and defending that perimeter swallowed an enormous share of its money and manpower.
- **The army and economy strained against each other.** Endless frontier wars demanded ever-larger armies, which demanded ever-higher taxes — and when taxes weren't enough, emperors quietly **${TERM_CURRENCY}** to pay the troops.
- **Politics turned violently unstable.** The **${TERM_CRISIS}** saw the throne change hands dozens of times in fifty years, often by assassination, gutting the continuity any large state needs.

No single cause "did it." Military overreach, monetary decay, and political chaos fed one another in a slow spiral — and the Western Empire that formally ended in 476 CE was, by then, a shadow held together by habit.

> Highlight any underlined phrase above to *drift* into it — explore one thread without losing your place here.`

const CRISIS_DRIFT_ANSWER = `The **Crisis of the Third Century (235–284 CE)** is the half-century where Rome nearly came apart at the seams. Here's the machinery of it:

- **The trigger:** when Emperor Severus Alexander was murdered by his own troops in 235, he left no stable rule for succession. Whoever the legions backed could *make* an emperor — so they did, repeatedly.
- **The spiral:** roughly **26 emperors in 50 years**, most dying by violence. Each usurper pulled troops off the frontier to fight rivals, which invited invasions, which created new generals with new armies and new imperial ambitions.
- **Why it mattered:** simultaneous pressure on every front — Persian armies in the east, Germanic incursions across the Rhine and Danube, breakaway states (the Gallic Empire, Palmyra) — while plague and a collapsing currency hollowed out the tax base.

It was finally stabilised by Diocletian (r. 284), who rebuilt the state almost from scratch — but the recovery came at the cost of a far more rigid, militarised, and expensive empire.`

const CURRENCY_DRIFT_ANSWER = `Think of Roman coins as a promise. The silver *denarius* was a little disc of trust — everyone agreed it held a fixed amount of silver.

When emperors needed to pay armies they couldn't afford, they quietly melted down coins and re-minted them with **less silver and more cheap base metal** — the same face value, less real value inside. That's "debasing."

The catch is the one every counterfeiter eventually learns: people notice. Over the 3rd century the denarius slid from around **90%+ silver to under 5%**. Prices shot up (early runaway inflation), people hoarded the old good coins, and trust in money itself eroded — so the state increasingly had to demand taxes and pay soldiers *in goods* instead of cash.

The plain version: Rome printed its way out of a cash crunch, and the money stopped meaning anything.`

const BORDERS_DRIFT_ANSWER = `"Overextension" is really a math problem about distance and time.

At its peak (~117 CE under Trajan) the Empire ran roughly **5,000 km east to west**, with frontiers totalling thousands of kilometres along the Rhine, Danube, eastern desert, and North Africa. Holding that line meant:

- **A standing army of ~300,000–400,000** spread thin across the perimeter — expensive in peacetime, never quite enough in a crisis on two fronts at once.
- **A speed-of-news ceiling.** Orders and reinforcements moved at the pace of a horse or a ship. A threat on the Danube could escalate for weeks before Rome could even respond.
- **Diminishing returns.** The richest, easiest conquests came first; later expansion added long, exposed borders without proportionate tax revenue to defend them.

So the limit wasn't ambition — it was logistics. Past a certain size, each new mile of frontier cost more to defend than it brought in, and the whole system became fragile to a shock on any single front.`

const SYNTH_TEXT = `Pulled together, the three threads aren't separate causes — they're one feedback loop.

**Overextended borders** set the bill: a perimeter too long to defend cheaply. To pay that bill, emperors **debased the currency**, which bought time but destroyed the value of money and the tax base underneath it. A broke, inflation-wracked state couldn't reliably pay its legions — so the legions started making and unmaking emperors, which is the **Crisis of the Third Century**. Political chaos then pulled troops off the very frontiers whose cost started the whole thing.

**The takeaway:** Rome's fall wasn't an event, it was a spiral — geography created cost, cost corrupted the money, broken money broke the politics, and broken politics weakened the geography again. Diocletian eventually halted the spin, but only by building a heavier, costlier empire that traded its old vitality for survival.`

/**
 * Build the full sample exploration: the root chat (with its drifted answer and a
 * synthesis) plus the three drift chats. Returns chats newest-last so callers can
 * order them however they like; ids are stable so re-seeding is impossible.
 */
export function buildSampleExploration(): ChatSession[] {
  // Anchor timestamps a few minutes apart, in the recent past, so ordering reads naturally.
  const base = Date.now() - 1000 * 60 * 30
  const at = (offsetMin: number) => new Date(base + offsetMin * 60 * 1000)

  const rootUser: Message = {
    id: 'sample-user-1',
    text: 'Why did the Roman Empire really fall?',
    isUser: true,
    timestamp: at(0),
  }

  const rootAnswer: Message = {
    id: SAMPLE_AI_ID,
    text: ROOT_ANSWER,
    isUser: false,
    timestamp: at(1),
    hasDrift: true,
    driftInfos: [
      { selectedText: TERM_BORDERS, driftChatId: DRIFT_BORDERS_ID, templateType: 'simplify' },
      { selectedText: TERM_CURRENCY, driftChatId: DRIFT_CURRENCY_ID, templateType: 'simplify' },
      { selectedText: TERM_CRISIS, driftChatId: DRIFT_CRISIS_ID, templateType: 'research' },
    ],
  }

  const synth: Message = {
    id: 'synth-sample',
    text: `## ✦ Synthesis · 3 drifts\n\n${SYNTH_TEXT}`,
    isUser: false,
    timestamp: at(20),
  }

  const root: ChatSession = {
    id: SAMPLE_ROOT_ID,
    title: 'Why did the Roman Empire really fall?',
    messages: [rootUser, rootAnswer, synth],
    lastMessage: '✦ Synthesis · 3 drifts',
    createdAt: at(0),
    metadata: { isSample: true },
  }

  const drift = (
    id: string,
    term: string,
    question: string,
    answer: string,
    offsetMin: number,
  ): ChatSession => ({
    id,
    title: term,
    messages: [
      { id: `${id}-q`, text: question, isUser: true, timestamp: at(offsetMin) },
      { id: `${id}-a`, text: answer, isUser: false, timestamp: at(offsetMin + 1) },
    ],
    lastMessage: answer.slice(0, 100),
    createdAt: at(offsetMin),
    metadata: {
      isDrift: true,
      parentChatId: SAMPLE_ROOT_ID,
      sourceMessageId: SAMPLE_AI_ID,
      selectedText: term,
      isSample: true,
    },
  })

  const drifts = [
    drift(DRIFT_BORDERS_ID, TERM_BORDERS,
      'Put this in plain terms — what does "overextended its borders" actually mean?',
      BORDERS_DRIFT_ANSWER, 4),
    drift(DRIFT_CURRENCY_ID, TERM_CURRENCY,
      'Explain this simply — how do you "debase" a currency?',
      CURRENCY_DRIFT_ANSWER, 8),
    drift(DRIFT_CRISIS_ID, TERM_CRISIS,
      'Take me deeper on the Crisis of the Third Century.',
      CRISIS_DRIFT_ANSWER, 12),
  ]

  return [root, ...drifts]
}

/**
 * Seed the sample exploration on genuine first run.
 *
 * Returns true only when it actually seeded — the caller can then land the user
 * inside the sample. Idempotent: the `SAMPLE_SEEDED_FLAG` guarantees we seed at
 * most once, and we never seed over a user who already has real conversations
 * (so existing installs aren't polluted when this ships).
 */
export function maybeSeedSampleExploration(): boolean {
  if (localStorage.getItem(SAMPLE_SEEDED_FLAG) === 'true') return false
  // Mark immediately so a transient error can't cause a re-seed on the next launch.
  localStorage.setItem(SAMPLE_SEEDED_FLAG, 'true')

  const store = useChatStore.getState()
  const hasRealChats = store.chatHistory.some(
    (c) => (c.messages?.length ?? 0) > 0 || c.metadata?.isDrift,
  )
  if (hasRealChats) return false

  // registerDriftSession inserts + persists each chat idempotently. Insert the
  // drifts first, then the root, so the root sits at the front of history.
  const [root, ...drifts] = buildSampleExploration()
  for (const d of drifts) store.registerDriftSession(d)
  store.registerDriftSession(root)
  return true
}

/** Remove every seeded sample chat from state + storage (the "Clear sample" action). */
export function clearSampleExploration(): void {
  const store = useChatStore.getState()
  for (const c of store.chatHistory.filter(isSampleChat)) store.deleteChat(c.id)
}
