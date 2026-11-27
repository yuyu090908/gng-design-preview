// ---------- /community/pulse/：NIGHT PULSE（トレンド。サーバーの集計関数 pulse() の結果をそのまま表示） ----------
(async function pulsePage() {
  const box = $('[data-pulse]');
  if (!box || !READY) return;
  const EMPTY = 'まだ集計できるほどのデータがありません';
  const postLink = (x) => `/community/post/?id=${encodeURIComponent(x.id)}`;
  const R = {
    posts: (x) => `<a href="${postLink(x)}"><span>${esc(x.title)}</span><small>${esc(TYPE_L[x.type] || '')}・参考 ${Number(x.helpful)}</small></a>`,
    helpful_reviews: (x) => `<a href="${postLink(x)}"><span>${esc(x.title)}</span><small>参考 ${Number(x.helpful)}</small></a>`,
    rising: (x) => { const to = safePath(x.article_path); const name = esc(x.name || (to ? '記事' : '')); const delta = `<small>${Number(x.before).toFixed(1)} → <b>${Number(x.now).toFixed(1)}</b>（${Number(x.n)}件）</small>`; return to ? `<a href="${esc(to)}"><span data-art="${esc(to)}">${name}</span>${delta}</a>` : `<span class="cside__row"><span>${name}</span>${delta}</span>`; },
    areas: (x) => `<span class="cside__row"><span>${esc(x.name)}</span><small>${Number(x.n)}件（前の期間 ${Number(x.before)}件）・${Number(x.users)}人</small></span>`,
    events: (x) => `<a href="${postLink(x)}"><span>${esc(x.title)}</span><small>参考 ${Number(x.helpful)}</small></a>`,
    new_venues: (x) => `<span class="cside__row"><span>${esc(x.name)}</span><small>${esc(VENUE_L[x.category] || '')}</small></span>`,
  };
  async function load(period) {
    box.setAttribute('aria-busy', 'true');
    try {
      const d = await rpc('pulse', { p_period: period });
      for (const k of Object.keys(R)) {
        const el = $(`[data-pulse-sec="${k}"]`);
        const rows = d[k] || [];
        el.innerHTML = rows.length ? rows.map((x) => `<li>${R[k](x)}</li>`).join('') : `<li class="cside__empty">${EMPTY}</li>`;
      }
      // 記事の名前を補う
      const A = await articles();
      $$('[data-art]', box).forEach((s) => { const a = A.find((x) => x.u === s.dataset.art); if (a && (!s.textContent || s.textContent === '記事')) s.textContent = a.t; });
      $('[data-pulse-gen]').textContent = `集計：${new Date(d.generated_at).toLocaleString('ja-JP')}`;
    } catch (e) { box.innerHTML = errorHTML(e); }
    finally { box.setAttribute('aria-busy', 'false'); }
  }
  const btns = $$('[data-period]');
  const set = (p) => { btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === p))); store.set('pulse', p); load(p); };
  btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.period)));
  set(['24h', '7d', '30d'].includes(store.get('pulse')) ? store.get('pulse') : '7d');
})();
