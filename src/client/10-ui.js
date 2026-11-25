// ---------- 小物 ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, size = 20, cls = '') => `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[n] || ''}</svg>`;
const ymd = (iso) => (iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDesktop = () => matchMedia('(min-width: 1024px)').matches;

let toastTimer;
function toast(msg) {
  const el = $('.toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// モーダル：背景スクロール停止・フォーカストラップ・Escape・元の場所へフォーカスを戻す
const openStack = [];
function openModal(root, { onClose, noEsc = false } = {}) {
  if (!root || !root.hidden) return null;
  const ret = document.activeElement;
  root.hidden = false;
  document.documentElement.classList.add('is-locked');
  const panel = root.querySelector('[role="dialog"]') || root;
  const focusables = () => $$('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])', panel).filter((e) => e.getClientRects().length);
  const entry = {};
  const onKey = (e) => {
    if (openStack[openStack.length - 1] !== entry) return;
    if (e.key === 'Escape' && !noEsc) { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  };
  function close() {
    if (root.hidden) return;
    root.hidden = true;
    document.removeEventListener('keydown', onKey);
    openStack.splice(openStack.indexOf(entry), 1);
    if (!openStack.length) document.documentElement.classList.remove('is-locked');
    if (onClose) onClose();
    if (ret && ret.focus) ret.focus({ preventScroll: true });
  }
  entry.close = close;
  openStack.push(entry);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => (panel.querySelector('[data-autofocus]') || panel).focus({ preventScroll: true }));
  return close;
}

// 記事カード（サーバー側の ArticleCard と同じ形）
function cardHTML(p, { level = 3 } = {}) {
  const u = safePath(p.u);
  if (!u) return '';
  const im = safeImg(p.i);
  const upd = p.m && String(p.m).slice(0, 10) !== String(p.d).slice(0, 10);
  return `<article class="ac ac--grid"><div class="ac__media">${im ? `<img src="${esc(im)}" alt="" width="520" height="293" loading="lazy" decoding="async">` : `<span class="noimg" aria-hidden="true">${icon('moon', 28)}</span>`}</div><div class="ac__body">${p.c ? `<p class="ac__cat">${esc(p.c)}</p>` : ''}<h${level} class="ac__title"><a class="ac__a" href="${esc(u)}">${esc(p.t)}</a></h${level}>${p.e ? `<p class="ac__ex">${esc(p.e)}</p>` : ''}<p class="ac__meta"><span><span class="sr">公開日 </span><time>${ymd(p.d)}</time></span>${upd ? `<span class="ac__upd">${icon('refresh', 12)}<span class="sr">更新日 </span><time>${ymd(p.m)}</time></span>` : ''}${p.r ? `<span>${icon('clock', 12)}約${Number(p.r) || 1}分</span>` : ''}</p></div><button class="save" type="button" aria-pressed="false" aria-label="「${esc(p.t)}」を保存" data-save data-u="${esc(u)}" data-t="${esc(p.t)}" data-i="${esc(im)}" data-c="${esc(p.c || '')}" data-d="${esc(p.d || '')}">${icon('bookmark', 18)}</button></article>`;
}
const skeleton = (n) => `<div class="agrid" aria-hidden="true">${'<div class="sk"><div class="sk__m"></div><div class="sk__l"></div><div class="sk__l sk__l--s"></div></div>'.repeat(n)}</div>`;
const emptyState = (ic, title, text = '', action = '') => `<div class="state"><span class="state__ic">${icon(ic, 28)}</span><p class="state__t">${esc(title)}</p>${text ? `<p class="state__d">${esc(text)}</p>` : ''}${action}</div>`;
const errorState = () => `<div class="state state--err" role="alert"><span class="state__ic">${icon('alert', 28)}</span><p class="state__t">読み込みに失敗しました</p><p class="state__d">通信状況を確認して、もう一度お試しください。</p><button class="btn btn--ghost" type="button" data-retry>再読み込み</button></div>`;

// 記事の索引（検索・並び替えに使う）
let indexPromise = null;
function loadIndex() {
  indexPromise ||= fetch('/search-index.json', { credentials: 'same-origin' })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

// 「本当に削除しますか？」をボタンの場所でその場確認する（ブラウザのダイアログを使わない）
function confirmInline(btn, label, onYes) {
  const wrap = btn.closest('[data-confirm-wrap]') || btn.parentElement;
  const orig = wrap.innerHTML;
  wrap.innerHTML = `<span class="confirm" role="group" aria-label="${esc(label)}"><span class="confirm__q">${esc(label)}</span><button class="btn btn--danger btn--sm" type="button" data-yes>削除する</button><button class="btn btn--ghost btn--sm" type="button" data-no>やめる</button></span>`;
  const restore = () => { wrap.innerHTML = orig; wrap.querySelector('button')?.focus(); };
  wrap.querySelector('[data-yes]').addEventListener('click', () => { onYes(); restore(); });
  wrap.querySelector('[data-no]').addEventListener('click', restore);
  wrap.querySelector('[data-no]').focus();
}
