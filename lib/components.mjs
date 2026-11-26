// 共通 UI コンポーネント（HTML を返す関数）。ページはこれらを組み合わせて作る。
import { icon } from './icons.mjs';
import { COUNTRY } from './data.mjs';
import { href } from './content.mjs';

// リポジトリ内の素材（src/media）。build.mjs が setMedia でハッシュ付きの URL を渡す
const MEDIA = {};
export function setMedia(m = {}) { Object.assign(MEDIA, m); }
export const media = (rel) => MEDIA[rel];
// 装飾用の背景画像（AI生成のイメージ画像）。無いときは何も出さない
export function BgImg(rel, { cls = '', w = 1600, h = 400 } = {}) {
  const u = MEDIA[rel];
  return u ? `<img class="bgi ${cls}" src="${u}" alt="" aria-hidden="true" width="${w}" height="${h}" loading="lazy" decoding="async">` : '';
}
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

// カードのラベル（上位カテゴリ＋国・ジャンル）
export function cardTags(p) {
  const out = [];
  if (p.top) out.push(p.top.name);
  if (p.cat && p.cat !== p.top) out.push(p.cat.name.replace(/風俗$/, ''));
  return out;
}
const Tags = (p) => { const t = cardTags(p); return t.length ? `<p class="ac__tags">${t.map((x, i) => `<span class="tag${i ? '' : ' tag--main'}">${esc(x)}</span>`).join('')}</p>` : ''; };

// ---------- 記事カード ----------
// カードは 3 種類だけ：feature（Featured：大きい画像＋抜粋）/ grid（Standard：16:9 の画像）/ list（Compact：左に小さい画像）
// 画像の上には文字を載せない（カテゴリ・日付は本文側に置く）
export function ArticleCard(p, { variant = 'grid', eager = false, level = 3, rank = 0, excerpt = false } = {}) {
  variant = { over: 'grid', mini: 'list' }[variant] || variant;
  const H = `h${level}`;
  const big = variant === 'feature';
  const sizes = big ? '(min-width: 1024px) 40vw, 100vw' : variant === 'list' ? '128px' : '(min-width: 1600px) 16vw, (min-width: 1024px) 22vw, (min-width: 480px) 45vw, 80vw';
  const ws = big ? [640, 960] : variant === 'list' ? [256, 384] : [384, 640];
  const src = big ? p.hero || p.thumb : p.thumb;
  const media = src
    ? `<img src="${esc(img(src, ws[Math.min(1, ws.length - 1)]))}"${IMG_OPT ? ` srcset="${srcset(src, ws)}" sizes="${sizes}"` : ''} alt="" width="${big ? 940 : 520}" height="${big ? 529 : 293}" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async">`
    : `<span class="noimg" aria-hidden="true">${Globe(28)}</span>`;
  return `<article class="ac ac--${variant}">
<div class="ac__media">${media}${rank ? `<span class="ac__rank rk rk--${Math.min(rank, 4)}" aria-label="${rank}位">${rank}</span>` : ''}</div>
<div class="ac__body">
${Tags(p)}
<${H} class="ac__title"><a class="ac__a" href="${href(p.path)}">${esc(p.title)}</a></${H}>
${big || excerpt ? `<p class="ac__ex">${esc(p.excerpt)}</p>` : ''}
<p class="ac__meta"><span>${icon('calendar', { size: 13 })}<span class="sr">公開日 </span><time datetime="${esc(p.date)}">${ymd(p.date)}</time></span>${!sameDay(p.date, p.modified) && variant === 'feature' ? `<span class="ac__upd">${icon('refresh', { size: 13 })}<span class="sr">更新日 </span><time datetime="${esc(p.modified)}">${ymd(p.modified)}</time></span>` : ''}<span>${icon('clock', { size: 13 })}約${p.readMin}分</span></p>
</div>
${SaveButton(p)}
</article>`;
}

export function SaveButton(p, { withLabel = false } = {}) {
  return `<button class="save${withLabel ? ' save--label' : ''}" type="button" aria-pressed="false" aria-label="保存「${esc(p.title)}」" data-save data-u="${esc(href(p.path))}" data-t="${esc(p.title)}" data-i="${esc(p.thumb ? img(p.thumb, 384) : '')}" data-c="${esc(p.cat?.name || '')}" data-d="${esc(p.date)}">${icon('bookmark', { size: 18 })}${withLabel ? '<span class="save__l">保存</span>' : ''}</button>`;
}

export const ArticleGrid = (ps, opts = {}) => `<div class="agrid" data-view-target>${ps.map((p, i) => ArticleCard(p, { eager: i < (opts.eager ?? 0), ...opts })).join('')}</div>`;
export const ArticleList = (ps, opts = {}) => `<div class="alist">${ps.map((p) => ArticleCard(p, { variant: 'list', ...opts })).join('')}</div>`;

// ---------- 横スワイプのカルーセル（矢印・キーボード・ドラッグ・ドット） ----------
export function SwipeCarousel({ id, label, items, cls = '', side = false }) {
  const n = items.length;
  return `<section class="carousel${cls ? ' ' + cls : ''}${side ? ' carousel--side' : ''}" data-carousel aria-roledescription="カルーセル" aria-label="${esc(label)}">
<div class="carousel__ctrl"><button class="ibtn carousel__btn" type="button" data-prev aria-controls="${id}" aria-label="${esc(label)}：前へ">${icon('left', { size: 18 })}</button><button class="ibtn carousel__btn" type="button" data-next aria-controls="${id}" aria-label="${esc(label)}：次へ">${icon('right', { size: 18 })}</button></div>
<ul class="carousel__track" id="${id}" tabindex="0" aria-label="${esc(label)}（${n}件。左右キーで移動）">${items.map((h, i) => `<li class="carousel__item" aria-roledescription="スライド" aria-label="${i + 1} / ${n}">${h}</li>`).join('')}</ul>
<div class="carousel__foot"><span class="carousel__pos" data-pos aria-hidden="true"></span><div class="carousel__dots" data-dots aria-hidden="true"></div></div>
<p class="sr" aria-live="polite" data-live></p>
</section>`;
}

// セクション見出し：アイコン＋見出し＋補足＋「すべて見る」
export function SectionHead({ ic, title, sub = '', id, more, moreLabel = 'すべて見る', level = 2, aside = '' }) {
  const H = `h${level}`;
  return `<div class="sh"><${H} class="sh__t" id="${id}">${ic ? icon(ic, { size: 20 }) : ''}<span>${esc(title)}</span></${H}>${sub ? `<p class="sh__sub">${esc(sub)}</p>` : ''}<div class="sh__aside">${aside}${more ? `<a class="tbtn" href="${href(more)}">${esc(moreLabel)}${icon('right', { size: 14 })}</a>` : ''}</div></div>`;
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
// ヘッダーのピル・サイドバーのカテゴリに出すカテゴリ（名前とアイコン）
export const PILLS = [['国内風俗', 'pin'], ['海外風俗', 'plane'], ['ソープランド', 'bath'], ['高級デリヘル', 'gem'], ['セフレ', 'heart'], ['精力剤', 'pill']];
export const pillCats = (site) => PILLS.map(([n, ic]) => ({ c: site.byName(n), ic })).filter((x) => x.c);
const isIn = (trail, c) => trail.includes(c.id);

function NavTree(site, path, trail, { id = 'sb' } = {}) {
  const cur = (p) => (path === p ? ' aria-current="page"' : '');
  const item = (to, ic, label, extra = '', badge = '') => `<li><a class="nv__a" href="${href(to)}"${cur(to)}${extra} data-tip="${esc(label)}">${icon(ic)}<span class="nv__l">${esc(label)}</span>${badge}</a></li>`;
  const pg = (slug) => site.pages.find((p) => p.slug === slug);
  const about = pg('about'), contact = pg('contact');
  const { japan = [], world = [], worldAll, themes = [] } = site.groups || {};
  const dom = site.byName('国内風俗');
  const themeList = [...pillCats(site).map((x) => x.c).filter((c) => c !== dom && c !== worldAll), ...themes.filter((c) => !PILLS.some(([n]) => n === c.name))].filter((c, i, a) => a.indexOf(c) === i);
  // カテゴリは「国内／海外／テーマ」の3つのまとまりに分け、今いるまとまりだけ開く
  const sub = (c, label = c.name) => `<li><a class="nv__s" href="${href(c.path)}"${isIn(trail, c) && trail[trail.length - 1] === c.id ? ' aria-current="page"' : ''}><span class="nv__l">${esc(label)}</span><span class="nv__n">${c.posts.length}</span></a></li>`;
  const group = (key, ic, label, all, list) => {
    if (!all && !list.length) return '';
    const open = (all && isIn(trail, all)) || list.some((c) => isIn(trail, c));
    return `<li><details class="nv__g" data-acc="${key}"${open ? ' open' : ''}><summary class="nv__a nv__sum" data-tip="${esc(label)}">${icon(ic)}<span class="nv__l">${esc(label)}</span>${icon('down', { size: 16, cls: 'nv__chev' })}</summary><ul class="nv__subl">${all ? sub(all, `${label}のすべて`) : ''}${list.map((c) => sub(c, c.name.replace(/風俗$/, '') || c.name)).join('')}</ul></details></li>`;
  };
  return `<nav class="nv" aria-label="サイトメニュー"><ul class="nv__list">
${item('/', 'home', 'ホーム')}
${item('/new/', 'file', '新着記事')}
${item('/area/', 'pin', 'エリア情報')}
${item('/features/', 'layers', '特集')}
${item('/ranking/', 'crown', 'ランキング')}
</ul>
<p class="nv__h" id="${id}-cat-h">カテゴリー</p>
<ul class="nv__list nv__list--cat" aria-labelledby="${id}-cat-h">
${group('jp', 'pin', '国内', dom, japan)}
${group('world', 'plane', '海外', worldAll, world)}
${group('theme', 'star', 'テーマ', null, themeList)}
</ul>
<p class="nv__h" id="${id}-me-h">マイライブラリ</p>
<ul class="nv__list" aria-labelledby="${id}-me-h">
${item('/my-dashboard/#saved', 'bookmark', '保存した記事', ' data-nav-saved', '<span class="nv__badge" data-saved-count hidden></span>')}
${item('/my-dashboard/', 'userc', 'マイページ')}
</ul>
<ul class="nv__list nv__list--sub">
${item('/guide/', 'help', 'はじめての方へ')}
${item('/faq/', 'info', 'よくある質問')}
${about ? item(about.path, 'file', '運営について') : ''}
${contact ? item(contact.path, 'mail', 'お問い合わせ') : ''}
${item('/my-dashboard/#settings', 'shield', 'プライバシー設定')}
</ul></nav>`;
}

// 金色の地球のロゴ
export const Globe = (size = 40) => `<svg class="globe" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="20"/><ellipse cx="24" cy="24" rx="9" ry="20"/><path d="M24 4v40M4 24h40M7.5 13h33M7.5 35h33"/></svg>`;

function Logo({ variant = 'side' } = {}) {
  return `<a class="logo logo--${variant}" href="/">${Globe(variant === 'side' ? 46 : 30)}<span class="logo__t"><b>GLOBAL<br>NIGHT GUIDE</b><small>グローバルナイトガイド</small><span class="sr">（ホーム）</span></span></a>`;
}

export function CategoryPills(site, trail, { cls = '' } = {}) {
  return `<ul class="pills ${cls}">${pillCats(site).map(({ c, ic }) => `<li><a class="pill" href="${href(c.path)}"${isIn(trail, c) ? ' aria-current="page"' : ''}>${icon(ic, { size: 16 })}${esc(c.name)}</a></li>`).join('')}</ul>`;
}

export function GlobalHeader(site, trail, { search = true } = {}) {
  return `<header class="gh" data-gh>
<button class="ibtn gh__menu" type="button" aria-label="メニューを開く" aria-controls="drawer" aria-expanded="false" data-drawer-open>${icon('menu', { size: 22 })}</button>
${Logo({ variant: 'head' })}
<div class="gh__search">${search ? GlobalSearch({ id: 'gh-q', cls: 'gs--head', button: false, placeholder: 'キーワードで記事を検索（/）', label: 'サイト内の記事を検索' }) : ''}</div>
<nav class="gh__act" aria-label="ユーティリティ">
<a class="ibtn gh__sp" href="/search/" aria-label="記事を検索">${icon('search', { size: 22 })}</a>
<a class="ibtn gh__pc" href="/my-dashboard/#saved" aria-label="保存した記事">${icon('bookmark', { size: 22 })}<span class="badge" data-saved-count hidden></span></a>
<a class="ibtn gh__pc" href="/my-dashboard/#settings" aria-label="表示とプライバシーの設定">${icon('settings', { size: 22 })}</a>
<a class="ibtn gh__pc gh__user" href="/my-dashboard/" aria-label="マイページ">${icon('userc', { size: 24 })}</a>
</nav>
</header>`;
}

export function GlobalSearch({ id, cls = '', value = '', placeholder = 'エリア・店舗・キーワードで記事を検索', button = true, cat = '', label = '記事を検索' }) {
  return `<form class="gs ${cls}" action="/search/" method="get" role="search"><label class="sr" for="${id}">${esc(label)}</label>${icon('search', { size: 20, cls: 'gs__ic' })}<input class="gs__in" id="${id}" type="search" name="q" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search" maxlength="80">${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ''}${button ? '<button class="gs__btn" type="submit">検索</button>' : ''}</form>`;
}

export function DesktopSidebar(site, path, trail) {
  return `<aside class="sb" id="sidebar" aria-label="サイドバー">${Logo()}${NavTree(site, path, trail)}<button class="sb__toggle" type="button" aria-label="サイドバーを折りたたむ" aria-expanded="true" data-sb-toggle>${icon('panel', { size: 18 })}<span class="nv__l">折りたたむ</span></button></aside>`;
}

export function MobileDrawer(site, path, trail) {
  return `<div class="drawer" id="drawer" hidden>
<div class="drawer__bg" data-drawer-close></div>
<div class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
<div class="drawer__hd"><h2 class="sr" id="drawer-title">メニュー</h2>${Logo({ variant: 'head' })}<button class="ibtn" type="button" data-drawer-close aria-label="メニューを閉じる">${icon('x')}</button></div>
${NavTree(site, path, trail, { id: 'dr' })}
</div></div>`;
}

export function MobileBottomNavigation(path) {
  const items = [['/', 'home', 'ホーム'], ['/new/', 'file', '新着'], ['/search/', 'search', '探す'], ['/my-dashboard/#saved', 'bookmark', '保存'], ['/my-dashboard/', 'userc', 'マイページ']];
  const active = (to) => (to === '/my-dashboard/#saved' ? false : to === path);
  return `<nav class="bn" aria-label="下部メニュー"><ul>${items.map(([to, ic, l]) => `<li><a href="${to}"${active(to) ? ' aria-current="page"' : ''}${to.endsWith('#saved') ? ' data-bn-saved' : ''}>${icon(ic, { size: 22 })}<span>${l}</span>${to.endsWith('#saved') ? '<span class="badge" data-saved-count hidden></span>' : ''}</a></li>`).join('')}</ul></nav>`;
}

export function Footer(site) {
  const pg = (slug) => site.pages.find((p) => p.slug === slug);
  const links = [['/guide/', 'はじめての方へ'], ['/faq/', 'よくある質問'], ...(pg('about') ? [[pg('about').path, '運営について']] : []), ...(pg('contact') ? [[pg('contact').path, 'お問い合わせ']] : []), ['/my-dashboard/#settings', 'プライバシー設定'], ['/area/', 'エリア情報']];
  return `<footer class="ft">${BgImg('backgrounds/footer-skyline.webp', { cls: 'ft__bg', w: 1600, h: 480 })}
<div class="ft__row">${Logo({ variant: 'head' })}<ul class="ft__links">${links.map(([to, l]) => `<li><a href="${href(to)}">${l}</a></li>`).join('')}</ul></div>
<p class="ft__note">${icon('shield', { size: 14 })}保存した記事や閲覧履歴は、この端末のブラウザ内だけに保存され、外部へは送信されません。</p>
<p class="ft__c"><small>© ${new Date().getFullYear()} ${SITE}　本サイトは18歳以上の方を対象としています。　背景の映像・画像は AI で生成したイメージです。</small></p>
</footer>`;
}

// 下から出る操作パネル（表示設定・並び替えなどを中に差し込む）
export function BottomSheet() {
  return `<div class="bs" id="sheet" hidden>
<div class="bs__bg" data-bs-close></div>
<div class="bs__panel" role="dialog" aria-modal="true" aria-labelledby="sheet-t" tabindex="-1">
<div class="bs__grip" data-bs-grip aria-hidden="true"><span></span></div>
<div class="bs__hd"><h2 class="bs__t" id="sheet-t">設定</h2><button class="ibtn" type="button" data-bs-close aria-label="閉じる">${icon('x')}</button></div>
<div class="bs__body" data-bs-body></div>
</div></div>`;
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
export function AppShell(site, assets, { path, title, description = '', body, jsonld = [], ogImage = '', ogType = 'website', bodyClass = '', progress = false, trail = [], preload = '' }) {
  const full = path === '/' ? `${SITE} | 国内・海外のナイトライフ情報ガイド` : `${title} | ${SITE}`;
  const canonical = CANONICAL + href(path);
  const desc = (description || '').slice(0, 120);
  return `<!DOCTYPE html>
<html lang="ja" data-theme="dark" data-fonts="${assets.fonts}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${INDEXABLE ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">
<meta name="rating" content="adult">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0B0F15">
<meta property="og:site_name" content="${SITE}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(path === '/' ? full : title)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="ja_JP">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${preload ? (typeof preload === 'object' ? `<link rel="preload" as="image" imagesrcset="${preload.srcset}" imagesizes="${preload.sizes}" type="${preload.type}" fetchpriority="high">` : `<link rel="preload" href="${preload}" as="image" fetchpriority="high">`) : ''}
<link rel="preload" href="${assets.fontInter}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assets.css}">
<noscript><link rel="stylesheet" href="${assets.fonts}"></noscript>
<script src="${assets.boot}"></script>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="${bodyClass}">
${progress ? '<div class="rp" aria-hidden="true"><span class="rp__bar"></span></div>' : ''}
<a class="skip" href="#content">本文へ移動</a>
<div class="app">
${DesktopSidebar(site, path, trail)}
<div class="app__col">
${GlobalHeader(site, trail)}
<main class="main" id="content" tabindex="-1">
${body}
${Footer(site)}
</main>
</div>
</div>
${MobileBottomNavigation(path)}
${MobileDrawer(site, path, trail)}
${AgeGate()}
${BottomSheet()}
<div class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
<button class="totop ibtn" type="button" aria-label="ページの先頭へ戻る" data-totop hidden>${icon('up')}</button>
<script src="${assets.js}" defer></script>
</body>
</html>
`;
}
