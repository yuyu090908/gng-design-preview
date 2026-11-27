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

// ===================== Phase 2 =====================
const asUser = (id, q, params = []) => api.sql(`select set_config('request.jwt.claim.sub', $1, true) as _s, ${q}`, [id, ...params]);
let livePostId;

test('NIGHT LIVE：都市を選んで共有すると24時間の一覧に出る（現在地は送らない）', async () => {
  const { page, errors } = users.alice;
  const sent = [];
  page.on('request', (r) => { if (r.url().includes('/rpc/post_live')) sent.push(JSON.parse(r.postData() || '{}')); });
  await page.goto(`${base}/community/live/`);
  await page.waitForSelector('[data-live-feed][aria-busy="false"]');
  assert.match(await page.textContent('[data-live-list]'), /24時間以内のライブ投稿はまだありません/);
  await page.click('[data-live-compose] summary');
  const [{ id: city }] = (await api.sql("select id from cities where slug = 'bangkok'")).rows;
  await page.selectOption('[data-region="live"] [data-region-country]', 'TH');
  await page.selectOption('[data-region="live"] [data-region-city]', String(city));
  await page.click('[data-live-form] [name=crowd][value="4"] + span');
  await page.click('[data-live-form] [name=vibe][value="lively"] + span');
  await page.click('[data-live-form] [name=open_status][value="open"] + span');
  await page.fill('[data-live-form] [name=price_note]', '入場無料');
  // 本文が短いとエラー
  await page.fill('[data-live-form] [name=body]', 'ab');
  await page.click('[data-live-form] [type=submit]');
  await page.waitForSelector('[data-live-form] [data-form-error]:not([hidden])');
  await page.fill('[data-live-form] [name=body]', '22時ごろ。入口に少し列があり、店内は満席に近いです。');
  await page.click('[data-live-form] [type=submit]');
  await page.waitForSelector('[data-live-list] .pc:not(.pc--sk) .ptag--live');
  const card = await page.textContent('[data-live-list] .pc');
  assert.match(card, /NIGHT LIVE/); assert.match(card, /混んでいる/); assert.match(card, /賑やか/); assert.match(card, /入場無料/);
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0].p).filter((k) => /lat|lng|lon|geo|location|coords/i.test(k)), []);
  livePostId = await page.getAttribute('[data-live-list] .pc', 'data-post');
  const { rows } = await api.sql('select l.crowd, l.vibe, l.open_status, p.type from live_reports l join community_posts p on p.id = l.post_id where l.post_id = $1', [livePostId]);
  assert.deepEqual(rows[0], { crowd: 4, vibe: 'lively', open_status: 'open', type: 'live' });
  await shot(page, 'live-pc');
  // 25 時間前の投稿は一覧に出ない
  await api.sql("update community_posts set published_at = now() - interval '25 hours' where id = $1", [livePostId]);
  const anon = await open('/community/live/');
  await anon.page.waitForSelector('[data-live-feed][aria-busy="false"]');
  assert.equal(await anon.page.locator(`[data-post="${livePostId}"]`).count(), 0);
  await api.sql('update community_posts set published_at = now() where id = $1', [livePostId]);
  await anon.page.reload();
  await anon.page.waitForSelector(`[data-live-list] [data-post="${livePostId}"]`);
  await anon.ctx.close();
  assert.deepEqual(errors, []);
});

test('フォロー：プロフィールからフォローでき、「フォロー中」タブと通知に反映される', async () => {
  const { page, errors } = users.bob;
  await page.goto(`${base}/community/u/?h=alice_tester`);
  await page.waitForSelector('[data-follow]');
  assert.match(await page.textContent('.prof'), /フォロワー0/);
  await page.click('[data-follow]');
  await page.waitForSelector('[data-follow][aria-pressed="true"]');
  assert.match(await page.textContent('.prof'), /フォロワー1/);
  await page.goto(`${base}/community/`);
  await page.click('[data-tab="following"]');
  await page.waitForSelector(`[data-feed-list] [data-post="${livePostId}"]`);
  const { rows } = await api.sql('select follower_count from user_profiles where id = $1', [users.alice.id]);
  assert.equal(rows[0].follower_count, 1);
  assert.deepEqual(errors, []);
});

test('XP：作ったばかりのアカウントからの「参考になった」では XP が入らず、24時間以上たったアカウントからは入る', async () => {
  const { page, errors } = users.bob;
  // 画面は先に切り替わる（楽観的更新）ので、サーバーの応答を待ってから確かめる
  const toggle = async () => { const r = page.waitForResponse((x) => x.url().includes('/rpc/toggle_helpful')); await page.click('[data-helpful]'); await r; };
  const xp = async () => (await api.sql('select xp from user_experience where user_id = $1', [users.alice.id])).rows[0].xp;
  await page.goto(`${base}/community/post/?id=${livePostId}`);
  await page.waitForSelector('[data-helpful]');
  await toggle();
  assert.equal(await page.textContent('[data-helpful-n]'), '1');
  assert.equal(await xp(), 0);
  // bob のアカウントを 3 日前に作られたことにして、押し直す
  await api.sql("update user_profiles set created_at = now() - interval '3 days' where id = $1", [users.bob.id]);
  await toggle(); await toggle();
  assert.equal(await xp(), 5);
  await toggle(); await toggle();
  assert.equal(await xp(), 5, '付け外しで XP が増えない');
  // カードにランクが出る
  assert.match(await page.textContent('.pc .rk'), /Rookie/);
  assert.deepEqual(errors, []);
});

test('NIGHT PASSPORT：ランク・XP・バッジ・TRUST SCORE（データ不足）・XP の履歴', async () => {
  const { page, errors } = users.alice;
  await page.goto(`${base}/community/passport/`);
  await page.waitForSelector('.pp__rank');
  assert.equal(await page.textContent('.pp__rank'), 'Rookie');
  assert.match(await page.textContent('.pp__xp'), /5\s*XP/);
  assert.match(await page.textContent('.pp__next'), /Night Explorer まであと 495 XP/);
  assert.equal(await page.locator('.bdg__i').count(), 8);
  assert.ok(await page.locator('.bdg__i.is-on').count() >= 1, 'First Review を獲得している');
  assert.match(await page.textContent('[data-pp-trust]'), /データ不足/);
  assert.match(await page.textContent('[data-pp-ledger]'), /「参考になった」を受けた[\s\S]*\+5 XP/);
  assert.match(await page.textContent('[data-pp-cities]'), /バンコク/);
  await shot(page, 'passport-pc');
  assert.deepEqual(errors, []);
});

test('通知センター：フォロー・参考になったが届き、既読にでき、種類ごとに止められる', async () => {
  const { page, errors } = users.alice;
  await page.goto(`${base}/community/notifications/`);
  await page.waitForSelector('[data-n-list] .nl');
  const text = await page.textContent('[data-n-list]');
  assert.match(text, /BOB さんがあなたをフォローしました/);
  assert.match(text, /BOB さんが「参考になった」を押しました/);
  assert.doesNotMatch(text, /ほか/, '同じ人の押し直しを人数に数えない');
  await page.waitForSelector('#sidebar [data-notif-count]:not([hidden])');
  await shot(page, 'notifications-pc');
  await page.click('[data-n-readall]');
  await page.waitForSelector('#sidebar [data-notif-count][hidden]', { state: 'attached' });
  assert.equal(await page.locator('.nl.is-unread').count(), 0);
  await page.click('[data-n-tab="settings"]');
  await page.uncheck('[data-n-settings] [name=follow]');
  assert.ok(await page.isDisabled('[data-n-settings] [name=moderation]'));
  await page.click('[data-n-settings] [type=submit]');
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('保存しました'));
  const { rows } = await api.sql("select notify->>'follow' f, notify->>'moderation' m from user_preferences where user_id = $1", [users.alice.id]);
  assert.deepEqual(rows[0], { f: 'false', m: 'true' });
  assert.deepEqual(errors, []);
});

test('ベストアンサー：質問した人だけが選べ、回答者に XP と通知が届く', async () => {
  const q = (await asUser(users.bob.id, `save_post('{"type":"question","category":"question","body":"バンコクで料金表がはっきりしているバーはありますか？"}') as id`)).rows[0].id;
  const c = (await asUser(users.alice.id, 'add_comment($2, $3, null) as id', [q, 'アソーク周辺のホテルバーは料金表が明確でした'])).rows[0].id;
  // 回答した本人の画面には「選ぶ」ボタンが出ない
  await users.alice.page.goto(`${base}/community/post/?id=${q}`);
  await users.alice.page.waitForSelector('.cmt');
  assert.equal(await users.alice.page.locator('[data-c-best]').count(), 0);
  const { page, errors } = users.bob;
  await page.goto(`${base}/community/post/?id=${q}`);
  await page.waitForSelector('[data-c-best]');
  await page.click('[data-c-best]');
  await page.click('[role=alertdialog] [data-ok]');
  await page.waitForSelector('.cmt--best .cmt__best');
  assert.equal(await page.locator('[data-c-best]').count(), 0);
  const { rows } = await api.sql('select (select best_comment_id from community_posts where id = $1) b, (select xp from user_experience where user_id = $2) xp', [q, users.alice.id]);
  assert.deepEqual(rows[0], { b: c, xp: 20 });
  assert.deepEqual(errors, []);
});

test('NIGHT PULSE：実際の評価から集計し、件数が少ないものは出さない', async () => {
  const { ctx, page, errors } = await open('/community/pulse/');
  await page.waitForSelector('[data-pulse][aria-busy="false"]');
  assert.match(await page.textContent('[data-pulse-sec="posts"]'), /22時ごろ/);
  assert.match(await page.textContent('[data-pulse-sec="rising"]'), /まだ集計できるほどのデータがありません/);
  assert.match(await page.textContent('[data-pulse-sec="areas"]'), /まだ集計できるほどのデータがありません/);
  await page.click('[data-period="24h"]');
  await page.waitForSelector('[data-period="24h"][aria-pressed="true"]');
  await page.waitForSelector('[data-pulse][aria-busy="false"]');
  await shot(page, 'pulse-pc');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('管理画面：Phase 2 の数値、XP の調整には理由が必要', async () => {
  const { page, errors } = users.alice;
  await page.goto(`${base}/admin/community/`);
  await page.waitForFunction(() => /付与した XP/.test(document.querySelector('[data-adm-kpis]')?.textContent || ''));
  await page.click('[data-adm-tab="users"]');
  await page.waitForSelector('[data-adm-list="users"] [data-a="u-xp"]');
  const row = page.locator('[data-adm-list="users"] .arow', { hasText: 'bob_tester' });
  await row.locator('[data-xp]').fill('10');
  await row.locator('[data-a="u-xp"]').click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('理由'));
  await row.locator('[data-note]').fill('テストの調整');
  await row.locator('[data-a="u-xp"]').click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent.includes('更新しました'));
  const { rows } = await api.sql("select (select xp from user_experience where user_id = $1) xp, (select count(*)::int from admin_audit_logs where action = 'xp.adjust') n", [users.bob.id]);
  assert.deepEqual(rows[0], { xp: 10, n: 1 });
  assert.deepEqual(errors, []);
});

test('スマホ：横にはみ出さず、下部ナビにコミュニティがある', async () => {
  for (const path of ['/community/', `/community/post/?id=${postId}`, '/community/new/', '/community/login/', '/community/rules/', '/community/live/', '/community/pulse/', '/community/passport/', '/community/notifications/', article.u]) {
    const { ctx, page, errors } = await open(path, { width: 390, height: 844 });
    await page.waitForTimeout(400);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, `${path}: ${sw}`);
    assert.ok(await page.isVisible('.bn a[href="/community/"]'));
    if (path === '/community/') { await page.waitForSelector('[data-feed-list] .pc:not(.pc--sk)'); await shot(page, 'community-feed-mobile'); }
    if (path === '/community/login/') await shot(page, 'login-mobile');
    if (path === '/community/live/') { await page.waitForSelector('[data-live-list] .pc:not(.pc--sk)'); await shot(page, 'live-mobile'); }
    if (path === '/community/pulse/') { await page.waitForSelector('[data-pulse][aria-busy="false"]'); await shot(page, 'pulse-mobile'); }
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
