// GLOBAL NIGHT GUIDE 2.0 — 静的サイトのビルド
// 本番 WordPress の REST API から記事・カテゴリ・固定ページを取得し、dist/ に書き出す。
// Vercel のビルド（npm run build）で毎回実行される。本番で記事を更新したら Vercel で Redeploy すると反映される。
//
// 環境変数
//   CANONICAL_ORIGIN  canonical / サイトマップに使う URL（既定：https://globalnightguide.com）
//   INDEXABLE=1       検索エンジンに登録させる（既定は noindex。プレビュー中の重複コンテンツを防ぐため）
//   IMG_OPT=1/0       Vercel の画像最適化を使うか（既定：Vercel 上でだけ使う）
//   GNG_FIXTURES=dir  ネットワークを使わず、手元の JSON で確認する
//   GNG_MEDIA_DIR=dir 映像・写真素材を手元のフォルダから読む（テスト用）
//   GNG_MEDIA=0       映像・写真素材を使わない（従来のイラスト・記事画像で表示）
import { mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { loadSite } from './lib/data.mjs';
import { makeLinker, href } from './lib/content.mjs';
import { PATHS } from './lib/icons.mjs';
import { CANONICAL, INDEXABLE } from './lib/components.mjs';
import { setArt, homePage, categoryPages, newPages, featuresPage, areaPage, rankingPage, guidePage, faqPage, articlePage, staticPage, searchPage, dashboardPage, notFoundPage } from './lib/pages.mjs';

const OUT = 'dist';
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

async function write(path, body) {
  const file = /\.\w+$/.test(path) ? join(OUT, path) : join(OUT, decodeURI(path), 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body);
}

async function concat(dir) {
  const files = (await readdir(dir)).filter((f) => !f.startsWith('_')).sort();
  return (await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')))).join('\n');
}

// フォント（Noto Sans JP 400/700、Inter 400/600/700）を自前で配信する
async function buildFonts() {
  const fdir = join(OUT, 'assets/fonts');
  await mkdir(fdir, { recursive: true });
  let css = '';
  const take = async (pkg, file) => {
    const base = `node_modules/@fontsource/${pkg}`;
    let c = await readFile(join(base, file), 'utf8');
    c = c.replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
    for (const m of c.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) await cp(join(base, 'files', m[1]), join(fdir, m[1]));
    css += c.replace(/url\(\.\/files\//g, 'url(/assets/fonts/');
  };
  for (const w of [400, 600, 700]) await take('inter', `latin-${w}.css`);
  // フォントは font-display: optional（間に合わなければ端末のフォントで表示し、
  // 2 ページ目以降でキャッシュから使う）。表示の遅れとレイアウトのずれを防ぐ
  for (const w of [400, 700]) await take('noto-sans-jp', `${w}.css`);
  // 見出し用の明朝（Noto Serif JP 700）
  await take('noto-serif-jp', '700.css');
  css = css.replace(/font-display: swap/g, 'font-display: optional');
  return { css, interPreload: '/assets/fonts/inter-latin-400-normal.woff2' };
}

// ---------- 映像・写真素材（Higgsfield で生成し、Web 用に圧縮したもの） ----------
// 素材の一覧と各ファイルの SHA-256 は src/media/manifest.json。本体は 1 つの ZIP（pack.url）にまとめてあり、
// ビルドのときに取得して中身を検証してから dist/assets/media/ に書き出す（配信はこのサイト自身のドメイン）。
// 取得や検証に失敗したときは素材を使わず、従来のイラスト・記事画像で表示する（ビルドは止めない）
async function walkFiles(root, dir = root, out = new Map()) {
  let list = [];
  try { list = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of list) {
    const full = join(dir, d.name);
    if (d.isDirectory()) await walkFiles(root, full, out);
    else if (!d.name.startsWith('.') && !/\.(md|json)$/.test(d.name)) out.set(full.slice(root.length + 1), await readFile(full));
  }
  return out;
}
// ZIP（無圧縮 / deflate）を読む。依存パッケージを増やさないための最小限の実装
function unzip(buf) {
  const files = new Map();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip: no end record');
  let p = buf.readUInt32LE(eocd + 16);
  const n = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central record');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(start, start + csize);
    files.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
  }
  return files;
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
async function loadMedia() {
  if (process.env.GNG_MEDIA === '0') return new Map();
  if (process.env.GNG_MEDIA_DIR) return walkFiles(process.env.GNG_MEDIA_DIR.replace(/\/$/, ''));
  const local = await walkFiles('src/media');
  if (local.size) return local;
  let manifest;
  try { manifest = JSON.parse(await readFile('src/media/manifest.json', 'utf8')); } catch { return new Map(); }
  const { pack, assets = [] } = manifest;
  if (!pack?.url) return new Map();
  const cache = join('node_modules/.cache/gng-media', `${pack.sha256}.zip`);
  try {
    let buf = await readFile(cache).catch(() => null);
    if (!buf || sha256(buf) !== pack.sha256) {
      const res = await fetch(pack.url, { signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
      if (sha256(buf) !== pack.sha256) throw new Error('pack checksum mismatch');
      await mkdir(dirname(cache), { recursive: true });
      await writeFile(cache, buf);
    }
    const files = unzip(buf);
    // manifest に載っていて、ハッシュが一致するファイルだけを使う
    const ok = new Map();
    for (const a of assets) for (const f of a.files || []) {
      const b = files.get(f.path);
      if (b && sha256(b) === f.sha256) ok.set(f.path, b);
      else console.warn(`media: skip ${f.path}`);
    }
    return ok;
  } catch (e) {
    console.warn(`media: not available (${e.message}). Using fallback images.`);
    return new Map();
  }
}

async function buildAssets() {
  await mkdir(join(OUT, 'assets'), { recursive: true });
  const fonts = await buildFonts();
  // コメントと余分な空白を取り除く（簡易的な圧縮）
  const css = (await concat('src/styles')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').replace(/\n+/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  const icons = `const ICON_PATHS = ${JSON.stringify(PATHS)};\n`;
  const js = `(() => {\n'use strict';\n${icons}${await concat('src/client')}\n})();\n`;
  const boot = await readFile('src/client/_boot.js', 'utf8');
  const names = { fonts: `/assets/fonts.${hash(fonts.css)}.css`, css: `/assets/app.${hash(css)}.css`, js: `/assets/app.${hash(js)}.js`, boot: `/assets/boot.${hash(boot)}.js`, fontInter: fonts.interPreload };
  await writeFile(join(OUT, names.css), css);
  await writeFile(join(OUT, names.fonts), fonts.css);
  await writeFile(join(OUT, names.js), js);
  await writeFile(join(OUT, names.boot), boot);
  await writeFile(join(OUT, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#0B1017"/><g fill="none" stroke="#D9BC80" stroke-width="2.6"><circle cx="24" cy="24" r="16"/><ellipse cx="24" cy="24" rx="7" ry="16"/><path d="M24 8v32M8 24h32M10.5 16h27M10.5 32h27"/></g></svg>');
  // 夜景イラスト・地図（scripts/gen-art.mjs で作った SVG）
  // ファイル名に内容のハッシュを付ける（長期キャッシュしても差し替えが反映されるように）
  names.art = {};
  await mkdir(join(OUT, 'assets/img'), { recursive: true });
  for (const f of await readdir('src/img')) {
    const buf = await readFile(join('src/img', f));
    const [base, ext] = [f.replace(/\.[^.]+$/, ''), f.split('.').pop()];
    const out = `/assets/img/${base}.${hash(buf)}.${ext}`;
    await writeFile(join(OUT, out), buf);
    names.art[base] = out;
  }
  // 映像・写真素材（src/media/<種類>/<名前>.<拡張子> → /assets/media/<種類>/<名前>.<ハッシュ>.<拡張子>）
  // 参照名は「種類/名前.拡張子」（例：heroes/home-tokyo-desktop.mp4）
  names.media = {};
  const files = await loadMedia();
  for (const [rel, buf] of files) {
    const out = `/assets/media/${rel.replace(/\.([^.]+)$/, `.${hash(buf)}.$1`)}`;
    await mkdir(join(OUT, out, '..'), { recursive: true });
    await writeFile(join(OUT, out), buf);
    names.media[rel] = out;
  }
  if (files.size) console.log(`media: ${files.size} files`);
  return names;
}

async function build() {
  const t0 = Date.now();
  const site = await loadSite();
  if (!site.posts.length) throw new Error('記事を 1 件も取得できませんでした');
  const link = makeLinker(site);
  await rm(OUT, { recursive: true, force: true });
  const assets = await buildAssets();
  setArt(assets.art, assets.media);

  const urls = []; // サイトマップ用
  const put = async (path, html, lastmod) => { await write(path, html); urls.push({ path, lastmod }); };

  await put('/', homePage(site, assets), site.updated);
  for (const pg of newPages(site, assets)) await put(pg.path, pg.html, site.updated);
  await put('/features/', featuresPage(site, assets), site.updated);
  await put('/area/', areaPage(site, assets), site.updated);
  await put('/ranking/', rankingPage(site, assets), site.updated);
  // はじめての方へ・よくある質問（元サイトに同じ URL のページがあれば、そちらを優先）
  if (!site.pages.some((p) => p.path === '/guide/')) await put('/guide/', guidePage(site, assets));
  if (!site.pages.some((p) => p.path === '/faq/')) await put('/faq/', faqPage(site, assets));
  for (const c of site.cats) {
    if (!c.posts.length) continue;
    const last = c.posts.reduce((m, p) => (p.modified > m ? p.modified : m), '');
    for (const pg of categoryPages(site, assets, c)) await put(pg.path, pg.html, last);
  }
  for (const p of site.posts) await put(p.path, articlePage(site, assets, p, link), p.modified);
  for (const pg of site.pages) await put(pg.path, staticPage(site, assets, pg, link), pg.modified);
  await write('/search/', searchPage(site, assets));
  await write('/my-dashboard/', dashboardPage(site, assets));
  await write('/404.html', notFoundPage(site, assets));

  // 検索・並び替え用の軽い索引（本文は含めない）
  await write('/search-index.json', JSON.stringify(site.posts.map((p) => ({
    u: href(p.path), t: p.title, e: p.excerpt, c: p.cat?.name || '', k: p.catIds, i: p.thumb, d: p.date, m: p.modified, r: p.readMin,
  }))));

  // サイトマップと robots.txt
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${CANONICAL}${href(u.path)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  await write('/sitemap.xml', sm);
  await write('/robots.txt', INDEXABLE
    ? `User-agent: *\nAllow: /\nDisallow: /my-dashboard/\nDisallow: /search/\n\nSitemap: ${CANONICAL}/sitemap.xml\n`
    : `# プレビュー環境のため、検索エンジンには登録しない（本番公開時は INDEXABLE=1 でビルド）\nUser-agent: *\nDisallow: /\n`);

  console.log(`built ${urls.length + 3} pages — ${site.posts.length} posts, ${site.cats.filter((c) => c.posts.length).length} categories, ${site.pages.length} pages, ranking ${site.popular.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

build().catch((e) => { console.error(e); process.exit(1); });
