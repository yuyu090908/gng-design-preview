// GLOBAL NIGHT GUIDE 2.0 — 静的サイトのビルド
// 本番 WordPress の REST API から記事・カテゴリ・固定ページを取得し、dist/ に書き出す。
// Vercel のビルド（npm run build）で毎回実行される。本番で記事を更新したら Vercel で Redeploy すると反映される。
//
// 環境変数
//   CANONICAL_ORIGIN  canonical / サイトマップに使う URL（既定：https://globalnightguide.com）
//   INDEXABLE=1       検索エンジンに登録させる（既定は noindex。プレビュー中の重複コンテンツを防ぐため）
//   IMG_OPT=1/0       Vercel の画像最適化を使うか（既定：Vercel 上でだけ使う）
//   GNG_FIXTURES=dir  ネットワークを使わず、手元の JSON で確認する
import { mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { loadSite } from './lib/data.mjs';
import { makeLinker, href } from './lib/content.mjs';
import { PATHS } from './lib/icons.mjs';
import { CANONICAL, INDEXABLE } from './lib/components.mjs';
import { homePage, categoryPages, newPages, featuresPage, articlePage, staticPage, searchPage, dashboardPage, notFoundPage } from './lib/pages.mjs';

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
  css = css.replace(/font-display: swap/g, 'font-display: optional');
  return { css, interPreload: '/assets/fonts/inter-latin-400-normal.woff2' };
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
  await writeFile(join(OUT, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0C1018"/><path d="M19.5 7.5a8.5 8.5 0 1 0 5 13.6A9 9 0 0 1 19.5 7.5Z" fill="#D7B77E"/></svg>');
  return names;
}

async function build() {
  const t0 = Date.now();
  const site = await loadSite();
  if (!site.posts.length) throw new Error('記事を 1 件も取得できませんでした');
  const link = makeLinker(site);
  await rm(OUT, { recursive: true, force: true });
  const assets = await buildAssets();

  const urls = []; // サイトマップ用
  const put = async (path, html, lastmod) => { await write(path, html); urls.push({ path, lastmod }); };

  await put('/', homePage(site, assets), site.updated);
  for (const pg of newPages(site, assets)) await put(pg.path, pg.html, site.updated);
  await put('/features/', featuresPage(site, assets), site.updated);
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
