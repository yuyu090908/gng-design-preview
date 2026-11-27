// 画面の回帰テスト（Playwright）：ナビゲーション、スワイプ、保存、履歴、設定、レスポンシブ
// 実行：npm run build のあと npm run test:e2e
import { test as nodeTest, before, after } from 'node:test';
// E2E_ONLY=文字列 で、名前にその文字列を含むテストだけを実行する
const test = (name, ...a) => (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY) ? undefined : nodeTest(name, ...a));
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIST = 'dist';
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4' };
let server, browser, base;
const index = JSON.parse(await readFile(join(DIST, 'search-index.json'), 'utf8'));
const post = index[0].u;
const hasCv = (await readFile(join(DIST, 'index.html'), 'utf8')).includes('data-cv ');
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

async function open(path, { width = 1440, height = 900, age = true, storage = null, reducedMotion = 'no-preference', block = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 768, reducedMotion });
  if (block) await ctx.route(block, (r) => r.fulfill({ status: 404, body: '' }));
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
  for (const [width, height] of [[320, 640], [375, 667], [390, 844], [393, 852], [430, 932], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
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
  const hero = await page.$eval('.hero', (e) => e.getBoundingClientRect().height);
  assert.ok(hero >= 180 && hero <= 300, `hero ${hero}px`);
  assert.deepEqual(await page.$$eval('.bn a span:not(.badge)', (els) => els.map((e) => e.textContent)), ['ホーム', '新着', '探す', '保存', 'マイページ']);
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

test('サイドバー：今いるカテゴリのまとまりが開き、現在地が選択状態になる', async () => {
  const { ctx, page } = await open(cat);
  const cur = await page.$$eval('.sb .nv__s[aria-current="page"]', (els) => els.length);
  assert.ok(cur >= 1, 'current category');
  assert.equal(await page.$eval('.sb .nv__s[aria-current="page"]', (e) => e.closest('details').open), true);
  assert.equal(await page.$$eval('.gh .pill', (els) => els.length), 0, 'ヘッダーにカテゴリのピルを重複させない');
  assert.ok(await page.isVisible('.chero h1'));
  const h = await page.$eval('.chero', (e) => e.getBoundingClientRect().height);
  assert.ok(h >= 260 && h <= 380, `category hero ${h}px`); // 4.4：写真の主題が見える高さに広げた
  await ctx.close();
});

test('カテゴリのタブ：URL に反映され、戻る・進むで元に戻る', async () => {
  const { ctx, page } = await open(cat, { width: 1280 });
  await page.click('[data-tab="feature"]');
  await page.waitForSelector('[data-list-client] .ac, [data-list-client] .state');
  assert.ok(page.url().includes('tab=feature'));
  assert.equal(await page.getAttribute('[data-tab="feature"]', 'aria-selected'), 'true');
  assert.equal(await page.isHidden('[data-list-server]'), true);
  await page.click('[data-tab="updated"]');
  assert.ok(page.url().includes('tab=updated'));
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-tab="feature"]').getAttribute('aria-selected') === 'true');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('[data-tab="all"]').getAttribute('aria-selected') === 'true');
  assert.equal(await page.isVisible('[data-list-server]'), true);
  await ctx.close();
});

test('スマホ：並び替え・表示のボトムシート（背景タップで閉じる）', async () => {
  const { ctx, page } = await open(cat, { width: 390, height: 844 });
  await page.click('[data-list-sheet]');
  assert.ok(await page.isVisible('#sheet .bs__panel'));
  await page.click('#sheet label:has(input[name="bs-view"][value="list"])');
  assert.equal(await page.getAttribute('[data-listing]', 'data-view'), 'list');
  await page.mouse.click(195, 40);
  assert.ok(await page.isHidden('#sheet'));
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
  const track = '#car-area';
  const x0 = await page.$eval(track, (e) => e.scrollLeft);
  await page.click('[data-next][aria-controls="car-area"]');
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
  const btn = page.locator('[aria-labelledby="sec-new"] [data-save]').first();
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

test('マイページ：パネルの非表示・並び替え・設定からの再表示が保存される', async () => {
  const { ctx, page } = await open('/my-dashboard/', { width: 1280 });
  await page.waitForSelector('[data-panels] .dpanel');
  const titles = () => page.$$eval('[data-panels] .dpanel h2', (els) => els.map((e) => e.textContent));
  assert.deepEqual(await titles(), ['続きから読む', '最近保存した記事', 'コレクション']);
  await page.click('[data-panel-move="recent"][data-dir="-1"]');
  assert.deepEqual(await titles(), ['最近保存した記事', '続きから読む', 'コレクション']);
  await page.click('[data-panel-hide="continue"]');
  assert.deepEqual(await titles(), ['最近保存した記事', 'コレクション']);
  await page.reload();
  assert.deepEqual(await titles(), ['最近保存した記事', 'コレクション']);
  await page.goto(base + '/my-dashboard/#settings');
  await page.check('[data-panel-opt][value="continue"]', { force: true });
  assert.equal((await titles()).length, 3);
  // 閲覧履歴は初期オフ：パネルにもその旨を表示する
  assert.ok((await page.textContent('[data-panels]')).includes('閲覧履歴はオフ'));
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
  // 表示設定はボトムシート：Esc・×で閉じ、背景はスクロールしない
  await page.click('[data-read-settings]');
  assert.equal(await page.isVisible('#sheet .bs__panel'), true);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('is-locked')), true);
  await page.click('#sheet label:has(input[name="rs-fs"][value="xl"])');
  assert.equal(await page.getAttribute('html', 'data-fs'), 'xl');
  await page.click('#sheet label:has(input[name="rs-theme"][value="light"])');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#sheet'), true);
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
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


// ---------- 4.0：背景映像（CinematicVideoBackground と再生制御） ----------

test('背景映像：ポスターが先に出て、画面内の映像だけが読み込まれる（PC は最大 2 本）', { skip: !hasCv && '素材なしのビルド' }, async () => {
  const { ctx, page, errors } = await open('/', { width: 1280, height: 600 });
  assert.ok(await page.isVisible('.hero .cv__poster'));
  await page.waitForSelector('.hero .cv video.cv__video', { state: 'attached' });
  const v = await page.$eval('.hero .cv video', (el) => ({ muted: el.muted, loop: el.loop, inline: el.playsInline, src: el.getAttribute('src') }));
  assert.deepEqual([v.muted, v.loop, v.inline], [true, true, true]);
  assert.match(v.src, /home-tokyo-desktop\.[0-9a-f]+\.mp4$/);
  // 地球のパネルは画面外なので、まだ動画を作らない
  assert.equal(await page.$('.earth .cv video'), null);
  await page.locator('.earth').scrollIntoViewIfNeeded();
  await page.waitForSelector('.earth .cv video', { state: 'attached' });
  const playing = await page.$$eval('.cv video', (vs) => vs.filter((x) => !x.paused).length);
  assert.ok(playing <= 2, `playing ${playing}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('背景映像：スマホは小さい動画を使い、同時に 1 本まで', { skip: !hasCv && '素材なしのビルド' }, async () => {
  const { ctx, page } = await open('/area/', { width: 390, height: 844 });
  await page.locator('.earth').scrollIntoViewIfNeeded();
  await page.waitForSelector('.earth .cv video', { state: 'attached' });
  assert.match(await page.getAttribute('.earth .cv video', 'src'), /asia-earth-mobile\./);
  await page.waitForTimeout(300);
  const playing = await page.$$eval('.cv video', (vs) => vs.filter((x) => !x.paused).length);
  assert.ok(playing <= 1, `playing ${playing}`);
  await ctx.close();
});

test('背景映像：停止ボタンで止まり、設定が保存されて次のページでも静止画のまま', { skip: !hasCv && '素材なしのビルド' }, async () => {
  const { ctx, page } = await open('/');
  await page.waitForSelector('.hero .cv video', { state: 'attached' });
  await page.click('[data-cv-toggle]');
  assert.equal(await page.getAttribute('[data-cv-toggle]', 'aria-pressed'), 'true');
  assert.equal(await page.$eval('.hero .cv video', (v) => v.paused), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gng:v1')).settings.video), 'off');
  await page.goto(base + cat);
  await page.waitForTimeout(300);
  assert.equal(await page.$('.chero .cv video'), null);
  assert.ok(await page.isVisible('.chero .cv__poster'));
  // マイページの設定からも戻せる
  await page.goto(base + '/my-dashboard/#settings');
  await page.click('[data-setting="video"]');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gng:v1')).settings.video), 'auto');
  await ctx.close();
});

test('背景映像：「視差効果を減らす」設定では動画を読み込まず、停止ボタンも出さない', { skip: !hasCv && '素材なしのビルド' }, async () => {
  const { ctx, page } = await open('/', { reducedMotion: 'reduce' });
  await page.waitForTimeout(400);
  assert.equal(await page.$('.cv video'), null);
  assert.ok(await page.isVisible('.hero .cv__poster'));
  assert.ok(await page.isHidden('[data-cv-toggle]'));
  await ctx.close();
});

test('背景映像：動画が読み込めないときはポスター画像のまま（エラーを出さない）', { skip: !hasCv && '素材なしのビルド' }, async () => {
  const { ctx, page, errors } = await open('/', { block: /\.mp4$/ });
  await page.waitForSelector('.hero .cv.is-failed');
  assert.equal(await page.$('.hero .cv video'), null);
  assert.ok(await page.isVisible('.hero .cv__poster'));
  assert.deepEqual(errors, []);
  await ctx.close();
});
