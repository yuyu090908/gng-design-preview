// 各ページのテンプレート。共通コンポーネント（components.mjs）を組み合わせて作る。
import { icon } from './icons.mjs';
import { cleanContent, href } from './content.mjs';
import { COUNTRY, text } from './data.mjs';
import {
  AppShell, ArticleCard, ArticleGrid, ArticleList, SwipeCarousel, SectionHead, TabNavigation, Pagination, Breadcrumbs, breadcrumbLd,
  TableOfContents, EmptyState, SkeletonLoader, GlobalSearch, SaveButton, catBadge, esc, ymd, sameDay, img, SITE, SITE_EN, CANONICAL,
} from './components.mjs';

export const PER_PAGE = 12;

const orgLd = () => ({ '@context': 'https://schema.org', '@type': 'Organization', name: SITE, alternateName: SITE_EN, url: CANONICAL + '/' });
const chips = (cs, { short = false, counts = true } = {}) => `<ul class="chips">${cs.map((c) => `<li><a class="chip" href="${href(c.path)}">${catBadge(c)}${esc(short ? c.name.replace(/風俗$/, '') : c.name)}${counts ? `<span class="chip__n">${c.posts.length}</span>` : ''}</a></li>`).join('')}</ul>`;
const shortName = (c) => c.name.replace(/風俗$/, '');

// ---------- TOP ----------
export function homePage(site, assets) {
  const { japan, world, worldAll, themes } = site.groups;
  const shown = new Set();
  const take = (list, n) => { const out = list.filter((p) => !shown.has(p)).slice(0, n); out.forEach((p) => shown.add(p)); return out; };
  const hasRanking = site.popular.length > 0;
  const featureSrc = hasRanking ? site.popular : site.posts;
  const [lead, ...subs] = take(featureSrc, 5);
  const latest = take(site.posts, 10);
  const jp = site.cats.find((c) => c.name === '国内風俗');
  const jpPosts = jp ? take(jp.posts, 4) : [];
  const wPosts = worldAll ? take(worldAll.posts, 4) : [];
  const catCount = site.cats.filter((c) => c.posts.length).length;

  const body = `
<section class="hero" aria-labelledby="hero-t">
  <div class="hero__in">
    <p class="hero__en">PREMIUM INTERNATIONAL NIGHT EDITORIAL</p>
    <h1 class="hero__t" id="hero-t">${SITE_EN}<span>${SITE}</span></h1>
    <p class="hero__lead">国内から海外まで、夜の街の文化・料金・遊び方を実体験ベースで整理するデジタルガイド。</p>
    ${GlobalSearch({ id: 'hero-q', cls: 'gs--hero' })}
  </div>
  <dl class="hero__stats">
    <div><dt>記事</dt><dd>${site.posts.length}</dd></div>
    <div><dt>海外エリア</dt><dd>${world.length}<small>か国</small></dd></div>
    <div><dt>カテゴリ</dt><dd>${catCount}</dd></div>
    <div><dt>最終更新</dt><dd class="hero__date">${ymd(site.updated)}</dd></div>
  </dl>
</section>

<nav class="qnav" aria-label="主要メニュー"><ul>
  ${jp ? `<li><a href="${href(jp.path)}">${icon('pin', { size: 18 })}国内</a></li>` : ''}
  ${worldAll ? `<li><a href="${href(worldAll.path)}">${icon('globe', { size: 18 })}海外</a></li>` : ''}
  <li><a href="/features/">${icon('sparkles', { size: 18 })}特集</a></li>
  <li><a href="/new/">${icon('clock', { size: 18 })}新着</a></li>
</ul></nav>

<section class="sec" aria-labelledby="sec-feature">
  ${SectionHead({ en: hasRanking ? 'FEATURED' : 'PICK UP', title: hasRanking ? '特集・よく読まれている記事' : '注目の記事', id: 'sec-feature', more: '/features/', moreLabel: '特集をすべて見る' })}
  <div class="bento">
    <div class="bento__lead">${lead ? ArticleCard(lead, { variant: 'feature', eager: true, rank: hasRanking ? 1 : 0 }) : ''}</div>
    <div class="bento__subs">${subs.map((p, i) => ArticleCard(p, { variant: 'mini', rank: hasRanking ? i + 2 : 0 })).join('')}</div>
    <div class="bento__area panel">
      <h3 class="panel__t">${icon('pin', { size: 18 })}エリアから探す</h3>
      ${TabNavigation({ id: 'area', label: 'エリア', tabs: [
        { label: '国内', panel: chips(japan) },
        { label: '海外', panel: chips([...(worldAll ? [worldAll] : []), ...world], { short: true }) },
        ...(themes.length ? [{ label: 'テーマ', panel: chips(themes) }] : []),
      ] })}
    </div>
    <div class="bento__info panel">
      <h3 class="panel__t">${icon('info', { size: 18 })}このサイトについて</h3>
      <p>運営者が実際に足を運んだ体験をもとに、料金・遊び方・注意点を整理しています。掲載情報は公開日・更新日時点のものです。</p>
      <a class="tbtn" href="/about/">運営者情報${icon('right', { size: 16 })}</a>
    </div>
  </div>
</section>

<section class="sec" aria-labelledby="sec-new">
  ${SectionHead({ en: 'NEW ARRIVALS', title: '新着記事', id: 'sec-new', more: '/new/' })}
  ${SwipeCarousel({ id: 'car-new', label: '新着記事', items: latest.map((p) => ArticleCard(p)) })}
</section>

${jp && jpPosts.length ? `<section class="sec" aria-labelledby="sec-jp">
  ${SectionHead({ en: 'JAPAN', title: '国内', id: 'sec-jp', more: jp.path, moreLabel: `国内の記事をすべて見る（${jp.posts.length}）` })}
  ${ArticleGrid(jpPosts)}
</section>` : ''}

${worldAll && wPosts.length ? `<section class="sec" aria-labelledby="sec-world">
  ${SectionHead({ en: 'WORLD', title: '海外', id: 'sec-world', more: worldAll.path, moreLabel: `海外の記事をすべて見る（${worldAll.posts.length}）` })}
  ${ArticleGrid(wPosts)}
</section>` : ''}

${themes.length ? `<section class="sec" aria-labelledby="sec-theme">
  ${SectionHead({ en: 'THEMES', title: 'テーマ別に読む', id: 'sec-theme' })}
  <ul class="tiles">${themes.map((c) => `<li><a class="tile" href="${href(c.path)}"><span class="tile__ic">${icon('tag', { size: 18 })}</span><span class="tile__t">${esc(c.name)}</span><span class="tile__n">${c.posts.length}記事</span></a></li>`).join('')}</ul>
</section>` : ''}`;

  return AppShell(site, assets, {
    path: '/', title: SITE, description: '国内・海外のナイトライフ情報を、料金・遊び方・注意点まで実体験ベースで整理したガイドサイト。', body, bodyClass: 'p-home',
    jsonld: [orgLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: CANONICAL + '/', potentialAction: { '@type': 'SearchAction', target: CANONICAL + '/search/?q={q}', 'query-input': 'required name=q' } }],
    ogImage: lead?.hero || '',
  });
}

// ---------- カテゴリ・新着の共通レイアウト ----------
function CategoryLayout(site, assets, { path, crumbs, en, title, desc, posts, cur, total, urlOf, catId = '', subcats = [], related = '' }) {
  const ps = posts.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const body = `
<header class="ph">
  ${Breadcrumbs(crumbs)}
  <p class="ph__en">${esc(en)}</p>
  <h1 class="ph__t">${esc(title)}${cur > 1 ? `<span class="ph__pg">（${cur}ページ目）</span>` : ''}</h1>
  ${desc ? `<p class="ph__d">${esc(desc)}</p>` : ''}
  <p class="ph__n">${icon('book', { size: 16 })}<span><b>${posts.length}</b>件の記事${total > 1 ? `・${cur} / ${total} ページ` : ''}</span></p>
  ${subcats.length ? `<div class="ph__subs">${chips(subcats, { short: true })}</div>` : ''}
</header>
<div class="lt" data-listing data-cat="${esc(catId)}" data-page="${cur}">
  <div class="lt__bar">
    <div class="seg" role="group" aria-label="表示方法">
      <button class="seg__b" type="button" data-view="grid" aria-pressed="true">${icon('grid', { size: 16 })}<span>グリッド</span></button>
      <button class="seg__b" type="button" data-view="list" aria-pressed="false">${icon('list', { size: 16 })}<span>リスト</span></button>
    </div>
    <label class="sel"><span class="sr">並び順</span>${icon('calendar', { size: 16 })}<select data-sort><option value="new">新着順</option><option value="updated">更新日順</option><option value="old">古い順</option></select>${icon('down', { size: 16 })}</label>
  </div>
  <div data-list-server>${ArticleGrid(ps, { eager: 2, level: 2 })}${Pagination(urlOf, cur, total)}</div>
  <div data-list-client hidden></div>
</div>
${related}`;
  return AppShell(site, assets, {
    path, title: cur > 1 ? `${title}（${cur}ページ目）` : title, description: desc || `${title}に関する記事一覧（${posts.length}件）。`, body, bodyClass: 'p-list',
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
  const subcats = c === worldAll ? world : c.children.filter((x) => x.posts.length);
  const siblings = (isWorld ? world : isJapan ? japan : site.groups.themes).filter((x) => x !== c).slice(0, 8);
  const pop = site.popular.filter((p) => p.catIds.includes(c.id)).slice(0, 4);
  const related = `<section class="sec" aria-labelledby="rel-t">
  ${SectionHead({ en: 'RELATED', title: '関連するカテゴリ・記事', id: 'rel-t' })}
  <div class="rel">
    ${siblings.length ? `<div class="panel"><h3 class="panel__t">${icon(isWorld ? 'globe' : 'pin', { size: 18 })}${isWorld ? 'ほかの国・エリア' : 'ほかのカテゴリ'}</h3>${chips(siblings, { short: isWorld })}</div>` : ''}
    ${pop.length ? `<div class="panel"><h3 class="panel__t">${icon('sparkles', { size: 18 })}このカテゴリの人気記事</h3>${ArticleList(pop, { level: 4 })}</div>` : ''}
  </div>
</section>`;
  const total = Math.max(1, Math.ceil(c.posts.length / PER_PAGE));
  const out = [];
  for (let n = 1; n <= total; n++) {
    const path = n === 1 ? c.path : `${c.path}page/${n}/`;
    out.push({ path, html: CategoryLayout(site, assets, {
      path, crumbs: n === 1 ? crumbs : [...crumbs.slice(0, -1), { name: c.name, path: c.path }, { name: `${n}ページ目` }],
      en: code ? `${code} · WORLD` : isWorld ? 'WORLD' : isJapan ? 'JAPAN' : 'CATEGORY', title: c.name, desc: c.description,
      posts: c.posts, cur: n, total, urlOf: (k) => (k === 1 ? c.path : `${c.path}page/${k}/`), catId: String(c.id), subcats, related,
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
      path, crumbs: [{ name: 'ホーム', path: '/' }, { name: '新着記事', path: '/new/' }, ...(n > 1 ? [{ name: `${n}ページ目` }] : [])].slice(0, n > 1 ? 3 : 2),
      en: 'NEW ARRIVALS', title: '新着記事', desc: '国内・海外のすべての記事を新しい順に掲載しています。', posts: site.posts, cur: n, total, urlOf,
    }) });
  }
  return out;
}

// ---------- 特集 ----------
export function featuresPage(site, assets) {
  const { japan, world, worldAll } = site.groups;
  const areaTile = (c) => {
    const cover = c.posts.find((p) => p.thumb)?.thumb;
    return `<li><a class="atile" href="${href(c.path)}"><span class="atile__m">${cover ? `<img src="${esc(img(cover, 384))}" alt="" width="520" height="293" loading="lazy" decoding="async">` : `<span class="ph">${icon('moon', { size: 24 })}</span>`}</span><span class="atile__b">${catBadge(c)}<span class="atile__t">${esc(c.name)}</span><span class="atile__n">${c.posts.length}記事</span></span></a></li>`;
  };
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: '特集' }];
  const body = `
<header class="ph">${Breadcrumbs(crumbs)}<p class="ph__en">FEATURES</p><h1 class="ph__t">特集</h1><p class="ph__d">よく読まれている記事と、エリア別のガイドをまとめています。</p></header>
${site.popular.length ? `<section class="sec" aria-labelledby="f-rank">${SectionHead({ en: 'RANKING', title: 'よく読まれている記事', id: 'f-rank' })}<ol class="rank">${site.popular.map((p, i) => `<li>${ArticleCard(p, { variant: 'list', rank: i + 1 })}</li>`).join('')}</ol></section>` : ''}
<section class="sec" aria-labelledby="f-jp">${SectionHead({ en: 'JAPAN', title: '国内エリア・ジャンル', id: 'f-jp' })}<ul class="atiles">${japan.map(areaTile).join('')}</ul></section>
<section class="sec" aria-labelledby="f-world">${SectionHead({ en: 'WORLD', title: '海外エリアガイド', id: 'f-world', more: worldAll?.path, moreLabel: '海外の記事をすべて見る' })}<ul class="atiles">${world.map(areaTile).join('')}</ul></section>`;
  return AppShell(site, assets, { path: '/features/', title: '特集', description: 'よく読まれている記事のランキングと、国内・海外のエリア別ガイド。', body, bodyClass: 'p-list', jsonld: [breadcrumbLd(crumbs)] });
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
    <button class="tool" type="button" data-fontsize aria-label="文字サイズを変更（現在：標準）">${icon('type', { size: 18 })}<span>文字<span data-fontsize-label>標準</span></span></button>
    <button class="tool" type="button" data-report-open>${icon('flag', { size: 18 })}<span>訂正・報告</span></button>
  </div>
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
${related.length ? `<section class="sec" aria-labelledby="rel-a">${SectionHead({ en: 'RELATED', title: `「${p.cat.name}」の関連記事`, id: 'rel-a', more: p.cat.path })}${SwipeCarousel({ id: 'car-rel', label: '関連記事', items: related.map((x) => ArticleCard(x)) })}</section>` : ''}
${ReportDialog(p)}
${Lightbox()}`;
  return AppShell(site, assets, {
    path: p.path, title: p.title, description: p.excerpt, body, bodyClass: 'p-article', progress: true, ogType: 'article', ogImage: p.hero,
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
  ${GlobalSearch({ id: 'q', cls: 'gs--page', autofocus: true })}
  <label class="sel"><span class="sr">カテゴリで絞り込む</span>${icon('tag', { size: 16 })}<select id="q-cat" data-search-cat><option value="">すべてのカテゴリ</option>${opts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>${icon('down', { size: 16 })}</label>
</div>
<p class="ph__n" id="search-status" aria-live="polite">店名・エリア・キーワードを入力してください（${site.posts.length}件の記事から検索）</p>
</header>
<div data-search-results></div>
<section class="sec" data-search-idle aria-labelledby="s-cat">${SectionHead({ en: 'BROWSE', title: 'カテゴリから探す', id: 's-cat' })}<div class="panel">${chips(opts)}</div></section>`;
  return AppShell(site, assets, { path: '/search/', title: '記事を検索', description: '国内・海外のナイトライフ記事をキーワードとカテゴリで検索できます。', body, bodyClass: 'p-search', jsonld: [breadcrumbLd(crumbs)] });
}

// ---------- マイダッシュボード ----------
export function dashboardPage(site, assets) {
  const crumbs = [{ name: 'ホーム', path: '/' }, { name: 'マイダッシュボード' }];
  const sw = (key, id, label, desc) => `<div class="setrow"><div><p class="setrow__t" id="${id}-l">${label}</p><p class="setrow__d" id="${id}-d">${desc}</p></div><button class="switch" type="button" role="switch" aria-checked="false" aria-labelledby="${id}-l" aria-describedby="${id}-d" data-setting="${key}"><span></span></button></div>`;
  const radios = (name, label, items) => `<fieldset class="setrow setrow--col"><legend class="setrow__t">${label}</legend><div class="seg seg--wide">${items.map(([v, l, ic]) => `<label class="seg__b"><input class="sr" type="radio" name="${name}" value="${v}" data-setting="${name}">${ic ? icon(ic, { size: 16 }) : ''}<span>${l}</span></label>`).join('')}</div></fieldset>`;
  const body = `
<header class="ph">${Breadcrumbs(crumbs)}<p class="ph__en">MY DASHBOARD</p><h1 class="ph__t">マイダッシュボード</h1>
<p class="ph__d">${icon('shield', { size: 16 })}ログインは不要です。保存記事・閲覧履歴・設定はこの端末のブラウザ内だけに保存され、外部には送信されません。</p></header>
<div class="dash" data-dashboard>
<dl class="kpis"><div><dt>保存記事</dt><dd data-kpi="saved">0</dd></div><div><dt>閲覧履歴</dt><dd data-kpi="history">0</dd></div><div><dt>読み終えた記事</dt><dd data-kpi="done">0</dd></div></dl>
${TabNavigation({ id: 'dash', label: 'マイダッシュボード', tabs: [
  { label: `${icon('bookmark', { size: 16 })}保存記事`, panel: `<div class="dash__bar"><div class="folders" data-folders role="group" aria-label="フォルダ"></div><button class="btn btn--ghost btn--sm" type="button" data-folder-new>${icon('plus', { size: 16 })}フォルダを作成</button></div><form class="inline-form" data-folder-form hidden><label class="sr" for="folder-name">フォルダ名</label><input class="input" id="folder-name" name="name" maxlength="20" placeholder="フォルダ名（20文字まで）" required><button class="btn btn--primary btn--sm" type="submit">作成</button><button class="btn btn--ghost btn--sm" type="button" data-folder-cancel>やめる</button></form><div data-saved-list>${SkeletonLoader(3)}</div>` },
  { label: `${icon('history', { size: 16 })}閲覧履歴`, panel: `${sw('historyEnabled', 'he1', '閲覧履歴を保存する', '初期設定はオフです。オンにすると、読んだ記事と読書の進み具合をこの端末に記録します。')}<div class="dash__bar"><p class="dash__note" data-history-note></p><span data-confirm-wrap><button class="btn btn--ghost btn--sm" type="button" data-history-clear>${icon('trash', { size: 16 })}履歴をすべて削除</button></span></div><div data-history-list>${SkeletonLoader(3)}</div>` },
  { label: `${icon('settings', { size: 16 })}設定`, panel: `<div class="settings">
    ${radios('theme', '表示モード', [['system', '端末に合わせる', 'monitor'], ['dark', 'ダーク', 'moon'], ['light', 'ライト', 'sun']])}
    ${radios('fontSize', '記事の文字サイズ', [['s', '小'], ['m', '標準'], ['l', '大'], ['xl', '特大']])}
    ${sw('historyEnabled', 'he2', '閲覧履歴を保存する', '共有の端末ではオフのままをおすすめします。')}
    <div class="setrow"><div><p class="setrow__t">年齢確認をやり直す</p><p class="setrow__d">次にページを開いたときに、もう一度確認画面を表示します。</p></div><button class="btn btn--ghost btn--sm" type="button" data-age-reset>やり直す</button></div>
    <div class="setrow setrow--danger"><div><p class="setrow__t">この端末のデータをすべて削除</p><p class="setrow__d">保存記事・フォルダ・閲覧履歴・設定をすべて消去します。元に戻せません。</p></div><span data-confirm-wrap><button class="btn btn--danger btn--sm" type="button" data-wipe>${icon('trash', { size: 16 })}すべて削除</button></span></div>
  </div>` },
] })}
<noscript><p class="notice">マイダッシュボードを使うには JavaScript を有効にしてください。</p></noscript>
</div>`;
  return AppShell(site, assets, { path: '/my-dashboard/', title: 'マイダッシュボード', description: '保存記事・閲覧履歴・表示設定を管理できます（データはこの端末内のみに保存）。', body, bodyClass: 'p-dash', jsonld: [breadcrumbLd(crumbs)] });
}

export function notFoundPage(site, assets) {
  const body = `<div class="nf"><h1 class="sr">ページが見つかりません（404）</h1>${EmptyState({ ic: 'alert', title: 'ページが見つかりません', text: 'お探しのページは移動または削除された可能性があります。', action: `<div class="nf__act"><a class="btn btn--primary" href="/">ホームへ戻る</a><a class="btn btn--ghost" href="/search/">記事を検索</a></div>` })}</div>`;
  return AppShell(site, assets, { path: '/404/', title: 'ページが見つかりません', body, bodyClass: 'p-404' });
}
