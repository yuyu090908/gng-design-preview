// 記事本文の整形：リンクの書き換え（サイト内で完結させる）、不要要素の削除、目次・ギャラリーの準備。
import * as cheerio from 'cheerio';
import { ORIGIN } from './data.mjs';

export const href = (p) => encodeURI(p);

// 本番サイトの URL を、このサイトのパスに書き換える関数を作る。
// 戻り値：このサイト内のパス / 外部 URL / null（このサイトに行き先が無いのでリンクを外す）
export function makeLinker(site) {
  const local = new Set(['/', '/search/', '/new/', '/features/', '/my-dashboard/']);
  for (const p of site.posts) local.add(p.path);
  for (const p of site.pages) local.add(p.path);
  for (const c of site.cats) if (c.posts.length) local.add(c.path);
  const byId = new Map(site.posts.map((p) => [String(p.id), p.path]));
  return (raw, selfPath) => {
    if (!raw) return null;
    const s = String(raw).trim();
    if (s.startsWith('#')) return s;
    let u;
    try { u = new URL(s, ORIGIN + (selfPath || '/')); } catch { return null; }
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return u.href;
    if (!/^https?:$/.test(u.protocol)) return null; // javascript: などは外す
    if (u.hostname.replace(/^www\./, '') !== 'globalnightguide.com') return u.href;
    let p = decodeURIComponent(u.pathname);
    if (!p.endsWith('/') && !/\.\w+$/.test(p)) p += '/';
    if (p.startsWith('/wp-content/')) return u.href; // 画像などのファイル
    const qp = u.searchParams.get('p');
    if (qp && byId.has(qp)) p = byId.get(qp);
    if (u.searchParams.get('s') != null) return '/search/?q=' + encodeURIComponent(u.searchParams.get('s'));
    const m = p.match(/^(.*\/)page\/\d+\/$/);
    const base = m ? m[1] : p;
    if (!local.has(base)) return null;
    if (p === selfPath && u.hash) return u.hash;
    return href(local.has(p) ? p : base) + u.hash;
  };
}

const KEEP_ATTR = new Set(['href', 'src', 'alt', 'class', 'id', 'colspan', 'rowspan', 'width', 'height', 'datetime', 'type', 'name', 'placeholder', 'rows', 'cols', 'for', 'start', 'title', 'allowfullscreen']);
const IFRAME_OK = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|google\.com\/maps|maps\.google\.)/;

export function cleanContent(html, selfPath, link) {
  const $ = cheerio.load(`<div id="__root">${html || ''}</div>`);
  const $root = $('#__root');
  $root.find('script,style,noscript,ins,link,meta,object,embed,.adsbygoogle,.sns-btn,.sns-btn__title,.screen-reader-response,#toc_container,.wpcf7-response-output').remove();
  $root.find('iframe').each((_, el) => { const src = $(el).attr('src') || $(el).attr('data-src') || ''; if (!IFRAME_OK.test(src)) $(el).remove(); else { $(el).attr('src', src); $(el).attr('loading', 'lazy'); } });
  $root.find('*').each((_, el) => {
    const $el = $(el);
    if (el.tagName === 'img') {
      const ds = $el.attr('data-src') || $el.attr('data-lazy-src');
      if (ds) $el.attr('src', ds);
    }
    for (const name of Object.keys(el.attribs || {})) if (!KEEP_ATTR.has(name) && !(el.tagName === 'iframe' && name === 'loading')) $el.removeAttr(name);
    const cls = $el.attr('class');
    if (cls) {
      const kept = cls.split(/\s+/)
        .map((c) => (/^marker-animation-\d+$/.test(c) ? 'mk' : c))
        .filter((c) => c && !/^(wp-image-\d+|size-\w+|attachment-[\w-]+|dfont|wp-post-image)$/.test(c));
      if (kept.length) $el.attr('class', kept.join(' ')); else $el.removeAttr('class');
    }
    if (el.tagName === 'img') {
      const src = $el.attr('src');
      if (!src) { $el.remove(); return; }
      $el.attr('src', new URL(src, ORIGIN).href);
      if ($el.attr('alt') == null) $el.attr('alt', '');
      $el.attr('loading', 'lazy');
      $el.attr('decoding', 'async');
    }
  });
  $root.find('a').each((_, el) => {
    const $el = $(el);
    const h = link($el.attr('href'), selfPath);
    if (h == null) { $el.replaceWith($el.contents()); return; }
    $el.attr('href', h);
    if (/^https?:/.test(h)) { $el.attr('rel', 'noopener noreferrer nofollow'); $el.attr('target', '_blank'); }
  });
  $root.find('p').each((_, el) => {
    const $el = $(el);
    if (!$el.text().trim() && !$el.find('img,a,input,textarea,select,iframe').length) $el.remove();
  });
  $root.find('table').each((_, el) => {
    const $el = $(el);
    if (!$el.parent().is('.scroll,.yoko-scroll,.tbl')) $el.wrap('<div class="tbl" tabindex="0" role="region" aria-label="表（横にスクロールできます）"></div>');
    else $el.parent().attr({ tabindex: '0', role: 'region', 'aria-label': '表（横にスクロールできます）' });
  });
  // 画像だけの段落が続く所を、横スワイプできるギャラリーにまとめる
  const imgOnly = (el) => {
    const $el = $(el);
    if (!['p', 'figure', 'div'].includes(el.tagName) || $el.is('.say,.sng-box,.memo,.tbl,.c_linkto_long')) return false;
    return $el.find('img').length > 0 && !$el.find('a').length && !$el.text().trim();
  };
  const kids = $root.children().toArray();
  for (let i = 0; i < kids.length;) {
    let j = i;
    while (j < kids.length && imgOnly(kids[j])) j++;
    const run = kids.slice(i, j);
    const imgs = run.flatMap((k) => $(k).find('img').toArray());
    if (imgs.length >= 2) {
      const $g = $('<div class="gallery" data-gallery></div>');
      for (const im of imgs) $g.append($('<figure class="gallery__item"></figure>').append($(im).clone()));
      $(run[0]).before($g);
      run.forEach((k) => $(k).remove());
    }
    i = Math.max(j, i + 1);
  }
  // 本文中の h1 は h2 に落とす（ページの h1 は記事タイトル 1 つだけにする）
  $root.find('h1').each((_, el) => { el.tagName = 'h2'; });
  // 目次（h2 と h3）。見出しに id を付ける
  const toc = [];
  $root.find('h2, h3').each((i, el) => {
    const $el = $(el);
    const t = $el.text().trim();
    if (!t) return;
    const id = `s${i + 1}`;
    $el.attr('id', id);
    if (el.tagName === 'h2') toc.push({ id, t, subs: [] }); else if (toc.length) toc.at(-1).subs.push({ id, t });
  });
  return { $, $root, toc };
}
