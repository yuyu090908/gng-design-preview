// 各ページのテンプレート。共通コンポーネント（components.mjs）を組み合わせて作る。
import { icon } from './icons.mjs';
import { cleanContent, href } from './content.mjs';
import { COUNTRY, COUNTRY_EN, text } from './data.mjs';
import {
  AppShell, ArticleCard, ArticleGrid, ArticleList, SwipeCarousel, SectionHead, TabNavigation, Pagination, Breadcrumbs, breadcrumbLd,
  TableOfContents, EmptyState, SkeletonLoader, GlobalSearch, SaveButton, CategoryPills, Globe, cardTags, catBadge, esc, ymd, sameDay, img, SITE, SITE_EN, CANONICAL, setMedia, media, BgImg,
} from './components.mjs';

export const PER_PAGE = 12;

const orgLd = () => ({ '@context': 'https://schema.org', '@type': 'Organization', name: SITE, alternateName: SITE_EN, url: CANONICAL + '/' });
const chips = (cs, { short = false, counts = true } = {}) => `<ul class="chips">${cs.map((c) => `<li><a class="chip" href="${href(c.path)}">${catBadge(c)}${esc(short ? c.name.replace(/風俗$/, '') : c.name)}${counts ? `<span class="chip__n">${c.posts.length}</span>` : ''}</a></li>`).join('')}</ul>`;
const shortName = (c) => c.name.replace(/風俗$/, '');
const trailOf = (site, c) => { const t = []; for (let x = c; x; x = site.catById.get(x.parent)) t.push(x.id); return t; };

// 背景のイラスト（コードで描いたオリジナルの夜景。写真ではない）
const ART = {};
export function setArt(a, m = {}) { ART.tokyo = a['hero-tokyo']; ART.bangkok = a['hero-bangkok']; ART.map = a['asia-map']; setMedia(m); }
// リポジトリ内の素材（src/media）。無いときは undefined を返し、呼び出し側は従来の画像に戻る
const M = media;
// ポスター画像：<名前>-640.webp / -1280.webp / -1920.webp（AVIF があれば優先）
function Poster(base, { cls = '', sizes = '100vw', eager = false, alt = '', w = 1280, h = 731 } = {}) {
  const ws = [480, 640, 960, 1280, 1920].filter((x) => M(`${base}-${x}.webp`));
  if (!ws.length) return '';
  const set = (ext) => ws.filter((x) => M(`${base}-${x}.${ext}`)).map((x) => `${M(`${base}-${x}.${ext}`)} ${x}w`).join(', ');
  const avif = set('avif');
  const fallback = M(`${base}-${ws.includes(1280) ? 1280 : ws[ws.length - 1]}.webp`);
  const lazy = eager === 'auto' ? '' : eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<picture>${avif ? `<source type="image/avif" srcset="${avif}" sizes="${sizes}">` : ''}<img class="${cls}" src="${fallback}" srcset="${set('webp')}" sizes="${sizes}" alt="${esc(alt)}" width="${w}" height="${h}"${lazy} decoding="async"></picture>`;
}
// 背景映像（CinematicVideoBackground）：ポスター → 動画。動画は画面に入ってから JS が読み込む
// key: heroes/home-tokyo など。prio: 1 が最優先
function Cinematic(key, { cls = '', prio = 1, eager = true, sizes = CINE_SIZES, note = 'イメージ映像（AI生成）', toggle = false } = {}) {
  const poster = Poster(`${key}-poster`, { cls: 'cv__poster', sizes, eager });
  if (!poster) return '';
  const d = M(`${key}-desktop.mp4`), m = M(`${key}-mobile.mp4`);
  const name = key.split('/').pop();
  return `<div class="cv cv--${name} ${cls}" ${d ? `data-cv data-prio="${prio}" data-d="${d}"${m ? ` data-m="${m}"` : ''}` : ''} aria-hidden="true">${poster}</div><span class="art-note">${note}</span>${d && toggle ? `<button class="cv__toggle" type="button" data-cv-toggle aria-pressed="false" aria-label="背景の映像を停止する">${icon('pause', { size: 14 })}<span data-cv-toggle-l>映像を停止</span></button>` : ''}`;
}
const CINE_SIZES = '(min-width: 1024px) 70vw, 100vw';
// ポスター画像の先読み（<picture> と同じ候補・同じ sizes を渡し、二重に読み込まないようにする）
const cinematicPreload = (key) => {
  const base = `${key}-poster`;
  const ext = M(`${base}-640.avif`) ? 'avif' : 'webp';
  const list = [640, 1280].filter((x) => M(`${base}-${x}.${ext}`));
  return list.length ? { srcset: list.map((x) => `${M(`${base}-${x}.${ext}`)} ${x}w`).join(', '), sizes: CINE_SIZES, type: `image/${ext}` } : '';
};
// ヒーローの夜景写真（Higgsfield で生成したイメージ画像）。Vercel の画像最適化で WebP / AVIF にして配信し、
// 読み込めないときは SVG のイラストに切り替える（ローカルのビルドではイラストを使う）
const PHOTO = {
  tokyo: 'https://d8j0ntlcm91z4.cloudfront.net/user_3GzEOW1cbzyPjySGkbYzv7L3rIa/hf_20261125_133140_ebad8eed-53b1-4b40-bdfb-805e110eaf4c.png',
  bangkok: 'https://d8j0ntlcm91z4.cloudfront.net/user_3GzEOW1cbzyPjySGkbYzv7L3rIa/hf_20261125_133143_d1a393bc-8bed-49f8-9b35-128db37a5e97.png',
};
const USE_PHOTO = process.env.IMG_OPT ? process.env.IMG_OPT === '1' : !!process.env.VERCEL;
const opt = (u, w) => `/_vercel/image?url=${encodeURIComponent(u)}&w=${w}&q=70`;
// 背景画像の <img>（写真があれば写真、無ければイラスト）
const HERO_MEDIA = { tokyo: 'heroes/home-tokyo', bangkok: 'heroes/overseas-bangkok', domestic: 'heroes/domestic' };
function HeroImg(key, cls) {
  const cine = HERO_MEDIA[key] && Cinematic(HERO_MEDIA[key], { cls, toggle: true });
  if (cine) return cine;
  if (key === 'domestic') key = 'tokyo';
  const svg = ART[key];
  if (USE_PHOTO && PHOTO[key]) {
    return `<img class="${cls} is-photo" src="${opt(PHOTO[key], 1280)}" srcset="${[640, 960, 1280].map((w) => `${opt(PHOTO[key], w)} ${w}w`).join(', ')}" sizes="(min-width: 1024px) 60vw, 100vw" data-fallback="${svg}" alt="" width="1344" height="752" fetchpriority="high" decoding="async"><span class="art-note">イメージ画像（AI生成）</span>`;
  }
  return `<img class="${cls}" src="${svg}" alt="" width="1600" height="560" fetchpriority="high" decoding="async"><span class="art-note">イメージイラスト</span>`;
}
const heroPreload = (key) => (HERO_MEDIA[key] && cinematicPreload(HERO_MEDIA[key])) || (USE_PHOTO && PHOTO[key === 'domestic' ? 'tokyo' : key] ? opt(PHOTO[key === 'domestic' ? 'tokyo' : key], 1280) : ART[key === 'domestic' ? 'tokyo' : key]);

// エリアの一覧（日本＝国内風俗、海外は記事数の多い順）
function areas(site) {
  const jp = site.byName('国内風俗');
  return [...(jp ? [{ c: jp, jp: '日本', en: 'JAPAN' }] : []), ...site.groups.world.map((c) => ({ c, jp: shortName(c), en: COUNTRY_EN[shortName(c)] || '' }))];
}
function AreaCard({ c, jp, en }, { eager = false } = {}) {
  const key = (en || '').toLowerCase();
  const art = key && Poster(`regions/${key}`, { sizes: '(min-width: 1024px) 260px, 45vw', eager: false, w: 960, h: 723 });
  if (art) return `<a class="area area--art" href="${href(c.path)}">${art}<span class="area__b"><span class="area__jp">${esc(jp)}</span><span class="area__en">${esc(en)}<span class="sr">（${c.posts.length}記事）</span>${icon('right', { size: 12 })}</span></span></a>`;
  const cover = c.posts.find((p) => p.thumb)?.thumb;
  return `<a class="area" href="${href(c.path)}">${cover ? `<img src="${esc(img(cover, 384))}" alt="" width="520" height="293" loading="${eager ? 'eager' : 'lazy'}" decoding="async">` : `<span class="noimg" aria-hidden="true">${Globe(28)}</span>`}<span class="area__b"><span class="area__jp">${esc(jp)}</span><span class="area__en">${esc(en)}<span class="sr">（${c.posts.length}記事）</span>${icon('right', { size: 12 })}</span></span></a>`;
}
const AreaRow = (list, id) => SwipeCarousel({ id, label: 'エリア', cls: 'carousel--area', items: list.map((a, i) => AreaCard(a, { eager: i < 4 })) });

// ランキング（元サイトの人気記事ウィジェットの順番。閲覧数は持っていないので表示しない）
function RankList(list, { ranked = true } = {}) {
  return `<ol class="rkl${ranked ? '' : ' rkl--plain'}">${list.map((p, i) => `<li><a class="rki" href="${href(p.path)}">${ranked ? `<span class="rk rk--${Math.min(i + 1, 4)}"><span class="sr">第</span>${i + 1}<span class="sr">位</span></span>` : ''}<span class="rki__img">${p.thumb ? `<img src="${esc(img(p.thumb, 256))}" alt="" width="520" height="293" loading="lazy" decoding="async">` : `<span class="noimg">${Globe(18)}</span>`}</span><span class="rki__b"><span class="rki__t">${esc(p.title)}</span><span class="rki__m">${icon('calendar', { size: 12 })}<time datetime="${esc(p.date)}">${ymd(p.date)}</time></span></span></a></li>`).join('')}</ol>`;
}
// マイライブラリ（保存・続きから読む）。中身はこの端末の保存データだけを使って画面側で描く
function LibraryPanels() {
  return `<section class="sec" aria-labelledby="sec-lib">
  ${SectionHead({ ic: 'bookmark', title: 'マイライブラリ', sub: 'この端末だけに保存されます', id: 'sec-lib', more: '/my-dashboard/', moreLabel: 'マイページを開く' })}
  <div class="lib">
    <div class="panel lib__p" data-saved-mini>
      <h3 class="lib__t">${icon('bookmark', { size: 18 })}保存した記事<span class="pnl__n" data-saved-total></span></h3>
      <ul class="smini" data-saved-mini-list></ul>
      <a class="smini__add" href="/my-dashboard/#saved">${icon('right', { size: 14 })}<span data-saved-mini-hint>記事の保存ボタンを押すと、ここに表示されます</span></a>
    </div>
    <div class="panel lib__p" data-continue>
      <h3 class="lib__t">${icon('clock', { size: 18 })}続きから読む</h3>
      <ul class="smini" data-continue-list></ul>
      <p class="lib__empty" data-continue-empty>閲覧履歴はオフになっています。オンにすると、読みかけの記事をここから再開できます。</p>
      <a class="smini__add" href="/my-dashboard/#settings">${icon('shield', { size: 14 })}<span data-continue-hint>閲覧履歴の設定を開く</span></a>
    </div>
  </div>
</section>`;
}

// 安全・法律・文化の情報（断定的な法律情報は書かず、確認先と注意点の入口だけを置く）
function SafetyPanel() {
  const items = [
    ['/guide/', 'help', 'はじめての方へ', 'サイトの使い方と、記事を読むときの注意点'],
    ['/faq/', 'info', 'よくある質問', '保存・履歴・表示設定などの疑問'],
    ['/search/?q=' + encodeURIComponent('注意点'), 'shield', '注意点の記事を探す', 'トラブルを避けるためのポイント'],
    ['/my-dashboard/#settings', 'eye', 'プライバシー設定', '履歴・保存データの管理と削除'],
  ];
  return `<section class="sec" aria-labelledby="sec-safe">
  ${SectionHead({ ic: 'shield', title: '安全・法律・文化の情報', id: 'sec-safe' })}
  <div class="safe">
    ${BgImg('backgrounds/editorial-information.webp', { cls: 'safe__bg', w: 1280, h: 716 })}
    <p class="safe__note">${icon('alert', { size: 18 })}<span>法律・条例や現地のルールは国・地域ごとに異なり、変わることがあります。利用前に必ず現地の最新情報を確認してください。当サイトは違法なサービスの利用を勧めるものではありません。</span></p>
    <ul class="safe__list">${items.map(([to, ic, t, d]) => `<li><a class="safe__a" href="${to}">${icon(ic, { size: 20 })}<span><b>${t}</b><small>${d}</small></span>${icon('right', { size: 16 })}</a></li>`).join('')}</ul>
  </div>
</section>`;
}

// 地球のパネル（映像は画面に入ったときだけ再生。優先度 2）
function EarthPanel(site) {
  const cine = Cinematic('features/asia-earth', { prio: 2, eager: false, sizes: '(min-width: 1024px) 50vw, 100vw' });
  if (!cine) return '';
  const n = site.groups.world.length;
  return `<section class="earth" aria-labelledby="earth-t">${cine}<div class="earth__in"><p class="earth__en">ASIA &amp; BEYOND</p><h2 class="earth__t" id="earth-t">アジアから世界へ、夜の旅を広げる</h2><p class="earth__d">国内と海外${n}か国の記事を、国・エリアごとに整理しています。</p><a class="btn btn--primary btn--sm" href="/area/">エリア情報を見る${icon('right', { size: 14 })}</a></div></section>`;
}

// ---------- TOP ----------
// 並び：ヒーロー（検索つき）→ カテゴリ → エリア → 特集 → 新着 → マイライブラリ → 安全情報 → フッター
export function homePage(site, assets) {
  const { world } = site.groups;
  const shown = new Set();
  const take = (list, n) => { const out = list.filter((p) => !shown.has(p)).slice(0, n); out.forEach((p) => shown.add(p)); return out; };
  const featured = take(site.posts, 4);
  const rankList = site.popular.length >= 3 ? take(site.popular, 5) : [];
  const latest = take(site.posts, 8);
  const kw = [...world.slice(0, 3).map(shortName), ...site.groups.japan.slice(1, 3).map((c) => c.name)].slice(0, 5);
  const [lead, ...subs] = featured;

  const body = `
<section class="hero hero--top" aria-labelledby="hero-t">
  ${HeroImg('tokyo', 'hero__bg')}
  <div class="hero__in">
    <p class="hero__en">${SITE_EN}</p>
    <h1 class="hero__t" id="hero-t">夜の街を、<br class="br-m">もっと賢く楽しむ。</h1>
    <p class="hero__lead">国内から海外まで、ナイトライフと旅の情報を整理したガイド。</p>
    ${GlobalSearch({ id: 'hero-q', cls: 'gs--hero', placeholder: 'エリア・キーワードで検索（例：バンコク）' })}
    <p class="hero__meta"><span><b>${site.posts.length}</b>記事</span><span><b>${world.length}</b>か国</span><span>最終更新 <time datetime="${esc(site.updated)}">${ymd(site.updated)}</time></span></p>
    ${kw.length ? `<p class="kw"><span class="kw__l">よく読まれるテーマ</span>${kw.map((k) => `<a class="kw__a" href="/search/?q=${encodeURIComponent(k)}">${esc(k)}</a>`).join('')}</p>` : ''}
  </div>
</section>

<nav class="mpills" aria-label="カテゴリから探す">${CategoryPills(site, [])}</nav>

<section class="sec" aria-labelledby="sec-area">
  ${SectionHead({ ic: 'globe', title: '国内・海外のエリア', sub: '国・エリアごとの文化と旅の情報', id: 'sec-area', more: '/area/', moreLabel: 'すべてのエリア' })}
  ${AreaRow(areas(site), 'car-area')}
</section>

${EarthPanel(site)}

${lead ? `<section class="sec" aria-labelledby="sec-feat">
  ${SectionHead({ ic: 'layers', title: '編集部の特集', sub: '新しく公開された記事', id: 'sec-feat', more: '/features/', moreLabel: '特集をすべて見る' })}
  <div class="bento${rankList.length ? ' bento--rank' : ''}">
    <div class="bento__lead">${ArticleCard(lead, { variant: 'feature', level: 3, eager: true })}</div>
    <div class="bento__subs">${subs.map((p) => ArticleCard(p, { variant: 'list', level: 3 })).join('')}</div>
    ${rankList.length ? `<div class="panel bento__rank"><h3 class="lib__t">${icon('crown', { size: 18 })}人気の記事</h3>${RankList(rankList)}<a class="tbtn" href="/ranking/">ランキングを見る${icon('right', { size: 14 })}</a></div>` : ''}
  </div>
</section>` : ''}

${latest.length ? `<section class="sec" aria-labelledby="sec-new">
  ${SectionHead({ ic: 'clock', title: '新着記事', id: 'sec-new', more: '/new/', moreLabel: 'すべて見る' })}
  <div class="agrid agrid--limit" data-view-target>${latest.map((p) => ArticleCard(p)).join('')}</div>
</section>` : ''}

${LibraryPanels()}
${SafetyPanel()}`;

  return AppShell(site, assets, {
    path: '/', title: SITE, description: '国内・海外のナイトライフ情報を、料金・遊び方・注意点まで実体験ベースで整理したガイドサイト。', body, bodyClass: 'p-home', preload: heroPreload('tokyo'),
    jsonld: [orgLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: CANONICAL + '/', potentialAction: { '@type': 'SearchAction', target: CANONICAL + '/search/?q={q}', 'query-input': 'required name=q' } }],
    ogImage: featured[0]?.hero || '',
  });
}

// ---------- カテゴリ・記事一覧の共通レイアウト（CategoryPageLayout） ----------
// ヒーローは小さく（タイトル・説明・件数）。一覧の上にタブ（すべて／新着／更新された記事／特集）と並び替え
const LIST_TABS = [['all', 'すべて'], ['new', '新着'], ['updated', '更新された記事'], ['feature', '特集']];
function CategoryLayout(site, assets, o) {
  const { path, crumbs, en, title, desc, posts, cur, total, urlOf, cat = null, areaList = [], filterOpts = [], art = 'tokyo', ic = 'globe', extra = '', trail = [] } = o;
  const ps = posts.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const last = posts.reduce((m, p) => (p.modified > m ? p.modified : m), '');
  const body = `
<section class="chero" aria-labelledby="ch-t">
  ${HeroImg(art, 'chero__bg')}
  <div class="chero__in">
    ${Breadcrumbs(crumbs)}
    <p class="chero__en">${icon(ic, { size: 16 })}${esc(en)}</p>
    <h1 class="chero__t" id="ch-t">${esc(title)}${cur > 1 ? `<small class="chero__pg">（${cur}ページ目）</small>` : ''}</h1>
    ${desc ? `<p class="chero__d">${esc(desc)}</p>` : ''}
    <p class="chero__meta"><span><b>${posts.length}</b>件の記事</span><span>最終更新 <time datetime="${esc(last)}">${ymd(last)}</time></span></p>
  </div>
</section>
${cur === 1 && areaList.length ? `<section class="sec sec--first" aria-labelledby="ca-t">${SectionHead({ ic: 'pin', title: 'エリアから探す', sub: `${title}の国・エリア`, id: 'ca-t', more: '/area/', moreLabel: 'すべてのエリア' })}${AreaRow(areaList, 'car-carea')}</section>` : ''}
<section class="sec lt" data-listing data-cat="${esc(cat ? String(cat.id) : '')}" data-page="${cur}" aria-labelledby="cl-t">
  <h2 class="sr" id="cl-t">${esc(title)}の記事一覧</h2>
  <div class="lt__bar">
    <div class="tabs__list lt__tabs" role="tablist" aria-label="記事の絞り込み">${LIST_TABS.map(([k, l], i) => `<button class="tabs__tab" type="button" role="tab" id="lt-${k}" aria-controls="lt-panel" aria-selected="${i ? 'false' : 'true'}" tabindex="${i ? '-1' : '0'}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="fbar" role="group" aria-label="並び替えと表示">
      ${cat ? `<div class="fbar__q">${GlobalSearch({ id: 'cat-q', cls: 'gs--cat', button: false, placeholder: `${title}の中を検索`, cat: String(cat.id), label: `${title}の中で記事を検索` })}</div>` : ''}
      ${filterOpts.length ? `<label class="sel fbar__area"><span class="sel__k">エリア</span><select data-nav-select aria-label="エリア・カテゴリを選ぶ"><option value="">すべて</option>${filterOpts.map((c) => `<option value="${esc(href(c.path))}"${c === cat ? ' selected' : ''}>${esc(c.label || c.name)}</option>`).join('')}</select>${icon('down', { size: 16 })}</label>` : ''}
      <label class="sel fbar__sort"><span class="sel__k">並び替え</span><select data-sort aria-label="並び替え"><option value="new">新着順</option><option value="updated">更新日順</option><option value="old">古い順</option></select>${icon('down', { size: 16 })}</label>
      <div class="seg fbar__view" role="group" aria-label="表示方法">
        <button class="seg__b" type="button" data-view="grid" aria-pressed="true" aria-label="カード表示">${icon('grid', { size: 16 })}</button>
        <button class="seg__b" type="button" data-view="list" aria-pressed="false" aria-label="リスト表示">${icon('list', { size: 16 })}</button>
      </div>
      <button class="btn btn--ghost btn--sm fbar__sheet" type="button" data-list-sheet>${icon('filter', { size: 16 })}並び替え・表示</button>
    </div>
  </div>
  <div id="lt-panel" role="tabpanel" aria-labelledby="lt-all">
    <p class="lt__count" data-list-count>${posts.length}件中 ${(cur - 1) * PER_PAGE + 1}〜${Math.min(cur * PER_PAGE, posts.length)}件目</p>
    <div data-list-server>${ArticleGrid(ps, { eager: 0, level: 3 })}${Pagination(urlOf, cur, total)}</div>
    <div data-list-client hidden></div>
  </div>
</section>
${cur === 1 ? extra : ''}`;
  return AppShell(site, assets, {
    path, title: cur > 1 ? `${title}（${cur}ページ目）` : title, description: desc || `${title}に関する記事一覧（${posts.length}件）。`, body, bodyClass: 'p-list', preload: heroPreload(art), trail,
    jsonld: [breadcrumbLd(crumbs), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, url: CANONICAL + href(path), ...(desc ? { description: desc } : {}) }],
    ogImage: ps[0]?.hero || '',
  });
}

export function categoryPages(site, assets, c) {
  const chain = [];
  for (let x = c; x; x = site.catById.get(x.parent)) chain.unshift(x);
  const crumbs = [{ name: 'ホーム', path: '/' }, ...chain.map((x) => ({ name: x.name, path: x.path }))];
  const code = COUNTRY[shortName(c)];
  const { japan, world, worldAll } = site.groups;
  const isWorld = c === worldAll || !!code;
  const isJapan = japan.includes(c);
  const all = areas(site);
  const areaList = c === worldAll ? all.filter((a) => a.c !== site.byName('国内風俗')) : c.children.filter((x) => x.posts.length).map((x) => all.find((a) => a.c === x) || { c: x, jp: shortName(x), en: COUNTRY_EN[shortName(x)] || '' });
  const filterOpts = isWorld ? [...(worldAll ? [{ ...worldAll, label: '海外すべて', path: worldAll.path }] : []), ...world.map((x) => ({ ...x, label: shortName(x) }))] : isJapan ? japan : [];
  // 選択中の判定のため、同じオブジェクトを使う
  const fo = filterOpts.map((x) => ({ name: x.name, label: x.label, path: x.path, id: x.id }));
  const pop = site.popular.filter((p) => p.catIds.includes(c.id));
  // 人気順は本物の順位があるときだけ出す（無ければ何も出さない）
  const extra = pop.length >= 3 ? `<section class="sec" aria-labelledby="crk-t">${SectionHead({ ic: 'crown', title: `${c.name}の人気記事`, sub: '元サイトの人気記事の順位', id: 'crk-t', more: '/ranking/', moreLabel: 'ランキング' })}<div class="panel">${RankList(pop.slice(0, 6))}</div></section>` : '';
  const total = Math.max(1, Math.ceil(c.posts.length / PER_PAGE));
  const out = [];
  for (let n = 1; n <= total; n++) {
    const path = n === 1 ? c.path : `${c.path}page/${n}/`;
    out.push({ path, html: CategoryLayout(site, assets, {
      path, crumbs: n === 1 ? crumbs : [...crumbs.slice(0, -1), { name: c.name, path: c.path }, { name: `${n}ページ目` }],
      en: isWorld ? (code ? `${COUNTRY_EN[shortName(c)] || code} NIGHTLIFE GUIDE` : 'OVERSEAS NIGHTLIFE GUIDE') : isJapan ? 'JAPAN NIGHTLIFE GUIDE' : 'NIGHTLIFE GUIDE',
      title: c.name, desc: c.description || (isWorld ? `${c.name}の記事をまとめています。エリアごとの特徴・遊び方・注意点まで、現地での体験をもとに解説します。` : `${c.name}の記事をまとめています。`),
      posts: c.posts, cur: n, total, urlOf: (k) => (k === 1 ? c.path : `${c.path}page/${k}/`), cat: c, areaList, filterOpts: fo.map((x) => (x.id === c.id ? c : x)),
      art: isWorld ? 'bangkok' : isJapan || c === site.byName('国内風俗') ? 'domestic' : 'tokyo', ic: isWorld ? 'globe' : isJapan ? 'pin' : 'tag', extra, trail: trailOf(site, c),
    }) });
  }
  return out;
}

export function newPages(site, assets) {
  const total = Math.max(1, Math.ceil(site.posts.length / PER_PAGE));
  const urlOf = (k) => (k === 1 ? '/new/' : `/page/${k}/`);
  const out = [];
  for (let n = 1; n <= total; n++) {
    const path = urlOf(n);
    out.push({ path, html: CategoryLayout(site, assets, {
      path, crumbs: [{ name: 'ホーム', path: '/' }, { name: '新着記事', path: '/new/' }, ...(n > 1 ? [{ name: `${n}ページ目` }] : [])],
      en: 'ALL ARTICLES', title: '新着記事', desc: '国内・海外のすべての記事を新しい順に掲載しています。', posts: site.posts, cur: n, total, urlOf, ic: 'file',
      areaList: [],
    }) });
  }
  return out;
}

// ---------- 特集 ----------
// 見出しだけの小さなページヘッダー
const PageHead = (crumbs, en, title, desc = '') => `<header class="ph">${Breadcrumbs(crumbs)}<p class="ph__en">${esc(en)}</p><h1 class="ph__t">${esc(title)}</h1>${desc ? `<p class="ph__d">${desc}</p>` : ''}</header>`;

// 映像つきの見出し（素材が無ければ通常の見出し）
function CinePageHead(key, crumbs, en, title, desc = '') {
  const cine = Cinematic(key, { prio: 1, toggle: true });
  if (!cine) return PageHead(crumbs, en, title, desc);
  return `<header class="chero chero--ed">${cine}<div class="chero__in">${Breadcrumbs(crumbs)}<p class="chero__en">${esc(en)}</p><h1 class="chero__t">${esc(title)}</h1>${desc ? `<p class="chero__d">${desc}</p>` : ''}</div></header>`;
}

export function featuresPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: '特集' }];
  const deep = [...site.posts].sort((a, b) => b.readMin - a.readMin).slice(0, 8);
  const body = `
${CinePageHead('features/editorial-feature', crumbs, 'FEATURES', '特集', '新着記事と、じっくり読める長めの記事をまとめています。')}
<section class="sec sec--first" aria-labelledby="f-new">${SectionHead({ ic: 'layers', title: '新しく公開された記事', id: 'f-new', more: '/new/', moreLabel: 'すべて見る' })}<div class="bento"><div class="bento__lead">${ArticleCard(site.posts[0], { variant: 'feature', eager: true })}</div><div class="bento__subs">${site.posts.slice(1, 4).map((p) => ArticleCard(p, { variant: 'list' })).join('')}</div></div></section>
${site.popular.length >= 3 ? `<section class="sec" aria-labelledby="f-rk">${SectionHead({ ic: 'crown', title: '人気の記事', sub: '元サイトの人気記事の順位', id: 'f-rk', more: '/ranking/', moreLabel: 'ランキング' })}<div class="panel">${RankList(site.popular.slice(0, 6))}</div></section>` : ''}
<section class="sec" aria-labelledby="f-deep">${SectionHead({ ic: 'book', title: '読みごたえのある記事', sub: '本文の長い順', id: 'f-deep' })}${ArticleGrid(deep)}</section>
<section class="sec" aria-labelledby="f-area">${SectionHead({ ic: 'pin', title: 'エリアから探す', id: 'f-area', more: '/area/', moreLabel: 'すべてのエリアを見る' })}${AreaRow(areas(site), 'car-farea')}</section>`;
  return AppShell(site, assets, { path: '/features/', preload: cinematicPreload('features/editorial-feature') || undefined, title: '特集', description: '新着記事、よく読まれている記事、長めの解説記事をまとめた特集ページ。', body, bodyClass: 'p-list', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- エリア情報（国・エリアとカテゴリの一覧。記事数は実際の件数） ----------
export function areaPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'エリア情報' }];
  const list = areas(site);
  const max = Math.max(...list.map((a) => a.c.posts.length), 1);
  const row = (a) => `<li><a class="cmp" href="${href(a.c.path)}"><span class="cmp__n">${esc(a.jp)}<small>${esc(a.en)}</small></span><span class="cmp__bar"><span class="cmp__fill" data-w="${Math.round((a.c.posts.length / max) * 100)}"></span></span><span class="cmp__c">${a.c.posts.length}<small>記事</small></span><span class="cmp__d">${a.c.posts[0] ? `最新 ${ymd(a.c.posts[0].date)}` : ''}</span></a></li>`;
  const body = `
${PageHead(crumbs, 'AREA GUIDE', 'エリア情報', `国内と海外${site.groups.world.length}か国の記事を、国・エリア別にまとめています。`)}
<section class="sec sec--tight" aria-labelledby="a-cards">${SectionHead({ ic: 'pin', title: '国・エリア', sub: '記事の多い順', id: 'a-cards' })}<ul class="areas">${list.map((a, i) => `<li>${AreaCard(a, { eager: i < 4 })}</li>`).join('')}</ul></section>
${EarthPanel(site)}
<section class="sec" aria-labelledby="a-cmp">${SectionHead({ ic: 'columns', title: 'エリア比較', sub: '記事数と最新の公開日', id: 'a-cmp' })}<ol class="cmps panel">${list.map(row).join('')}</ol></section>
<section class="sec" aria-labelledby="a-cat">${SectionHead({ ic: 'tag', title: 'ジャンル・テーマ', id: 'a-cat' })}<div class="panel">${chips([...site.groups.japan, ...site.groups.themes])}</div></section>`;
  return AppShell(site, assets, { path: '/area/', title: 'エリア情報', description: '国内・海外の国やエリアごとの記事一覧と記事数の比較。', body, bodyClass: 'p-list', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- ランキング（元サイトの人気記事ウィジェットの順位。無ければ新着を「ピックアップ」として表示） ----------
export function rankingPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'ランキング' }];
  const has = site.popular.length >= 3;
  const body = `
${PageHead(crumbs, 'RANKING', has ? '人気記事ランキング' : '編集部のピックアップ', has ? '元サイトの人気記事ウィジェットの順位をそのまま掲載しています。閲覧数のデータは持っていないため表示していません。' : '人気順のデータが取得できなかったため、新しい記事を掲載しています。')}
<div class="rank-page panel">${RankList(has ? site.popular : site.posts.slice(0, 10), { ranked: has })}</div>
${site.groups.world.length ? `<section class="sec" aria-labelledby="r-area">${SectionHead({ ic: 'pin', title: 'エリアから探す', id: 'r-area', more: '/area/', moreLabel: 'すべてのエリアを見る' })}${AreaRow(areas(site), 'car-rarea')}</section>` : ''}`;
  return AppShell(site, assets, { path: '/ranking/', title: has ? '人気記事ランキング' : '編集部のピックアップ', description: 'よく読まれている記事のランキング。', body, bodyClass: 'p-list', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- はじめての方へ・よくある質問（このサイトの機能についての説明だけを書く） ----------
const qa = (items) => `<div class="faq">${items.map(([q, a], i) => `<details class="faq__i"${i === 0 ? ' open' : ''}><summary>${icon('help', { size: 18 })}<span>${q}</span>${icon('down', { size: 16, cls: 'faq__chev' })}</summary><div class="faq__a">${a}</div></details>`).join('')}</div>`;
export function guidePage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'はじめての方へ' }];
  const about = site.pages.find((p) => p.slug === 'about');
  const step = (n, ic, t, d) => `<li class="step"><span class="step__n">${n}</span><span class="step__ic">${icon(ic, { size: 22 })}</span><h2 class="step__t">${t}</h2><p>${d}</p></li>`;
  const body = `
${PageHead(crumbs, 'GETTING STARTED', 'はじめての方へ', 'グローバルナイトガイドの使い方をまとめました。会員登録やログインは必要ありません。')}
<ol class="steps">
${step(1, 'pin', 'エリアから探す', `国内や海外の国ごとに記事をまとめています。<a href="/area/">エリア情報</a>から国を選ぶか、上部のカテゴリボタンから選んでください。`)}
${step(2, 'search', 'キーワードで探す', '地名・店名・ジャンルなどで記事を検索できます。カテゴリページの検索欄では、そのカテゴリの中だけを検索します。')}
${step(3, 'bookmark', 'あとで読む記事を保存する', '記事カードやページのしおりボタンで保存できます。保存した記事は<a href="/my-dashboard/#saved">マイページ</a>でコレクションに分けられます。')}
${step(4, 'shield', 'データは端末の中だけ', '保存した記事・閲覧履歴・設定は、このブラウザの中だけに保存され、外部には送信されません。閲覧履歴は初期設定でオフです。')}
</ol>
<section class="sec" aria-labelledby="g-read">${SectionHead({ ic: 'book', title: '記事を読むときのポイント', id: 'g-read', level: 2 })}
<div class="panel prose"><ul>
<li>記事には公開日と更新日を表示しています。料金や営業状況は変わることがあるため、最新の情報は各店舗・施設の公式情報で確認してください。</li>
<li>記事ページの「集中閲覧モード」を使うと、メニューを隠して本文だけを読めます。文字サイズも変更できます。</li>
<li>誤りに気づいたら、記事ページの「訂正・報告」から内容をまとめて、お問い合わせページに送ってください。</li>
<li>本サイトは18歳以上の方を対象としています。各国・地域の法律や規則を守って行動してください。</li>
</ul>${about ? `<p><a class="tbtn" href="${href(about.path)}">運営者情報を見る${icon('right', { size: 14 })}</a></p>` : ''}</div></section>`;
  return AppShell(site, assets, { path: '/guide/', title: 'はじめての方へ', description: 'グローバルナイトガイドの使い方（探し方・保存・プライバシー）。', body, bodyClass: 'p-page', jsonld: [breadcrumbLd(crumbs)] });
}
export function faqPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'よくある質問' }];
  const contact = site.pages.find((p) => p.slug === 'contact');
  const body = `
${PageHead(crumbs, 'FAQ', 'よくある質問', 'このサイトの使い方についての質問と回答です。')}
${qa([
  ['会員登録やログインは必要ですか？', '<p>必要ありません。記事の閲覧・検索・保存は、登録なしで使えます。</p>'],
  ['保存した記事はどこに保存されますか？', '<p>お使いのブラウザの中（この端末）だけに保存されます。サーバーには送信されないため、別の端末やブラウザとは共有されません。</p>'],
  ['閲覧履歴は記録されますか？', '<p>初期設定では記録しません。<a href="/my-dashboard/#settings">プライバシー設定</a>でオンにした場合だけ、この端末に記録します。いつでも削除できます。</p>'],
  ['保存した記事や設定をすべて消したい', '<p><a href="/my-dashboard/#settings">マイページの設定</a>にある「この端末のデータをすべて削除」から消去できます。</p>'],
  ['ランキングは何の順位ですか？', '<p>元サイトに掲載されている人気記事の順位をそのまま使っています。閲覧数のデータは持っていないため、数字は表示していません。</p>'],
  ['記事の情報が古い・間違っているときは？', `<p>記事ページの「訂正・報告」で内容をまとめ、${contact ? `<a href="${href(contact.path)}">お問い合わせ</a>` : 'お問い合わせ'}から送ってください。</p>`],
  ['文字が小さくて読みにくい', '<p>記事ページの「表示設定」ボタン、またはマイページの設定で4段階から選べます。</p>'],
])}`;
  return AppShell(site, assets, { path: '/faq/', title: 'よくある質問', description: 'グローバルナイトガイドの使い方についてのよくある質問。', body, bodyClass: 'p-page', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- 記事 ----------
export function articlePage(site, assets, p, link) {
  const { $root, toc } = cleanContent(p.content, p.path, link);
  const chain = [];
  for (let c = p.cat; c; c = site.catById.get(c.parent)) chain.unshift(c);
  const crumbs = [{ name: 'ホーム', path: '/' }, ...chain.map((c) => ({ name: c.name, path: c.path })), { name: p.title }];
  const related = (p.cat?.posts || []).filter((x) => x !== p).slice(0, 8);
  const i = site.posts.indexOf(p);
  const newer = site.posts[i - 1], older = site.posts[i + 1];
  const updated = !sameDay(p.date, p.modified);
  const author = p.author;
  const body = `
<div class="rd" data-article data-u="${esc(href(p.path))}" data-t="${esc(p.title)}" data-i="${esc(p.thumb ? img(p.thumb, 384) : '')}" data-c="${esc(p.cat?.name || '')}" data-d="${esc(p.date)}">
<header class="rd__hd">
  ${Breadcrumbs(crumbs)}
  ${p.cat ? `<a class="cat" href="${href(p.cat.path)}">${catBadge(p.cat)}${esc(p.cat.name)}</a>` : ''}
  <h1 class="rd__t">${esc(p.title)}</h1>
  <ul class="rd__meta">
    <li>${icon('calendar', { size: 15 })}<span>公開 <time datetime="${esc(p.date)}">${ymd(p.date)}</time></span></li>
    ${updated ? `<li>${icon('refresh', { size: 15 })}<span>更新 <time datetime="${esc(p.modified)}">${ymd(p.modified)}</time></span></li>` : ''}
    <li>${icon('clock', { size: 15 })}<span>約${p.readMin}分で読めます</span></li>
    ${author ? `<li>${icon('user', { size: 15 })}<span>${esc(author.name)}</span></li>` : ''}
  </ul>
  <div class="rd__tools" role="toolbar" aria-label="記事の操作">
    ${SaveButton(p, { withLabel: true })}
    <button class="tool" type="button" data-share>${icon('share', { size: 18 })}<span>共有</span></button>
    <button class="tool" type="button" data-read-settings aria-haspopup="dialog">${icon('type', { size: 18 })}<span>表示設定<span class="tool__v">（文字：<span data-fontsize-label>標準</span>）</span></span></button>
    <button class="tool" type="button" data-focus aria-pressed="false">${icon('focus', { size: 18 })}<span>集中モード</span></button>
    <button class="tool" type="button" data-report-open>${icon('flag', { size: 18 })}<span>訂正・報告</span></button>
  </div>
  <p class="resume" data-resume hidden><button class="btn btn--ghost btn--sm" type="button" data-resume-btn>${icon('clock', { size: 16 })}<span data-resume-label>前回の続きから読む</span></button></p>
  ${p.hero ? `<figure class="rd__img"><img src="${esc(img(p.hero, 960))}"${img(p.hero, 960) !== p.hero ? ` srcset="${img(p.hero, 640)} 640w, ${img(p.hero, 960)} 960w, ${img(p.hero, 1280)} 1280w" sizes="(min-width: 1024px) 800px, 100vw"` : ''} alt="${esc(p.alt)}" width="${p.heroW}" height="${p.heroH}" fetchpriority="high" decoding="async"></figure>` : ''}
</header>
${toc.length >= 2 ? `<aside class="rd__rail" aria-label="目次">${TableOfContents(toc)}</aside>` : ''}
<div class="rd__body">
  <div class="entry" data-entry>${$root.html()}</div>
  <section class="src" aria-labelledby="src-t">
    <h2 class="src__h" id="src-t">${icon('info', { size: 18 })}記事について</h2>
    ${author ? `<div class="au">${author.avatar ? `<img class="au__img" src="${esc(author.avatar)}" alt="" width="48" height="48" loading="lazy">` : `<span class="au__img au__img--ph">${icon('user', { size: 22 })}</span>`}<div><p class="au__n">執筆：${esc(author.name)}</p>${author.description ? `<p class="au__d">${esc(author.description)}</p>` : ''}</div></div>` : ''}
    <dl class="src__dl">
      <div><dt>出典</dt><dd>${SITE}（${ymd(p.date)} 掲載）</dd></div>
      <div><dt>最終更新</dt><dd>${ymd(p.modified)}</dd></div>
      <div><dt>注意</dt><dd>料金や営業状況は変わることがあります。最新の情報は各店舗の公式情報でご確認ください。</dd></div>
    </dl>
    <button class="btn btn--ghost" type="button" data-report-open>${icon('flag', { size: 16 })}情報の誤りを報告する</button>
  </section>
  <nav class="pn" aria-label="前後の記事">${older ? `<a class="pn__a" href="${href(older.path)}" rel="prev"><span class="pn__l">${icon('left', { size: 16 })}前の記事</span><span class="pn__t">${esc(older.title)}</span></a>` : '<span></span>'}${newer ? `<a class="pn__a pn__a--next" href="${href(newer.path)}" rel="next"><span class="pn__l">次の記事${icon('right', { size: 16 })}</span><span class="pn__t">${esc(newer.title)}</span></a>` : ''}</nav>
</div>
</div>
${related.length ? `<section class="sec" aria-labelledby="rel-a">${SectionHead({ ic: 'layers', title: `「${p.cat.name}」の関連記事`, id: 'rel-a', more: p.cat.path })}${SwipeCarousel({ id: 'car-rel', label: '関連記事', items: related.map((x) => ArticleCard(x)) })}</section>` : ''}
${ReportDialog(p)}
${Lightbox()}`;
  return AppShell(site, assets, {
    path: p.path, title: p.title, description: p.excerpt, body, bodyClass: 'p-article', progress: true, trail: p.cat ? trailOf(site, p.cat) : [], ogType: 'article', ogImage: p.hero,
    jsonld: [breadcrumbLd(crumbs), {
      '@context': 'https://schema.org', '@type': 'Article', headline: p.title.slice(0, 110), datePublished: p.date, dateModified: p.modified,
      mainEntityOfPage: CANONICAL + href(p.path), ...(p.hero ? { image: [p.hero] } : {}),
      author: author ? { '@type': 'Person', name: author.name } : { '@type': 'Organization', name: SITE },
      publisher: { '@type': 'Organization', name: SITE, url: CANONICAL + '/' }, ...(p.cat ? { articleSection: p.cat.name } : {}),
    }],
  });
}

function ReportDialog(p) {
  return `<div class="modal" id="report" hidden>
<div class="modal__bg" data-modal-close></div>
<div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="rep-t" tabindex="-1">
<div class="modal__hd"><h2 class="modal__t" id="rep-t">${icon('flag', { size: 20 })}情報の訂正・報告</h2><button class="ibtn" type="button" data-modal-close aria-label="閉じる">${icon('x')}</button></div>
<form class="form" data-report-form novalidate>
<fieldset><legend>内容の種類</legend>
${['情報が古い', '内容に誤りがある', 'リンクが切れている', '表示が崩れている', 'その他'].map((v, i) => `<label class="radio"><input type="radio" name="kind" value="${v}"${i === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}
</fieldset>
<label class="field"><span>詳しい内容（任意・1000文字まで）</span><textarea name="detail" rows="4" maxlength="1000"></textarea></label>
<p class="form__note">この画面からは送信されません。「内容をコピー」を押して、お問い合わせページに貼り付けて送ってください。個人情報は書かないでください。</p>
<div class="modal__btns"><button class="btn btn--primary" type="submit">${icon('copy', { size: 16 })}内容をコピー</button><a class="btn btn--ghost" href="/contact/">お問い合わせページへ</a></div>
<input type="hidden" name="page" value="${esc(p.title)}（${esc(href(p.path))}）">
</form>
</div></div>`;
}

function Lightbox() {
  return `<div class="lb" id="lightbox" hidden>
<div class="lb__panel" role="dialog" aria-modal="true" aria-label="画像の拡大表示" tabindex="-1">
<div class="lb__bar"><span class="lb__count" aria-live="polite"></span><button class="ibtn" type="button" data-lb-zoom aria-pressed="false" aria-label="拡大">${icon('zoom')}</button><button class="ibtn" type="button" data-lb-close aria-label="閉じる">${icon('x')}</button></div>
<ul class="lb__track" tabindex="0"></ul>
<button class="ibtn lb__prev" type="button" data-lb-prev aria-label="前の画像">${icon('left')}</button><button class="ibtn lb__next" type="button" data-lb-next aria-label="次の画像">${icon('right')}</button>
</div></div>`;
}

// ---------- 固定ページ ----------
export function staticPage(site, assets, pg, link) {
  const { $, $root } = cleanContent(pg.content, pg.path, link);
  const hasForm = $root.find('form').length > 0;
  $root.find('form').each((_, f) => {
    const $f = $(f);
    $f.attr('class', 'form form--wp');
    $f.find('input[type=hidden]').remove();
    $f.find('br').remove();
    $f.find('input,textarea').attr('disabled', 'disabled');
    $f.find('input[type=submit]').replaceWith('<button class="btn btn--primary" type="button" disabled>送信する（準備中）</button>');
  });
  if (hasForm) $root.find('form').first().before(`<p class="notice">${icon('info', { size: 16 })}<span>このサイトは公開準備中のため、フォームからの送信はまだできません。</span></p>`);
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: pg.title }];
  const body = `<div class="rd rd--page"><header class="rd__hd">${Breadcrumbs(crumbs)}<h1 class="rd__t">${esc(pg.title)}</h1></header><div class="rd__body"><div class="entry" data-entry>${$root.html()}</div></div></div>`;
  return AppShell(site, assets, { path: pg.path, title: pg.title, description: text(pg.content).slice(0, 120), body, bodyClass: 'p-page', jsonld: [breadcrumbLd(crumbs), ...(pg.slug === 'about' ? [orgLd()] : [])] });
}

// ---------- 検索 ----------
export function searchPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: '記事を検索' }];
  const opts = [...site.groups.japan, ...(site.groups.worldAll ? [site.groups.worldAll] : []), ...site.groups.world, ...site.groups.themes];
  const body = `
<header class="ph">${Breadcrumbs(crumbs)}<p class="ph__en">SEARCH</p><h1 class="ph__t">記事を検索</h1>
<div class="sx">
  ${GlobalSearch({ id: 'q', cls: 'gs--hero gs--page' })}
  <label class="sel"><span class="sr">カテゴリで絞り込む</span>${icon('tag', { size: 16 })}<select id="q-cat" data-search-cat><option value="">すべてのカテゴリ</option>${opts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>${icon('down', { size: 16 })}</label>
</div>
<p class="ph__n" id="search-status" aria-live="polite">店名・エリア・キーワードを入力してください（${site.posts.length}件の記事から検索）</p>
</header>
<div data-search-results></div>
<section class="sec" data-search-idle aria-labelledby="s-cat">${SectionHead({ ic: 'tag', title: 'カテゴリから探す', id: 's-cat' })}<div class="panel">${chips(opts)}</div></section>`;
  return AppShell(site, assets, { path: '/search/', title: '記事を検索', description: '国内・海外のナイトライフ記事をキーワードとカテゴリで検索できます。', body, bodyClass: 'p-search', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- マイダッシュボード ----------
export function dashboardPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'マイページ' }];
  const sw = (key, id, label, desc) => `<div class="setrow"><div><p class="setrow__t" id="${id}-l">${label}</p><p class="setrow__d" id="${id}-d">${desc}</p></div><button class="switch" type="button" role="switch" aria-checked="false" aria-labelledby="${id}-l" aria-describedby="${id}-d" data-setting="${key}"><span></span></button></div>`;
  const radios = (name, label, items) => `<fieldset class="setrow setrow--col"><legend class="setrow__t">${label}</legend><div class="seg seg--wide">${items.map(([v, l, ic]) => `<label class="seg__b"><input class="sr" type="radio" name="${name}" value="${v}" data-setting="${name}">${ic ? icon(ic, { size: 16 }) : ''}<span>${l}</span></label>`).join('')}</div></fieldset>`;
  const body = `
<header class="ph ph--bg">${BgImg('backgrounds/dashboard-matte-gold.webp', { cls: 'ph__bg' })}${Breadcrumbs(crumbs)}<p class="ph__en">MY LIBRARY</p><h1 class="ph__t">マイページ</h1>
<p class="ph__d">${icon('shield', { size: 16 })}ログインは不要です。保存記事・閲覧履歴・設定はこの端末のブラウザ内だけに保存され、外部には送信されません。</p></header>
<div class="dash" data-dashboard>
<dl class="kpis"><div><dt>保存記事</dt><dd data-kpi="saved">0</dd></div><div><dt>コレクション</dt><dd data-kpi="folders">1</dd></div><div><dt>閲覧履歴</dt><dd data-kpi="history">0</dd></div></dl>
<div class="dpanels" data-panels aria-label="ライブラリのパネル"></div>
${TabNavigation({ id: 'dash', label: 'マイページ', tabs: [
  { label: `${icon('bookmark', { size: 16 })}保存記事`, panel: `<div class="dash__bar"><div class="folders" data-folders role="group" aria-label="コレクション"></div><button class="btn btn--ghost btn--sm" type="button" data-folder-new>${icon('plus', { size: 16 })}コレクションを作成</button></div><form class="inline-form" data-folder-form hidden><label class="sr" for="folder-name">コレクション名</label><input class="input" id="folder-name" name="name" maxlength="20" placeholder="コレクション名（20文字まで）" required><button class="btn btn--primary btn--sm" type="submit">作成</button><button class="btn btn--ghost btn--sm" type="button" data-folder-cancel>やめる</button></form><div data-saved-list>${SkeletonLoader(3)}</div>` },
  { label: `${icon('history', { size: 16 })}閲覧履歴`, panel: `${sw('historyEnabled', 'he1', '閲覧履歴を保存する', '初期設定はオフです。オンにすると、読んだ記事と読書の進み具合をこの端末に記録します。')}<div class="dash__bar"><p class="dash__note" data-history-note></p><span data-confirm-wrap><button class="btn btn--ghost btn--sm" type="button" data-history-clear>${icon('trash', { size: 16 })}履歴をすべて削除</button></span></div><div data-history-list>${SkeletonLoader(3)}</div>` },
  { label: `${icon('settings', { size: 16 })}設定`, panel: `<div class="settings">
    ${radios('theme', '表示モード', [['system', '端末に合わせる', 'monitor'], ['dark', 'ダーク', 'moon'], ['light', 'ライト', 'sun']])}
    ${radios('fontSize', '記事の文字サイズ', [['s', '小'], ['m', '標準'], ['l', '大'], ['xl', '特大']])}
    <fieldset class="setrow setrow--col"><legend class="setrow__t">マイページに表示するパネル</legend><p class="setrow__d">チェックを外したパネルは上の一覧に表示しません。PC ではパネルの「上へ・下へ」で並び順も変えられます。</p><div class="opt__row" data-panel-opts></div></fieldset>
    ${sw('historyEnabled', 'he2', '閲覧履歴を保存する', '共有の端末ではオフのままをおすすめします。')}
    ${sw('video', 'vd1', '背景の映像を再生する', 'TOP やカテゴリの見出しの映像を再生します。オフにすると静止画だけを表示します。データ節約モードや「視差効果を減らす」設定のときは常に静止画です。')}
    <div class="setrow"><div><p class="setrow__t">年齢確認をやり直す</p><p class="setrow__d">次にページを開いたときに、もう一度確認画面を表示します。</p></div><button class="btn btn--ghost btn--sm" type="button" data-age-reset>やり直す</button></div>
    <div class="setrow setrow--danger"><div><p class="setrow__t">この端末のデータをすべて削除</p><p class="setrow__d">保存記事・フォルダ・閲覧履歴・設定をすべて消去します。元に戻せません。</p></div><span data-confirm-wrap><button class="btn btn--danger btn--sm" type="button" data-wipe>${icon('trash', { size: 16 })}すべて削除</button></span></div>
  </div>` },
] })}
<noscript><p class="notice">マイページを使うには JavaScript を有効にしてください。</p></noscript>
</div>`;
  return AppShell(site, assets, { path: '/my-dashboard/', title: 'マイページ', description: '保存記事・コレクション・閲覧履歴・表示設定を管理できます（データはこの端末内のみに保存）。', body, bodyClass: 'p-dash', jsonld: [breadcrumbLd(crumbs)] });
}

export function notFoundPage(site, assets) {
  const body = `<div class="nf"><h1 class="sr">ページが見つかりません（404）</h1>${EmptyState({ ic: 'alert', title: 'ページが見つかりません', text: 'お探しのページは移動または削除された可能性があります。', action: `<div class="nf__act"><a class="btn btn--primary" href="/">ホームへ戻る</a><a class="btn btn--ghost" href="/search/">記事を検索</a></div>` })}</div>`;
  return AppShell(site, assets, { path: '/404/', title: 'ページが見つかりません', body, bodyClass: 'p-404' });
}
