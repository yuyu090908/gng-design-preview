// GLOBAL NIGHT COMMUNITY の画面テスト（Playwright + 本物の PostgreSQL）
// 実行：npm run test:community（コミュニティを有効にしたビルドを dist-community/ に作ってから実行する）
// 前提：PostgreSQL に接続できること（PGHOST / PGPORT / PGUSER）。テスト用の DB を毎回作り直す。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { startStandin } from './support/supabase-standin.mjs';

const DIST = process.env.GNG_OUT || 'dist-community';
const DB = 'gn_community_e2e';
const SHOTS = process.env.SHOTS || '';
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
let server, browser, base, api;
const index = JSON.parse(await readFile(join(DIST, 'search-index.json'), 'utf8'));
const article = index[0];

before(async () => {
  const psql = (...a) => execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', ...a], { stdio: ['ignore', 'ignore', 'inherit'] });
  psql('-d', 'postgres', '-c', `drop database if exists ${DB}`, '-c', `create database ${DB}`);
  psql('-d', DB, '-f', 'supabase/tests/00_supabase_stub.sql');
  for (const f of execFileSync('ls', ['supabase/migrations']).toString().trim().split('\n')) psql('-d', DB, '-f', `supabase/migrations/${f}`);
  api = await startStandin({ port: 54400, database: DB });
  server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(DIST, p);
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); await stat(f); } catch { res.statusCode = 404; f = join(DIST, '404.html'); }
    res.setHeader('content-type', TYPES[extname(f)] || 'text/html; charset=utf-8');
    res.end(await readFile(f));
  }).listen(0);
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
});
after(async () => { await browser?.close(); server?.close(); await api?.close(); });

async function open(path, { width = 1440, height = 900, ctx = null } = {}) {
  ctx ||= await browser.newContext({ viewport: { width, height }, hasTouch: width < 768, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => localStorage.setItem('gng:age', '1'));
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(base + path);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: false }); };
const users = {};
async function signup(name, { width = 1440 } = {}) {
  const email = `${name}@example.test`;
  const { ctx, page, errors } = await open('/community/login/?mode=signup', { width });
  await page.fill('[name=email]', email);
  await page.fill('[name=password]', 'correct-horse-battery');
  await page.check('[name=age]'); await page.check('[name=rules]');
  await page.click('[data-auth-submit]');
  await page.waitForURL(/\/community\/me\/#settings/);
  await page.waitForSelector('[data-profile-form] [name=handle]');
  await page.fill('[name=display_name]', name.toUpperCase());
  await page.fill('[name=handle]', `${name}_tester`);
  await page.click('[data-profile-form] [type=submit]');
  await page.waitForFunction(() => document.querySelector('.prof__h')?.textContent.includes('_tester'));
  const { rows } = await api.sql('select id, age_confirmed_at from user_profiles where handle = $1', [`${name}_tester`]);
  users[name] = { id: rows[0].id, ctx, page, errors };
  return { ...users[name], age: rows[0].age_confirmed_at };
}

test('未ログイン：コミュニティを開ける（投稿が無いことを正直に表示）', async () => {
  const { ctx, page, errors } = await open('/community/');
  await page.waitForSelector('[data-feed][aria-busy="false"]');
  assert.match(await page.textContent('[data-feed-list]'), /まだ投稿がありません/);
  assert.ok(await page.isVisible('.fab'));
  assert.ok(await page.isVisible('#sidebar a[href="/community/"]'));
  assert.equal(await page.isVisible('[data-com-offline]'), false);
  await shot(page, 'community-empty-pc');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('登録：18歳以上の確認つきで登録し、ニックネームを設定できる', async () => {
  const a = await signup('alice');
  assert.ok(a.age, '年齢確認が記録される');
  const b = await signup('bob');
  assert.ok(b.age);
  assert.deepEqual(a.errors, []);
});

let postId;
test('店舗の感想：記事を対象に評価つきで投稿し、記事ページに反映される', async () => {
  const { page, errors } = users.alice;
  await page.goto(`${base}/community/new/?type=review&article=${encodeURIComponent(article.u)}`);
  await page.waitForSelector('[data-target-chosen]:not([hidden])');
  // 店舗の種類で評価項目が変わる
  await page.selectOption('[data-venue-cat]', 'bar');
  assert.ok(await page.isVisible('[data-aspect="drinks"]'));
  await page.selectOption('[data-venue-cat]', 'delivery');
  assert.equal(await page.isVisible('[data-aspect="drinks"]'), false);
  // 総合評価なしでは送れない
  await page.fill('[name=body]', '受付の説明が丁寧で、料金表が最初に提示されたので安心して利用できました。また利用したいです。');
  await page.check('[name=agree]');
  await page.click('[data-submit]');
  assert.match(await page.textContent('[data-form-error]'), /総合評価/);
  await page.click('[data-aspect="overall"] .stars__s:nth-child(4)');
  await page.click('[data-aspect="service"] .stars__s:nth-child(5)');
  await page.fill('[name=spend_amount]', '18000');
  await page.click('[data-preview]');
  assert.match(await page.textContent('[data-preview-body]'), /料金表/);
  await shot(page, 'composer-preview-pc');
  await page.click('[data-preview-close]');
  await shot(page, 'composer-review-pc');
  await page.click('[data-submit]');
  await page.waitForURL(/\/community\/post\/\?id=/);
  postId = new URL(page.url()).searchParams.get('id');
  await page.waitForSelector('.pc--detail');
  assert.match(await page.textContent('.pc--detail'), /訪問未確認/);
  const r = await api.sql('select aspect, score from review_ratings where post_id = $1 order by aspect', [postId]);
  assert.deepEqual(r.rows.map((x) => `${x.aspect}:${x.score}`), ['overall:4', 'service:5']);
  await page.goto(base + article.u);
  await page.locator('[data-article-reviews]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.arev__score b');
  assert.equal((await page.textContent('.arev__score b')).trim(), '4.0');
  await page.waitForSelector('[data-arev-list] .pc');
  assert.match(await page.textContent('[data-arev-list]'), /料金表/);
  await shot(page, 'article-reviews-pc');
  assert.deepEqual(errors, []);
});

test('口コミの無い記事は「まだ口コミがありません」と表示し、評価を作らない', async () => {
  const { ctx, page } = await open(index[1].u);
  await page.locator('[data-article-reviews]').scrollIntoViewIfNeeded();
  await page.waitForSelector('.arev__empty');
  assert.equal(await page.locator('.arev__score').count(), 0);
  await ctx.close();
});

test('XSS：本文の HTML はそのまま文字として表示される', async () => {
  const { page } = users.alice;
  await page.goto(`${base}/community/new/?type=talk`);
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  await page.fill('[name=body]', '<img src=x onerror="window.__x=1"><script>window.__x=2</script> テスト');
  await page.check('[name=agree]');
  await page.click('[data-submit]');
  await page.waitForSelector('.pc--detail');
  assert.equal(await page.evaluate(() => window.__x), undefined);
  assert.match(await page.textContent('.pc--detail .pc__body'), /<img src=x/);
});

test('別のユーザー：参考になった・コメント・通報ができ、他人の投稿は編集できない', async () => {
  const { page, errors } = users.bob;
  await page.goto(`${base}/community/post/?id=${postId}`);
  await page.waitForSelector('[data-helpful]');
  await page.click('[data-helpful]');
  await page.waitForFunction(() => document.querySelector('[data-helpful-n]').textContent === '1');
  await page.fill('#cmt-body', '参考になりました。予約は必要でしたか？');
  await page.click('[data-comment-form] [type=submit]');
  await page.waitForSelector('.cmt');
  await page.click('[data-report]');
  await page.check('[name=reason][value=fake_review]');
  await page.click('[data-com-report-form] [type=submit]');
  await page.waitForSelector('#com-report[hidden]', { state: 'attached' });
  // 二重通報はできない
  await page.click('[data-report]');
  await page.click('[data-com-report-form] [type=submit]');
  await page.waitForSelector('#com-report [data-form-error]:not([hidden])');
  assert.match(await page.textContent('#com-report [data-form-error]'), /すでに通報済み/);
  await page.keyboard.press('Escape');
  // URL を書き換えて他人の投稿を編集しようとしても開けない
  await page.goto(`${base}/community/new/?edit=${postId}`);
  await page.waitForSelector('.clay__main > .state');
  assert.match(await page.textContent('.clay__main'), /編集できる投稿が見つかりません/);
  assert.equal(await page.isVisible('[data-composer]'), false);
  const { rows } = await api.sql('select helpful_count, comment_count from community_posts where id = $1', [postId]);
  assert.deepEqual(rows[0], { helpful_count: 1, comment_count: 1 });
  assert.deepEqual(errors, []);
});

test('一般ユーザーは管理画面を開けない', async () => {
  const { page } = users.bob;
  await page.goto(`${base}/admin/community/`);
  await page.waitForSelector('[data-admin-denied]:not([hidden])');
  assert.equal(await page.isVisible('[data-admin]'), false);
});

test('管理画面：通報を確認して投稿を非表示にすると、一般の一覧から消え、監査ログに残る', async () => {
  await api.sql("insert into user_roles (user_id, role) values ($1, 'admin')", [users.alice.id]);
  const { page, errors } = users.alice;
  await page.goto(`${base}/admin/community/`);
  await page.waitForSelector('[data-adm-kpis] dd');
  assert.match(await page.textContent('[data-adm-kpis]'), /登録ユーザー2/);
  await shot(page, 'admin-dashboard-pc');
  await page.click('[data-adm-tab="reports"]');
  await page.waitForSelector('[data-adm-list="reports"] .arow');
  await page.fill('[data-adm-list="reports"] [data-note]', 'やらせの疑いを確認');
  await page.click('[data-adm-list="reports"] [data-a="hide-post"]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('更新しました'));
  await page.click('[data-adm-tab="audit"]');
  await page.waitForSelector('[data-adm-list="audit"] .arow');
  assert.match(await page.textContent('[data-adm-list="audit"]'), /post\.status[\s\S]*やらせの疑い/);
  const anon = await open('/community/');
  await anon.page.waitForSelector('[data-feed][aria-busy="false"]');
  assert.equal(await anon.page.locator(`[data-post="${postId}"]`).count(), 0);
  await anon.ctx.close();
  assert.deepEqual(errors, []);
});

test('画像つきの投稿：位置情報を消して本人のフォルダにアップロードされる', async () => {
  const { page } = users.bob;
  await page.goto(`${base}/community/new/?type=recommend`);
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  const png = Buffer.from((await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#334'; g.fillRect(0, 0, 640, 480); return c.toDataURL('image/png'); })).split(',')[1], 'base64');
  await page.setInputFiles('[data-file]', { name: 'photo.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('.up__list li:not(.is-busy) img') || document.querySelector('.toast.is-on'));
  assert.equal(await page.locator('.toast.is-on').count() && await page.textContent('.toast'), 0);
  await page.fill('[name=body]', 'スクンビットで落ち着いて飲めるバーを探している人におすすめです。');
  await page.check('[name=agree]');
  await page.click('[data-submit]');
  await page.waitForSelector('.pc--detail .pc__media img');
  const { rows } = await api.sql('select m.path from post_media m join community_posts p on p.id = m.post_id where p.author_id = $1', [users.bob.id]);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].path.startsWith(users.bob.id + '/'));
  assert.match(rows[0].path, /\.(webp|jpg)$/);
});

test('下書き：入力内容が端末に自動保存され、次に開いたときに復元される', async () => {
  const { page } = users.bob;
  await page.goto(`${base}/community/new/?type=question`);
  await page.waitForSelector('[data-step="2"]:not([hidden])');
  await page.fill('[name=body]', 'ソウルで初心者でも入りやすいバーはありますか？');
  await page.waitForFunction(() => document.querySelector('[data-autosave]').textContent.includes('自動保存'));
  await page.goto(`${base}/community/new/`);
  await page.waitForFunction(() => document.querySelector('[name=body]').value.includes('ソウル'));
  assert.match(await page.textContent('[data-autosave]'), /復元/);
});

test('フィード：タブと地域の絞り込みが動き、選んだ条件を次回も使う', async () => {
  const { ctx, page, errors } = await open('/community/');
  await page.waitForSelector('[data-feed-list] .pc:not(.pc--sk)');
  const n = await page.locator('[data-feed-list] .pc:not(.pc--sk)').count();
  assert.ok(n >= 1, `${n}`);
  await page.click('[data-tab="question"]');
  await page.waitForSelector('[data-feed][aria-busy="false"]');
  assert.match(await page.textContent('[data-feed-list]'), /まだ投稿がありません|この条件の投稿はまだありません/);
  await page.click('[data-tab="latest"]');
  await page.click('.cf__sum');
  await page.selectOption('[data-region="feed"] [data-region-country]', 'TH');
  await page.waitForSelector('[data-feed][aria-busy="false"]');
  assert.match(await page.textContent('[data-filter-summary]'), /タイ/);
  await page.reload();
  await page.waitForSelector('[data-feed][aria-busy="false"]');
  assert.match(await page.textContent('[data-filter-summary]'), /タイ/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('スマホ：横にはみ出さず、下部ナビにコミュニティがある', async () => {
  for (const path of ['/community/', `/community/post/?id=${postId}`, '/community/new/', '/community/login/', '/community/rules/', article.u]) {
    const { ctx, page, errors } = await open(path, { width: 390, height: 844 });
    await page.waitForTimeout(400);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, `${path}: ${sw}`);
    assert.ok(await page.isVisible('.bn a[href="/community/"]'));
    if (path === '/community/') { await page.waitForSelector('[data-feed-list] .pc:not(.pc--sk)'); await shot(page, 'community-feed-mobile'); }
    if (path === '/community/login/') await shot(page, 'login-mobile');
    assert.deepEqual(errors, [], path);
    await ctx.close();
  }
});

test('スクリーンショット（PC）', { skip: !SHOTS }, async () => {
  const { ctx, page } = await open('/community/');
  await page.waitForSelector('[data-feed-list] .pc:not(.pc--sk)');
  await shot(page, 'community-feed-pc');
  await page.goto(`${base}/community/u/?h=bob_tester`);
  await page.waitForSelector('.prof__n');
  await shot(page, 'profile-pc');
  await ctx.close();
  const m = await open('/', { width: 390, height: 844 });
  await m.page.locator('[data-home-community]').scrollIntoViewIfNeeded();
  await m.page.waitForSelector('[data-home-com-list] .pc:not(.pc--sk)');
  await m.page.screenshot({ path: join(SHOTS, 'home-digest-mobile.png') });
  await m.ctx.close();
});
