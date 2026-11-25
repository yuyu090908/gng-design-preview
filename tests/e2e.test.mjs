// 画面の回帰テスト（Playwright）：ナビゲーション、スワイプ、保存、履歴、設定、レスポンシブ
// 実行：npm run build のあと npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
let server, browser, base;
const index = JSON.parse(await readFile(join(DIST, 'search-index.json'), 'utf8'));
const post = index[0].u;
const cat = await (async () => { const h = await readFile(join(DIST, 'index.html'), 'utf8'); return h.match(/href="(\/category\/[^"]+\/)"/)[1]; })();

before(async () => {
  server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(DIST, p);
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); await stat(f); } catch { res.statusCode = 404; f = join(DIST, '404.html'); }
    res.setHeader('content-type', TYPES[extname(f)] || 'text/html; charset=utf-8');
    res.end(await readFile(f));
  }).listen(0);
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(path, { width = 1440, height = 900, age = true, storage = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 768 });
  await ctx.addInitScript(([a, s]) => { if (a) localStorage.setItem('gng:age', '1'); if (s) localStorage.setItem('gng:v1', s); }, [age, storage]);
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + path);
  return { ctx, page, errors };
}

test('年齢確認：初回に表示され、確認後は表示されない', async () => {
  const { ctx, page } = await open('/', { age: false });
  await page.waitForSelector('#age-gate:not([hidden])');
  await page.click('[data-age-ok]');
  assert.equal(await page.isHidden('#age-gate'), true);
  await page.reload();
  assert.equal(await page.isHidden('#age-gate'), true);
  await ctx.close();
});

test('横方向にはみ出さない（参考画像の確認サイズ × 主要ページ）', async () => {
  for (const [width, height] of [[320, 640], [375, 667], [390, 844], [393, 852], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    for (const path of ['/', cat, post, '/search/?q=a', '/my-dashboard/', '/features/', '/new/', '/area/', '/ranking/', '/guide/', '/faq/']) {
      const { ctx, page, errors } = await open(path, { width, height });
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= width, `${path} @${width}: scrollWidth ${sw}`);
      assert.deepEqual(errors, [], `${path} @${width}: ${errors.join(' | ')}`);
      await ctx.close();
    }
  }
});

test('スマホ：下部ナビとドロワー（フォーカストラップ・Escape・背景スクロール停止）', async () => {
  const { ctx, page } = await open('/', { width: 375, height: 812 });
  assert.ok(await page.isVisible('.bn'));
  assert.ok(await page.isHidden('#sidebar'));
  const hero = await page.$eval('.hero__vis', (e) => e.getBoundingClientRect().height);
  assert.ok(hero >= 180 && hero <= 240, `hero ${hero}px`);
  await page.click('[data-drawer-open]');
  assert.ok(await page.isVisible('#drawer .drawer__panel'));
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-locked')), true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.querySelector('#drawer').contains(document.activeElement)), 'focus stays in drawer');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#drawer'));
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-locked')), false);
  // 背景タップでも閉じる
  await page.click('[data-drawer-open]');
  await page.mouse.click(370, 400);
  assert.ok(await page.isHidden('#drawer'));
  await ctx.close();
});

test('PC：サイドバーの開閉状態が保持される', async () => {
  const { ctx, page } = await open('/');
  assert.ok(await page.isVisible('#sidebar'));
  assert.ok(await page.isHidden('.bn'));
  await page.click('[data-sb-toggle]');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('sb-collapsed')), true);
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('sb-collapsed')), true);
  assert.equal(await page.getAttribute('[data-sb-toggle]', 'aria-expanded'), 'false');
  await ctx.close();
});

test('カテゴリのピル：今いるカテゴリが選択状態になる', async () => {
  const { ctx, page } = await open(cat);
  const cur = await page.$$eval('.gh .pill[aria-current="page"]', (els) => els.length);
  assert.ok(cur >= 1, 'current pill');
  assert.ok(await page.isVisible('.chero h1'));
  await ctx.close();
});

test('記事：集中閲覧モード（ボタンで切り替え、Esc で戻る）', async () => {
  const { ctx, page } = await open(post);
  await page.click('[data-focus]');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-focus')), true);
  assert.ok(await page.isHidden('#sidebar'));
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-focus')), false);
  await ctx.close();
});

test('カルーセル：次へボタンとキーボードで動く', async () => {
  const { ctx, page } = await open('/', { width: 1024 });
  const track = '#car-pick';
  const x0 = await page.$eval(track, (e) => e.scrollLeft);
  await page.click('[data-next][aria-controls="car-pick"]');
  await page.waitForTimeout(600);
  const x1 = await page.$eval(track, (e) => e.scrollLeft);
  assert.ok(x1 > x0, `scroll ${x0} → ${x1}`);
  await page.focus(track);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  assert.ok((await page.$eval(track, (e) => e.scrollLeft)) < x1);
  await ctx.close();
});

test('タブ：矢印キーで切り替わる', async () => {
  const { ctx, page } = await open('/my-dashboard/');
  await page.focus('#dash-t0');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getAttribute('#dash-t1', 'aria-selected'), 'true');
  assert.ok(await page.isVisible('#dash-p1'));
  assert.ok(await page.isHidden('#dash-p0'));
  await ctx.close();
});

test('保存：カードから保存 → バッジ → ダッシュボードで表示・フォルダ移動・削除', async () => {
  const { ctx, page } = await open('/', { width: 1280 });
  const btn = page.locator('.carousel [data-save]').first();
  const u = await btn.getAttribute('data-u');
  await btn.click();
  assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  assert.equal((await page.textContent('.sb [data-saved-count]')).trim(), '1');
  assert.equal(await page.locator('[data-saved-mini-list] li').count(), 1);
  assert.ok((await page.textContent('.toast')).includes('保存しました'));
  await page.goto(base + '/my-dashboard/#saved');
  await page.waitForSelector(`[data-saved-list] [data-u="${u}"]`);
  // フォルダを作って移動
  await page.click('[data-folder-new]');
  await page.fill('#folder-name', 'タイ旅行');
  await page.press('#folder-name', 'Enter');
  await page.click('[data-folder=""]');
  await page.selectOption(`[data-saved-list] [data-u="${u}"] [data-move]`, 'タイ旅行');
  await page.click('[data-folder="タイ旅行"]');
  assert.equal(await page.locator('[data-saved-list] .mrow').count(), 1);
  await page.click(`[data-saved-list] [data-u="${u}"] [data-del]`);
  assert.ok(await page.isVisible('[data-saved-list] .state'));
  await ctx.close();
});

test('閲覧履歴：初期はオフ。オンにすると記録され、個別・一括で削除できる', async () => {
  const { ctx, page } = await open(post);
  await page.goto(base + '/my-dashboard/#history');
  assert.equal(await page.getAttribute('#dash-p1 [data-setting="historyEnabled"]', 'aria-checked'), 'false');
  assert.equal(await page.locator('[data-history-list] .mrow').count(), 0);
  await page.click('#dash-p1 [data-setting="historyEnabled"]');
  await page.goto(base + post);
  await page.goto(base + index[1].u);
  await page.goto(base + '/my-dashboard/#history');
  assert.equal(await page.locator('[data-history-list] .mrow').count(), 2);
  await page.locator('[data-history-list] [data-del]').first().click();
  assert.equal(await page.locator('[data-history-list] .mrow').count(), 1);
  await page.click('[data-history-clear]');
  await page.click('[data-confirm-wrap] [data-yes]');
  assert.equal(await page.locator('[data-history-list] .mrow').count(), 0);
  await ctx.close();
});

test('設定：文字サイズ・すべて削除', async () => {
  const { ctx, page } = await open('/my-dashboard/#settings');
  await page.check('input[data-setting="fontSize"][value="l"]', { force: true });
  assert.equal(await page.getAttribute('html', 'data-fs'), 'l');
  await page.goto(base + post);
  assert.equal(await page.getAttribute('html', 'data-fs'), 'l');
  await page.click('[data-fontsize]');
  assert.equal(await page.getAttribute('html', 'data-fs'), 'xl');
  await page.goto(base + '/my-dashboard/#settings');
  await page.click('[data-wipe]');
  await page.click('[data-confirm-wrap] [data-yes]');
  assert.equal(await page.evaluate(() => localStorage.getItem('gng:v1') === null || JSON.parse(localStorage.getItem('gng:v1')).saved.length === 0), true);
  await ctx.close();
});

test('記事：目次・進捗バー・報告ダイアログ・画像拡大', async () => {
  const { ctx, page } = await open(post, { width: 1440 });
  if (await page.$('[data-toc]')) {
    await page.locator('[data-toc-link]').nth(1).click();
    await page.waitForTimeout(400);
    assert.ok(await page.$('[data-toc-link][aria-current]'));
  }
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(200);
  const tr = await page.$eval('.rp__bar', (e) => e.style.transform);
  assert.match(tr, /scaleX\(0\.[0-9]*[1-9]|scaleX\(1/);
  await page.locator('.rd__tools [data-report-open]').click();
  assert.ok(await page.isVisible('#report .modal__panel'));
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#report'));
  const zoom = page.locator('.entry img.zoomable').first();
  if (await zoom.count()) {
    await zoom.scrollIntoViewIfNeeded();
    await zoom.click();
    assert.ok(await page.isVisible('#lightbox'));
    await page.keyboard.press('Escape');
    assert.ok(await page.isHidden('#lightbox'));
  }
  await ctx.close();
});

test('カテゴリ：グリッド／リスト切り替えと並び替え', async () => {
  const { ctx, page } = await open(cat);
  await page.click('[data-view="list"]');
  assert.equal(await page.getAttribute('[data-listing]', 'data-view'), 'list');
  await page.selectOption('[data-sort]', 'old');
  await page.waitForSelector('[data-list-client] .ac');
  assert.ok(await page.isHidden('[data-list-server]'));
  assert.ok(page.url().includes('sort=old'));
  await page.selectOption('[data-sort]', 'new');
  assert.ok(await page.isVisible('[data-list-server]'));
  await ctx.close();
});

test('検索：キーワードで結果が出て、該当なしは空状態', async () => {
  const word = index[0].t.slice(0, 2);
  const { ctx, page } = await open('/search/?q=' + encodeURIComponent(word));
  await page.waitForSelector('[data-search-results] .ac');
  assert.ok((await page.textContent('#search-status')).includes('件'));
  await page.fill('#q', 'zzzzzzzzzz該当なし');
  await page.waitForSelector('[data-search-results] .state');
  await ctx.close();
});
