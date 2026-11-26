// ---------- ページ共通：接続の確認、ログイン状態による表示切り替え、通報・画像のダイアログ ----------
if (!READY) {
  // 接続先が未設定：コミュニティの中身を隠し「準備中」を出す（ボタンだけ並んで動かない状態にしない）
  $$('.clay, [data-composer], [data-auth], [data-me], [data-admin], [data-profile], .fab, .nhero__cta, [data-article-reviews], [data-home-community]').forEach((e) => { e.hidden = true; });
  const off = $('[data-com-offline]');
  if (off && document.body.classList.contains('p-com')) off.hidden = false;
}

function syncWhen() {
  $$('[data-when="guest"]').forEach((e) => { e.hidden = !!uid(); });
  $$('[data-when="member"]').forEach((e) => { e.hidden = !uid(); });
}
syncWhen();
onAuth(syncWhen);

// 1 日 1 回の利用記録（DAU などの集計用。見たページは送らない）
if (READY && uid()) {
  const day = new Date().toISOString().slice(0, 10);
  if (store.get('ping') !== day) rpc('ping').then(() => store.set('ping', day)).catch(() => {});
}

// 通報（投稿・コメント・ユーザー）
function openReport(type, id) {
  if (needLogin()) return;
  const root = $('#com-report');
  if (!root) return;
  const form = $('[data-com-report-form]', root);
  form.reset();
  const err = $('[data-form-error]', form); err.hidden = true;
  const close = modal(root);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('[type=submit]', form);
    try {
      await busy(btn, () => rpc('report_content', { p_type: type, p_id: id, p_reason: form.reason.value, p_detail: form.detail.value }));
      close();
      toast('通報を受け付けました。運営が確認します');
    } catch (ex) { err.textContent = errText(ex); err.hidden = false; }
  };
}

// 画像の全画面表示
function openViewer(list, start = 0) {
  const root = $('#com-viewer');
  if (!root || !list.length) return;
  let i = start;
  const img = $('[data-iv-img]', root), cnt = $('[data-iv-count]', root);
  const show = () => { img.src = list[i].src; img.alt = list[i].alt || ''; cnt.textContent = `${i + 1} / ${list.length}`; $('[data-iv-prev]', root).disabled = i === 0; $('[data-iv-next]', root).disabled = i === list.length - 1; };
  $('[data-iv-prev]', root).onclick = () => { if (i > 0) { i--; show(); } };
  $('[data-iv-next]', root).onclick = () => { if (i < list.length - 1) { i++; show(); } };
  $('.iv__nav', root).hidden = list.length < 2;
  show();
  modal(root);
}

// 共有（端末の共有機能、なければ URL をコピー）
async function share(url, title) {
  const full = new URL(url, location.origin).href;
  try {
    if (navigator.share) { await navigator.share({ title, url: full }); return; }
    await navigator.clipboard.writeText(full);
    toast('リンクをコピーしました');
  } catch (e) { if (e?.name !== 'AbortError') toast('共有できませんでした'); }
}

// 再読み込みボタン（エラー表示の中）
document.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) location.reload(); });
window.addEventListener('offline', () => toast('オフラインになりました。接続が戻ると操作できます'));
