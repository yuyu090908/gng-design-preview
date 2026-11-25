// ---------- サイト内検索（索引はこのサイトの JSON。入力内容は外部に送信しない） ----------
const results = $('[data-search-results]');
if (results) {
  const input = $('#q');
  const catSel = $('[data-search-cat]');
  const status = $('#search-status');
  const idle = $('[data-search-idle]');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKC');
  const params = new URLSearchParams(location.search);
  input.value = (params.get('q') || '').slice(0, 80);
  if (catSel && params.get('cat')) catSel.value = params.get('cat');
  let shown = 24, hits = [];
  const draw = () => {
    results.innerHTML = `<div class="agrid">${hits.slice(0, shown).map((p) => cardHTML(p, { level: 2 })).join('')}</div>${shown < hits.length ? `<button class="btn btn--ghost btn--more" type="button" data-more>さらに表示（残り${hits.length - shown}件）</button>` : ''}`;
    syncSaveButtons(results);
  };
  const run = async () => {
    const q = input.value.trim().slice(0, 80);
    const cat = catSel?.value || '';
    const url = new URL(location.href);
    q ? url.searchParams.set('q', q) : url.searchParams.delete('q');
    cat ? url.searchParams.set('cat', cat) : url.searchParams.delete('cat');
    history.replaceState(null, '', url);
    if (!q && !cat) { results.innerHTML = ''; idle.hidden = false; status.textContent = '店名・エリア・キーワードを入力してください'; return; }
    idle.hidden = true;
    results.setAttribute('aria-busy', 'true');
    if (!indexPromise) results.innerHTML = skeleton(6);
    try {
      const idx = await loadIndex();
      const words = norm(q).split(/\s+/).filter(Boolean);
      hits = idx.filter((p) => (!cat || (p.k || []).map(String).includes(cat)) && words.every((w) => norm(`${p.t} ${p.e} ${p.c}`).includes(w)));
      shown = 24;
      const label = [q && `「${q}」`, cat && catSel.selectedOptions[0]?.textContent].filter(Boolean).join('・');
      status.textContent = `${label}の検索結果：${hits.length}件`;
      if (hits.length) draw();
      else results.innerHTML = emptyState('search', '該当する記事が見つかりませんでした', 'キーワードを短くするか、別の言葉でお試しください。');
    } catch {
      results.innerHTML = errorState();
      status.textContent = '検索の準備に失敗しました';
    }
    results.removeAttribute('aria-busy');
  };
  let timer;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 180); });
  input.form.addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); run(); });
  catSel?.addEventListener('change', run);
  results.addEventListener('click', (e) => {
    if (e.target.closest('[data-more]')) { shown += 24; draw(); }
    if (e.target.closest('[data-retry]')) run();
  });
  if (input.value || catSel?.value) run();
  if (!input.value && isDesktop()) input.focus();
}
