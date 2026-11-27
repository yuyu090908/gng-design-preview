// ---------- /community/live/：NIGHT LIVE（24 時間以内のライブ投稿と、いまの様子の共有） ----------
(async function livePage() {
  const feed = $('[data-live-feed]');
  if (!feed || !READY) return;
  const listEl = $('[data-live-list]', feed), moreBtn = $('[data-live-more]', feed);
  const PAGE = 15;
  const since = () => new Date(Date.now() - 24 * 3600000).toISOString();
  let cursor = null, newest = null, loading = false;
  const saved = store.get('liveFilter', {});
  const region = await initRegion($('[data-region="livef"]'), saved, () => { store.set('liveFilter', region.get()); summary(); load(true); });
  const summary = () => { $('[data-filter-summary]').textContent = region.label() || 'すべての地域'; };
  function filters() {
    const r = region.get();
    const f = { select: POST_SELECT, status: 'eq.published', type: 'eq.live', published_at: `gte.${since()}`, order: 'published_at.desc,id.desc' };
    if (r.country) f.country_code = `eq.${r.country}`;
    if (r.city) f.city_id = `eq.${r.city}`;
    if (r.area) f.area_id = `eq.${r.area}`;
    return f;
  }
  async function load(reset = false) {
    if (loading) return;
    loading = true; feed.setAttribute('aria-busy', 'true');
    if (reset) { cursor = null; $('[data-new-banner]').hidden = true; }
    const f = { ...filters(), limit: PAGE };
    if (cursor) f.or = `(published_at.lt.${cursor.t},and(published_at.eq.${cursor.t},id.lt.${cursor.id}))`;
    try {
      const rows = await select('post_feed', f);
      if (reset && !rows.length) listEl.innerHTML = stateHTML('radio', region.get().country ? 'この地域の24時間以内の投稿はまだありません' : '24時間以内のライブ投稿はまだありません', '今夜出かけたら、お店や街の様子を共有してみませんか。');
      else await renderPosts(rows, listEl, { append: !reset });
      if (reset) newest = rows[0]?.published_at || new Date().toISOString();
      const last = rows[rows.length - 1];
      if (last) cursor = { t: last.published_at, id: last.id };
      moreBtn.hidden = rows.length < PAGE;
    } catch (e) { if (reset) listEl.innerHTML = errorHTML(e); else toast(errText(e)); }
    finally { loading = false; feed.setAttribute('aria-busy', 'false'); }
  }
  moreBtn.addEventListener('click', () => busy(moreBtn, () => load(false)));
  summary();
  load(true);

  // 新着：30 秒ごとに件数だけ確認し、押したときに表示する（画面は勝手に動かさない）
  const banner = $('[data-new-banner]');
  setInterval(async () => {
    if (document.hidden || !newest) return;
    try {
      const rows = await select('post_feed', { ...filters(), select: 'id', published_at: `gt.${newest}`, limit: 20 });
      if (rows.length) { $('[data-new-count]', banner).textContent = `新しいライブ投稿が ${rows.length >= 20 ? '20件以上' : rows.length + '件'} あります`; banner.hidden = false; }
    } catch {}
  }, 30000);
  $('[data-new-load]').addEventListener('click', () => load(true));

  // 24 時間の投稿が多い都市（実際の件数。2 件以上の都市だけ）
  (async () => {
    const el = $('[data-live-cities]');
    try {
      const rows = await select('post_feed', { select: 'city_id,city_name,country_name', status: 'eq.published', type: 'eq.live', published_at: `gte.${since()}`, city_id: 'not.is.null', limit: 500 });
      const m = new Map();
      rows.forEach((r) => { const v = m.get(r.city_id) || { n: 0, name: `${r.city_name}（${r.country_name}）` }; v.n++; m.set(r.city_id, v); });
      const top = [...m.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
      el.innerHTML = top.length ? top.map((a) => `<li><span class="cside__row"><span>${esc(a.name)}</span><small>${a.n}件</small></span></li>`).join('') : '<li class="cside__empty">まだ集計できるほどの投稿がありません</li>';
    } catch { el.innerHTML = '<li class="cside__empty">読み込めませんでした</li>'; }
  })();

  // 共有フォーム（ログイン中のみ表示）
  const form = $('[data-live-form]');
  if (!form) return;
  const err = $('[data-form-error]', form), venueSel = $('[data-live-venue]', form);
  const reg = await initRegion($('[data-region="live"]', form), saved, async () => {
    const r = reg.get();
    venueSel.innerHTML = '<option value="">店舗を選ばない</option>'; venueSel.disabled = true;
    if (!r.city) return;
    const vs = await select('venues', { select: 'id,name,category', status: 'eq.published', city_id: `eq.${r.city}`, order: 'name', limit: 200 }).catch(() => []);
    venueSel.insertAdjacentHTML('beforeend', vs.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}（${esc(VENUE_L[v.category] || '')}）</option>`).join(''));
    venueSel.disabled = !vs.length;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const r = reg.get();
    const body = form.body.value.trim();
    if (!r.city) { err.textContent = '都市を選んでください。'; err.hidden = false; return; }
    if (body.length < 5) { err.textContent = 'いまの様子を5文字以上で書いてください。'; err.hidden = false; form.body.focus(); return; }
    const v = (n) => form.querySelector(`[name="${n}"]:checked`)?.value || '';
    try {
      await busy($('[type=submit]', form), () => rpc('post_live', { p: { country_code: r.country, city_id: r.city, area_id: r.area, venue_id: venueSel.value || null, body, crowd: v('crowd'), vibe: v('vibe'), open_status: v('open_status') || 'unknown', event_now: form.event_now.checked, price_note: form.price_note.value } }));
      form.reset(); reg.set(r);
      $('[data-live-compose]').open = false;
      toast('共有しました');
      load(true);
    } catch (ex) { err.textContent = errText(ex); err.hidden = false; }
  });
})();
