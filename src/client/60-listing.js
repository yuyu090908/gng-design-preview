// ---------- 記事一覧：タブ（すべて／新着／更新された記事／特集）・並び替え・表示切り替え ----------
// 「すべて＋新着順」はサーバーで作ったページ（検索エンジンが読む一覧）をそのまま使う。
// それ以外は記事の索引から画面側で並べ替える。状態は URL（?tab= / ?sort=）に入れるので、戻る・進むで元に戻る。
const listing = $('[data-listing]');
if (listing) {
  const VIEW_KEY = 'gng:view';
  const serverBox = $('[data-list-server]', listing);
  const clientBox = $('[data-list-client]', listing);
  const countEl = $('[data-list-count]', listing);
  const count0 = countEl?.textContent || '';
  const panel = $('#lt-panel', listing);
  const tabs = $$('[role="tab"]', listing);
  const sel = $('[data-sort]', listing);
  const cat = listing.dataset.cat;
  const PER = 12;
  const TABS = tabs.map((t) => t.dataset.tab);
  const SORTS = sel ? [...sel.options].map((o) => o.value) : ['new'];
  let shown = PER, sorted = [], state = { tab: 'all', sort: 'new' };

  const setView = (v) => {
    listing.dataset.view = v;
    $$('[data-view]', listing).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    try { sessionStorage.setItem(VIEW_KEY, v); } catch {}
  };
  $$('[data-view]', listing).forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  let v0 = 'grid';
  try { v0 = sessionStorage.getItem(VIEW_KEY) || 'grid'; } catch {}
  setView(v0);

  const fromURL = () => {
    const q = new URLSearchParams(location.search);
    const tab = TABS.includes(q.get('tab')) ? q.get('tab') : 'all';
    const sort = SORTS.includes(q.get('sort')) ? q.get('sort') : 'new';
    return { tab, sort };
  };
  const toURL = (s, push) => {
    const url = new URL(location.href);
    if (s.tab === 'all') url.searchParams.delete('tab'); else url.searchParams.set('tab', s.tab);
    if (s.sort === 'new') url.searchParams.delete('sort'); else url.searchParams.set('sort', s.sort);
    if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
  };

  const render = () => {
    const label = state.tab === 'updated' ? '公開後に更新された記事はまだありません' : '該当する記事がありません';
    clientBox.innerHTML = sorted.length
      ? `<div class="agrid">${sorted.slice(0, shown).map((p) => cardHTML(p, { level: 3 })).join('')}</div>${shown < sorted.length ? `<button class="btn btn--ghost btn--more" type="button" data-more>さらに表示（残り${sorted.length - shown}件）</button>` : ''}`
      : emptyState('file', label, '「すべて」タブから全記事を見られます。');
    if (countEl) countEl.textContent = sorted.length ? `${sorted.length}件` : '';
    syncSaveButtons(clientBox);
  };

  const apply = async () => {
    const { tab, sort } = state;
    tabs.forEach((t) => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    const cur = tabs.find((t) => t.dataset.tab === tab);
    if (panel && cur) panel.setAttribute('aria-labelledby', cur.id);
    if (sel) { sel.value = sort; sel.closest('.sel').hidden = tab !== 'all'; }
    if (tab === 'all' && sort === 'new') {
      clientBox.hidden = true; serverBox.hidden = false;
      if (countEl) countEl.textContent = count0;
      return;
    }
    serverBox.hidden = true; clientBox.hidden = false;
    clientBox.innerHTML = skeleton(6);
    clientBox.setAttribute('aria-busy', 'true');
    try {
      const idx = await loadIndex();
      const list = cat ? idx.filter((p) => (p.k || []).map(String).includes(cat)) : idx.slice();
      const by = (k, asc = false) => (a, b) => (asc ? String(a[k]).localeCompare(String(b[k])) : String(b[k]).localeCompare(String(a[k])));
      if (tab === 'new') sorted = list.sort(by('d')).slice(0, PER);
      else if (tab === 'updated') sorted = list.filter((p) => String(p.m).slice(0, 10) !== String(p.d).slice(0, 10)).sort(by('m'));
      else if (tab === 'feature') sorted = list.sort((a, b) => (Number(b.r) || 0) - (Number(a.r) || 0)).slice(0, PER);
      else sorted = list.sort(sort === 'updated' ? by('m') : by('d', sort === 'old'));
      shown = PER;
      render();
    } catch {
      clientBox.innerHTML = errorState();
    }
    clientBox.removeAttribute('aria-busy');
  };
  const go = (next, push) => { state = { ...state, ...next }; toURL(state, push); apply(); };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => go({ tab: t.dataset.tab }, true));
    t.addEventListener('keydown', (e) => {
      const n = tabs.length;
      const k = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); tabs[k].focus(); go({ tab: tabs[k].dataset.tab }, true);
    });
  });
  sel?.addEventListener('change', () => go({ sort: sel.value }, false));
  clientBox.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { shown += PER; render(); }
    if (e.target.closest('[data-retry]')) apply();
  });
  window.addEventListener('popstate', () => { state = fromURL(); apply(); });

  // スマホ：並び替えと表示方法はボトムシートで選ぶ
  $('[data-list-sheet]', listing)?.addEventListener('click', () => {
    const sorts = sel ? [...sel.options].map((o) => [o.value, o.textContent]) : [];
    openSheet({
      title: '並び替え・表示',
      html: `${state.tab === 'all' && sorts.length ? `<fieldset class="opt"><legend>並び替え</legend>${chips('bs-sort', sorts, state.sort)}</fieldset>` : ''}<fieldset class="opt"><legend>表示方法</legend>${chips('bs-view', [['grid', 'カード'], ['list', 'リスト']], listing.dataset.view)}</fieldset>`,
      onOpen: (body) => body.addEventListener('change', (e) => {
        if (e.target.name === 'bs-sort') go({ sort: e.target.value }, false);
        if (e.target.name === 'bs-view') setView(e.target.value);
      }),
    });
  });

  state = fromURL();
  if (state.tab !== 'all' || state.sort !== 'new') apply();
}
