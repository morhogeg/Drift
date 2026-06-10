// Compose App Store marketing screenshots: each raw capture framed on a branded
// gradient with a headline. Outputs 1290x2796 (6.7") PNGs to screenshots/final.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const RAW = resolve('screenshots/raw')
const dataUri = (file) => 'data:image/png;base64,' + readFileSync(`${RAW}/${file}`).toString('base64')
const OUT = 'screenshots/final'
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  { file: '1-main.png',      eyebrow: 'MEET DRIFT',     title: 'Think in branches,\nnot threads',   sub: 'Highlight any idea in a reply and explore it in a focused side-thread.' },
  { file: '2-suggest.png',   eyebrow: 'NEVER A BLANK PAGE', title: 'Tap Drift,\nnever stall',       sub: 'Open a free-form branch on any phrase — and Drift suggests what to ask next.' },
  { file: '3-lenses.png',    eyebrow: 'FIVE WAYS IN',   title: 'Drift free —\nor pick a lens',      sub: 'Simplify, deep-dive, connect, or challenge any idea in a single tap.' },
  { file: '4-map.png',       eyebrow: 'SEE THE SHAPE',  title: 'Your ideas,\nmapped',               sub: 'Every branch becomes a glowing node on your living knowledge map.' },
  { file: '5-synthesis.png', eyebrow: 'TIE IT TOGETHER', title: 'Weave it all\ninto one insight',   sub: 'Synthesize every branch into a single, clear takeaway.' },
]

const html = (s) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1290px; height:2796px; }
  .stage {
    position:relative; width:1290px; height:2796px; overflow:hidden;
    background:
      radial-gradient(1200px 900px at 12% -6%, rgba(255,0,110,0.30), transparent 60%),
      radial-gradient(1300px 1000px at 110% 8%, rgba(168,85,247,0.30), transparent 60%),
      radial-gradient(1000px 1200px at 50% 118%, rgba(168,85,247,0.18), transparent 60%),
      #07060a;
    font-family:-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;
  }
  /* faint starfield */
  .stage::before {
    content:''; position:absolute; inset:0; opacity:0.5;
    background-image:
      radial-gradient(1.5px 1.5px at 20% 15%, rgba(255,255,255,.35), transparent),
      radial-gradient(1.5px 1.5px at 70% 25%, rgba(255,255,255,.25), transparent),
      radial-gradient(1.5px 1.5px at 85% 12%, rgba(255,255,255,.30), transparent),
      radial-gradient(1.5px 1.5px at 35% 8%, rgba(255,255,255,.20), transparent);
  }
  .copy { position:absolute; top:150px; left:96px; right:96px; text-align:center; z-index:2; }
  .eyebrow {
    font-size:30px; font-weight:700; letter-spacing:0.28em; text-transform:uppercase;
    background:linear-gradient(90deg,#ff4d94,#c084fc); -webkit-background-clip:text; background-clip:text; color:transparent;
    margin-bottom:28px;
  }
  .title { font-size:96px; line-height:1.04; font-weight:800; color:#fff; letter-spacing:-0.02em; white-space:pre-line; }
  .sub { margin-top:34px; font-size:38px; line-height:1.4; font-weight:400; color:rgba(255,255,255,0.62); max-width:980px; margin-left:auto; margin-right:auto; }

  .device-wrap { position:absolute; left:50%; bottom:-40px; transform:translateX(-50%); z-index:1; }
  .device {
    width:1020px; border-radius:62px; padding:14px;
    background:linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.03));
    box-shadow:
      0 40px 120px rgba(168,85,247,0.35),
      0 10px 40px rgba(255,0,110,0.20),
      0 2px 0 rgba(255,255,255,0.12) inset;
  }
  .device img { display:block; width:100%; border-radius:50px; }
</style></head>
<body><div class="stage">
  <div class="copy">
    <div class="eyebrow">${s.eyebrow}</div>
    <div class="title">${s.title}</div>
    <div class="sub">${s.sub}</div>
  </div>
  <div class="device-wrap"><div class="device">
    <img src="${dataUri(s.file)}">
  </div></div>
</div></body></html>`

const run = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 })
  for (const s of SHOTS) {
    await page.setContent(html(s), { waitUntil: 'networkidle' })
    await page.waitForTimeout(600) // let fonts settle
    const out = `${OUT}/${s.file}`
    await page.screenshot({ path: out })
    console.log('framed', out)
  }
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })
