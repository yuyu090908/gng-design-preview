// ---------- 画面の外枠：テーマ、サイドバー、ドロワー、年齢確認、検索ショートカット、先頭へ戻る ----------
const root = document.documentElement;

function applySettings() {
  const s = store.read().settings;
  let t = s.theme || 'dark';
  if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  root.dataset.theme = t;
  root.dataset.fs = s.fontSize || 'm';
  $$('[data-theme-toggle]:not([data-theme-text])').forEach((b) => b.setAttribute('aria-label', t === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'));
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applySettings);

$$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  store.update((v) => { v.settings.theme = next; });
  applySettings();
  toast(next === 'dark' ? 'ダークモードにしました' : 'ライトモードにしました');
}));

// PC のサイドバー（開閉状態を保存）
const sbBtn = $('[data-sb-toggle]');
function syncSidebar() {
  const c = root.classList.contains('sb-collapsed');
  if (sbBtn) { sbBtn.setAttribute('aria-expanded', String(!c)); sbBtn.setAttribute('aria-label', c ? 'サイドバーを広げる' : 'サイドバーを折りたたむ'); }
}
sbBtn?.addEventListener('click', () => {
  const c = !root.classList.contains('sb-collapsed');
  root.classList.toggle('sb-collapsed', c);
  store.update((v) => { v.settings.sidebarCollapsed = c; });
  syncSidebar();
});
syncSidebar();
// 折りたたみ中にカテゴリを押したら、サイドバーを広げて中身を見せる
$$('#sidebar details > summary').forEach((s) => s.addEventListener('click', () => {
  if (root.classList.contains('sb-collapsed')) {
    root.classList.remove('sb-collapsed');
    store.update((v) => { v.settings.sidebarCollapsed = false; });
    syncSidebar();
  }
}));
// アコーディオンの開閉も覚えておく（今いるページを含むグループは常に開く）
{
  const acc = store.read().settings.acc || {};
  $$('details[data-acc]').forEach((d) => {
    const k = d.dataset.acc;
    if (!d.open && acc[k]) d.open = true;
    d.addEventListener('toggle', () => store.update((v) => { v.settings.acc = { ...(v.settings.acc || {}), [k]: d.open }; }));
  });
}

// モバイルのドロワー
const drawer = $('#drawer');
const drawerBtn = $('[data-drawer-open]');
let closeDrawer = null;
drawerBtn?.addEventListener('click', () => {
  closeDrawer = openModal(drawer, { onClose: () => drawerBtn.setAttribute('aria-expanded', 'false') });
  drawerBtn.setAttribute('aria-expanded', 'true');
});
drawer?.addEventListener('click', (e) => {
  if (e.target.closest('[data-drawer-close]')) closeDrawer?.();
  else if (e.target.closest('a[href]')) closeDrawer?.();
});

// 年齢確認（初回だけ。結果はこの端末にのみ保存）
const gate = $('#age-gate');
let ageOk = false;
try { ageOk = localStorage.getItem(AGE_KEY) === '1'; } catch { ageOk = true; }
if (ageOk) root.classList.remove('age-pending');
if (gate && !ageOk) {
  const close = openModal(gate, { noEsc: true });
  gate.querySelector('[data-age-ok]').addEventListener('click', () => { try { localStorage.setItem(AGE_KEY, '1'); } catch {} root.classList.remove('age-pending'); close && close(); });
}

// 「/」キーで検索欄へ
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || openStack.length) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
  const input = isDesktop() ? $('#gh-q') : $('#q') || $('#hero-q');
  if (input && input.getClientRects().length) { e.preventDefault(); input.focus(); }
  else if (!isDesktop()) location.href = '/search/';
});

// 保存記事の件数バッジ
function syncBadges() {
  const n = store.read().saved.length;
  $$('[data-saved-count]').forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n); });
}
document.addEventListener('gng:store', syncBadges);
syncBadges();

// 下部ナビ：ハッシュ付きのリンク（保存・マイページ）の現在地表示
{
  const p = location.pathname, h = location.hash;
  if (p === '/my-dashboard/') {
    $$('.bn a').forEach((a) => a.removeAttribute('aria-current'));
    const t = h === '#saved' ? $('[data-bn-saved]') : $('.bn a[href="/my-dashboard/"]');
    t?.setAttribute('aria-current', 'page');
  }
}

// 先頭へ戻る
const totop = $('[data-totop]');
if (totop) {
  let ticking = false;
  const on = () => { totop.hidden = window.scrollY < 900; ticking = false; };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(on); } }, { passive: true });
  on();
  totop.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); $('#content')?.focus({ preventScroll: true }); });
}

applySettings();
