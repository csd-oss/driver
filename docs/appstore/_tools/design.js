/**
 * The marketing-screenshot design: one stylesheet and four page layouts
 * (hero, feature, trust, cta), rendered by render.js at 1320 × 2868.
 *
 * Look: a near-black navy stage lit by two accent glows, faint lane markings
 * and film grain; an eyebrow label, a heavy headline with one highlighted
 * phrase (*like this* in captions.json), the device, and optionally a
 * callout, a crop of the capture enlarged over its own spot on the screen.
 */

const W = 1320;
const H = 2868;

// Frame geometry (frame.png is 1470 × 3000; the capture sits at 75,66).
const FRAME_W = 1470;
const CUT = { x: 75, y: 66 };
const PHONE_W = 1100;
const PHONE_X = (W - PHONE_W) / 2;
const SCALE = PHONE_W / FRAME_W;
const CALLOUT_ZOOM = 1.3;

const THEMES = {
  indigo:  { a: '#6366f1', b: '#22d3ee', em: ['#c7d2fe', '#67e8f9'] },
  violet:  { a: '#8b5cf6', b: '#ec4899', em: ['#ddd6fe', '#f9a8d4'] },
  amber:   { a: '#f59e0b', b: '#ef4444', em: ['#fde68a', '#fb923c'] },
  sky:     { a: '#0ea5e9', b: '#6366f1', em: ['#bae6fd', '#a5b4fc'] },
  rose:    { a: '#f43f5e', b: '#f59e0b', em: ['#fecdd3', '#fcd34d'] },
  emerald: { a: '#10b981', b: '#22d3ee', em: ['#a7f3d0', '#67e8f9'] },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Escape, then turn *phrase* into the highlighted span. */
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

const css = (t) => `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #070b18;
  font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
.stage { position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
  background: linear-gradient(180deg, #0b1024 0%, #070b18 55%, #05070f 100%); }
.glow { position: absolute; border-radius: 50%; filter: blur(160px); opacity: .55; }
.glow.a { width: 1300px; height: 1100px; left: -420px; top: -380px; background: ${t.a}; }
.glow.b { width: 1200px; height: 1200px; right: -520px; top: 1300px; background: ${t.b}; opacity: .38; }
.lanes { position: absolute; inset: 0; opacity: .06;
  background:
    repeating-linear-gradient(90deg, transparent 0 140px, #fff 140px 150px, transparent 150px 300px) 0 0 / 100% 100%;
  -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 38%);
  transform: skewX(-18deg) scaleX(1.4); }
.lanes::after { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 12px; margin-left: -6px;
  background: repeating-linear-gradient(180deg, #fff 0 70px, transparent 70px 140px); }
.grain { position: absolute; inset: 0; background-image: ${GRAIN}; opacity: .10; mix-blend-mode: overlay; }
.copy { position: absolute; left: 0; right: 0; top: 150px; padding: 0 70px; text-align: center; z-index: 3; }
.eyebrow { display: inline-flex; align-items: center; gap: 16px; padding: 16px 30px; border-radius: 999px;
  background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.14);
  color: rgba(255,255,255,.92); font-size: 30px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; }
.eyebrow i { width: 14px; height: 14px; border-radius: 50%; background: linear-gradient(135deg, ${t.em[0]}, ${t.em[1]});
  box-shadow: 0 0 18px ${t.a}; }
h1 { margin-top: 40px; color: #fff; font-size: 116px; font-weight: 800; line-height: 1.0; letter-spacing: -3.5px; text-wrap: balance; }
h1 em { font-style: normal; white-space: nowrap; background: linear-gradient(100deg, ${t.em[0]} 0%, ${t.em[1]} 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { margin-top: 34px; color: rgba(255,255,255,.72); font-size: 42px; font-weight: 500; line-height: 1.25; letter-spacing: -.4px; }
.pill { display: inline-block; margin-top: 44px; padding: 20px 40px; border-radius: 999px;
  background: linear-gradient(100deg, ${t.em[0]}, ${t.em[1]}); color: #0b1024; font-size: 36px; font-weight: 800; letter-spacing: -.2px;
  box-shadow: 0 18px 50px rgba(0,0,0,.35); }
.phone { position: absolute; left: ${PHONE_X}px; width: ${PHONE_W}px; z-index: 2;
  filter: drop-shadow(0 70px 120px rgba(0,0,0,.65)) drop-shadow(0 20px 40px rgba(0,0,0,.45)); }
.phone img { display: block; width: 100%; }
.callout { position: absolute; z-index: 4; border-radius: 48px; overflow: hidden; background: #fff;
  box-shadow: 0 50px 110px rgba(0,0,0,.55), 0 0 0 3px rgba(255,255,255,.55), 0 0 90px ${t.a}66;
  transform: rotate(-2deg); }
.callout img { display: block; width: 100%; }
/* trust */
.grid { position: absolute; left: 80px; right: 80px; top: 900px; display: grid; grid-template-columns: 1fr 1fr; gap: 34px; z-index: 3; }
.card { position: relative; height: 520px; border-radius: 52px; padding: 56px 50px;
  background: linear-gradient(160deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  border: 2px solid rgba(255,255,255,.12); display: flex; flex-direction: column; justify-content: flex-end; }
.card .big { font-size: 170px; font-weight: 800; letter-spacing: -6px; line-height: .95;
  background: linear-gradient(110deg, #fff 10%, ${t.em[1]} 120%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.card .label { margin-top: 22px; color: #fff; font-size: 44px; font-weight: 700; line-height: 1.12; letter-spacing: -.6px; }
.card .note { margin-top: 12px; color: rgba(255,255,255,.62); font-size: 32px; font-weight: 500; line-height: 1.25; }
.tag { position: absolute; top: 44px; left: 50px; padding: 10px 22px; border-radius: 999px; font-size: 26px; font-weight: 800;
  letter-spacing: 2px; text-transform: uppercase; }
.tag.free { background: rgba(52,211,153,.18); color: #6ee7b7; }
.tag.pro { background: rgba(251,191,36,.18); color: #fcd34d; }
/* cta */
.cta { position: absolute; left: 0; right: 0; top: 760px; text-align: center; z-index: 3; padding: 0 90px; }
.icon { width: 460px; height: 460px; border-radius: 104px; margin: 0 auto; display: block;
  box-shadow: 0 60px 120px rgba(0,0,0,.6), 0 0 160px ${t.a}88; }
.brand { margin-top: 60px; color: rgba(255,255,255,.7); font-size: 40px; font-weight: 700; letter-spacing: 8px; text-transform: uppercase; }
.cta h1 { margin-top: 34px; font-size: 168px; letter-spacing: -6px; }
.cta .sub { font-size: 50px; }
.checks { margin: 110px auto 0; display: inline-flex; flex-direction: column; gap: 44px; text-align: left; }
.checks div { display: flex; align-items: center; gap: 34px; color: #fff; font-size: 54px; font-weight: 600; letter-spacing: -.5px; }
.checks b { flex: none; width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(135deg, ${t.em[0]}, ${t.em[1]}); color: #0b1024; font-size: 38px; font-weight: 900; }
`;

const shell = (t, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css(t)}</style></head>
<body><div class="stage"><div class="glow a"></div><div class="glow b"></div><div class="lanes"></div><div class="grain"></div>
${body}</div></body></html>`;

const copy = (c, extra = '') => `<div class="copy">
  ${c.eyebrow ? `<div class="eyebrow"><i></i>${esc(c.eyebrow)}</div>` : ''}
  <h1>${rich(c.caption)}</h1>
  ${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ''}
  ${extra}
</div>`;

/** Page position of the phone and, if given, its callout. */
function layout(phoneTop, callout) {
  if (!callout) return { phoneTop };
  const s = SCALE * CALLOUT_ZOOM;
  const cx = PHONE_X + (CUT.x + callout.x + callout.w / 2) * SCALE;
  const cy = phoneTop + (CUT.y + callout.y + callout.h / 2) * SCALE;
  const w = callout.w * s;
  const h = callout.h * s;
  const left = Math.max(36, Math.min(W - 36 - w, cx - w / 2 + (callout.dx || 0)));
  return { phoneTop, box: { left, top: cy - h / 2 + (callout.dy || 0), width: w } };
}

function device(page, { theme, copy: c, deviceUrl, calloutUrl, callout, hero, pill }) {
  const t = THEMES[theme] || THEMES.indigo;
  const extra = hero && pill ? `<div class="pill">${esc(pill)}</div>` : '';
  const phoneTop = hero ? 860 : 760;
  const l = layout(phoneTop, calloutUrl && callout);
  const box = l.box
    ? `<div class="callout" style="left:${l.box.left}px;top:${l.box.top}px;width:${l.box.width}px"><img src="${calloutUrl}"></div>`
    : '';
  return shell(t, `${copy(c, extra)}
  <div class="phone" style="top:${phoneTop}px"><img src="${deviceUrl}"></div>${box}`);
}

function trust({ theme, copy: c, tags }) {
  const t = THEMES[theme] || THEMES.indigo;
  const cards = (c.cards || []).map((k) => `<div class="card">
    ${k.tag ? `<div class="tag ${esc(k.tag)}">${esc(tags[k.tag] || k.tag)}</div>` : ''}
    <div class="big">${esc(k.big)}</div><div class="label">${esc(k.label)}</div>${k.note ? `<div class="note">${esc(k.note)}</div>` : ''}
  </div>`).join('');
  return shell(t, `${copy(c)}<div class="grid">${cards}</div>`);
}

function cta({ theme, copy: c, iconUrl }) {
  const t = THEMES[theme] || THEMES.indigo;
  const checks = (c.checks || []).map((x) => `<div><b>✓</b>${esc(x)}</div>`).join('');
  return shell(t, `<div class="cta">
    <img class="icon" src="${iconUrl}">
    <div class="brand">Driver SK</div>
    <h1>${rich(c.caption)}</h1>
    ${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ''}
    <div class="checks">${checks}</div>
  </div>`);
}

module.exports = { W, H, THEMES, device, trust, cta };
