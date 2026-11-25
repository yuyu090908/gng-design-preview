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
  const tags = p.c ? `<p class="ac__tags"><span class="tag tag--main">${esc(p.c)}</span></p>` : '';
  return `<article class="ac ac--grid"><div class="ac__media">${im ? `<img src="${esc(im)}" alt="" width="520" height="293" loading="lazy" decoding="async">` : `<span class="noimg" aria-hidden="true">${icon('globe', 28)}</span>`}</div><div class="ac__body">${tags}<h${level} class="ac__title"><a class="ac__a" href="${esc(u)}">${esc(p.t)}</a></h${level}><p class="ac__meta"><span>${icon('calendar', 13)}<span class="sr">公開日 </span><time>${ymd(p.d)}</time></span>${p.r ? `<span>${icon('clock', 13)}約${Number(p.r) || 1}分</span>` : ''}</p></div><button class="save" type="button" aria-pressed="false" aria-label="保存「${esc(p.t)}」" data-save data-u="${esc(u)}" data-t="${esc(p.t)}" data-i="${esc(im)}" data-c="${esc(p.c || '')}" data-d="${esc(p.d || '')}">${icon('bookmark', 18)}</button></article>`;
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

// ボトムシート：スマホは下から、PC は中央に出す。つまんで下に引くか、背景・×・Esc で閉じる
const sheet = { close: null };
function openSheet({ title, html, onOpen, onClose }) {
  const root = $('#sheet');
  if (!root) return null;
  if (sheet.close) sheet.close();
  $('#sheet-t', root).textContent = title;
  const body = $('[data-bs-body]', root);
  body.innerHTML = html;
  $('.bs__panel', root).style.transform = '';
  const close = openModal(root, { onClose: () => { sheet.close = null; body.innerHTML = ''; if (onClose) onClose(); } });
  sheet.close = close;
  if (onOpen) onOpen(body, close);
  return close;
}
{
  const root = $('#sheet');
  if (root) {
    root.addEventListener('click', (e) => { if (e.target.closest('[data-bs-close]')) sheet.close?.(); });
    const panel = $('.bs__panel', root);
    let y0 = null, dy = 0;
    const start = (e) => {
      if (isDesktop()) return;
      if (!e.target.closest('[data-bs-grip], .bs__hd') || e.target.closest('button')) return;
      y0 = e.clientY; dy = 0; panel.classList.add('is-drag'); panel.classList.remove('is-back');
      panel.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = 'translateY(' + dy + 'px)'; };
    const end = () => {
      if (y0 === null) return;
      y0 = null; panel.classList.remove('is-drag');
      if (dy > Math.min(140, panel.offsetHeight * 0.3)) sheet.close?.();
      else { panel.classList.add('is-back'); panel.style.transform = ''; }
    };
    panel.addEventListener('pointerdown', start);
    panel.addEventListener('pointermove', move);
    panel.addEventListener('pointerup', end);
    panel.addEventListener('pointercancel', end);
  }
}
// 選択肢（チップ型のラジオ）
const chips = (name, list, cur) => '<div class="opt__row">' + list.map(([v, l]) => '<label class="chip"><input type="radio" name="' + name + '" value="' + v + '"' + (v === cur ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('') + '</div>';
