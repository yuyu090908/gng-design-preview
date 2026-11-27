// ---------- /night-radar/：NIGHT RADAR（地図・リスト・店舗プレビュー） ----------
// 地図の背景は OpenFreeMap（キー不要・OpenStreetMap のデータ）。印はすべて DOM の要素で描き、店舗は画面上の距離でまとめる（クラスタ）。
// 地図が読み込めない環境でも、リストだけで同じ情報を確認できる。
const LEVEL_L = { very_active: '非常に活発', active: '活発', normal: '通常', insufficient: 'データ不足' };
const MAP_STYLE = () => (document.documentElement.dataset.theme === 'light' ? 'https://tiles.openfreemap.org/styles/positron' : 'https://tiles.openfreemap.org/styles/dark');
const FALLBACK_STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#10131B' } }] };
function loadScript(src) { return new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ng; document.head.append(s); }); }
function loadCss(href) { if ($(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); }
const savedVenues = () => new Set(store.get('savedVenues', []));

(async function radarPage() {
  const root = $('[data-radar]');
  if (!root || !READY) return;
  const mapEl = $('[data-radar-map]', root), listEl = $('[data-radar-list]', root), panel = $('[data-radar-panel]', root), catSel = $('[data-rcat]', root);
  let data = null, map = null, markers = [], period = store.get('radarPeriod', '7d');
  if (!['24h', '7d', '30d'].includes(period)) period = '7d';

  // 表示の切り替え（地図・リスト・両方）
  const setView = (v) => { root.dataset.view = v; $$('[data-rview]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rview === v))); store.set('radarView', v); if (map) setTimeout(() => map.resize(), 50); };
  $$('[data-rview]', root).forEach((b) => b.addEventListener('click', () => setView(b.dataset.rview)));
  setView(store.get('radarView', matchMedia('(max-width: 767px)').matches ? 'list' : 'both'));
  $$('[data-rperiod]', root).forEach((b) => b.addEventListener('click', () => { period = b.dataset.rperiod; store.set('radarPeriod', period); $$('[data-rperiod]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(); }));
  $$('[data-rperiod]', root).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.rperiod === period)));
  catSel.addEventListener('change', () => { drawList(); drawMarkers(); });

  const venues = () => (data?.venues || []).filter((v) => !catSel.value || v.category === catSel.value);

  // ---------- リスト ----------
  function drawList() {
    if (!data) return;
    const cities = [...data.cities].sort((a, b) => (b.n || 0) - (a.n || 0));
    const active = cities.filter((c) => c.level !== 'insufficient');
    const vs = venues();
    listEl.innerHTML = `<section class="rdr__sec" aria-labelledby="rl-c"><h2 class="pulse__t" id="rl-c">${icon('pin', 18)}都市の活動度</h2>
<ol class="rlist">${(active.length ? active : cities.slice(0, 8)).map((c) => `<li><button class="rlist__b" type="button" data-rcity="${c.id}"><span class="lvl lvl--${esc(c.level)}" aria-hidden="true"></span><span class="rlist__n">${esc(c.name)}<small>${esc(c.country)}</small></span><span class="rlist__s">${esc(LEVEL_L[c.level])}${c.n ? `・${Number(c.n)}件` : ''}</span></button></li>`).join('')}</ol>
${active.length ? '' : '<p class="cside__empty">この期間は、色を付けられるほどの投稿がまだありません。</p>'}</section>
<section class="rdr__sec" aria-labelledby="rl-v"><h2 class="pulse__t" id="rl-v">${icon('star', 18)}地図に載っている店舗</h2>
${vs.length ? `<ol class="rlist">${vs.map((v) => `<li><button class="rlist__b" type="button" data-rvenue="${esc(v.id)}"><span class="rlist__ic">${icon('pin', 16)}</span><span class="rlist__n">${esc(v.name)}<small>${esc(VENUE_L[v.category] || '')}</small></span><span class="rlist__s">${v.reviews ? `${stars(v.overall)} ${Number(v.overall).toFixed(1)}（${v.reviews}件）` : '口コミなし'}</span></button></li>`).join('')}</ol>` : '<p class="cside__empty">位置が確認された店舗はまだありません。運営が確認した店舗から順に表示します。</p>'}</section>`;
    listEl.setAttribute('aria-busy', 'false');
  }
  listEl.addEventListener('click', (e) => {
    const c = e.target.closest('[data-rcity]'), v = e.target.closest('[data-rvenue]');
    if (c) { const x = data.cities.find((k) => String(k.id) === c.dataset.rcity); showPlace('city', x); if (map && x) map.flyTo({ center: [x.lng, x.lat], zoom: 11, essential: false }); }
    if (v) { const x = data.venues.find((k) => k.id === v.dataset.rvenue); showVenue(x); if (map && x) map.flyTo({ center: [x.lng, x.lat], zoom: 15 }); }
  });

  // ---------- プレビュー（PC は右、スマホは下からのシート） ----------
  function openPanel(html) {
    panel.innerHTML = `<button class="ibtn rdr__x" type="button" data-rclose aria-label="閉じる">${icon('x')}</button>${html}`;
    panel.hidden = false;
    $('[data-rclose]', panel).focus({ preventScroll: true });
  }
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-rclose]')) { panel.hidden = true; return; }
    const sv = e.target.closest('[data-rsave]');
    if (sv) { const s = savedVenues(); const id = sv.dataset.rsave; s.has(id) ? s.delete(id) : s.add(id); store.set('savedVenues', [...s]); sv.setAttribute('aria-pressed', String(s.has(id))); $('span', sv).textContent = s.has(id) ? '保存済み' : '保存する'; toast(s.has(id) ? 'この端末に保存しました' : '保存を外しました'); }
    const go = e.target.closest('[data-rfeed]');
    if (go) { store.set('filter', { region: JSON.parse(go.dataset.rfeed) }); store.set('tab', 'latest'); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) panel.hidden = true; });
  const indexHTML = (a) => (!a ? '' : a.status !== 'ok'
    ? `<p class="aix aix--na">${icon('activity', 16)}NIGHT ACTIVITY INDEX：<b>情報不足</b><small>直近6時間の NIGHT LIVE の報告が2人未満です</small></p>`
    : `<p class="aix">${icon('activity', 16)}NIGHT ACTIVITY INDEX：<b>${Number(a.score)}</b><small>直近6時間・報告 ${Number(a.reports)}件（${Number(a.reporters)}人）・一致度 ${Number(a.agreement)}%${a.event ? '・イベントの報告あり' : ''}</small></p>`);
  async function showPlace(kind, x) {
    if (!x) return;
    const region = kind === 'city' ? { country: null, city: x.id } : { country: null, city: x.city_id, area: x.id };
    const cityRow = kind === 'city' ? x : data.cities.find((c) => c.id === x.city_id);
    openPanel(`<p class="ph__en">${kind === 'city' ? 'CITY' : 'AREA'}</p><h2 class="rdr__pt">${esc(x.name)}${cityRow && kind !== 'city' ? `<small>${esc(cityRow.name)}</small>` : x.country ? `<small>${esc(x.country)}</small>` : ''}</h2>
<p class="rdr__lv"><span class="lvl lvl--${esc(x.level)}" aria-hidden="true"></span>${esc(LEVEL_L[x.level])}<small>${x.n ? `期間内の投稿 ${Number(x.n)}件・投稿者 ${Number(x.users)}人` : '期間内の投稿はありません'}</small></p>
<div data-raix><p class="cside__empty">NIGHT ACTIVITY INDEX を計算中…</p></div>
<p class="rdr__acts"><a class="btn btn--primary btn--sm" href="/community/" data-rfeed='${esc(JSON.stringify({ country: region.country, city: region.city, area: region.area || null }))}'>この地域の投稿を見る</a>${has('live') ? '<a class="btn btn--ghost btn--sm" href="/community/live/">NIGHT LIVE</a>' : ''}</p>`);
    // 都市の国コードを補う（コミュニティの絞り込みに使う）
    try {
      const [ci] = await select('cities', { select: 'country_code', id: `eq.${cityRow?.id || x.id}` });
      const a = $('[data-rfeed]', panel); if (a && ci) a.dataset.rfeed = JSON.stringify({ country: ci.country_code, city: cityRow?.id || x.id, area: kind === 'area' ? x.id : null });
      const ai = await rpc('activity_index', { p_kind: kind, p_id: String(x.id) });
      $('[data-raix]', panel).innerHTML = indexHTML(ai);
    } catch { const el = $('[data-raix]', panel); if (el) el.innerHTML = ''; }
  }
  async function showVenue(v) {
    if (!v) return;
    const saved = savedVenues().has(v.id);
    const art = safePath(v.article_path);
    openPanel(`<p class="ph__en">${esc(VENUE_L[v.category] || '')}</p><h2 class="rdr__pt">${esc(v.name)}</h2>
<p class="rdr__rate">${v.reviews ? `${stars(v.overall)}<b>${Number(v.overall).toFixed(1)}</b><small>口コミ ${Number(v.reviews)}件・最新 ${esc(ago(v.last_review_at))}</small>` : '<small>まだ口コミがありません</small>'}</p>
${v.latest ? `<blockquote class="rdr__q">${esc(v.latest)}${v.latest.length >= 80 ? '…' : ''}</blockquote>` : ''}
<div data-raix><p class="cside__empty">NIGHT ACTIVITY INDEX を計算中…</p></div>
<p class="rdr__acts">${art ? `<a class="btn btn--primary btn--sm" href="${esc(art)}">詳細を見る</a>` : ''}<a class="btn btn--ghost btn--sm" href="/community/new/?type=review&amp;venue=${esc(v.id)}">${icon('pencil', 14)}口コミを書く</a><button class="btn btn--ghost btn--sm" type="button" data-rsave="${esc(v.id)}" aria-pressed="${saved}">${icon('bookmark', 14)}<span>${saved ? '保存済み' : '保存する'}</span></button></p>`);
    try { $('[data-raix]', panel).innerHTML = indexHTML(await rpc('activity_index', { p_kind: 'venue', p_id: v.id })); } catch { const el = $('[data-raix]', panel); if (el) el.innerHTML = ''; }
  }

  // ---------- 地図 ----------
  async function initMap() {
    const js = root.dataset.vendorJs, css = root.dataset.vendorCss, worker = root.dataset.vendorWorker;
    if (!js || !window.WebGLRenderingContext) throw new Error('no map');
    loadCss(css);
    await loadScript(js);
    const ml = window.maplibregl;
    ml.setWorkerUrl(worker);
    map = new ml.Map({ container: mapEl, style: MAP_STYLE(), center: [115, 20], zoom: 2.4, minZoom: 1.5, maxZoom: 17, attributionControl: { compact: true }, cooperativeGestures: matchMedia('(pointer: coarse)').matches });
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
    let styled = false;
    map.on('styledata', () => { styled = true; });
    map.on('error', () => { if (!styled) { styled = true; map.setStyle(FALLBACK_STYLE); } });
    map.on('moveend', drawMarkers);
    map.on('zoomend', drawMarkers);
  }
  // 画面上で近い店舗をまとめる（距離 44px 以内）
  function clusters(list) {
    const out = [];
    list.forEach((v) => {
      const p = map.project([v.lng, v.lat]);
      const c = out.find((k) => Math.hypot(k.x - p.x, k.y - p.y) < 44);
      if (c) { c.items.push(v); } else out.push({ x: p.x, y: p.y, items: [v] });
    });
    return out;
  }
  function drawMarkers() {
    if (!map || !data) return;
    markers.forEach((m) => m.remove());
    markers = [];
    const ml = window.maplibregl;
    const z = map.getZoom();
    const add = (lnglat, el) => { const m = new ml.Marker({ element: el }).setLngLat(lnglat).addTo(map); markers.push(m); };
    // 活動度：ズームが小さいときは都市、大きいときはエリア
    const places = z < 9 ? data.cities.map((c) => ({ ...c, kind: 'city' })) : data.areas.map((a) => ({ ...a, kind: 'area' }));
    places.forEach((x) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `rmk rmk--heat lvl--${x.level}`;
      el.dataset.size = x.level === 'very_active' ? 'l' : x.level === 'active' ? 'm' : 's';
      el.setAttribute('aria-label', `${x.name}：${LEVEL_L[x.level]}`);
      el.innerHTML = `<span class="rmk__l">${esc(x.name)}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); showPlace(x.kind, x); });
      add([x.lng, x.lat], el);
    });
    // 店舗（ズーム 9 以上）
    if (z >= 9) clusters(venues()).forEach((c) => {
      const el = document.createElement('button');
      el.type = 'button';
      if (c.items.length > 1) {
        el.className = 'rmk rmk--cluster';
        el.textContent = String(c.items.length);
        el.setAttribute('aria-label', `店舗 ${c.items.length}件。拡大する`);
        el.addEventListener('click', (e) => { e.stopPropagation(); map.easeTo({ center: map.unproject([c.x, c.y]), zoom: Math.min(17, map.getZoom() + 2) }); });
        add(map.unproject([c.x, c.y]), el);
      } else {
        const v = c.items[0];
        el.className = 'rmk rmk--venue';
        el.innerHTML = icon('pin', 18);
        el.setAttribute('aria-label', `${v.name}（${VENUE_L[v.category] || ''}）`);
        el.addEventListener('click', (e) => { e.stopPropagation(); showVenue(v); });
        add([v.lng, v.lat], el);
      }
    });
  }

  async function load() {
    listEl.setAttribute('aria-busy', 'true');
    try { data = await rpc('radar', { p_period: period }); }
    catch (e) { listEl.innerHTML = errorHTML(e); listEl.setAttribute('aria-busy', 'false'); return; }
    drawList();
    drawMarkers();
  }
  try { await initMap(); } catch { $('[data-radar-fail]', root).hidden = false; root.classList.add('is-nomap'); }
  await load();
})();
