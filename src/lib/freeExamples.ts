/**
 * Free "on us" intro content.
 *
 * The welcome screen offers four fixed example prompts. So a visitor can taste
 * Drift with no API key of their own, each example ships with a PRE-WRITTEN
 * answer (identical for everyone — zero API calls). Each answer also carries a
 * fixed set of dotted "drift" terms; tapping one of THOSE serves a pre-written
 * drift answer too. Everything beyond this (any other highlight the user makes,
 * any lens, any typed follow-up) is "real" and needs the user's own key.
 *
 * These canned paths only fire when no usable provider key is configured — a
 * user with their own key always gets a live answer instead.
 *
 * IMPORTANT: every string in `highlights` must appear VERBATIM (plain text, not
 * inside markdown emphasis/headings) in its `answer`, or the dotted underline
 * won't render — the renderer locates highlights by exact substring match.
 */

export interface FreeExample {
  /** Must match the welcome-screen chip text exactly. */
  prompt: string
  /** Pre-written root answer (markdown). */
  answer: string
  /** Dotted drift terms — same for every user. Each must appear verbatim in `answer`. */
  highlights: string[]
}

/** Canned drift answers, keyed by the highlighted term (one per highlight above). */
const FREE_DRIFTS: Record<string, string> = {
  // ── Rome ──────────────────────────────────────────────────────────────────
  'fiscal crisis':
    "Rome's money problem was mechanical, not just bad luck. The silver denarius started near pure silver under Augustus; by the late 3rd century it held under 5% silver, the rest base metal. Emperors debased the coinage to mint more coins from the same bullion — a way to \"print money\" to pay armies and buy grain. Predictably, prices exploded: Diocletian's Edict on Maximum Prices (301 AD) tried to freeze thousands of prices by law and failed completely. Meanwhile plague and war shrank the population paying taxes, so the state squeezed the survivors harder, driving farmers off their land — which shrank the tax base further. A doom loop: less revenue → more debasement → more inflation → less real revenue.",
  'mercenaries':
    "As Roman citizens grew reluctant to serve, the army increasingly hired *foederati* — Germanic and other tribal groups who fought under their own chiefs in exchange for land, pay, or grain. It worked for a while and cost less than raising fresh citizen legions. But it quietly inverted the relationship: the people defending Rome were no longer Roman. When pay lapsed or politics soured, those same forces could turn. Alaric, who sacked Rome in 410, had served as a Roman commander first — he attacked partly because promised subsidies stopped arriving. The empire had outsourced its own survival, and eventually the bill came due.",
  'Crisis of the Third Century':
    "Roughly 235–284 AD, the empire nearly came apart. After Severus Alexander was murdered by his own troops, the army discovered it could make and unmake emperors at will — so it did, again and again. Layer on simultaneous pressure from Sasanian Persia in the east and Germanic confederations in the north, the Plague of Cyprian, and economic collapse, and the empire briefly fractured into three (the breakaway Gallic and Palmyrene states). Diocletian finally stabilized things after 284 — but only by rebuilding Rome into a far more rigid, militarized, heavily taxed state. Rome survived, yet it never recovered the confident civic culture it had before.",

  // ── Quantum entanglement ────────────────────────────────────────────────────
  'spooky action at a distance':
    "This was Einstein's mocking phrase (*spukhafte Fernwirkung*, from a 1947 letter), aimed at what he thought was a flaw. In his 1935 EPR paper with Podolsky and Rosen, he argued entanglement showed quantum mechanics was incomplete — surely the particles carried hidden, pre-set values we simply couldn't see, no spookiness required. The stunning turn came in 1964, when John Bell devised a test that could actually tell the two pictures apart. Experiments ran it — Aspect in 1982, then loophole-free versions in 2015 — and nature sided against Einstein: there are no hidden pre-set values. The correlations are real and stronger than any \"common cause\" story allows. The 2022 Nobel Prize honored exactly this work.",
  'correlation':
    "The heart of it: entanglement is correlation without communication. Picture a machine that prints two cards in always-opposite colors and mails one to you, one to a friend. You open yours — red — and instantly know theirs is black. No signal passed; the link was baked in at creation. Ordinary classical correlation works just like that. What makes the quantum version strange is that the colors aren't decided until someone looks, yet they still come out perfectly matched — and Bell's theorem proves no \"pre-printed cards\" account can reproduce the full statistical pattern. It's correlation stronger than any classical mechanism permits, which is why it counts as genuinely new physics rather than hidden bookkeeping.",
  'faster than light':
    "Here's the rule that keeps entanglement from breaking relativity: you can't choose your own outcome. When you measure your particle you get a random result — heads or tails, red or black — with no way to force which. So although your partner's particle is instantly fixed to the opposite, they can't tell you've measured yet; their side still looks perfectly random. Only when you physically bring the two result-lists together — by ordinary, slower-than-light means — does the matching reveal itself. This is the \"no-communication theorem\": entanglement carries no usable information faster than light. It can correlate, but it can't signal — which is precisely why it coexists peacefully with Einstein's speed limit.",

  // ── Stoicism vs Buddhism ────────────────────────────────────────────────────
  'dukkha':
    "Dukkha is usually rendered \"suffering,\" but that's too narrow — it's closer to \"unsatisfactoriness\" or \"unease.\" The classic image is a cart wheel slightly off its axle: it still rolls, but with a constant wobble. Buddhism names three layers. First, plain pain — illness, loss, grief. Second, the dukkha of change: even good experiences ache because they end. Third, the subtlest — a background dissatisfaction baked into existing as a self that always wants the next thing. This is the First Noble Truth, and importantly it's a diagnosis, not pessimism: the other three truths say dukkha has a cause (craving), an end, and a path there. Naming the wobble is the first step toward steadying it.",
  'attachment':
    "Attachment (Pali *upādāna* — \"clinging,\" \"grasping\") is Buddhism's engine of suffering. It isn't love or care as such; it's the white-knuckle grip that demands a person, a pleasure, or a self-image stay exactly as it is in a world where nothing does. We cling to things, to opinions, to rituals, and most stubbornly to the idea of a permanent \"me.\" Because everything is impermanent, clinging guarantees pain — you're holding water. The antidote isn't cold indifference; it's *non*-attachment: engaging fully, loving even, while holding loosely enough that loss doesn't shatter you. The Stoics say something close with their \"preferred indifferents\" — value things, but don't stake your serenity on keeping them.",
  'dichotomy of control':
    "This is Stoicism's master tool, and it opens Epictetus's *Enchiridion*: \"Some things are up to us and some are not.\" Up to us — our judgments, intentions, and responses. Not up to us — our bodies, reputations, wealth, other people, outcomes. Nearly all suffering, the Stoics argue, comes from investing our peace in the second column, staking happiness on what we don't actually command. The discipline is to want only what's genuinely yours to give, and to meet everything else as \"preferred but not required.\" Modern cognitive behavioral therapy borrows the move almost wholesale: distress often flows from our appraisal of events, so change the appraisal. Marcus Aurelius ran an empire by it — the aim isn't passivity but pointing your effort where it can actually land.",

  // ── Caffeine ────────────────────────────────────────────────────────────────
  'adenosine':
    "Adenosine is your brain's sleep-pressure gauge. It's a byproduct of burning energy: every time a cell spends ATP (its fuel), adenosine is left behind. So the longer you're awake and the harder your neurons work, the more it accumulates — and as it binds its receptors, it dials neural firing down and makes you drowsy. Sleep is when the brain clears it back out, which is why you wake refreshed: the gauge resets. Caffeine doesn't lower adenosine at all; it just hides the gauge by occupying the receptors. The adenosine keeps climbing in the background — which is exactly why an all-nighter feels brutal even with coffee. You're masking an ever-larger signal, not removing it.",
  'half-life':
    "A drug's half-life is the time your body needs to clear half of it. Caffeine's is about 5–6 hours in a typical adult — so if you drink 200 mg at noon, roughly 100 mg is still circulating by 5–6 p.m. and ~50 mg near midnight. That long tail is why afternoon coffee quietly wrecks sleep even when you fall asleep fine: it lightens deep sleep without you noticing. The number isn't fixed, though. Pregnancy and some medications can double or triple it; smoking roughly halves it; and a liver enzyme (CYP1A2) makes some people genuinely \"fast\" or \"slow\" metabolizers. That genetic difference is a big reason an espresso barely touches one person yet keeps another up all night.",
  'blood-brain barrier':
    "The blood-brain barrier is a tight lining of cells wrapped around the brain's blood vessels that works like a bouncer — admitting oxygen, glucose, and a select few molecules while blocking most toxins, pathogens, and even many drugs. Caffeine slips past it easily because it's small and fat-soluble (lipophilic), so it dissolves straight through cell membranes rather than needing a special gate. That's why coffee acts so fast — noticeable effects within ~10–20 minutes. Plenty of promising brain drugs fail precisely because they *can't* cross this barrier; caffeine's free pass is part of what makes it the world's most widely used psychoactive substance. Alcohol and nicotine share the same easy-crossing trick.",
}

export const FREE_EXAMPLES: FreeExample[] = [
  {
    prompt: 'Why did the Roman Empire really fall?',
    highlights: ['fiscal crisis', 'mercenaries', 'Crisis of the Third Century'],
    answer:
      "There's no single cause — Rome fell from a convergence of slow pressures, not one dramatic blow. The ones that mattered most fed off each other:\n\n" +
      "**Overstretch.** By the 3rd century the empire was simply too large to defend everywhere at once. Holding the Rhine, the Danube, and the eastern border at the same time drained men and silver faster than the provinces could replace them.\n\n" +
      "**Money broke before the legions did.** A deepening fiscal crisis — debased coinage, runaway inflation, a shrinking tax base — meant Rome increasingly couldn't pay its own soldiers. To fill the ranks it leaned on mercenaries and frontier tribes whose loyalty followed the paycheck, not the eagle.\n\n" +
      "**Politics hollowed it out.** During the Crisis of the Third Century the empire churned through roughly 26 emperors in 50 years, most murdered by their own troops. An institution that runs on continuity stopped being continuous.\n\n" +
      "The famous invasions of 410 and 476 were the final shove — but they toppled a structure already rotted from inside. Tellingly, the richer, better-run eastern half didn't fall at all: it lived on for another thousand years as Byzantium.",
  },
  {
    prompt: 'Explain quantum entanglement without the jargon',
    highlights: ['spooky action at a distance', 'correlation', 'faster than light'],
    answer:
      "Imagine you prepare two coins together in a special way, seal each in a box, and mail them to opposite ends of the galaxy. Quantum mechanics says that until someone looks, neither coin is \"heads\" or \"tails\" — each is genuinely undecided. But the pair was made so their outcomes are linked: the instant you open your box and see heads, you know the distant box is tails.\n\n" +
      "That linkage is entanglement, and Einstein hated it — he called it \"spooky action at a distance.\" The unsettling part isn't the knowing; it's that the result wasn't sitting there decided in advance. The two particles share a single description, not two separate ones, no matter how far apart they drift.\n\n" +
      "The catch that saves physics: you can't *control* which result you get — your coin is random. So you can't use entanglement to send a message faster than light. What you're left with is a perfect correlation between two random outcomes, one that only becomes visible later, when you and the distant person compare notes. It's real, repeatedly tested, and now the backbone of quantum computing and cryptography.",
  },
  {
    prompt: 'Compare Stoicism and Buddhism on suffering',
    highlights: ['dukkha', 'attachment', 'dichotomy of control'],
    answer:
      "Both traditions begin from the same uncomfortable observation — life is shot through with suffering — but they diagnose and treat it differently.\n\n" +
      "**Buddhism** makes suffering its first principle. Its central term, dukkha, names a pervasive unsatisfactoriness: even pleasure is tinged with the ache of impermanence, because we cling to what won't last. The cause is craving and attachment; the cure is to see through the illusion of a fixed, separate self and let the clinging dissolve. The goal is liberation (nirvana) — stepping off the wheel entirely.\n\n" +
      "**Stoicism** is less metaphysical, more like practical engineering for the mind. Suffering, the Stoics say, comes not from events but from our *judgments* about them. The remedy is the dichotomy of control: relentlessly sorting what's up to you (your choices, your responses) from what isn't (everything else), and investing your peace only in the former. The goal is *ataraxia* — equanimity while still fully engaged in the world.\n\n" +
      "The shared insight: your suffering lives largely in your relationship to reality, not in reality itself. The difference: Buddhism aims to *extinguish* craving and exit the cycle; Stoicism aims to *retrain* desire and live well inside it.",
  },
  {
    prompt: 'How does caffeine actually work in the brain?',
    highlights: ['adenosine', 'blood-brain barrier', 'half-life'],
    answer:
      "Caffeine doesn't add energy — it *blocks the brain's \"I'm tired\" signal*. Here's the mechanism.\n\n" +
      "As your neurons work through the day, they produce a molecule called adenosine, which builds up and binds to receptors that slow neural activity. The more it accumulates, the drowsier you feel — it's part of how your body keeps score of how long you've been awake.\n\n" +
      "Caffeine happens to be almost the same shape as adenosine. It crosses the blood-brain barrier within minutes and plugs into those same receptors — but without activating them. It's a decoy: it takes the parking spots so adenosine can't dock. Your tiredness signal goes quiet, and downstream stimulants like dopamine and adrenaline flow more freely. Hence the alertness.\n\n" +
      "Two catches. First, the sleepiness isn't gone — adenosine keeps piling up behind the blockade, which is why you can crash hard once the caffeine fades. Second, caffeine has a half-life of about 5–6 hours, so a 3 p.m. coffee can still leave a quarter of the dose in you at bedtime. With regular use the brain grows *more* receptors to compensate — that's tolerance, and why the same cup does less over time.",
  },
]

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const EXAMPLE_BY_PROMPT = new Map(FREE_EXAMPLES.map(e => [norm(e.prompt), e]))
const DRIFT_BY_TERM = new Map(Object.entries(FREE_DRIFTS).map(([k, v]) => [norm(k), v]))

/** The canned root answer + dotted terms for a welcome example, or null. */
export function getFreeExample(text: string): FreeExample | null {
  return EXAMPLE_BY_PROMPT.get(norm(text)) ?? null
}

/** The canned drift answer for a pre-marked term, or null. */
export function getFreeDriftAnswer(term: string): string | null {
  return DRIFT_BY_TERM.get(norm(term)) ?? null
}
