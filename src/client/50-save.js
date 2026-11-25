// ---------- 記事の保存（ブックマーク） ----------
function savedSet() { return new Set(store.read().saved.map((s) => s.u)); }
function syncSaveButtons(rootEl = document) {
  const set = savedSet();
  $$('[data-save]', rootEl).forEach((b) => {
    const on = set.has(b.dataset.u);
    b.setAttribute('aria-pressed', String(on));
    const t = b.dataset.t || '記事';
    b.setAttribute('aria-label', on ? `保存済み「${t}」（押すと解除）` : `保存「${t}」`);
    const l = b.querySelector('.save__l');
    if (l) l.textContent = on ? '保存済み' : '保存';
  });
}
function toggleSave(b) {
  const u = safePath(b.dataset.u);
  if (!u) return;
  let added = false;
  store.update((v) => {
    const i = v.saved.findIndex((s) => s.u === u);
    if (i >= 0) v.saved.splice(i, 1);
    else {
      added = true;
      v.saved.unshift({ u, t: clip(b.dataset.t, 200), i: safeImg(b.dataset.i), c: clip(b.dataset.c, 40), d: clip(b.dataset.d, 25), f: v.folders[0] || 'あとで読む', at: new Date().toISOString() });
      v.saved = v.saved.slice(0, 500);
    }
  });
  syncSaveButtons();
  toast(added ? '保存しました。マイページで確認できます' : '保存を解除しました');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-save]');
  if (b) { e.preventDefault(); toggleSave(b); }
});
document.addEventListener('gng:store', () => syncSaveButtons());
syncSaveButtons();
