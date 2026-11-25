// 本番 WordPress（REST API）から記事・カテゴリ・固定ページを取得し、サイト用のデータに整える。
// 架空のデータは作らない。取得できなかったものは「無い」として扱う。
import * as cheerio from 'cheerio';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ORIGIN = 'https://globalnightguide.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 表示しない固定ページ（会員機能など、静的サイトでは使えないもの）
const SKIP_PAGES = new Set(['member-directory', 'my-profile', 'account', 'reset-password', 'sign-up', 'log-in']);

export const COUNTRY = { タイ: 'TH', 韓国: 'KR', 台湾: 'TW', ベトナム: 'VN', フィリピン: 'PH', カンボジア: 'KH', インドネシア: 'ID', シンガポール: 'SG', マレーシア: 'MY', ドイツ: 'DE', ミャンマー: 'MM', モンゴル: 'MN', ラオス: 'LA', ウズベキスタン: 'UZ' };
export const JAPAN = ['国内風俗', 'ソープランド', '高級デリヘル', '激安デリヘル', 'キャバクラ'];

async function get(path, { json = true, withHeaders = false } = {}) {
  if (process.env.GNG_FIXTURES) {
    // 確認用：<dir>/categories.json / pages.json / posts.json / home.html を読む
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

export const text = (html) => cheerio.load(`<div>${html || ''}</div>`)('div').text().replace(/\s+/g, ' ').trim();
export const pathOf = (link) => { try { return decodeURIComponent(new URL(link, ORIGIN).pathname); } catch { return null; } };

// 日本語の読書速度を 1 分 500 文字として、本文の文字数から読了時間を出す
// 表（料金表・店舗データ）は通読しないので数えない
export function readingMinutes(html) {
  const $ = cheerio.load(`<div>${html || ''}</div>`);
  $('table, script, style').remove();
  const n = $('div').first().text().replace(/\s/g, '').length;
  return Math.max(1, Math.round(n / 500));
}

export async function loadSite() {
  const [cats, pages, posts] = await Promise.all([
    getAll('/wp-json/wp/v2/categories?_fields=id,name,slug,count,parent,link,description'),
    getAll('/wp-json/wp/v2/pages?_fields=id,slug,link,title,content,date,modified'),
    getAll('/wp-json/wp/v2/posts?_embed=wp:featuredmedia,author&_fields=id,link,title,excerpt,content,date,modified,categories,_links,_embedded'),
  ]);

  const catById = new Map();
  for (const c of cats) catById.set(c.id, { id: c.id, name: c.name, count: c.count, parent: c.parent, description: text(c.description), path: pathOf(c.link), posts: [], children: [] });
  for (const c of catById.values()) if (c.parent && catById.has(c.parent)) catById.get(c.parent).children.push(c);

  const P = posts.map((p) => {
    const fm = p._embedded?.['wp:featuredmedia']?.[0];
    const sizes = fm?.media_details?.sizes || {};
    const pick = (...names) => names.map((n) => sizes[n]?.source_url).find(Boolean) || fm?.source_url || '';
    const cs = (p.categories || []).map((id) => catById.get(id)).filter(Boolean);
    const main = cs.filter((c) => c.name !== '未分類').sort((a, b) => a.count - b.count)[0] || cs[0] || null;
    const au = p._embedded?.author?.[0];
    return {
      id: p.id,
      path: pathOf(p.link),
      title: text(p.title.rendered),
      excerpt: text(p.excerpt.rendered).replace(/\s*(…|\[…\]|&hellip;)\s*$/, '…'),
      content: p.content.rendered,
      date: p.date,
      modified: p.modified,
      thumb: pick('thumb-520', 'medium_large', 'medium'),
      hero: pick('thumb-940', 'large', 'medium_large', 'full'),
      heroW: sizes['thumb-940']?.width || fm?.media_details?.width || 940,
      heroH: sizes['thumb-940']?.height || fm?.media_details?.height || 541,
      alt: fm?.alt_text || '',
      cats: cs,
      cat: main,
      readMin: readingMinutes(p.content.rendered),
      author: au && au.name && !/^admin(istrator)?$/i.test(au.name) ? { name: au.name, description: text(au.description || ''), avatar: au.avatar_urls?.['96'] || '' } : null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  // カテゴリの記事一覧（子カテゴリの記事も親に含める）
  for (const p of P) {
    const seen = new Set();
    for (let c of p.cats) {
      while (c && !seen.has(c.id)) { seen.add(c.id); c.posts.push(p); c = catById.get(c.parent); }
    }
    p.catIds = [...seen];
  }

  const Pages = pages.filter((p) => !SKIP_PAGES.has(p.slug)).map((p) => ({ id: p.id, slug: p.slug, path: pathOf(p.link), title: text(p.title.rendered), content: p.content.rendered, date: p.date, modified: p.modified }));

  // 人気記事：本番トップのランキングウィジェットの順番を使う（取得できなければ空）
  let popular = [];
  try {
    const $ = cheerio.load(await get('/', { json: false }));
    const byPath = new Map(P.map((p) => [p.path, p]));
    $('.my_popular_posts li a').each((_, a) => { const p = byPath.get(pathOf($(a).attr('href'))); if (p && !popular.includes(p)) popular.push(p); });
  } catch (e) { console.warn('ranking:', e.message); }

  const live = [...catById.values()].filter((c) => c.posts.length && c.name !== '未分類');
  const byName = (n) => live.find((c) => c.name === n);
  const japan = JAPAN.map(byName).filter(Boolean);
  const world = live.filter((c) => COUNTRY[c.name.replace(/風俗$/, '')]).sort((a, b) => b.posts.length - a.posts.length);
  const worldAll = byName('海外風俗');
  const used = new Set([...japan, ...world, worldAll]);
  const themes = live.filter((c) => !used.has(c));

  return {
    cats: [...catById.values()],
    catById,
    posts: P,
    pages: Pages,
    popular: popular.slice(0, 10),
    groups: { japan, world, worldAll, themes },
    updated: P.reduce((m, p) => (p.modified > m ? p.modified : m), ''),
  };
}
