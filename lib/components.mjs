// 共通 UI コンポーネント（HTML を返す関数）。ページはこれらを組み合わせて作る。
import { icon } from './icons.mjs';
import { COUNTRY } from './data.mjs';
import { href } from './content.mjs';

export const SITE = 'グローバルナイトガイド';
export const SITE_EN = 'GLOBAL NIGHT GUIDE';
export const CANONICAL = (process.env.CANONICAL_ORIGIN || 'https://globalnightguide.com').replace(/\/$/, '');
export const INDEXABLE = process.env.INDEXABLE === '1';
const IMG_OPT = process.env.IMG_OPT ? process.env.IMG_OPT === '1' : !!process.env.VERCEL;
export const IMG_SIZES = [256, 384, 640, 960, 1280];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ymd = (iso) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');
export const sameDay = (a, b) => (a || '').slice(0, 10) === (b || '').slice(0, 10);

// 画像の最適化（Vercel の画像最適化で WebP / AVIF に変換、幅を揃える）
export function img(url, w) {
  if (!url) return '';
  if (!IMG_OPT || !/^https:\/\/globalnightguide\.com\//.test(url)) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${w}&q=70`;
}
const srcset = (url, ws) => (IMG_OPT ? ws.map((w) => `${img(url, w)} ${w}w`).join(', ') : '');

export function catBadge(c) {
  const code = c && COUNTRY[c.name.replace(/風俗$/, '')];
  return code ? `<span class="flag" aria-hidden="true">${code}</span>` : '';
}

// ---------- 記事カード ----------
// variant: grid（縦型）/ list（横長）/ feature（大きい特集）/ mini（小）
export function ArticleCard(p, { variant = 'grid', eager = false, level = 3, rank = 0 } = {}) {
  const H = `h${level}`;
  const updated = !sameDay(p.date, p.modified);
  const sizes = variant === 'feature' ? '(min-width: 1024px) 50vw, 100vw' : variant === 'list' || variant === 'mini' ? '160px' : '(min-width: 1536px) 22vw, (min-width: 1024px) 28vw, (min-width: 480px) 45vw, 100vw';
  const ws = variant === 'feature' ? [640, 960, 1280] : variant === 'list' || variant === 'mini' ? [256, 384] : [384, 640];
  const src = variant === 'feature' ? p.hero || p.thumb : p.thumb;
  const media = src
    ? `<img src="${esc(img(src, ws[Math.min(1, ws.length - 1)]))}"${IMG_OPT ? ` srcset="${srcset(src, ws)}" sizes="${sizes}"` : ''} alt="" width="${variant === 'feature' ? 940 : 520}" height="${variant === 'feature' ? 529 : 293}" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async">`
    : `<span class="noimg" aria-hidden="true">${icon('moon', { size: 28 })}</span>`;
  return `<article class="ac ac--${variant}">
<div class="ac__media">${media}${rank ? `<span class="ac__rank" aria-label="${rank}位">${rank}</span>` : ''}</div>
<div class="ac__body">
${p.cat ? `<p class="ac__cat">${catBadge(p.cat)}${esc(p.cat.name)}</p>` : ''}
<${H} class="ac__title"><a class="ac__a" href="${href(p.path)}">${esc(p.title)}</a></${H}>
${variant === 'mini' ? '' : `<p class="ac__ex">${esc(p.excerpt)}</p>`}
<p class="ac__meta"><span><span class="sr">公開日 </span><time datetime="${esc(p.date)}">${ymd(p.date)}</time></span>${updated && variant !== 'mini' ? `<span class="ac__upd">${icon('refresh', { size: 12 })}<span class="sr">更新日 </span><time datetime="${esc(p.modified)}">${ymd(p.modified)}</time></span>` : ''}<span>${icon('clock', { size: 12 })}約${p.readMin}分</span></p>
</div>
${SaveButton(p)}
</article>`;
}

export function SaveButton(p, { withLabel = false } = {}) {
  return `<button class="save${withLabel ? ' save--label' : ''}" type="button" aria-pressed="false" aria-label="「${esc(p.title)}」を保存" data-save data-u="${esc(href(p.path))}" data-t="${esc(p.title)}" data-i="${esc(p.thumb ? img(p.thumb, 384) : '')}" data-c="${esc(p.cat?.name || '')}" data-d="${esc(p.date)}">${icon('bookmark', { size: 18 })}${withLabel ? '<span class="save__l">保存</span>' : ''}</button>`;
}

export const ArticleGrid = (ps, opts = {}) => `<div class="agrid" data-view-target>${ps.map((p, i) => ArticleCard(p, { eager: i < (opts.eager ?? 0), ...opts })).join('')}</div>`;
export const ArticleList = (ps, opts = {}) => `<div class="alist">${ps.map((p) => ArticleCard(p, { variant: 'list', ...opts })).join('')}</div>`;

// ---------- 横スワイプのカルーセル ----------
export function SwipeCarousel({ id, label, items }) {
  return `<div class="carousel" data-carousel>
<div class="carousel__ctrl"><button class="ibtn ibtn--sm" type="button" data-prev aria-controls="${id}" aria-label="${esc(label)}：前へ">${icon('left', { size: 18 })}</button><button class="ibtn ibtn--sm" type="button" data-next aria-controls="${id}" aria-label="${esc(label)}：次へ">${icon('right', { size: 18 })}</button></div>
<ul class="carousel__track" id="${id}" tabindex="0" aria-label="${esc(label)}（左右キーで移動）">${items.map((h) => `<li class="carousel__item">${h}</li>`).join('')}</ul>
</div>`;
}

export function SectionHead({ en, title, id, more, moreLabel = 'すべて見る', aside = '' }) {
  return `<div class="sh"><h2 class="sh__t" id="${id}">${en ? `<span class="sh__en">${esc(en)}</span>` : ''}${esc(title)}</h2><div class="sh__aside">${aside}${more ? `<a class="tbtn" href="${href(more)}">${esc(moreLabel)}${icon('right', { size: 16 })}</a>` : ''}</div></div>`;
}

// ---------- タブ ----------
export function TabNavigation({ id, label, tabs }) {
  return `<div class="tabs" data-tabs>
<div class="tabs__list" role="tablist" aria-label="${esc(label)}">${tabs.map((t, i) => `<button class="tabs__tab" type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${t.label}</button>`).join('')}</div>
${tabs.map((t, i) => `<div class="tabs__panel" role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}" data-tab-panel>${t.panel}</div>`).join('')}
</div>`;
}

// ---------- ページ送り ----------
export function Pagination(urlOf, cur, total) {
  if (total <= 1) return '';
  const nums = [...new Set([1, cur - 1, cur, cur + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let out = '', prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out += '<li><span class="pg__dots" aria-hidden="true">…</span></li>';
    out += n === cur ? `<li><span class="pg__n" aria-current="page">${n}</span></li>` : `<li><a class="pg__n" href="${href(urlOf(n))}" aria-label="${n}ページ目">${n}</a></li>`;
    prev = n;
  }
  return `<nav class="pg" aria-label="ページ送り"><ul>${cur > 1 ? `<li><a class="pg__n pg__step" href="${href(urlOf(cur - 1))}" rel="prev" aria-label="前のページ">${icon('left', { size: 18 })}</a></li>` : ''}${out}${cur < total ? `<li><a class="pg__n pg__step" href="${href(urlOf(cur + 1))}" rel="next" aria-label="次のページ">${icon('right', { size: 18 })}</a></li>` : ''}</ul></nav>`;
}

export function Breadcrumbs(list) {
  return `<nav class="bc" aria-label="パンくずリスト"><ol>${list.map((c, i) => `<li>${c.path && i < list.length - 1 ? `<a href="${href(c.path)}">${esc(c.name)}</a>` : `<span aria-current="page">${esc(c.name)}</span>`}</li>`).join('')}</ol></nav>`;
}
export function breadcrumbLd(list) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.path ? { item: CANONICAL + href(c.path) } : {}) })) };
}

// ---------- 目次 ----------
export function TableOfContents(toc) {
  if (toc.length < 2) return '';
  return `<details class="toc" data-toc open>
<summary class="toc__sum"><span class="toc__t">${icon('list', { size: 18 })}目次</span><span class="toc__n">${toc.length}項目</span>${icon('down', { size: 18, cls: 'toc__chev' })}</summary>
<ol class="toc__list">${toc.map((h, i) => `<li><a href="#${h.id}" data-toc-link><span class="toc__no">${String(i + 1).padStart(2, '0')}</span><span>${esc(h.t)}</span></a>${h.subs.length ? `<ul>${h.subs.map((s) => `<li><a href="#${s.id}" data-toc-link>${esc(s.t)}</a></li>`).join('')}</ul>` : ''}</li>`).join('')}</ol>
</details>`;
}

// ---------- 状態表示 ----------
export function EmptyState({ ic = 'bookmark', title, text = '', action = '' }) {
  return `<div class="state"><span class="state__ic">${icon(ic, { size: 28 })}</span><p class="state__t">${esc(title)}</p>${text ? `<p class="state__d">${esc(text)}</p>` : ''}${action}</div>`;
}
export function ErrorState({ title = '読み込みに失敗しました', text = '通信状況を確認して、もう一度お試しください。' } = {}) {
  return `<div class="state state--err" role="alert"><span class="state__ic">${icon('alert', { size: 28 })}</span><p class="state__t">${esc(title)}</p><p class="state__d">${esc(text)}</p><button class="btn btn--ghost" type="button" data-retry>再読み込み</button></div>`;
}
export const SkeletonLoader = (n = 6) => `<div class="agrid" aria-hidden="true">${'<div class="sk"><div class="sk__m"></div><div class="sk__l"></div><div class="sk__l sk__l--s"></div></div>'.repeat(n)}</div>`;

// ---------- ナビゲーション（サイドバーとドロワーで共用） ----------
function NavTree(site, path, { forDrawer = false } = {}) {
  const cur = (p) => (path === p ? ' aria-current="page"' : '');
  const item = (to, ic, label, extra = '') => `<li><a class="nv__a" href="${href(to)}"${cur(to)}${extra}>${icon(ic)}<span class="nv__l">${esc(label)}</span></a></li>`;
  const catLink = (c, short) => `<li><a class="nv__sub" href="${href(c.path)}"${path === c.path || path.startsWith(c.path + 'page/') ? ' aria-current="page"' : ''}>${catBadge(c)}<span class="nv__l">${esc(short ? c.name.replace(/風俗$/, '') : c.name)}</span><span class="nv__cnt">${c.posts.length}</span></a></li>`;
  const { japan, world, worldAll, themes } = site.groups;
  const inGroup = (cs) => cs.some((c) => c && (path === c.path || path.startsWith(c.path)));
  const group = (key, ic, label, inner, open) => `<li class="nv__grp"><details${open ? ' open' : ''} data-acc="${key}"><summary class="nv__a nv__sum">${icon(ic)}<span class="nv__l">${esc(label)}</span>${icon('down', { size: 16, cls: 'nv__chev' })}</summary><ul class="nv__subs">${inner}</ul></details></li>`;
  const sfx = forDrawer ? 'd' : 's';
  return `<nav class="nv" aria-label="サイトメニュー"><ul class="nv__list">
${item('/', 'home', 'ホーム')}
${item('/features/', 'sparkles', '特集')}
${item('/new/', 'clock', '新着記事')}
</ul>
<p class="nv__h" id="nv-cat-${sfx}">カテゴリ</p>
<ul class="nv__list" aria-labelledby="nv-cat-${sfx}">
${group('jp', 'pin', '国内', japan.map((c) => catLink(c)).join(''), inGroup(japan))}
${group('world', 'globe', '海外', (worldAll ? catLink(worldAll) : '') + world.map((c) => catLink(c, true)).join(''), inGroup([worldAll, ...world]))}
${themes.length ? group('theme', 'tag', 'テーマ', themes.map((c) => catLink(c)).join(''), inGroup(themes)) : ''}
</ul>
<p class="nv__h" id="nv-me-${sfx}">マイページ</p>
<ul class="nv__list" aria-labelledby="nv-me-${sfx}">
${item('/my-dashboard/#saved', 'bookmark', '保存記事', ' data-nav-saved')}
${item('/my-dashboard/#history', 'history', '閲覧履歴')}
${item('/my-dashboard/#settings', 'settings', '設定')}
${group('about', 'info', 'サイト情報', site.pages.map((p) => `<li><a class="nv__sub" href="${href(p.path)}"${cur(p.path)}><span class="nv__l">${esc(p.title)}</span></a></li>`).join(''), site.pages.some((p) => p.path === path))}
</ul></nav>`;
}

function Logo({ small = false } = {}) {
  return `<a class="logo${small ? ' logo--s' : ''}" href="/" aria-label="${SITE}（ホーム）"><span class="logo__mark" aria-hidden="true">${icon('moon', { size: 18 })}</span><span class="logo__t"><b>${SITE_EN}</b><small>${SITE}</small></span></a>`;
}

export function GlobalHeader() {
  return `<header class="gh">
<button class="ibtn gh__menu" type="button" aria-label="メニューを開く" aria-controls="drawer" aria-expanded="false" data-drawer-open>${icon('menu')}</button>
<button class="ibtn gh__sb" type="button" aria-label="サイドバーを折りたたむ" aria-expanded="true" data-sb-toggle>${icon('panel')}</button>
${Logo()}
${GlobalSearch({ id: 'gh-q', cls: 'gh__search' })}
<div class="gh__act">
<a class="ibtn gh__sicon" href="/search/" aria-label="記事を検索">${icon('search')}</a>
<button class="ibtn gh__pc" type="button" data-theme-toggle aria-label="ライトモードに切り替え">${icon('sun', { cls: 'only-dark' })}${icon('moon', { cls: 'only-light' })}</button>
<a class="ibtn gh__pc" href="/my-dashboard/#saved" aria-label="保存記事">${icon('bookmark')}<span class="badge" data-saved-count hidden></span></a>
<a class="ibtn gh__pc" href="/my-dashboard/" aria-label="マイダッシュボード">${icon('dashboard')}</a>
</div>
</header>`;
}

export function GlobalSearch({ id, cls = '', autofocus = false, value = '' }) {
  return `<form class="gs ${cls}" action="/search/" method="get" role="search"><label class="sr" for="${id}">記事を検索</label>${icon('search', { size: 18, cls: 'gs__ic' })}<input class="gs__in" id="${id}" type="search" name="q" value="${esc(value)}" placeholder="店名・エリア・キーワードで検索" autocomplete="off" enterkeyhint="search" maxlength="80"${autofocus ? ' data-autofocus' : ''}><kbd class="gs__kbd" aria-hidden="true">/</kbd></form>`;
}

export function DesktopSidebar(site, path) {
  return `<aside class="sb" id="sidebar" aria-label="サイドバー">${NavTree(site, path)}</aside>`;
}

export function MobileDrawer(site, path) {
  return `<div class="drawer" id="drawer" hidden>
<div class="drawer__bg" data-drawer-close></div>
<div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
<div class="drawer__hd"><h2 class="sr" id="drawer-title">メニュー</h2>${Logo({ small: true })}<button class="ibtn" type="button" data-drawer-close aria-label="メニューを閉じる">${icon('x')}</button></div>
<button class="drawer__theme" type="button" data-theme-toggle aria-label="ライトモードに切り替え">${icon('sun', { cls: 'only-dark' })}${icon('moon', { cls: 'only-light' })}<span class="only-dark">ライトモードにする</span><span class="only-light">ダークモードにする</span></button>
${NavTree(site, path, { forDrawer: true })}
</div></div>`;
}

export function MobileBottomNavigation(path) {
  const items = [['/', 'home', 'ホーム'], ['/search/', 'search', '検索'], ['/new/', 'clock', '新着'], ['/my-dashboard/#saved', 'bookmark', '保存'], ['/my-dashboard/', 'user', 'マイページ']];
  const active = (to) => (to === '/my-dashboard/#saved' ? false : to === path || (to === '/new/' && /^\/page\/\d+\/$/.test(path)));
  return `<nav class="bn" aria-label="下部メニュー"><ul>${items.map(([to, ic, l]) => `<li><a href="${to}"${active(to) ? ' aria-current="page"' : ''}${to.endsWith('#saved') ? ' data-bn-saved' : ''}>${icon(ic, { size: 22 })}<span>${l}</span>${to.endsWith('#saved') ? '<span class="badge" data-saved-count hidden></span>' : ''}</a></li>`).join('')}</ul></nav>`;
}

export function Footer(site) {
  const { japan, world } = site.groups;
  return `<footer class="ft">
<div class="ft__grid">
<div class="ft__brand">${Logo({ small: true })}<p>国内から海外まで、夜の街の文化・料金・遊び方を実体験ベースで整理するデジタルガイド。</p><p class="ft__note">${icon('shield', { size: 14 })}保存記事や閲覧履歴は、この端末のブラウザ内だけに保存され、外部へは送信されません。</p></div>
<div><h2 class="ft__h">国内</h2><ul>${japan.map((c) => `<li><a href="${href(c.path)}">${esc(c.name)}</a></li>`).join('')}</ul></div>
<div><h2 class="ft__h">海外</h2><ul>${world.slice(0, 8).map((c) => `<li><a href="${href(c.path)}">${esc(c.name)}</a></li>`).join('')}</ul></div>
<div><h2 class="ft__h">サイト情報</h2><ul>${site.pages.map((p) => `<li><a href="${href(p.path)}">${esc(p.title)}</a></li>`).join('')}<li><a href="/my-dashboard/#settings">プライバシー設定</a></li></ul></div>
</div>
<p class="ft__c"><small>© ${new Date().getFullYear()} ${SITE}　本サイトは18歳以上の方を対象としています。</small></p>
</footer>`;
}

function AgeGate() {
  return `<div class="modal" id="age-gate" hidden>
<div class="modal__bg"></div>
<div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="age-t" aria-describedby="age-d" tabindex="-1">
<p class="modal__ic">${icon('shield', { size: 28 })}</p>
<h2 class="modal__t" id="age-t">18歳以上の方を対象としたサイトです</h2>
<p class="modal__d" id="age-d">このサイトには成人向けの情報が含まれます。18歳未満の方の閲覧はご遠慮ください。確認結果はこの端末にのみ保存されます。</p>
<div class="modal__btns"><button class="btn btn--primary" type="button" data-age-ok>18歳以上なので閲覧する</button><a class="btn btn--ghost" href="https://www.google.co.jp/" rel="noopener noreferrer">退出する</a></div>
</div></div>`;
}

// ---------- 全ページ共通の外枠 ----------
export function AppShell(site, assets, { path, title, description = '', body, jsonld = [], ogImage = '', ogType = 'website', bodyClass = '', progress = false }) {
  const full = path === '/' ? `${SITE} | 国内・海外のナイトライフ情報ガイド` : `${title} | ${SITE}`;
  const canonical = CANONICAL + href(path);
  const desc = (description || '').slice(0, 120);
  return `<!DOCTYPE html>
<html lang="ja" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${INDEXABLE ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">
<meta name="rating" content="adult">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0C1018" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F6F5F2" media="(prefers-color-scheme: light)">
<meta property="og:site_name" content="${SITE}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(path === '/' ? full : title)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="ja_JP">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<link rel="preload" href="${assets.fontInter}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<script src="${assets.boot}"></script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
${progress ? '<div class="rp" aria-hidden="true"><span class="rp__bar"></span></div>' : ''}
<a class="skip" href="#content">本文へ移動</a>
${GlobalHeader()}
<div class="shell">
${DesktopSidebar(site, path)}
<main class="main" id="content" tabindex="-1">
${body}
${Footer(site)}
</main>
</div>
${MobileBottomNavigation(path)}
${MobileDrawer(site, path)}
${AgeGate()}
<div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
<button class="totop ibtn" type="button" aria-label="ページの先頭へ戻る" data-totop hidden>${icon('up')}</button>
<script src="${assets.js}" defer></script>
</body>
</html>
`;
}
