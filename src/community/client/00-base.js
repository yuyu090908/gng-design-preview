// ---------- GLOBAL NIGHT COMMUNITY：共通の小物・接続（Supabase の REST / Auth / Storage を直接呼ぶ） ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, size = 20, cls = '') => `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[n] || ''}</svg>`;
const safePath = (u) => (typeof u === 'string' && /^\/[^/]/.test(u) && !/[<>"'\s]/.test(u) ? u : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const qs = new URLSearchParams(location.search);
const store = {
  get(k, d = null) { try { const v = JSON.parse(localStorage.getItem('gnc:' + k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gnc:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('gnc:' + k); } catch {} },
};
let toastTimer;
function toast(msg) {
  const el = $('.toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2800);
}

const CFG = (() => { try { return JSON.parse($('#gn-config').textContent); } catch { return {}; } })();
const READY = !!(CFG.url && CFG.key);
const has = (f) => (CFG.features || []).includes(f);

// ---------- エラーを利用者向けの文に ----------
const ERR = {
  login_required: 'ログインが必要です。', profile_missing: 'プロフィールが見つかりません。もう一度ログインしてください。',
  account_banned: 'このアカウントは利用を停止されています。', account_limited: 'このアカウントは現在、投稿が制限されています。',
  age_unconfirmed: '投稿するには、プロフィール設定で18歳以上であることの確認が必要です。', rate_limited: '短い時間に操作が続いたため、少し時間をおいてからお試しください。',
  invalid_handle: 'ユーザー名は英小文字・数字・_ の3〜20文字にしてください。', reserved_handle: 'このユーザー名は使えません。', handle_taken: 'このユーザー名はすでに使われています。',
  body_too_short: '本文が短すぎます（店舗の感想は30文字以上）。', review_needs_target: '口コミの対象（記事か店舗）を選んでください。', review_needs_overall: '総合評価を選んでください。',
  invalid_visit_date: '訪問日が正しくありません。', invalid_venue: '選んだ店舗は現在使えません。', invalid_region: '地域の組み合わせが正しくありません。', too_many_media: '画像は4枚までです。',
  invalid_media: '画像を確認できませんでした。もう一度追加してください。', not_owner: '自分の投稿・コメントだけ操作できます。', locked_by_moderation: 'この投稿は運営の審査中のため編集できません。',
  post_not_found: '投稿が見つかりません。', cannot_rate_own: '自分の投稿には押せません。', already_reported: 'この内容はすでに通報済みです。', blocked: 'この投稿にはコメントできません。',
  forbidden: 'この操作を行う権限がありません。', cannot_block_self: '自分はブロックできません。', parent_not_found: '返信先のコメントが見つかりません。',
  offline: 'インターネットに接続されていません。接続を確認してからお試しください。',
  note_required: '理由（メモ）と数値を入力してください。', cannot_follow_self: '自分はフォローできません。', user_not_found: 'ユーザーが見つかりません。',
  not_question: '質問の投稿だけで選べます。', already_chosen: 'ベストアンサーはすでに選ばれています。', comment_not_found: 'コメントが見つかりません。',
  ai_disabled: 'NIGHT AI は現在停止しています。', ai_quota: '今日の NIGHT AI の利用回数の上限に達しました。', invalid_location: '緯度・経度が正しくありません。',
  live_needs_place: '都市か店舗を選んでください。', use_post_live: 'NIGHT LIVE の投稿は NIGHT LIVE の画面から共有してください。',
};
const errText = (e) => ERR[e?.code] || e?.message || '処理できませんでした。時間をおいてお試しください。';
class ApiError extends Error { constructor(code, message, status) { super(message || code); this.code = code; this.status = status; } }

// ---------- ログイン状態 ----------
const SESSION_KEY = 'session';
let session = store.get(SESSION_KEY);
const listeners = new Set();
const onAuth = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function setSession(s) {
  session = s && s.access_token ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600), user: { id: s.user?.id, email: s.user?.email } } : null;
  if (session) store.set(SESSION_KEY, session); else store.del(SESSION_KEY);
  me = null;
  listeners.forEach((fn) => fn(session));
}
const uid = () => session?.user?.id || null;

async function raw(path, { method = 'GET', body, headers = {}, auth = true, prefer } = {}) {
  if (!READY) throw new ApiError('offline', 'not configured');
  if (!navigator.onLine) throw new ApiError('offline');
  if (auth && session && session.expires_at - 60 < Date.now() / 1000) await refresh();
  const h = { apikey: CFG.key, ...headers };
  h.Authorization = `Bearer ${auth && session ? session.access_token : CFG.key}`;
  if (body !== undefined && !(body instanceof Blob)) h['Content-Type'] = 'application/json';
  if (prefer) h.Prefer = prefer;
  let res;
  try { res = await fetch(CFG.url + path, { method, headers: h, body: body === undefined || body instanceof Blob ? body : JSON.stringify(body) }); }
  catch { throw new ApiError('offline'); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401 && auth && session) { setSession(null); }
    const msg = data?.message || data?.msg || data?.error_description || data?.error || res.statusText;
    const code = Object.keys(ERR).find((k) => String(msg).includes(k)) || (/permission denied/.test(msg) ? 'forbidden' : res.status === 429 ? 'rate_limited' : '');
    throw new ApiError(code, msg, res.status);
  }
  return { data, res };
}
let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) return;
  refreshing ||= (async () => {
    try {
      const r = await fetch(`${CFG.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!r.ok) throw new Error('refresh');
      setSession(await r.json());
    } catch { setSession(null); }
    finally { refreshing = null; }
  })();
  return refreshing;
}

// PostgREST：表の読み取り（params はオブジェクト。値はそのまま URL に入れる前にエンコードする）
async function select(table, params = {}, { count = false } = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.append(k, v);
  const { data, res } = await raw(`/rest/v1/${table}?${q}`, { prefer: count ? 'count=exact' : undefined });
  if (count) { const m = (res.headers.get('content-range') || '').match(/\/(\d+)$/); return { rows: data || [], total: m ? Number(m[1]) : (data || []).length }; }
  return data || [];
}
const rpc = async (fn, args = {}) => (await raw(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args })).data;
const inList = (ids) => `in.(${ids.filter((x) => UUID.test(x)).join(',')})`;
const like = (s) => `*${String(s).replace(/[*,()%\\:."']/g, ' ').trim().slice(0, 40)}*`;

// Auth（Supabase Auth の REST）
const auth = {
  async signUp(email, password) {
    const r = await raw(`/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin + '/community/login/')}`, { method: 'POST', body: { email, password }, auth: false });
    if (r.data?.access_token) setSession(r.data);
    return r.data;
  },
  async signIn(email, password) { const r = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false }); setSession(r.data); return r.data; },
  async magic(email) { await raw(`/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + '/community/login/')}`, { method: 'POST', body: { email, create_user: false }, auth: false }); },
  async recover(email) { await raw(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + '/community/login/')}`, { method: 'POST', body: { email }, auth: false }); },
  async setPassword(password) { await raw('/auth/v1/user', { method: 'PUT', body: { password } }); },
  async signOut() { try { await raw('/auth/v1/logout', { method: 'POST' }); } catch {} setSession(null); },
};
// メールのリンクから戻ってきたとき（#access_token=...）
let authLinkType = null;
(function readHash() {
  if (!/access_token=/.test(location.hash)) {
    const m = location.hash.match(/error_description=([^&]+)/);
    if (m) setTimeout(() => toast(decodeURIComponent(m[1].replace(/\+/g, ' '))), 300);
    return;
  }
  const h = new URLSearchParams(location.hash.slice(1));
  authLinkType = h.get('type');
  setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in'), user: {} });
  history.replaceState(null, '', location.pathname + location.search);
  raw('/auth/v1/user').then(({ data }) => { if (data?.id) setSession({ ...session, user: data }); }).catch(() => {});
})();

// 自分のプロフィール（キャッシュ）
let me = null;
async function myProfile(force = false) {
  if (!uid()) return null;
  if (me && !force) return me;
  const [p] = await select('user_profiles', { id: `eq.${uid()}`, select: '*' });
  me = p || null;
  if (me) {
    const roles = await select('user_roles', { user_id: `eq.${uid()}`, select: 'role' }).catch(() => []);
    me.roles = roles.map((r) => r.role);
    // 登録時に「18歳以上」にチェックした人は、最初のログインで確認済みにする
    if (!me.age_confirmed_at && store.get('pendingAge') === uid()) {
      try { me = { ...(await rpc('update_profile', { p_handle: me.handle, p_display_name: me.display_name, p_bio: me.bio, p_is_private: me.is_private, p_confirm_age: true })), roles: me.roles }; store.del('pendingAge'); } catch {}
    }
  }
  return me;
}

// ---------- 表示用 ----------
// アバター：登録時に決まる乱数（avatar_seed）から幾何学模様を作る。写真は使わない
const AV_COLORS = [['#C9A86A', '#5B4520'], ['#8B5CF6', '#2B1B5A'], ['#4F8CFF', '#132A55'], ['#D98E96', '#4A2026'], ['#34D399', '#0E3A2C'], ['#E8CF99', '#3A2E14']];
function avatar(seed, cls = '') {
  const s = String(seed || '0').replace(/[^0-9a-f]/gi, '').padEnd(12, '0');
  const n = (i) => parseInt(s.slice(i, i + 2), 16) || 0;
  const [a, b] = AV_COLORS[n(0) % AV_COLORS.length];
  const shape = n(2) % 3;
  const r = 8 + (n(4) % 6), x = 12 + (n(6) % 16), y = 12 + (n(8) % 16), rot = n(10) % 90;
  const fig = shape === 0 ? `<circle cx="${x}" cy="${y}" r="${r}" fill="${a}" opacity=".9"/>` : shape === 1 ? `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="3" transform="rotate(${rot} ${x} ${y})" fill="${a}" opacity=".9"/>` : `<path d="M${x} ${y - r}L${x + r} ${y + r}H${x - r}Z" fill="${a}" opacity=".9"/>`;
  return `<span class="av ${cls}" aria-hidden="true"><svg viewBox="0 0 40 40"><rect width="40" height="40" fill="${b}"/>${fig}<circle cx="${40 - x}" cy="${40 - y}" r="${r / 2}" fill="none" stroke="${a}" stroke-width="1.5" opacity=".7"/></svg></span>`;
}
function ago(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime(), d = (Date.now() - t) / 1000;
  if (d < 60) return 'たった今';
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}日前`;
  return new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}
const TYPE_L = { review: '店舗の感想', live: 'リアルタイム', question: '質問', recommend: 'おすすめ', event: 'イベント', talk: 'フリートーク' };
const CAT_L = { review: '店舗レビュー', recommend: 'おすすめ店舗', question: '質問・相談', budget: '料金・予算情報', event: 'イベント情報', local: '現地情報', beginner: 'ナイトライフ初心者', chat: '雑談', caution: '注意事項・トラブル情報', region: '国・都市別' };
const ASPECT_L = { overall: '総合', service: '接客', atmosphere: '雰囲気', cleanliness: '清潔感', price_clarity: '料金の明確さ', value: 'コスパ', safety: '安心感', drinks: 'ドリンク', music: '音楽' };
const VENUE_L = { bar: 'バー', club: 'クラブ', karaoke: 'カラオケ', cabaret: 'キャバクラ・ラウンジ', soapland: 'ソープランド', delivery: 'デリバリー', massage: 'マッサージ', restaurant: '飲食店', other: 'その他' };
const STATUS_L = { draft: '下書き', published: '公開中', pending: '審査待ち', hidden: '非表示（運営）', removed: '削除（運営）' };
const stars = (n) => { const v = Math.round(Number(n) || 0); return `<span class="pc__stars" aria-hidden="true">${'★'.repeat(v)}${'☆'.repeat(5 - v)}</span>`; };
const mediaUrl = (p) => (/^[0-9a-f-]{36}\/[0-9a-zA-Z_.-]{1,80}$/.test(p) ? `${CFG.url}/storage/v1/object/public/post-media/${p}` : '');
const money = (a, c) => (a == null ? '' : `${Number(a).toLocaleString('ja-JP')} ${esc(c || '')}`);

// サイトの記事（口コミの対象）。search-index.json を一度だけ読む
let articlesP = null;
const articles = () => (articlesP ||= fetch('/search-index.json').then((r) => r.json()).catch(() => []));
async function articleTitle(path) { const a = (await articles()).find((x) => x.u === path); return a ? a.t : ''; }

// 地域（国・都市・エリア）
let regionsP = null;
const regions = () => (regionsP ||= Promise.all([
  select('countries', { select: 'code,name_ja', order: 'sort' }), select('cities', { select: 'id,slug,country_code,name_ja,name_en', order: 'name_ja' }), select('areas', { select: 'id,city_id,name_ja', order: 'name_ja' }),
]).then(([countries, cities, areas]) => ({ countries, cities, areas })).catch(() => ({ countries: [], cities: [], areas: [] })));
async function initRegion(box, value = {}, onChange = () => {}) {
  if (!box) return { get: () => ({}) };
  const [c, ci, ar] = ['[data-region-country]', '[data-region-city]', '[data-region-area]'].map((s) => $(s, box));
  const R = await regions();
  c.insertAdjacentHTML('beforeend', R.countries.map((x) => `<option value="${esc(x.code)}">${esc(x.name_ja)}</option>`).join(''));
  const fill = (sel, list, first) => { sel.innerHTML = `<option value="">${first}</option>` + list.map((x) => `<option value="${x.id}">${esc(x.name_ja)}</option>`).join(''); sel.disabled = !list.length; };
  const sync = (keep = {}) => {
    fill(ci, R.cities.filter((x) => x.country_code === c.value), 'すべての都市');
    if (keep.city) ci.value = String(keep.city);
    fill(ar, R.areas.filter((x) => String(x.city_id) === ci.value), 'すべてのエリア');
    if (keep.area) ar.value = String(keep.area);
  };
  if (value.country) c.value = value.country;
  sync(value);
  c.addEventListener('change', () => { sync(); onChange(); });
  ci.addEventListener('change', () => { fill(ar, R.areas.filter((x) => String(x.city_id) === ci.value), 'すべてのエリア'); onChange(); });
  ar.addEventListener('change', onChange);
  const label = () => [c, ci, ar].filter((s) => s.value).map((s) => s.selectedOptions[0].textContent).join(' → ');
  return {
    get: () => ({ country: c.value || null, city: ci.value ? Number(ci.value) : null, area: ar.value ? Number(ar.value) : null }),
    set: (v) => { c.value = v.country || ''; sync(v); },
    label,
  };
}

// ---------- モーダル（フォーカスを閉じ込め、Escape で閉じ、元の場所に戻す） ----------
function modal(root) {
  if (!root) return () => {};
  const ret = document.activeElement;
  root.hidden = false;
  document.documentElement.classList.add('is-locked');
  const panel = $('[role="dialog"]', root) || root;
  const f = () => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea', panel).filter((e) => e.getClientRects().length);
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { const l = f(); if (!l.length) return; const [a, z] = [l[0], l[l.length - 1]]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
  };
  const close = () => { if (root.hidden) return; root.hidden = true; document.documentElement.classList.remove('is-locked'); document.removeEventListener('keydown', key); $$('[data-modal-close]', root).forEach((b) => b.removeEventListener('click', close)); ret?.focus?.({ preventScroll: true }); };
  document.addEventListener('keydown', key);
  $$('[data-modal-close]', root).forEach((b) => b.addEventListener('click', close));
  requestAnimationFrame(() => panel.focus({ preventScroll: true }));
  return close;
}

// ボタンの状態（Loading / Success / Disabled）
async function busy(btn, fn, { done = '' } = {}) {
  if (!btn || btn.classList.contains('is-loading')) return;
  btn.classList.add('is-loading'); btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    const r = await fn();
    if (done) { btn.classList.add('is-done'); setTimeout(() => btn.classList.remove('is-done'), 1500); }
    return r;
  } finally { btn.classList.remove('is-loading'); btn.disabled = false; btn.removeAttribute('aria-busy'); }
}
const loginHref = () => `/community/login/?next=${encodeURIComponent(location.pathname + location.search)}`;
function needLogin() { if (uid()) return false; toast('ログインが必要です'); setTimeout(() => { location.href = loginHref(); }, 600); return true; }
const stateHTML = (ic, t, d = '', action = '') => `<div class="state"><span class="state__ic">${icon(ic, 28)}</span><p class="state__t">${esc(t)}</p>${d ? `<p class="state__d">${esc(d)}</p>` : ''}${action}</div>`;
const errorHTML = (e) => `<div class="state state--err" role="alert"><span class="state__ic">${icon('alert', 28)}</span><p class="state__t">読み込めませんでした</p><p class="state__d">${esc(errText(e))}</p><button class="btn btn--ghost" type="button" data-retry>再読み込み</button></div>`;
