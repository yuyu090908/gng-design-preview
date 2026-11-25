// ---------- マイダッシュボード：保存記事（フォルダ）、閲覧履歴、設定 ----------
const dash = $('[data-dashboard]');
if (dash) {
  const tabsEl = $('[data-tabs]', dash);
  const HASH = ['#saved', '#history', '#settings'];
  const fromHash = () => { const i = HASH.indexOf(location.hash); if (i >= 0) tabsEl.selectTab(i); };
  tabsEl.addEventListener('tabchange', (e) => { const h = HASH[e.detail.index]; if (location.hash !== h) history.replaceState(null, '', h); });
  window.addEventListener('hashchange', fromHash);
  fromHash();

  let folder = '';
  const savedBox = $('[data-saved-list]', dash);
  const histBox = $('[data-history-list]', dash);
  const foldersBox = $('[data-folders]', dash);
  const folderForm = $('[data-folder-form]', dash);

  const progressBar = (pct) => `<span class="prog" role="progressbar" aria-label="読書の進み具合" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span data-pct="${pct}"></span></span><span class="prog__t">${pct >= 95 ? '読了' : `${pct}%`}</span>`;
  const row = (it, { kind, folders, pct }) => {
    const u = safePath(it.u);
    if (!u) return '';
    const im = safeImg(it.i);
    return `<li class="mrow" data-u="${esc(u)}">
<a class="mrow__a" href="${esc(u)}"><span class="mrow__m">${im ? `<img src="${esc(im)}" alt="" width="160" height="90" loading="lazy">` : `<span class="ph">${icon('moon', 20)}</span>`}</span>
<span class="mrow__b">${it.c ? `<span class="ac__cat">${esc(it.c)}</span>` : ''}<span class="mrow__t">${esc(it.t)}</span><span class="mrow__meta">${kind === 'saved' ? `保存 ${ymd(it.at)}` : `閲覧 ${ymd(it.at)}`}${pct != null ? ` ・ ${progressBar(pct)}` : ''}</span></span></a>
<span class="mrow__act">${kind === 'saved' ? `<label class="sel sel--sm"><span class="sr">フォルダを移動</span>${icon('folder', 16)}<select data-move>${folders.map((f) => `<option${f === it.f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>` : ''}<button class="ibtn ibtn--sm" type="button" data-del aria-label="「${esc(it.t)}」を${kind === 'saved' ? '保存から削除' : '履歴から削除'}">${icon('trash', 18)}</button></span>
</li>`;
  };

  function render() {
    const v = store.read();
    const s = v.settings;
    // KPI
    $('[data-kpi="saved"]', dash).textContent = v.saved.length;
    $('[data-kpi="history"]', dash).textContent = v.history.length;
    $('[data-kpi="done"]', dash).textContent = Object.values(v.progress).filter((p) => p >= 95).length;
    // フォルダ
    const folders = v.folders.length ? v.folders : ['あとで読む'];
    if (folder && !folders.includes(folder)) folder = '';
    const cnt = (f) => v.saved.filter((x) => x.f === f).length;
    foldersBox.innerHTML = [['', `すべて`, v.saved.length], ...folders.map((f) => [f, f, cnt(f)])].map(([val, label, n]) => `<span class="fchip"><button class="chip${folder === val ? ' is-on' : ''}" type="button" data-folder="${esc(val)}" aria-pressed="${folder === val}">${val ? icon('folder', 14) : ''}${esc(label)}<span class="chip__n">${n}</span></button>${val && val !== folders[0] ? `<button class="fchip__x" type="button" data-folder-del="${esc(val)}" aria-label="フォルダ「${esc(val)}」を削除（記事は「${esc(folders[0])}」に移動）">${icon('x', 14)}</button>` : ''}</span>`).join('');
    // 保存記事
    const list = v.saved.filter((x) => !folder || x.f === folder);
    savedBox.innerHTML = list.length
      ? `<ul class="mlist">${list.map((it) => row(it, { kind: 'saved', folders, pct: s.historyEnabled && v.progress[it.u] != null ? v.progress[it.u] : null })).join('')}</ul>`
      : emptyState('bookmark', folder ? `「${folder}」に保存した記事はありません` : 'まだ保存した記事はありません', '記事カードや記事ページの保存ボタンを押すと、ここに表示されます。', '<a class="btn btn--primary" href="/new/">新着記事を見る</a>');
    // 閲覧履歴
    $('[data-history-note]', dash).textContent = s.historyEnabled ? '閲覧履歴を保存しています（この端末のみ）。' : '閲覧履歴の保存はオフです。';
    $('[data-history-clear]', dash)?.toggleAttribute('disabled', !v.history.length);
    histBox.innerHTML = v.history.length
      ? `<ul class="mlist">${v.history.map((it) => row(it, { kind: 'history', pct: v.progress[it.u] ?? 0 })).join('')}</ul>`
      : emptyState('history', s.historyEnabled ? 'まだ閲覧履歴はありません' : '閲覧履歴は記録されていません', s.historyEnabled ? '記事を開くと、ここに表示されます。' : '上のスイッチをオンにすると、読んだ記事と進み具合を記録できます。');
    // 設定
    $$('[data-setting="historyEnabled"]', dash).forEach((b) => b.setAttribute('aria-checked', String(!!s.historyEnabled)));
    $$('input[data-setting="theme"]', dash).forEach((r) => { r.checked = r.value === (s.theme || 'dark'); r.closest('.seg__b')?.classList.toggle('is-on', r.checked); });
    $$('input[data-setting="fontSize"]', dash).forEach((r) => { r.checked = r.value === (s.fontSize || 'm'); r.closest('.seg__b')?.classList.toggle('is-on', r.checked); });
    $$('[data-pct]', dash).forEach((el) => { el.style.width = `${Math.min(100, Number(el.dataset.pct) || 0)}%`; });
    syncSaveButtons();
  }

  dash.addEventListener('click', (e) => {
    const t = e.target;
    const f = t.closest('[data-folder]');
    if (f) { folder = f.dataset.folder; render(); return; }
    const fd = t.closest('[data-folder-del]');
    if (fd) {
      const name = fd.dataset.folderDel;
      store.update((v) => { const first = v.folders[0]; v.folders = v.folders.filter((x) => x !== name); v.saved.forEach((x) => { if (x.f === name) x.f = first; }); });
      toast(`フォルダ「${name}」を削除しました`);
      return;
    }
    if (t.closest('[data-folder-new]')) { folderForm.hidden = false; $('input', folderForm).focus(); return; }
    if (t.closest('[data-folder-cancel]')) { folderForm.hidden = true; folderForm.reset(); return; }
    const del = t.closest('[data-del]');
    if (del) {
      const li = del.closest('[data-u]');
      const u = li.dataset.u;
      const inSaved = !!li.closest('[data-saved-list]');
      store.update((v) => { if (inSaved) v.saved = v.saved.filter((x) => x.u !== u); else { v.history = v.history.filter((x) => x.u !== u); delete v.progress[u]; } });
      toast(inSaved ? '保存から削除しました' : '履歴から削除しました');
      return;
    }
    const sw = t.closest('[data-setting="historyEnabled"]');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true';
      store.update((v) => { v.settings.historyEnabled = on; });
      toast(on ? '閲覧履歴の保存をオンにしました' : '閲覧履歴の保存をオフにしました（これまでの履歴は残っています）');
      return;
    }
    const hc = t.closest('[data-history-clear]');
    if (hc) { confirmInline(hc, '閲覧履歴と進み具合をすべて削除しますか？', () => { store.update((v) => { v.history = []; v.progress = {}; }); toast('閲覧履歴をすべて削除しました'); }); return; }
    if (t.closest('[data-age-reset]')) { try { localStorage.removeItem(AGE_KEY); } catch {} toast('次にページを開いたときに年齢確認を表示します'); return; }
    const wipe = t.closest('[data-wipe]');
    if (wipe) { confirmInline(wipe, 'この端末のデータをすべて削除しますか？', () => { store.wipe(); applySettings(); toast('この端末のデータをすべて削除しました'); }); }
  });
  dash.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-move]')) {
      const u = t.closest('[data-u]').dataset.u;
      store.update((v) => { const it = v.saved.find((x) => x.u === u); if (it && v.folders.includes(t.value)) it.f = t.value; });
      toast(`「${t.value}」に移動しました`);
    }
    if (t.matches('input[data-setting="theme"]')) { store.update((v) => { v.settings.theme = t.value; }); applySettings(); }
    if (t.matches('input[data-setting="fontSize"]')) { store.update((v) => { v.settings.fontSize = t.value; }); applySettings(); }
  });
  folderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = String(new FormData(folderForm).get('name') || '').replace(/[<>"']/g, '').trim().slice(0, 20);
    if (!name) return;
    const v = store.read();
    if (v.folders.includes(name)) { toast('同じ名前のフォルダがあります'); return; }
    if (v.folders.length >= 20) { toast('フォルダは20個まで作れます'); return; }
    store.update((x) => { x.folders.push(name); });
    folder = name;
    folderForm.hidden = true;
    folderForm.reset();
    toast(`フォルダ「${name}」を作成しました`);
  });
  document.addEventListener('gng:store', render);
  render();
}
