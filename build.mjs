// グローバルナイトガイドの本番ページを取得し、新しいデザインの静的サイトとして dist/ に書き出す。
// Vercel のビルド（npm run build）で毎回実行されるので、本番の記事を更新したら Vercel で
// 「Redeploy」するだけで中身も最新になる。
import * as cheerio from 'cheerio';
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ORIGIN = 'https://globalnightguide.com';
const OUT = 'dist';
const SITE_NAME = 'グローバルナイトガイド';

// 作るページ。path は本番と同じ（リンクの書き換えに使う）
const PAGES = [
  { path: '/', type: 'home' },
  { path: '/about/', type: 'page' },
  { path: '/contact/', type: 'contact' },
  { path: '/category/海外風俗/', type: 'archive' },
  { path: '/2965/', type: 'post' },
];
const LOCAL = new Set(PAGES.map((p) => p.path));

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(path) {
  if (process.env.GNG_FIXTURES) return readFile(join(process.env.GNG_FIXTURES, (decodeURI(path).replace(/\//g, '_') || '_') + '.html'), 'utf8');
  const url = ORIGIN + encodeURI(path);
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ja' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.text();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 本番の URL を、このサイトにあるページなら相対パスへ、無ければ本番の絶対 URL にする
function rewriteHref(href, selfPath) {
  if (!href) return href;
  if (href.startsWith('#')) return href;
  let u;
  try { u = new URL(href, ORIGIN + selfPath); } catch { return href; }
  if (u.origin !== ORIGIN) return u.href;
  const p = decodeURIComponent(u.pathname);
  if (LOCAL.has(p)) {
    if (p === selfPath && u.hash) return u.hash; // 同じページ内の目次リンク
    return encodeURI(p) + u.hash;
  }
  return u.href;
}

const KEEP_ATTR = new Set(['href', 'src', 'alt', 'class', 'id', 'colspan', 'rowspan', 'width', 'height', 'datetime', 'type', 'name', 'placeholder', 'value', 'rows', 'cols', 'for', 'target', 'rel']);

function clean($, $root, selfPath) {
  $root.find('script,style,noscript,ins,link,meta,.adsbygoogle,.sns-btn,.sns-btn__title,.screen-reader-response').remove();
  $root.find('*').each((_, el) => {
    const $el = $(el);
    if (el.tagName === 'img') {
      const ds = $el.attr('data-src') || $el.attr('data-lazy-src');
      if (ds) $el.attr('src', ds);
    }
    for (const name of Object.keys(el.attribs || {})) {
      if (!KEEP_ATTR.has(name)) $el.removeAttr(name);
    }
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
    if (el.tagName === 'a') {
      const h = rewriteHref($el.attr('href'), selfPath);
      if (h) $el.attr('href', h);
      if (h && /^https?:/.test(h) && !h.startsWith(ORIGIN)) $el.attr('rel', 'noopener');
    }
  });
  // 空の段落を消す
  $root.find('p').each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && !$el.find('img,a,input,textarea').length) $el.remove();
  });
  // 表は横にはみ出しても読めるよう、スクロール枠で包む（既に包まれているものは除く）
  $root.find('table').each((_, el) => {
    const $el = $(el);
    if (!$el.parent().is('.scroll,.yoko-scroll,.tbl')) $el.wrap('<div class="tbl"></div>');
  });
  return $root;
}

function navFrom($, selfPath) {
  const items = [];
  $('.desktop-nav > ul > li').each((_, li) => {
    const $a = $(li).children('a').first();
    const subs = [];
    $(li).find('.sub-menu > li > a').each((_, a) => subs.push({ text: $(a).text().trim(), href: rewriteHref($(a).attr('href'), selfPath) }));
    items.push({ text: $a.text().trim(), href: rewriteHref($a.attr('href'), selfPath), raw: $a.attr('href'), subs });
  });
  return items;
}

function rankingFrom($, selfPath) {
  const list = [];
  $('.my_popular_posts li').each((_, li) => {
    const $a = $(li).find('a').first();
    list.push({
      href: rewriteHref($a.attr('href'), selfPath),
      img: $a.find('img').attr('src'),
      title: $a.find('.my-widget__text').text().trim(),
    });
  });
  return list.slice(0, 5);
}

function cardsFrom($, selfPath) {
  const cards = [];
  $('#main .c_linkto_wrap, #main .sidelong__article').each((_, w) => {
    const $w = $(w);
    const $a = $w.find('a.c_linkto, a.sidelong__link').first();
    const href = $a.attr('href');
    if (!href) return;
    cards.push({
      href: rewriteHref(href, selfPath),
      img: $a.find('img').attr('data-src') || $a.find('img').attr('src'),
      title: $a.find('h2, .sidelong__title').first().text().trim() || $a.find('img').attr('alt'),
      date: $a.find('time').first().text().trim(),
      updated: $a.find('time').first().hasClass('updated'),
      cat: $w.find('.cat-name').first().text().trim(),
    });
  });
  return cards;
}

function pagerFrom($) {
  const pages = [];
  $('.pagination li > .page-numbers').each((_, el) => {
    const $el = $(el);
    pages.push({ text: $el.text().trim() || ($el.hasClass('next') ? '›' : '‹'), href: $el.attr('href') ? new URL($el.attr('href'), ORIGIN).href : null, current: $el.hasClass('current') });
  });
  return pages;
}

function layout({ path, title, description, nav, body, ranking, wide = false }) {
  const depth = path.split('/').filter(Boolean).length;
  const root = depth ? '../'.repeat(depth) : './';
  const navHtml = nav.map((n) => {
    const on = n.href === encodeURI(path) || (path === '/2965/' && n.raw?.endsWith('/2965/'));
    const sub = n.subs.length ? `<ul class="sub">${n.subs.map((s) => `<li><a href="${esc(s.href)}">${esc(s.text)}</a></li>`).join('')}</ul>` : '';
    return `<li${n.subs.length ? ' class="has-sub"' : ''}><a href="${esc(n.href)}"${on ? ' aria-current="page"' : ''}>${esc(n.text)}</a>${sub}</li>`;
  }).join('');
  const rankHtml = ranking.length ? `<aside class="side"><section class="sw"><h2 class="sw__title">人気の記事ランキング</h2><ol class="rank">${ranking.map((r, i) => `<li><a href="${esc(r.href)}"><span class="rank__no">${i + 1}</span><img src="${esc(r.img)}" alt="" width="80" height="80" loading="lazy"><span class="rank__t">${esc(r.title)}</span></a></li>`).join('')}</ol></section></aside>` : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(ORIGIN + encodeURI(path))}">
<link rel="stylesheet" href="${root}assets/site.css">
</head>
<body>
<a class="skip" href="#content">本文へ移動</a>
<header class="hd">
  <div class="hd__in">
    <a class="logo" href="${root}">${SITE_NAME}</a>
  </div>
  <nav class="gnav" aria-label="メニュー"><ul>${navHtml}</ul></nav>
</header>
<div class="layout${wide ? ' layout--wide' : ''}">
  <main id="content">${body}</main>
  ${rankHtml}
</div>
<footer class="ft">
  <nav class="ft__nav" aria-label="サイト情報"><a href="${root}about/">自己紹介</a><a href="${root}contact/">お問い合わせ</a><a href="${root}design/">デザインの比較</a></nav>
  <p class="ft__c">© ${new Date().getFullYear()} ${SITE_NAME} All rights reserved.</p>
</footer>
<a class="totop" href="#" aria-label="ページの先頭へ">↑</a>
<script src="${root}assets/site.js" defer></script>
</body>
</html>
`;
}

function crumbs(list) {
  return `<nav class="crumb" aria-label="パンくずリスト"><ol>${list.map((c) => `<li>${c.href ? `<a href="${esc(c.href)}">${esc(c.text)}</a>` : `<span>${esc(c.text)}</span>`}</li>`).join('')}</ol></nav>`;
}

function cardList(cards, { lead = false } = {}) {
  return `<div class="cards">${cards.map((c, i) => `<article class="card${lead && i === 0 ? ' card--lead' : ''}"><a href="${esc(c.href)}"><span class="card__img"><img src="${esc(c.img)}" alt="" width="520" height="300" loading="${i < 2 ? 'eager' : 'lazy'}"></span><span class="card__body">${c.cat ? `<span class="card__cat">${esc(c.cat)}</span>` : ''}${c.date ? `<time class="card__date${c.updated ? ' is-updated' : ''}">${esc(c.date)}</time>` : ''}<span class="card__t">${esc(c.title)}</span></span></a></article>`).join('')}</div>`;
}

function pager(pages) {
  if (!pages.length) return '';
  return `<nav class="pager" aria-label="ページ送り">${pages.map((p) => p.current ? `<span aria-current="page">${esc(p.text)}</span>` : p.href ? `<a href="${esc(p.href)}">${esc(p.text)}</a>` : `<span class="dots">${esc(p.text)}</span>`).join('')}</nav><p class="note">2 ページ目以降は本番サイトが開きます</p>`;
}

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'assets'), { recursive: true });
  await cp('src/site.css', join(OUT, 'assets/site.css'));
  await cp('src/site.js', join(OUT, 'assets/site.js'));
  await cp('design', join(OUT, 'design'), { recursive: true });

  for (const page of PAGES) {
    const html = await get(page.path);
    const $ = cheerio.load(html);
    const nav = navFrom($, page.path);
    const ranking = rankingFrom($, page.path);
    const description = $('meta[name=description]').attr('content') || '';
    let title = $('title').text().trim();
    let body = '';

    if (page.type === 'home') {
      const cards = cardsFrom($, page.path);
      body = `<h1 class="sr">${esc(SITE_NAME)}</h1>${cardList(cards, { lead: true })}${pager(pagerFrom($))}`;
    } else if (page.type === 'archive') {
      const h1 = $('#archive_header h1').text().trim();
      const cards = cardsFrom($, page.path);
      body = `<header class="arch">${crumbs([{ text: 'ホーム', href: rewriteHref('/', page.path) }, { text: h1 }])}<h1>${esc(h1)}</h1><p>${cards.length} 件を表示中</p></header>${cardList(cards)}${pager(pagerFrom($))}`;
    } else {
      const $ec = clean($, $('.entry-content').first(), page.path);
      if (page.type === 'contact') {
        // 静的サイトでは送信できないので、入力欄は見た目だけにして本番のフォームへ案内する
        $ec.find('form').each((_, f) => {
          const $f = $(f);
          $f.attr('class', 'form');
          $f.find('input[type=hidden]').remove();
          $f.find('br').remove();
          $f.find('input[type=submit]').replaceWith(`<a class="btn" href="${ORIGIN}/contact/">本番サイトのフォームから送信する</a>`);
          $f.before('<p class="note note--box">このページはデザイン確認用のため、ここからは送信できません。下のボタンから本番サイトのフォームを開いてください。</p>');
        });
        $ec.find('.wpcf7-response-output').remove();
      }
      const h1 = $('.entry-title, .page-title').first().text().trim();
      const cr = [{ text: 'ホーム', href: rewriteHref('/', page.path) }];
      $('#breadcrumb li a').slice(1).each((_, a) => cr.push({ text: $(a).text().trim(), href: rewriteHref($(a).attr('href'), page.path) }));
      cr.push({ text: h1 });
      const times = $('.entry-meta time, .article-header time').map((_, t) => ({ dt: $(t).attr('datetime'), text: $(t).text().trim(), updated: $(t).hasClass('updated') })).get();
      const meta = times.length ? `<p class="meta">${times.map((t) => `<time datetime="${esc(t.dt)}">${t.updated ? '更新 ' : '公開 '}${esc(t.text)}</time>`).join('')}</p>` : '';
      body = `<article class="art">${crumbs(cr)}<header class="art__hd"><h1>${esc(h1)}</h1>${meta}</header><div class="entry">${$ec.html()}</div></article>`;
    }

    const out = join(OUT, decodeURI(page.path), 'index.html');
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, layout({ path: page.path, title, description, nav, body, ranking, wide: page.type === 'contact' }));
    console.log('built', page.path, (body.length / 1024).toFixed(0) + 'KB');
  }
}

build().catch((e) => { console.error(e); process.exit(1); });
