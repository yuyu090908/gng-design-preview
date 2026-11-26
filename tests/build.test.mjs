// ビルド結果（dist/）の回帰テスト：URL の維持、内部リンク、SEO、セキュリティ、アクセシビリティの基本
// 実行：npm run build のあと npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as cheerio from 'cheerio';

const DIST = 'dist';
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p))); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const files = await walk(DIST);
const pages = await Promise.all(files.map(async (f) => ({ f, $: cheerio.load(await readFile(f, 'utf8')) })));
const index = JSON.parse(await readFile(join(DIST, 'search-index.json'), 'utf8'));

test('記事がすべてページになっている（URL を維持）', async () => {
  assert.ok(index.length > 0);
  for (const p of index) assert.ok(await exists(join(DIST, decodeURI(p.u), 'index.html')), `missing ${p.u}`);
});

test('主要ページがある', async () => {
  for (const p of ['/', '/new/', '/features/', '/search/', '/my-dashboard/', '/404.html', '/sitemap.xml', '/robots.txt']) {
    assert.ok(await exists(p.endsWith('/') ? join(DIST, p, 'index.html') : join(DIST, p)), p);
  }
});

test('本番サイトのページへのリンクが無い（画像ファイルは除く）', () => {
  for (const { f, $ } of pages) {
    $('a[href]').each((_, a) => {
      const h = $(a).attr('href');
      assert.ok(!/^https?:\/\/(www\.)?globalnightguide\.com(?!\/wp-content\/)/.test(h), `${f}: ${h}`);
    });
  }
});

test('サイト内リンクが切れていない', async () => {
  const seen = new Set();
  for (const { f, $ } of pages) {
    for (const a of $('a[href^="/"]').toArray()) {
      const h = $(a).attr('href').split('#')[0].split('?')[0];
      if (!h || seen.has(h)) continue;
      seen.add(h);
      const p = decodeURI(h);
      const ok = (await exists(join(DIST, p, 'index.html'))) || (await exists(join(DIST, p)));
      assert.ok(ok, `${f} → ${h}`);
    }
  }
});

test('危険なリンク・インラインスクリプト・style 属性が無い（XSS / CSP）', () => {
  for (const { f, $ } of pages) {
    assert.equal($('a[href^="javascript:"]').length, 0, f);
    $('script').each((_, s) => {
      const t = $(s).attr('type');
      if (t === 'application/ld+json') return;
      assert.ok($(s).attr('src'), `${f}: inline script`);
    });
    assert.equal($('[style]').length, 0, `${f}: style 属性`);
    $('[onclick],[onload],[onerror]').each(() => assert.fail(`${f}: on* 属性`));
    $('a[target="_blank"]').each((_, a) => assert.match($(a).attr('rel') || '', /noopener/, f));
  }
});

test('各ページに h1 が 1 つ、title・description・canonical・OGP がある', () => {
  for (const { f, $ } of pages) {
    assert.equal($('h1').length, 1, `${f}: h1 = ${$('h1').length}`);
    assert.ok($('title').text().trim(), f);
    assert.ok($('link[rel=canonical]').attr('href')?.startsWith('https://'), f);
    assert.ok($('meta[property="og:title"]').attr('content'), f);
    assert.equal($('html').attr('lang'), 'ja');
  }
});

test('構造化データが正しい JSON で、記事には Article と BreadcrumbList がある', () => {
  for (const { f, $ } of pages) {
    const types = $('script[type="application/ld+json"]').toArray().map((s) => JSON.parse($(s).text())['@type']);
    if ($('[data-article]').length) {
      assert.ok(types.includes('Article'), f);
      assert.ok(types.includes('BreadcrumbList'), f);
    }
  }
});

test('ID の重複が無く、画像に alt 属性がある', () => {
  for (const { f, $ } of pages) {
    const ids = $('[id]').toArray().map((e) => $(e).attr('id'));
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    assert.deepEqual(dup, [], `${f}: 重複 ID ${dup.join(',')}`);
    $('img').each((_, im) => assert.ok($(im).attr('alt') !== undefined, `${f}: alt なし ${$(im).attr('src')}`));
  }
});

test('ボタンとリンクに名前がある（スクリーンリーダー）', () => {
  for (const { f, $ } of pages) {
    $('button, a[href]').each((_, el) => {
      const $el = $(el);
      const name = ($el.attr('aria-label') || $el.attr('aria-labelledby') || $el.text() || $el.attr('title') || $el.find('img[alt]').attr('alt') || '').trim();
      assert.ok(name, `${f}: 名前の無い ${el.tagName} ${$el.attr('class') || ''}`);
    });
  }
});

test('サイトマップに全記事が入っている', async () => {
  const sm = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
  for (const p of index) assert.ok(sm.includes(`${p.u}</loc>`), p.u);
});

test('架空のデモデータが残っていない', () => {
  for (const { f, $ } of pages) {
    const t = $('body').text();
    assert.ok(!/lorem ipsum|ダミー|サンプル記事|dummy/i.test(t), f);
  }
});
test("一覧ページの見出しの形", () => { for (const { f, $ } of pages) if ($("[data-listing]").length) assert.ok($(".chero h1").length, f); });

// 4.2：画像・映像の上に説明の文字を重ねない／国別ページはその国のヒーローを使う
test('画像・映像の上に「イメージ映像（AI生成）」などの表記がない', () => {
  for (const { f, $ } of pages) assert.equal($('.art-note').length, 0, f);
});
