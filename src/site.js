// メニュー（ドロワー）、目次の折りたたみ、サイト内検索、ページ先頭へ戻るボタン
{
  // ---- メニュー ----
  const drawer = document.getElementById('drawer');
  const btn = document.querySelector('.menu-btn');
  if (drawer && btn) {
    const open = (v) => {
      drawer.hidden = !v;
      btn.setAttribute('aria-expanded', String(v));
      document.documentElement.classList.toggle('is-locked', v);
      if (v) drawer.querySelector('input')?.focus({ preventScroll: true }); else btn.focus({ preventScroll: true });
    };
    btn.addEventListener('click', () => open(true));
    drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) open(false); });
  }

  // ---- 目次：スマホでは最初は大見出しだけ ----
  const toc = document.querySelector('.toc');
  const tbtn = toc?.querySelector('.toc__btn');
  if (toc && tbtn) {
    const set = (folded) => {
      toc.classList.toggle('is-folded', folded);
      tbtn.textContent = folded ? 'すべて表示' : '見出しだけ';
      tbtn.setAttribute('aria-expanded', String(!folded));
    };
    set(window.matchMedia('(max-width: 767px)').matches);
    tbtn.addEventListener('click', () => set(!toc.classList.contains('is-folded')));
  }

  // ---- サイト内検索 ----
  const results = document.getElementById('search-results');
  if (results) {
    const input = document.getElementById('q');
    const status = document.getElementById('search-status');
    const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = (s) => s.toLowerCase().normalize('NFKC');
    let index = null;
    const run = async () => {
      const q = input.value.trim();
      const url = new URL(location.href);
      if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
      history.replaceState(null, '', url);
      if (!q) { results.innerHTML = ''; status.textContent = 'キーワードを入力してください'; return; }
      index ||= await fetch('/search-index.json').then((r) => r.json());
      const words = norm(q).split(/\s+/).filter(Boolean);
      const hits = index.filter((p) => { const s = norm(p.t + ' ' + p.e + ' ' + p.c); return words.every((w) => s.includes(w)); });
      status.textContent = `「${q}」の検索結果：${hits.length} 件`;
      results.innerHTML = hits.slice(0, 60).map((p) => `<article class="card"><a href="${p.u}"><span class="card__img"><img src="${esc(p.i)}" alt="" width="520" height="300" loading="lazy"></span><span class="card__body">${p.c ? `<span class="tag">${esc(p.c)}</span>` : ''}<span class="card__t">${esc(p.t)}</span><time>${p.d}</time></span></a></article>`).join('');
    };
    input.value = new URLSearchParams(location.search).get('q') || '';
    let timer;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
    input.form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    if (input.value) run(); else input.focus();
  }

  // ---- ページ先頭へ ----
  const top = document.querySelector('.totop');
  if (top) {
    const onScroll = () => top.classList.toggle('is-on', window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    top.addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0 }); });
  }
}
