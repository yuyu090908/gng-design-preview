// ---------- 記事一覧：グリッド／リスト切り替えと並び替え ----------
const listing = $('[data-listing]');
if (listing) {
  const VIEW_KEY = 'gng:view';
  const serverBox = $('[data-list-server]', listing);
  const clientBox = $('[data-list-client]', listing);
  const setView = (v) => {
    listing.dataset.view = v;
    $$('[data-view]', listing).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    try { sessionStorage.setItem(VIEW_KEY, v); } catch {}
  };
  $$('[data-view]', listing).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  let v0 = 'grid';
  try { v0 = sessionStorage.getItem(VIEW_KEY) || 'grid'; } catch {}
  setView(v0);

  // 並び替え：新着順はサーバーで作ったページをそのまま使う。それ以外はカテゴリの全記事を並べ替えて表示する
  const sel = $('[data-sort]', listing);
  const cat = listing.dataset.cat;
  const PER = 12;
  let shown = PER, sorted = [];
  const render = () => {
    clientBox.innerHTML = `<div class="agrid">${sorted.slice(0, shown).map((p) => cardHTML(p, { level: 2 })).join('')}</div>${shown < sorted.length ? `<button class="btn btn--ghost btn--more" type="button" data-more>さらに表示（残り${sorted.length - shown}件）</button>` : ''}`;
    syncSaveButtons(clientBox);
  };
  const apply = async () => {
    const mode = sel.value;
    const url = new URL(location.href);
    if (mode === 'new') {
      url.searchParams.delete('sort');
      history.replaceState(null, '', url);
      clientBox.hidden = true; serverBox.hidden = false;
      return;
    }
    url.searchParams.set('sort', mode);
    history.replaceState(null, '', url);
    serverBox.hidden = true; clientBox.hidden = false;
    clientBox.innerHTML = skeleton(6);
    clientBox.setAttribute('aria-busy', 'true');
    try {
      const idx = await loadIndex();
      const list = cat ? idx.filter((p) => (p.k || []).map(String).includes(cat)) : idx.slice();
      const key = mode === 'updated' ? 'm' : 'd';
      sorted = list.sort((a, b) => (mode === 'old' ? String(a.d).localeCompare(String(b.d)) : String(b[key]).localeCompare(String(a[key]))));
      shown = PER;
      render();
    } catch {
      clientBox.innerHTML = errorState();
    }
    clientBox.removeAttribute('aria-busy');
  };
  clientBox.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { shown += PER; render(); }
    if (e.target.closest('[data-retry]')) apply();
  });
  sel?.addEventListener('change', apply);
  const initial = new URLSearchParams(location.search).get('sort');
  if (sel && initial && [...sel.options].some((o) => o.value === initial)) { sel.value = initial; apply(); }
}
