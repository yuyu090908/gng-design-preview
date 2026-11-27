// ---------- /night-ai/：NIGHT AI ----------
// 1) 入力文を「条件」に変える：AI が有効なら Edge Function（Claude）で、無効なら下の規則で。
// 2) 条件で、サイトの記事とコミュニティの実際の口コミだけを検索する。店舗名・評価・営業時間を作ることはない。
const AI_FN = () => `${CFG.url}/functions/v1/night-ai`;
const CAT_WORDS = { bar: ['バー', 'bar', 'ラウンジバー'], club: ['クラブ', 'club', 'ナイトクラブ'], karaoke: ['カラオケ', 'karaoke'], cabaret: ['キャバクラ', 'ラウンジ', 'キャバレー'], soapland: ['ソープ'], delivery: ['デリヘル', 'デリバリー'], massage: ['マッサージ', 'massage', 'スパ'], restaurant: ['レストラン', '飲食', '食事', 'ダイニング'] };
const CUR_WORDS = [[/バーツ|thb|฿/i, 'THB'], [/ウォン|krw|₩/i, 'KRW'], [/円|jpy|¥/i, 'JPY'], [/ドル|usd|\$/i, 'USD'], [/ペソ|php/i, 'PHP'], [/ドン|vnd/i, 'VND'], [/元|twd|台湾ドル/i, 'TWD'], [/リンギット|myr/i, 'MYR']];
const ILLEGAL = /(未成年|子ども|児童|薬物|ドラッグ|覚せい|大麻|違法|売春|援交|本番|裏オプ)/;

async function ruleFilters(q) {
  const R = await regions();
  const s = q.toLowerCase();
  const f = { country: null, city: null, area: null, category: null, budget_amount: null, budget_currency: null, beginner: /初め|初心者|はじめて|初体験/.test(q), calm: /落ち着|静か|ゆっくり|大人/.test(q), high_rated: /評価が高|人気|おすすめ|評判/.test(q), recent_reviews: /最近|最新|新しい口コミ/.test(q), events_today: /今日|今夜|イベント/.test(q) && /イベント/.test(q), keywords: [], out_of_scope: ILLEGAL.test(q) };
  const area = R.areas.find((a) => q.includes(a.name_ja)); if (area) { f.area = area.id; f.city = area.city_id; }
  const city = R.cities.find((c) => q.includes(c.name_ja) || s.includes(String(c.name_en || '').toLowerCase() || '\u0000')) || (f.city && R.cities.find((c) => c.id === f.city));
  if (city) { f.city = city.id; f.country = city.country_code; }
  const country = !f.country && R.countries.find((c) => q.includes(c.name_ja)); if (country) f.country = country.code;
  for (const [k, ws] of Object.entries(CAT_WORDS)) if (ws.some((w) => s.includes(w.toLowerCase()))) { f.category = k; break; }
  const m = q.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(万|千)?\s*(バーツ|thb|฿|ウォン|krw|円|jpy|ドル|usd|ペソ|php|ドン|vnd|元|twd|リンギット|myr)?/i);
  if (m && /予算|以内|以下|まで|円|バーツ|ウォン|ドル|ペソ|ドン|元/.test(q)) {
    f.budget_amount = Number(m[1]) * (m[2] === '万' ? 10000 : m[2] === '千' ? 1000 : 1);
    f.budget_currency = (CUR_WORDS.find(([re]) => re.test(m[3] || q)) || [null, null])[1];
  }
  return f;
}

// 条件 → 検索（実データだけ）
async function aiSearch(f) {
  const R = await regions();
  const out = { venues: [], articles: [], events: [], areas: [] };
  const cityRow = f.city ? R.cities.find((c) => String(c.id) === String(f.city) || c.slug === f.city) : null;
  const cityName = cityRow?.name_ja || '';
  const cityId = cityRow?.id ?? null;
  // 口コミ（対象ごとの件数・評価・利用金額・本文の手がかり）
  const rq = { select: 'venue_id,article_path,body,spend_amount,spend_currency,published_at,ratings', type: 'eq.review', status: 'eq.published', order: 'published_at.desc', limit: 1000 };
  if (cityId) rq.city_id = `eq.${cityId}`; else if (f.country) rq.country_code = `eq.${f.country}`;
  const reviews = await select('post_feed', rq).catch(() => []);
  const by = new Map();
  reviews.forEach((r) => {
    const k = r.venue_id || r.article_path; if (!k) return;
    const t = by.get(k) || { key: k, venue_id: r.venue_id, article_path: r.article_path, n: 0, sum: 0, recent: 0, spends: [], calm: 0, beginner: 0, last: r.published_at };
    t.n++; t.sum += Number(r.ratings?.overall || 0);
    if (Date.now() - new Date(r.published_at) < 30 * 86400000) t.recent++;
    if (r.spend_amount != null && (!f.budget_currency || r.spend_currency === f.budget_currency)) t.spends.push(Number(r.spend_amount));
    if (/落ち着|静か|ゆっくり/.test(r.body)) t.calm++;
    if (/初め|初心者|はじめて/.test(r.body)) t.beginner++;
    by.set(k, t);
  });
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const vq = { select: 'id,name,category,city_id,article_path', status: 'eq.published', limit: 500 };
  if (cityId) vq.city_id = `eq.${cityId}`; else if (f.country) vq.country_code = `eq.${f.country}`;
  if (f.category) vq.category = `eq.${f.category}`;
  const vs = await select('venues', vq).catch(() => []);
  const A = await articles();
  const score = (t) => (t ? (t.sum / t.n) * 2 + Math.min(t.n, 10) * 0.3 + (f.recent_reviews ? t.recent : 0) + (f.calm ? t.calm * 2 : 0) + (f.beginner ? t.beginner * 2 : 0) : 0);
  const fits = (t) => {
    if (f.budget_amount && t) { const md = median(t.spends); if (md != null && md > f.budget_amount) return false; }
    if (f.calm && (!t || !t.calm)) return false;
    if (f.beginner && (!t || !t.beginner)) return false;
    if ((f.high_rated || f.recent_reviews) && (!t || t.n < 1)) return false;
    return true;
  };
  out.venues = vs.map((v) => ({ ...v, t: by.get(v.id) })).filter((v) => fits(v.t)).sort((a, b) => score(b.t) - score(a.t)).slice(0, 8);
  // 記事：都市名・種類の言葉が題名か抜粋にあるもの
  const catWords = f.category ? CAT_WORDS[f.category] : [];
  const kws = (f.keywords || []).filter((k) => k && k.length >= 2).slice(0, 5);
  out.articles = A.filter((a) => {
    const txt = `${a.t} ${a.e || ''} ${a.c || ''}`;
    if (cityName && !txt.includes(cityName)) return false;
    if (catWords.length && !catWords.some((w) => txt.includes(w))) return false;
    if (kws.length && !kws.some((k) => txt.includes(k)) && !cityName && !catWords.length) return false;
    return !!(cityName || catWords.length || kws.length);
  }).map((a) => ({ ...a, t2: by.get(a.u) })).filter((a) => fits(a.t2) || (!f.calm && !f.beginner && !f.high_rated && !f.recent_reviews && !f.budget_amount)).sort((a, b) => score(b.t2) - score(a.t2)).slice(0, 8);
  if (f.events_today) {
    const eq = { select: 'id,title,body,published_at,city_name,country_name', type: 'eq.event', status: 'eq.published', published_at: `gte.${new Date(Date.now() - 7 * 86400000).toISOString()}`, order: 'published_at.desc', limit: 10 };
    if (cityId) eq.city_id = `eq.${cityId}`;
    out.events = await select('post_feed', eq).catch(() => []);
  }
  if (/エリア|area/i.test(f.keywords?.join(' ') || '') || f._areas) out.areas = ((await rpc('pulse', { p_period: '7d' }).catch(() => ({})))?.areas) || [];
  out.cityName = cityName; out.median = median;
  return out;
}

function filterChips(f) {
  const R = [];
  if (f._cityName) R.push(f._cityName);
  if (f.category) R.push(VENUE_L[f.category]);
  if (f.budget_amount) R.push(`予算 ${Number(f.budget_amount).toLocaleString('ja-JP')} ${f.budget_currency || ''} 以下`);
  if (f.high_rated) R.push('評価が高い'); if (f.recent_reviews) R.push('最近の口コミ'); if (f.calm) R.push('落ち着いた'); if (f.beginner) R.push('初心者向け'); if (f.events_today) R.push('イベント');
  return R.length ? `<p class="ai__chips">${R.map((x) => `<span class="ptag">${esc(x)}</span>`).join('')}</p>` : '';
}
function resultHTML(f, r) {
  const reason = (t) => [t?.n ? `口コミ ${t.n}件` : '口コミなし', t?.calm && f.calm ? '口コミに「落ち着いた」' : '', t?.beginner && f.beginner ? '口コミに「初めて」' : '', t?.spends?.length ? `利用金額の中央値 ${r.median(t.spends).toLocaleString('ja-JP')} ${esc(f.budget_currency || '')}` : f.budget_amount ? '料金の口コミなし' : ''].filter(Boolean).join('・');
  const card = (href, name, sub, t) => `<li class="aic"><${href ? `a href="${esc(href)}"` : 'div'}><span class="aic__n">${esc(name)}</span><span class="aic__s">${esc(sub)}</span>${t?.n ? `<span class="aic__r">${stars(t.sum / t.n)}<b>${(t.sum / t.n).toFixed(1)}</b></span>` : ''}<span class="aic__w">${reason(t)}</span></${href ? 'a' : 'div'}></li>`;
  const parts = [];
  if (r.venues.length) parts.push(`<p class="ai__h">${icon('pin', 14)}店舗</p><ul class="aicards">${r.venues.map((v) => card(safePath(v.article_path), v.name, VENUE_L[v.category] || '', v.t)).join('')}</ul>`);
  if (r.articles.length) parts.push(`<p class="ai__h">${icon('file', 14)}記事</p><ul class="aicards">${r.articles.map((a) => card(a.u, a.t, a.c || '', a.t2)).join('')}</ul>`);
  if (r.events.length) parts.push(`<p class="ai__h">${icon('calendar', 14)}イベント情報（7日以内の投稿）</p><ul class="aicards">${r.events.map((e) => `<li class="aic"><a href="/community/post/?id=${esc(e.id)}"><span class="aic__n">${esc((e.title || e.body).slice(0, 60))}</span><span class="aic__s">${esc([e.city_name, e.country_name].filter(Boolean).join('・'))}・${esc(ago(e.published_at))}</span></a></li>`).join('')}</ul>`);
  if (r.areas.length) parts.push(`<p class="ai__h">${icon('trend', 14)}投稿が増えているエリア（7日間）</p><ul class="aicards">${r.areas.map((a) => `<li class="aic"><span class="aic__n">${esc(a.name)}</span><span class="aic__s">${Number(a.n)}件・${Number(a.users)}人</span></li>`).join('')}</ul>`);
  if (!parts.length) return `<p>条件に合う記事・口コミは、まだ見つかりませんでした。</p><p class="ai__ex">条件を減らすか、別の都市でお試しください。口コミが無い店舗について、評価や料金を推測してお伝えすることはしません。</p>`;
  return `<p>サイト内の記事とコミュニティの口コミから見つかったものです。${f.budget_amount ? '予算は、口コミに書かれた利用金額の中央値で判断しています（料金の口コミが無いものは除外していません）。' : ''}</p>${parts.join('')}`;
}

(async function aiPage() {
  const box = $('[data-ai]');
  if (!box || !READY) return;
  const log = $('[data-ai-log]', box), form = $('[data-ai-form]', box);
  const [cfg] = await select('ai_config', { select: 'enabled,user_daily_limit' }).catch(() => []);
  const aiOn = !!cfg?.enabled;
  if (aiOn) $('[data-ai-mode] span', box).textContent = `Claude が入力文を条件に変え、サイト内の記事と口コミを検索します（ログイン中は1日 ${Number(cfg.user_daily_limit)} 回まで）。`;
  const add = (cls, html) => { log.insertAdjacentHTML('beforeend', `<li class="ai__msg ai__msg--${cls}">${html}</li>`); log.lastElementChild.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return log.lastElementChild; };
  async function ask(q, quick = '') {
    add('me', `<p>${esc(q)}</p>`);
    const bot = add('bot', '<p class="ai__wait"><span class="sk-l"></span></p>');
    try {
      let f = null;
      if (aiOn && uid()) {
        try {
          const res = await fetch(AI_FN(), { method: 'POST', headers: { apikey: CFG.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', q }) });
          const j = await res.json();
          if (res.ok) f = j.filters; else if (j.error === 'ai_quota') toast('今日の NIGHT AI の利用回数の上限に達しました。条件検索で探します');
        } catch {}
      }
      f ||= await ruleFilters(q);
      if (f.out_of_scope || ILLEGAL.test(q)) { bot.innerHTML = '<p>この内容にはお答えできません。NIGHT AI は、法律の範囲内のナイトライフ・飲食・娯楽の情報だけを扱っています。</p>'; return; }
      if (quick === 'areas') f._areas = true;
      if (quick === 'events') f.events_today = true;
      const r = await aiSearch(f);
      f._cityName = r.cityName;
      bot.innerHTML = filterChips(f) + resultHTML(f, r);
    } catch (e) { bot.innerHTML = errorHTML(e); }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = form.q.value.trim(); if (!q) return; form.q.value = ''; ask(q); });
  form.q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  $$('[data-ai-quick]', box).forEach((b) => b.addEventListener('click', () => ask(b.dataset.q, b.dataset.aiQuick)));
})();
