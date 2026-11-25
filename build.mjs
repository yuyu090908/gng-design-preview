// グローバルナイトガイドの記事・カテゴリ・固定ページを WordPress の REST API から取得し、
// オリジナルデザインの静的サイトとして dist/ に書き出す。
// サイト内のリンクはすべてこのサイトの中で完結する（本番サイトへは飛ばない）。
// Vercel のビルド（npm run build）で毎回実行されるので、本番で記事を更新したら
// Vercel で「Redeploy」するだけで中身も最新になる。
import * as cheerio from 'cheerio';
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ORIGIN = 'https://globalnightguide.com';
const OUT = 'dist';
const SITE = 'グローバルナイトガイド';
const SITE_EN = 'GLOBAL NIGHT GUIDE';
const PER_PAGE = 12;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 表示しない固定ページ（会員機能など）
const SKIP_PAGES = new Set(['member-directory', 'my-profile', 'account', 'reset-password', 'sign-up', 'log-in']);
// 国コード（エリアのバッジ表示用）
const COUNTRY = { タイ: 'TH', 韓国: 'KR', 台湾: 'TW', ベトナム: 'VN', フィリピン: 'PH', カンボジア: 'KH', インドネシア: 'ID', シンガポール: 'SG', マレーシア: 'MY', ドイツ: 'DE', ミャンマー: 'MM', モンゴル: 'MN', ラオス: 'LA', ウズベキスタン: 'UZ' };
// ヘッダーのメニュー（カテゴリ名）
const MAIN_NAV = ['国内風俗', '海外風俗', 'ソープランド', '高級デリヘル', 'セフレ', '精力剤'];

// ---------- 取得 ----------
async function get(path, { json = true, withHeaders = false } = {}) {
  if (process.env.GNG_FIXTURES) {
    // 確認用：.fixtures/ の categories.json / pages.json / posts.json / home.html を読む
    const name = (path.match(/v2\/(\w+)/) || [, 'home'])[1];
    const body = await readFile(join(process.env.GNG_FIXTURES, name + (json ? '.json' : '.html')), 'utf8').catch(() => (json ? '[]' : ''));
    const data = json ? JSON.parse(body) : body;
    return withHeaders ? { data, headers: new Headers({ 'x-wp-totalpages': '1' }) } : data;
  }
  const url = ORIGIN + path;
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ja' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const data = json ? await res.json() : await res.text();
      return withHeaders ? { data, headers: res.headers } : data;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function getAll(path) {
  const list = [];
  for (let page = 1; ; page++) {
    const { data, headers } = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { withHeaders: true });
    list.push(...data);
    if (page >= Number(headers.get('x-wp-totalpages') || 1)) break;
  }
  return list;
}

// ---------- 小物 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (html) => cheerio.load(`<div>${html || ''}</div>`)('div').text().replace(/\s+/g, ' ').trim();
const pathOf = (link) => { try { return decodeURIComponent(new URL(link, ORIGIN).pathname); } catch { return null; } };
const href = (p) => encodeURI(p);
const ymd = (iso) => (iso ? iso.slice(0, 10).replace(/-/g, '.') : '');

// ---------- データの組み立て ----------
async function load() {
  const [cats, pages, posts] = await Promise.all([
    getAll('/wp-json/wp/v2/categories?_fields=id,name,slug,count,parent,link,description'),
    getAll('/wp-json/wp/v2/pages?_fields=id,slug,link,title,content,date,modified'),
    getAll('/wp-json/wp/v2/posts?_embed=wp:featuredmedia&_fields=id,link,title,excerpt,content,date,modified,categories,_links,_embedded'),
  ]);

  const catById = new Map();
  for (const c of cats) catById.set(c.id, { ...c, path: pathOf(c.link), posts: [], children: [] });
  for (const c of catById.values()) if (c.parent && catById.has(c.parent)) catById.get(c.parent).children.push(c);

  const P = posts.map((p) => {
    const fm = p._embedded?.['wp:featuredmedia']?.[0];
    const sizes = fm?.media_details?.sizes || {};
    const pick = (...names) => names.map((n) => sizes[n]?.source_url).find(Boolean) || fm?.source_url || '';
    const cs = (p.categories || []).map((id) => catById.get(id)).filter(Boolean);
    const main = cs.filter((c) => c.name !== '未分類').sort((a, b) => a.count - b.count)[0] || cs[0];
    return {
      id: p.id,
      path: pathOf(p.link),
      title: text(p.title.rendered),
      excerpt: text(p.excerpt.rendered).replace(/\s*…\s*$/, '…'),
      content: p.content.rendered,
      date: p.date,
      modified: p.modified,
      thumb: pick('thumb-520', 'medium_large', 'medium'),
      hero: pick('thumb-940', 'large', 'medium_large', 'full'),
      cats: cs,
      cat: main,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  // カテゴリの記事一覧（子カテゴリの記事も親に含める）
  for (const p of P) {
    const seen = new Set();
    for (let c of p.cats) {
      while (c && !seen.has(c.id)) { seen.add(c.id); c.posts.push(p); c = catById.get(c.parent); }
    }
  }

  const Pages = pages.filter((p) => !SKIP_PAGES.has(p.slug)).map((p) => ({ id: p.id, slug: p.slug, path: pathOf(p.link), title: text(p.title.rendered), content: p.content.rendered, date: p.date, modified: p.modified }));

  // 人気記事：本番トップのランキングを使う（取れなければ新着順）
  let popular = [];
  try {
    const $ = cheerio.load(await get('/', { json: false }));
    const byPath = new Map(P.map((p) => [p.path, p]));
    $('.my_popular_posts li a').each((_, a) => { const p = byPath.get(pathOf($(a).attr('href'))); if (p && !popular.includes(p)) popular.push(p); });
  } catch (e) { console.warn('ranking:', e.message); }
  if (popular.length < 5) popular = [...new Set([...popular, ...P])];
  popular = popular.slice(0, 5);

  return { cats: [...catById.values()], catById, posts: P, pages: Pages, popular };
}

// ---------- リンクの書き換え ----------
function makeLinker(site) {
  const local = new Set(['/', '/search/']);
  for (const p of site.posts) local.add(p.path);
  for (const p of site.pages) local.add(p.path);
  for (const c of site.cats) if (c.posts.length) local.add(c.path);
  const byId = new Map(site.posts.map((p) => [String(p.id), p.path]));
  // 戻り値：このサイト内のパス / 外部 URL / null（行き先が無いのでリンクを外す）
  return (raw, selfPath) => {
    if (!raw) return null;
    if (raw.startsWith('#')) return raw;
    let u;
    try { u = new URL(raw, ORIGIN + (selfPath || '/')); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return u.href; // mailto: など
    if (u.hostname.replace(/^www\./, '') !== 'globalnightguide.com') return u.href;
    let p = decodeURIComponent(u.pathname);
    if (!p.endsWith('/') && !/\.\w+$/.test(p)) p += '/';
    if (p.startsWith('/wp-content/')) return u.href; // 画像などのファイル
    if (u.searchParams.get('p') && byId.has(u.searchParams.get('p'))) p = byId.get(u.searchParams.get('p'));
    if (u.searchParams.get('s') != null) return '/search/?q=' + encodeURIComponent(u.searchParams.get('s'));
    const m = p.match(/^(.*\/)page\/\d+\/$/);
    const base = m ? m[1] : p;
    if (!local.has(base)) return null;
    if (p === selfPath && u.hash) return u.hash;
    return href(local.has(p) ? p : base) + u.hash;
  };
}

const KEEP_ATTR = new Set(['href', 'src', 'alt', 'class', 'id', 'colspan', 'rowspan', 'width', 'height', 'datetime', 'type', 'name', 'placeholder', 'rows', 'cols', 'for', 'target', 'rel', 'start']);

function cleanContent(html, selfPath, link) {
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  const $root = $('#__root');
  $root.find('script,style,noscript,ins,link,meta,iframe[src*="googleads"],.adsbygoogle,.sns-btn,.sns-btn__title,.screen-reader-response,#toc_container,.wpcf7-response-output').remove();
  $root.find('*').each((_, el) => {
    const $el = $(el);
    if (el.tagName === 'img') {
      const ds = $el.attr('data-src') || $el.attr('data-lazy-src');
      if (ds) $el.attr('src', ds);
    }
    for (const name of Object.keys(el.attribs || {})) if (!KEEP_ATTR.has(name)) $el.removeAttr(name);
    const cls = $el.attr('class');
    if (cls) {
      const kept = cls.split(/\s+/)
        .map((c) => (/^marker-animation-\d+$/.test(c) ? 'mk' : c))
        .filter((c) => c && !/^(wp-image-\d+|size-\w+|attachment-[\w-]+|dfont|wp-post-image)$/.test(c));
      if (kept.length) $el.attr('class', kept.join(' ')); else $el.removeAttr('class');
    }
    if (el.tagName === 'img') {
      const src = $el.attr('src');
      if (src) $el.attr('src', new URL(src, ORIGIN).href);
      $el.attr('loading', 'lazy');
      $el.attr('decoding', 'async');
    }
  });
  $root.find('a').each((_, el) => {
    const $el = $(el);
    const h = link($el.attr('href'), selfPath);
    if (h == null) { $el.replaceWith($el.contents()); return; }
    $el.attr('href', h);
    if (/^https?:/.test(h)) { $el.attr('rel', 'noopener sponsored'); $el.attr('target', '_blank'); } else { $el.removeAttr('target'); $el.removeAttr('rel'); }
  });
  $root.find('p').each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && !$el.find('img,a,input,textarea,select').length) $el.remove();
  });
  $root.find('table').each((_, el) => {
    const $el = $(el);
    if (!$el.parent().is('.scroll,.yoko-scroll,.tbl')) $el.wrap('<div class="tbl"></div>');
  });
  // 目次を作る（h2 と h3）
  const toc = [];
  let n2 = 0;
  $root.find('h2, h3').each((i, el) => {
    const $el = $(el);
    const t = $el.text().trim();
    if (!t) return;
    const id = `s${i + 1}`;
    $el.attr('id', id);
    if (el.tagName === 'h2') { n2++; toc.push({ id, t, subs: [] }); } else if (toc.length) toc.at(-1).subs.push({ id, t });
  });
  return { $, $root, toc, n2 };
}

// ---------- 部品 ----------
const ICON = {
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function areaGroups(site) {
  const live = site.cats.filter((c) => c.posts.length && c.name !== '未分類');
  const byName = (n) => live.find((c) => c.name === n);
  const japan = ['国内風俗', 'ソープランド', '高級デリヘル', '激安デリヘル', 'キャバクラ'].map(byName).filter(Boolean);
  const world = live.filter((c) => COUNTRY[c.name.replace(/風俗$/, '')]).sort((a, b) => b.posts.length - a.posts.length);
  const used = new Set([...japan, ...world, byName('海外風俗')]);
  const other = live.filter((c) => !used.has(c));
  return { japan, world, worldAll: byName('海外風俗'), other };
}

function catBadge(c) {
  const code = COUNTRY[c.name.replace(/風俗$/, '')];
  return code ? `<span class="flag">${code}</span>` : '';
}

function layout(site, { path, title, description, body, side = true, bodyClass = '' }) {
  const g = areaGroups(site);
  const nav = MAIN_NAV.map((n) => site.cats.find((c) => c.name === n && c.posts.length)).filter(Boolean);
  const on = (p) => (path === p || (p !== '/' && path.startsWith(p)) ? ' aria-current="page"' : '');
  const list = (cs) => cs.map((c) => `<li><a href="${href(c.path)}">${catBadge(c)}<span>${esc(c.name)}</span><small>${c.posts.length}</small></a></li>`).join('');
  const fullTitle = path === '/' ? `${SITE} | 国内・海外の夜遊びガイド` : `${title} | ${SITE}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
${description ? `<meta name="description" content="${esc(description.slice(0, 120))}">` : ''}
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0f1526">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body class="${bodyClass}">
<a class="skip" href="#content">本文へ移動</a>
<header class="hd">
  <div class="hd__in">
    <a class="logo" href="/">${ICON.moon}<span class="logo__t"><b>${SITE_EN}</b><small>${SITE}</small></span></a>
    <nav class="hd__nav" aria-label="メインメニュー"><ul>${nav.map((c) => `<li><a href="${href(c.path)}"${on(c.path)}>${esc(c.name)}</a></li>`).join('')}</ul></nav>
    <a class="icon-btn" href="/search/" aria-label="記事を検索">${ICON.search}</a>
    <button class="icon-btn menu-btn" type="button" aria-label="メニューを開く" aria-controls="drawer" aria-expanded="false">${ICON.menu}</button>
  </div>
  <nav class="tabs" aria-label="カテゴリ"><ul>${[{ name: 'ホーム', path: '/' }, ...nav].map((c) => `<li><a href="${href(c.path)}"${c.path === '/' ? (path === '/' ? ' aria-current="page"' : '') : on(c.path)}>${esc(c.name)}</a></li>`).join('')}</ul></nav>
</header>
<div class="drawer" id="drawer" hidden>
  <div class="drawer__bg" data-close></div>
  <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="メニュー">
    <div class="drawer__hd"><span>MENU</span><button class="icon-btn" type="button" data-close aria-label="メニューを閉じる">${ICON.close}</button></div>
    <form class="search" action="/search/" role="search"><input type="search" name="q" placeholder="店名・エリア・キーワード" aria-label="キーワード">${ICON.search}</form>
    <p class="drawer__h">国内</p><ul class="clist">${list(g.japan)}</ul>
    <p class="drawer__h">海外</p><ul class="clist">${g.worldAll ? list([g.worldAll]) : ''}${list(g.world)}</ul>
    ${g.other.length ? `<p class="drawer__h">テーマ</p><ul class="clist">${list(g.other)}</ul>` : ''}
    <p class="drawer__h">サイトについて</p><ul class="clist">${site.pages.map((p) => `<li><a href="${href(p.path)}"><span>${esc(p.title)}</span></a></li>`).join('')}</ul>
  </div>
</div>
<div class="wrap${side ? ' wrap--side' : ''}">
  <main id="content">${body}</main>
  ${side ? sidebar(site, g) : ''}
</div>
<footer class="ft">
  <div class="ft__in">
    <a class="logo logo--ft" href="/">${ICON.moon}<span class="logo__t"><b>${SITE_EN}</b><small>${SITE}</small></span></a>
    <p class="ft__lead">国内から海外まで、夜の街を歩くための実体験ガイド。</p>
    <div class="ft__cols">
      <div><p class="ft__h">国内</p><ul>${g.japan.map((c) => `<li><a href="${href(c.path)}">${esc(c.name)}</a></li>`).join('')}</ul></div>
      <div><p class="ft__h">海外</p><ul>${g.world.slice(0, 8).map((c) => `<li><a href="${href(c.path)}">${esc(c.name)}</a></li>`).join('')}</ul></div>
      <div><p class="ft__h">サイト</p><ul>${site.pages.map((p) => `<li><a href="${href(p.path)}">${esc(p.title)}</a></li>`).join('')}<li><a href="/search/">記事を検索</a></li></ul></div>
    </div>
    <p class="ft__c">© ${new Date().getFullYear()} ${SITE}</p>
  </div>
</footer>
<a class="totop" href="#" aria-label="ページの先頭へ">${ICON.arrow}</a>
<script src="/assets/site.js" defer></script>
</body>
</html>
`;
}

function sidebar(site, g) {
  return `<aside class="side">
  <section class="box"><h2 class="box__h">人気の記事</h2><ol class="rank">${site.popular.map((p, i) => `<li><a href="${href(p.path)}"><span class="rank__no">${i + 1}</span><img src="${esc(p.thumb)}" alt="" width="160" height="92" loading="lazy"><span class="rank__t">${esc(p.title)}</span></a></li>`).join('')}</ol></section>
  <section class="box"><h2 class="box__h">エリアから探す</h2><ul class="chips">${[...g.japan, ...g.world].map((c) => `<li><a href="${href(c.path)}">${catBadge(c)}${esc(c.name.replace(/風俗$/, ''))}</a></li>`).join('')}</ul></section>
</aside>`;
}

function card(p, { eager = false, big = false } = {}) {
  return `<article class="card${big ? ' card--big' : ''}"><a href="${href(p.path)}">
  <span class="card__img"><img src="${esc(p.thumb)}" alt="" width="520" height="300" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></span>
  <span class="card__body">${p.cat ? `<span class="tag">${catBadge(p.cat)}${esc(p.cat.name)}</span>` : ''}<span class="card__t">${esc(p.title)}</span>${big ? `<span class="card__ex">${esc(p.excerpt)}</span>` : ''}<time datetime="${p.date}">${ymd(p.date)}</time></span>
</a></article>`;
}

const cards = (ps, opts = {}) => `<div class="cards">${ps.map((p, i) => card(p, { eager: i < 2, ...opts })).join('')}</div>`;

function crumbs(list) {
  return `<nav class="crumb" aria-label="パンくずリスト"><ol>${list.map((c) => `<li>${c.path ? `<a href="${href(c.path)}">${esc(c.name)}</a>` : `<span aria-current="page">${esc(c.name)}</span>`}</li>`).join('')}</ol></nav>`;
}

function pager(base, cur, total) {
  if (total <= 1) return '';
  const url = (n) => href(n === 1 ? base : `${base}page/${n}/`);
  const nums = [...new Set([1, cur - 1, cur, cur + 1, total])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  let out = '', prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out += '<span class="dots">…</span>';
    out += n === cur ? `<span aria-current="page">${n}</span>` : `<a href="${url(n)}">${n}</a>`;
    prev = n;
  }
  return `<nav class="pager" aria-label="ページ送り">${cur > 1 ? `<a class="pager__step" href="${url(cur - 1)}" aria-label="前のページ">‹</a>` : ''}${out}${cur < total ? `<a class="pager__step" href="${url(cur + 1)}" aria-label="次のページ">›</a>` : ''}</nav>`;
}

function tocHtml(toc) {
  if (toc.length < 2) return '';
  const hasSub = toc.some((h) => h.subs.length);
  return `<nav class="toc" aria-label="目次"><div class="toc__hd"><p class="toc__t">目次</p>${hasSub ? '<button class="toc__btn" type="button" aria-expanded="true">見出しだけ</button>' : ''}</div><ol>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.t)}</a>${h.subs.length ? `<ul>${h.subs.map((s) => `<li><a href="#${s.id}">${esc(s.t)}</a></li>`).join('')}</ul>` : ''}</li>`).join('')}</ol></nav>`;
}

// ---------- 各ページ ----------
function homePage(site) {
  const g = areaGroups(site);
  const latest = site.posts.slice(0, PER_PAGE);
  const total = Math.ceil(site.posts.length / PER_PAGE);
  const sectionOf = (name) => site.cats.find((c) => c.name === name && c.posts.length);
  const blocks = ['国内風俗', '海外風俗'].map(sectionOf).filter(Boolean);
  const body = `
<section class="hero">
  <p class="hero__en">${SITE_EN}</p>
  <h1 class="hero__t">夜の街を、<br>もっと賢く楽しむ。</h1>
  <p class="hero__lead">国内の人気店から、タイ・韓国・台湾など海外の夜遊び事情まで。料金・遊び方・注意点を実体験ベースでまとめています。</p>
  <form class="search search--hero" action="/search/" role="search"><input type="search" name="q" placeholder="店名・エリア・キーワードで探す" aria-label="キーワード">${ICON.search}</form>
  <p class="hero__stat"><b>${site.posts.length}</b>記事 ／ <b>${g.world.length}</b>か国</p>
</section>
<section class="sec">
  <div class="sec__hd"><h2 class="sec__t"><span>AREA</span>エリアから探す</h2></div>
  <div class="areas">
    <div class="area area--jp"><p class="area__h">国内</p><ul class="chips">${g.japan.map((c) => `<li><a href="${href(c.path)}">${esc(c.name)}<small>${c.posts.length}</small></a></li>`).join('')}</ul></div>
    <div class="area area--world"><p class="area__h">海外</p><ul class="chips">${g.world.map((c) => `<li><a href="${href(c.path)}">${catBadge(c)}${esc(c.name.replace(/風俗$/, ''))}<small>${c.posts.length}</small></a></li>`).join('')}</ul></div>
  </div>
</section>
<section class="sec">
  <div class="sec__hd"><h2 class="sec__t"><span>RANKING</span>よく読まれている記事</h2></div>
  <ol class="pop">${site.popular.map((p, i) => `<li><a href="${href(p.path)}"><span class="pop__img"><img src="${esc(p.thumb)}" alt="" width="520" height="300" loading="lazy"><span class="pop__no">${i + 1}</span></span><span class="pop__t">${esc(p.title)}</span></a></li>`).join('')}</ol>
</section>
<section class="sec">
  <div class="sec__hd"><h2 class="sec__t"><span>NEW</span>新着記事</h2></div>
  ${cards(latest.slice(0, 1), { big: true })}${cards(latest.slice(1))}
  ${total > 1 ? `<a class="more" href="/page/2/">新着記事をもっと見る${ICON.arrow}</a>` : ''}
</section>
${blocks.map((c) => `<section class="sec">
  <div class="sec__hd"><h2 class="sec__t"><span>${c.name === '国内風俗' ? 'JAPAN' : 'WORLD'}</span>${esc(c.name)}</h2><a class="sec__more" href="${href(c.path)}">すべて見る（${c.posts.length}）</a></div>
  ${cards(c.posts.slice(0, 4))}
</section>`).join('')}`;
  return layout(site, { path: '/', title: SITE, description: '国内・海外の夜遊び情報を実体験ベースでまとめたガイドサイト。', body, bodyClass: 'is-home' });
}

function listPages(site, { base, name, en, desc, posts, crumbsList }) {
  const total = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  const out = [];
  for (let n = 1; n <= total; n++) {
    const ps = posts.slice((n - 1) * PER_PAGE, n * PER_PAGE);
    const path = n === 1 ? base : `${base}page/${n}/`;
    const body = `<header class="lhd">${crumbs(crumbsList)}<p class="lhd__en">${esc(en)}</p><h1 class="lhd__t">${esc(name)}</h1>${desc ? `<p class="lhd__d">${esc(desc)}</p>` : ''}<p class="lhd__n">${posts.length} 件の記事${total > 1 ? `（${n} / ${total} ページ）` : ''}</p></header>${cards(ps)}${pager(base, n, total)}`;
    out.push({ path, html: layout(site, { path, title: n === 1 ? name : `${name}（${n}ページ目）`, description: desc, body }) });
  }
  return out;
}

function postPage(site, p, link) {
  const { $root, toc } = cleanContent(p.content, p.path, link);
  // 目次は最初の h2 の直前に入れる
  const t = tocHtml(toc);
  const first = $root.find('h2').first();
  if (t && first.length) first.before(t); else if (t) $root.prepend(t);
  const chain = [];
  for (let c = p.cat; c; c = site.catById.get(c.parent)) chain.unshift(c);
  const related = (p.cat?.posts || []).filter((x) => x !== p).slice(0, 4);
  const i = site.posts.indexOf(p);
  const newer = site.posts[i - 1], older = site.posts[i + 1];
  const updated = p.modified && p.modified.slice(0, 10) !== p.date.slice(0, 10);
  const body = `<article class="art">
  <header class="art__hd">
    ${crumbs([{ name: 'ホーム', path: '/' }, ...chain.map((c) => ({ name: c.name, path: c.path })), { name: p.title }])}
    ${p.cat ? `<a class="tag" href="${href(p.cat.path)}">${catBadge(p.cat)}${esc(p.cat.name)}</a>` : ''}
    <h1 class="art__t">${esc(p.title)}</h1>
    <p class="art__meta"><time datetime="${p.date}">公開 ${ymd(p.date)}</time>${updated ? `<time datetime="${p.modified}">更新 ${ymd(p.modified)}</time>` : ''}</p>
    ${p.hero ? `<figure class="art__img"><img src="${esc(p.hero)}" alt="" width="940" height="541" fetchpriority="high"></figure>` : ''}
  </header>
  <div class="entry">${$root.html()}</div>
  <nav class="pn" aria-label="前後の記事">${older ? `<a class="pn__a" href="${href(older.path)}"><small>‹ 前の記事</small>${esc(older.title)}</a>` : '<span></span>'}${newer ? `<a class="pn__a pn__a--next" href="${href(newer.path)}"><small>次の記事 ›</small>${esc(newer.title)}</a>` : ''}</nav>
</article>
${related.length ? `<section class="sec"><div class="sec__hd"><h2 class="sec__t"><span>RELATED</span>「${esc(p.cat.name)}」の関連記事</h2><a class="sec__more" href="${href(p.cat.path)}">すべて見る</a></div>${cards(related)}</section>` : ''}`;
  return layout(site, { path: p.path, title: p.title, description: p.excerpt, body });
}

function staticPage(site, pg, link) {
  const { $, $root } = cleanContent(pg.content, pg.path, link);
  // お問い合わせフォームは見た目を整え、送信先は公開時に設定する
  $root.find('form').each((_, f) => {
    const $f = $(f);
    $f.attr('class', 'form');
    $f.find('input[type=hidden]').remove();
    $f.find('br').remove();
    $f.find('input[type=submit]').replaceWith('<button class="btn" type="submit" disabled>送信する（準備中）</button>');
  });
  if ($root.find('form').length) $root.find('form').first().before('<p class="notice">このサイトは公開準備中のため、フォームの送信はまだできません。</p>');
  const body = `<article class="art art--page"><header class="art__hd">${crumbs([{ name: 'ホーム', path: '/' }, { name: pg.title }])}<h1 class="art__t">${esc(pg.title)}</h1></header><div class="entry">${$root.html()}</div></article>`;
  return layout(site, { path: pg.path, title: pg.title, description: text(pg.content).slice(0, 120), body, side: pg.slug !== 'contact' });
}

function searchPage(site) {
  const body = `<header class="lhd">${crumbs([{ name: 'ホーム', path: '/' }, { name: '記事を検索' }])}<p class="lhd__en">SEARCH</p><h1 class="lhd__t">記事を検索</h1>
<form class="search search--page" action="/search/" role="search"><input type="search" name="q" id="q" placeholder="店名・エリア・キーワード" aria-label="キーワード" autocomplete="off">${ICON.search}</form>
<p class="lhd__n" id="search-status" aria-live="polite">キーワードを入力してください</p></header>
<div class="cards" id="search-results"></div>`;
  return layout(site, { path: '/search/', title: '記事を検索', body, bodyClass: 'is-search' });
}

function notFound(site) {
  const body = `<section class="nf"><p class="nf__code">404</p><h1>ページが見つかりません</h1><p>お探しのページは移動したか、削除された可能性があります。</p><a class="btn" href="/">ホームへ戻る</a></section>`;
  return layout(site, { path: '/404', title: 'ページが見つかりません', body });
}

// ---------- 書き出し ----------
async function write(path, html) {
  const file = path.endsWith('.html') || path.endsWith('.json') ? join(OUT, path) : join(OUT, path, 'index.html');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

async function build() {
  const site = await load();
  const link = makeLinker(site);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'assets'), { recursive: true });
  await cp('src/site.css', join(OUT, 'assets/site.css'));
  await cp('src/site.js', join(OUT, 'assets/site.js'));

  let n = 0;
  await write('/', homePage(site)); n++;
  for (const pg of listPages(site, { base: '/', name: '新着記事', en: 'NEW ARRIVALS', posts: site.posts, crumbsList: [{ name: 'ホーム', path: '/' }, { name: '新着記事' }] }).slice(1)) { await write(pg.path, pg.html); n++; }
  for (const c of site.cats) {
    if (!c.posts.length) continue;
    const chain = [];
    for (let x = c; x; x = site.catById.get(x.parent)) chain.unshift(x);
    const code = COUNTRY[c.name.replace(/風俗$/, '')];
    for (const pg of listPages(site, { base: c.path, name: c.name, en: code ? `${code} · WORLD` : 'CATEGORY', desc: text(c.description), posts: c.posts, crumbsList: [{ name: 'ホーム', path: '/' }, ...chain.slice(0, -1).map((x) => ({ name: x.name, path: x.path })), { name: c.name }] })) { await write(pg.path, pg.html); n++; }
  }
  for (const p of site.posts) { await write(p.path, postPage(site, p, link)); n++; }
  for (const pg of site.pages) { await write(pg.path, staticPage(site, pg, link)); n++; }
  await write('/search/', searchPage(site)); n++;
  await write('/404.html', notFound(site));
  await write('/search-index.json', JSON.stringify(site.posts.map((p) => ({ u: href(p.path), t: p.title, e: p.excerpt, c: p.cat?.name || '', i: p.thumb, d: ymd(p.date) }))));
  console.log(`built ${n} pages (${site.posts.length} posts, ${site.cats.filter((c) => c.posts.length).length} categories, ${site.pages.length} pages)`);
}

build().catch((e) => { console.error(e); process.exit(1); });
