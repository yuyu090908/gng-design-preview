// ---------- /community/：タブ・絞り込み・フィード・新着のお知らせ・右の補助情報 ----------
(async function feedPage() {
  const feed = $('[data-feed]');
  if (!feed || !READY) return;
  const listEl = $('[data-feed-list]', feed), moreBtn = $('[data-feed-more]', feed);
  const form = $('[data-filter-form]');
  const PAGE = 15;
  let followingIds = null;
  let tab = store.get('tab', 'latest'), cursor = null, offset = 0, newest = null, loading = false, prefRegion = null;
  const saved = store.get('filter', {});

  // ログイン中は保存済みの「よく見る地域」を For You に使う
  if (uid()) {
    const [pr] = await select('user_preferences', { user_id: `eq.${uid()}`, select: 'country_code,city_id,area_id' }).catch(() => []);
    if (pr && pr.country_code) prefRegion = { country: pr.country_code, city: pr.city_id, area: pr.area_id };
  }
  const region = await initRegion($('[data-region="feed"]'), saved.region || {}, () => apply());
  if (saved.category) form.category.value = saved.category;
  if (saved.type) form.type.value = saved.type;
  form.addEventListener('change', (e) => { if (!e.target.closest('[data-region]')) apply(); });
  form.addEventListener('reset', () => setTimeout(() => { region.set({}); apply(); }));

  const summary = () => {
    const parts = [region.label(), form.category.selectedIndex ? form.category.selectedOptions[0].textContent : '', form.type.selectedIndex ? form.type.selectedOptions[0].textContent : ''].filter(Boolean);
    $('[data-filter-summary]').textContent = parts.join('・') || 'すべての地域';
  };
  function filters() {
    let r = region.get();
    if (tab === 'foryou' && !r.country && prefRegion) r = prefRegion;
    const f = { select: POST_SELECT, status: 'eq.published' };
    if (r.country) f.country_code = `eq.${r.country}`;
    if (r.city) f.city_id = `eq.${r.city}`;
    if (r.area) f.area_id = `eq.${r.area}`;
    if (form.category.value) f.category = `eq.${form.category.value}`;
    const t = tab === 'review' ? 'review' : tab === 'question' ? 'question' : form.type.value;
    if (t) f.type = `eq.${t}`;
    if (tab === 'following') f.author_id = inList(followingIds.length ? followingIds : ['00000000-0000-0000-0000-000000000000']);
    if (tab === 'popular') { f.published_at = `gte.${new Date(Date.now() - 30 * 86400000).toISOString()}`; f.order = 'helpful_count.desc,published_at.desc,id.desc'; }
    else f.order = 'published_at.desc,id.desc';
    return f;
  }
  function apply() {
    store.set('filter', { region: region.get(), category: form.category.value, type: form.type.value });
    summary();
    load(true);
  }
  async function load(reset = false) {
    if (loading) return;
    loading = true;
    feed.setAttribute('aria-busy', 'true');
    if (reset) { cursor = null; offset = 0; listEl.innerHTML = `<div aria-hidden="true">${'<div class="pc pc--sk"><div class="pc__hd"><span class="sk-c"></span><span class="sk-l"></span></div><span class="sk-l sk-l--w"></span><span class="sk-l"></span></div>'.repeat(2)}</div>`; $('[data-new-banner]').hidden = true; }
    if (tab === 'following') {
      const stop = (html) => { listEl.innerHTML = html; moreBtn.hidden = true; loading = false; feed.setAttribute('aria-busy', 'false'); };
      if (!uid()) return stop(stateHTML('users', 'ログインすると、フォローした人の投稿がここに表示されます', '', `<a class="btn btn--primary" href="${loginHref()}">ログイン</a>`));
      if (!followingIds) followingIds = (await select('user_follows', { select: 'followee_id', follower_id: `eq.${uid()}`, limit: 500 }).catch(() => [])).map((r) => r.followee_id);
      if (!followingIds.length) return stop(stateHTML('userplus', 'まだ誰もフォローしていません', '参考になった投稿の投稿者をフォローすると、ここにその人の新しい投稿が並びます。'));
    }
    const f = { ...filters(), limit: PAGE };
    if (tab === 'popular') f.offset = offset;
    else if (cursor) f.or = `(published_at.lt.${cursor.t},and(published_at.eq.${cursor.t},id.lt.${cursor.id}))`;
    try {
      const rows = await select('post_feed', f);
      if (reset && !rows.length) {
        const filtered = region.get().country || form.category.value || form.type.value || tab === 'review' || tab === 'question';
        listEl.innerHTML = stateHTML('message', filtered ? 'この条件の投稿はまだありません' : 'まだ投稿がありません', filtered ? '条件を変えるか、最初の投稿をしてみませんか。' : '最初の投稿をして、コミュニティを始めましょう。', '<a class="btn btn--primary" href="/community/new/">投稿する</a>');
      } else {
        await renderPosts(rows, listEl, { append: !reset });
      }
      if (reset) newest = rows[0]?.published_at || newest || new Date().toISOString();
      const last = rows[rows.length - 1];
      if (last) cursor = { t: last.published_at, id: last.id };
      offset += rows.length;
      moreBtn.hidden = rows.length < PAGE;
      if (tab === 'foryou' && reset && !region.get().country) {
        listEl.insertAdjacentHTML('afterbegin', `<p class="cside__empty">${prefRegion ? 'プロフィールで選んだ地域の新しい投稿です。' : 'よく見る地域を選ぶと、その地域の投稿を優先して表示します。'}<a class="tbtn" href="/community/me/#settings">地域を設定${icon('right', 14)}</a></p>`);
      }
    } catch (e) {
      if (reset) listEl.innerHTML = errorHTML(e); else toast(errText(e));
    } finally { loading = false; feed.setAttribute('aria-busy', 'false'); }
  }
  moreBtn.addEventListener('click', () => busy(moreBtn, () => load(false)));

  // タブ
  const tabs = $$('[data-feed-tabs] [data-tab]');
  if (!tabs.some((b) => b.dataset.tab === tab)) tab = 'latest';
  const setTab = (k) => { tab = k; store.set('tab', k); tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === k))); load(true); };
  tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
  summary();
  load(true);

  // 新着のお知らせ：最新タブを見ているときだけ 60 秒ごとに件数を確認する。画面は勝手に動かさない
  const banner = $('[data-new-banner]');
  setInterval(async () => {
    if (document.hidden || tab !== 'latest' || !newest) return;
    try {
      const rows = await select('post_feed', { ...filters(), select: 'id', published_at: `gt.${newest}`, limit: 20 });
      if (rows.length) { $('[data-new-count]', banner).textContent = `新しい投稿が ${rows.length >= 20 ? '20件以上' : rows.length + '件'} あります`; banner.hidden = false; }
    } catch {}
  }, 60000);
  $('[data-new-load]').addEventListener('click', () => { load(true); $('#feed').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });

  // 右の補助情報（実データの集計だけ。足りなければそう表示する）
  (async () => {
    const pop = $('[data-side-popular]'), areasEl = $('[data-side-areas]');
    try {
      const rows = await select('post_feed', { select: 'id,title,body,helpful_count', status: 'eq.published', helpful_count: 'gt.0', published_at: `gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`, order: 'helpful_count.desc,published_at.desc', limit: 5 });
      pop.innerHTML = rows.length ? rows.map((p) => `<li><a href="/community/post/?id=${esc(p.id)}"><span>${esc((p.title || p.body).slice(0, 40))}</span><small>${Number(p.helpful_count)}</small></a></li>`).join('') : '<li class="cside__empty">今週はまだありません</li>';
    } catch { pop.innerHTML = '<li class="cside__empty">読み込めませんでした</li>'; }
    try {
      const rows = await select('post_feed', { select: 'city_id,city_name,country_name', status: 'eq.published', city_id: 'not.is.null', published_at: `gte.${new Date(Date.now() - 30 * 86400000).toISOString()}`, limit: 500 });
      const m = new Map();
      rows.forEach((r) => { const k = r.city_id; const v = m.get(k) || { n: 0, name: `${r.city_name}（${r.country_name}）` }; v.n++; m.set(k, v); });
      const top = [...m.values()].sort((a, b) => b.n - a.n).slice(0, 5);
      areasEl.innerHTML = top.length ? top.map((a) => `<li><span class="cside__row"><span>${esc(a.name)}</span><small>${a.n}件</small></span></li>`).join('') : '<li class="cside__empty">まだ集計できるほどの投稿がありません</li>';
    } catch { areasEl.innerHTML = '<li class="cside__empty">読み込めませんでした</li>'; }
  })();
})();
