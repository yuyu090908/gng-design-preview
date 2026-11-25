// 夜景イラスト（SVG）を作る。写真ではなく、このサイト用にコードで描いたオリジナルのイラスト。
// 実行：node scripts/gen-art.mjs → src/img/*.svg を書き出す（できあがった SVG はリポジトリに含める）
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('src/img', { recursive: true });
const f = (n) => Math.round(n * 10) / 10;

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// 窓あかりのパターン（3 種類）
const windowPatterns = (rnd, warm = '#FFD98A', cool = '#CFE0FF') => [0, 1, 2].map((k) => {
  let r = '';
  for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) {
    if (rnd() < 0.42 + k * 0.08) r += `<rect x="${x * 6 + 1.5}" y="${y * 7 + 2}" width="3" height="3.4" fill="${rnd() < 0.7 ? warm : cool}" fill-opacity="${f(0.35 + rnd() * 0.6)}"/>`;
  }
  return `<pattern id="w${k}" width="24" height="42" patternUnits="userSpaceOnUse">${r}</pattern>`;
}).join('');

function skyline(rnd, { W, H, x0, x1, minH, maxH, color, win = true, shape }) {
  let out = '';
  let x = x0;
  while (x < x1) {
    const w = 26 + rnd() * 54;
    const h = (shape ? shape(x / W) : 1) * (minH + rnd() * (maxH - minH));
    const y = H - h;
    out += `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${color}"/>`;
    if (rnd() < 0.25) out += `<rect x="${f(x + w * 0.3)}" y="${f(y - 14)}" width="${f(w * 0.4)}" height="14" fill="${color}"/>`;
    if (rnd() < 0.18) out += `<rect x="${f(x + w / 2 - 1)}" y="${f(y - 34)}" width="2" height="34" fill="${color}"/><circle cx="${f(x + w / 2)}" cy="${f(y - 34)}" r="2.2" fill="#FF4A3D"/>`;
    if (win) out += `<rect x="${f(x + 3)}" y="${f(y + 6)}" width="${f(w - 6)}" height="${f(h - 6)}" fill="url(#w${Math.floor(rnd() * 3)})"/>`;
    x += w + 2 + rnd() * 6;
  }
  return out;
}

function stars(rnd, W, H, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f(rnd() * W)}" cy="${f(rnd() * H)}" r="${f(rnd() * 0.9 + 0.3)}"/>`;
  return `<g fill="#fff" fill-opacity=".5">${s}</g>`;
}

// ---------- 東京（右側に電波塔） ----------
{
  const W = 1600, H = 560, rnd = rng(11);
  const tx = 1190, base = H, top = 92; // 塔の位置
  const th = base - top;
  const at = (t) => top + th * t; // 高さの比率 → y
  const half = (t) => 6 + 120 * Math.pow(t, 2.1); // 高さの比率 → 塔の半幅
  const leg = (t) => `${f(tx - half(t))},${f(at(t))}`;
  const legR = (t) => `${f(tx + half(t))},${f(at(t))}`;
  const ts = [0.08, 0.2, 0.3, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92, 1];
  let lattice = '';
  for (let i = 0; i < ts.length - 1; i++) {
    const a = ts[i], b = ts[i + 1];
    lattice += `<path d="M${leg(a)}L${legR(b)}M${legR(a)}L${leg(b)}M${leg(a)}L${legR(a)}"/>`;
  }
  const tower = `
<g>
  <ellipse cx="${tx}" cy="${at(0.45)}" rx="260" ry="300" fill="url(#tglow)"/>
  <path d="M${tx - 1.5},${top - 70}h3v70h-3z" fill="#FFE2B0"/>
  <path d="M${f(tx - 6)},${top}L${leg(0.3)}L${leg(1)}L${f(tx - half(1) + 40)},${base}Q${tx},${at(0.78)} ${f(tx + half(1) - 40)},${base}L${legR(1)}L${legR(0.3)}L${f(tx + 6)},${top}z" fill="url(#tower)"/>
  <g stroke="#7A1E0C" stroke-opacity=".55" stroke-width="1.6" fill="none">${lattice}</g>
  <rect x="${f(tx - half(0.3) - 8)}" y="${f(at(0.3) - 10)}" width="${f(half(0.3) * 2 + 16)}" height="16" rx="2" fill="#FFF1D2"/>
  <rect x="${f(tx - half(0.62) - 14)}" y="${f(at(0.62) - 14)}" width="${f(half(0.62) * 2 + 28)}" height="22" rx="3" fill="#FFF4DC"/>
  <rect x="${f(tx - half(0.62) - 14)}" y="${f(at(0.62) + 8)}" width="${f(half(0.62) * 2 + 28)}" height="5" fill="#C23B16"/>
  <circle cx="${tx}" cy="${top - 70}" r="3" fill="#FF5A4A"/>
</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060A16"/><stop offset=".45" stop-color="#0E1530"/><stop offset=".75" stop-color="#2A2346"/><stop offset="1" stop-color="#5A3438"/></linearGradient>
<radialGradient id="tglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF8A3D" stop-opacity=".45"/><stop offset=".5" stop-color="#FF7A2E" stop-opacity=".12"/><stop offset="1" stop-color="#FF7A2E" stop-opacity="0"/></radialGradient>
<linearGradient id="tower" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD27A"/><stop offset=".35" stop-color="#FF8A2E"/><stop offset="1" stop-color="#E2541C"/></linearGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1017" stop-opacity="0"/><stop offset="1" stop-color="#0B1017" stop-opacity=".9"/></linearGradient>
<radialGradient id="city" cx=".7" cy="1" r=".6"><stop offset="0" stop-color="#FFB25E" stop-opacity=".28"/><stop offset="1" stop-color="#FFB25E" stop-opacity="0"/></radialGradient>
${windowPatterns(rnd)}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars(rnd, W, H * 0.5, 90)}
<rect width="${W}" height="${H}" fill="url(#city)"/>
<g>${skyline(rnd, { W, H, x0: 0, x1: W, minH: 90, maxH: 210, color: '#121A30', shape: (p) => 0.5 + p * 0.8 })}</g>
${tower}
<g>${skyline(rnd, { W, H, x0: 520, x1: 1110, minH: 70, maxH: 250, color: '#0A1020', shape: (p) => 0.4 + p })}</g>
<g>${skyline(rnd, { W, H, x0: 1300, x1: W, minH: 120, maxH: 330, color: '#0A1020' })}</g>
<g>${skyline(rnd, { W, H, x0: 0, x1: W, minH: 30, maxH: 90, color: '#080D19' })}</g>
<rect y="${H - 160}" width="${W}" height="160" fill="url(#haze)"/>
</svg>`;
  writeFileSync('src/img/hero-tokyo.svg', svg.replace(/\n/g, ''));
}

// ---------- バンコク（寺院の塔と高層ビル、川面の反射） ----------
{
  const W = 1600, H = 520, rnd = rng(29);
  const river = 430;
  const prang = (cx, h, w) => {
    const b = river;
    const t = b - h;
    // 先がとがったトウモロコシ型の塔（段の線を入れる）
    const body = `M${f(cx - w)},${b}C${f(cx - w)},${f(b - h * 0.35)} ${f(cx - w * 0.42)},${f(b - h * 0.55)} ${f(cx - w * 0.16)},${f(b - h * 0.86)}L${cx},${t}L${f(cx + w * 0.16)},${f(b - h * 0.86)}C${f(cx + w * 0.42)},${f(b - h * 0.55)} ${f(cx + w)},${f(b - h * 0.35)} ${f(cx + w)},${b}z`;
    let lines = '';
    for (let i = 1; i < 9; i++) { const y = b - h * 0.86 * (i / 9); lines += `<path d="M${f(cx - w * 1.1)} ${f(y)}h${f(w * 2.2)}"/>`; }
    const id = `c${Math.round(cx)}`;
    return `<clipPath id="${id}"><path d="${body}"/></clipPath><path d="${body}" fill="url(#gold)"/><g clip-path="url(#${id})" stroke="#8A5418" stroke-opacity=".55" stroke-width="2">${lines}</g><rect x="${f(cx - w * 1.15)}" y="${b - 8}" width="${f(w * 2.3)}" height="8" fill="#C98A34"/>`;
  };
  const temple = `<ellipse cx="800" cy="${river - 120}" rx="420" ry="230" fill="url(#gglow)"/>${prang(800, 300, 70)}${prang(650, 170, 42)}${prang(950, 170, 42)}${prang(560, 110, 28)}${prang(1040, 110, 28)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070A18"/><stop offset=".5" stop-color="#151634"/><stop offset=".8" stop-color="#3B2448"/><stop offset="1" stop-color="#6A3A3E"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE6A8"/><stop offset=".5" stop-color="#F0B54E"/><stop offset="1" stop-color="#B9772A"/></linearGradient>
<radialGradient id="gglow" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#FFB547" stop-opacity=".5"/><stop offset="1" stop-color="#FFB547" stop-opacity="0"/></radialGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1830"/><stop offset="1" stop-color="#0B1017"/></linearGradient>
<linearGradient id="refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0B54E" stop-opacity=".55"/><stop offset="1" stop-color="#F0B54E" stop-opacity="0"/></linearGradient>
${windowPatterns(rnd, '#FFD98A', '#E7C4FF')}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${stars(rnd, W, H * 0.45, 70)}
<g>${skyline(rnd, { W, H: river, x0: 0, x1: W, minH: 120, maxH: 260, color: '#131532', shape: (p) => 0.6 + Math.abs(p - 0.5) })}</g>
<g>${skyline(rnd, { W, H: river, x0: 1080, x1: W, minH: 140, maxH: 300, color: '#0B0F22' })}</g>
<g>${skyline(rnd, { W, H: river, x0: 0, x1: 520, minH: 60, maxH: 190, color: '#0B0F22' })}</g>
${temple}
<rect y="${river}" width="${W}" height="${H - river}" fill="url(#water)"/>
<g fill="url(#refl)">${[560, 650, 800, 950, 1040].map((x, i) => `<rect x="${x - (i === 2 ? 30 : 14)}" y="${river + 2}" width="${i === 2 ? 60 : 28}" height="${i === 2 ? 80 : 50}"/>`).join('')}</g>
<g stroke="#FFD98A" stroke-opacity=".35" stroke-width="2">${Array.from({ length: 40 }, () => { const x = rnd() * W, y = river + 6 + rnd() * 70, w = 10 + rnd() * 40; return `<path d="M${f(x)} ${f(y)}h${f(w)}"/>`; }).join('')}</g>
</svg>`;
  writeFileSync('src/img/hero-bangkok.svg', svg.replace(/\n/g, ''));
}
console.log('ok');
