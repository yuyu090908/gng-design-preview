// ---------- 記事ページの「口コミ・質問」欄と、TOP のダイジェスト ----------
(async function articleReviews() {
  const box = $('[data-article-reviews]');
  if (!box || !READY) return;
  const path = safePath(box.dataset.path);
  if (!path) return;
  const sum = $('[data-arev-summary]', box), list = $('[data-arev-list]', box);
  let started = false;
  // 画面に近づいてから読み込む（記事の表示を遅らせない）
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !started) { started = true; io.disconnect(); run(); } }, { rootMargin: '400px' });
  io.observe(box);
  async function run() {
    try {
      const [[s], aspects] = await Promise.all([
        select('review_summary', { select: '*', article_path: `eq.${path}` }),
        select('review_aspect_summary', { select: 'aspect,score,n', target: `eq.${path}` }),
      ]);
      sum.setAttribute('aria-busy', 'false');
      if (!s || !s.review_count) {
        sum.innerHTML = '<p class="arev__empty">まだ口コミがありません。実際に体験した方は、最初の口コミを書いてみませんか。評価や件数は、口コミが投稿されてから表示します。</p>';
      } else {
        const asp = aspects.filter((a) => a.aspect !== 'overall');
        sum.classList.add('has-data');
        sum.innerHTML = `<div class="arev__score"><b>${Number(s.overall).toFixed(1)}</b>${stars(s.overall)}<small>口コミ ${Number(s.review_count)}件（訪問確認済み ${Number(s.verified_count)}件）</small><small>最新 ${esc(ago(s.last_review_at))}</small></div>
${asp.length ? `<ul class="rbars">${asp.map((a) => `<li><span>${esc(ASPECT_L[a.aspect] || a.aspect)}</span><span class="rbars__bar"><span data-w="${Number(a.score) * 20}"></span></span><b>${Number(a.score).toFixed(1)}</b></li>`).join('')}</ul>` : ''}`;
        $$('[data-w]', sum).forEach((e) => { e.style.width = `${e.dataset.w}%`; });
        trend(sum);
        if (has('ai')) aiSummary(sum, s);
      }
    } catch (e) { sum.innerHTML = errorHTML(e); }
    show('latest');
  }
  // AI 口コミ要約（公開中の口コミが 3 件以上のときだけ。件数・分析日時・参照した口コミへのリンクを必ず表示する）
  async function aiSummary(el, s) {
    if (s.review_count < 3) return;
    const box2 = document.createElement('div');
    box2.className = 'aisum';
    el.after(box2);
    const draw = (x) => {
      const S = x.summary || {};
      const li = (a) => (a || []).filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join('');
      box2.innerHTML = `<p class="aisum__h">${icon('sparkles', 16)}AI 口コミ要約<small>口コミ ${Number(x.review_count)}件から・${esc(new Date(x.generated_at).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }))} に分析</small></p>
${S.good?.length ? `<p class="aisum__l">高く評価されている点</p><ul>${li(S.good)}</ul>` : ''}${S.improve?.length ? `<p class="aisum__l">改善を求められている点</p><ul>${li(S.improve)}</ul>` : ''}
${S.price ? `<p><b>料金：</b>${esc(S.price)}</p>` : ''}${S.trend ? `<p><b>最近の変化：</b>${esc(S.trend)}</p>` : ''}${S.beginner ? `<p><b>初めての方：</b>${esc(S.beginner)}</p>` : ''}
<p class="aisum__src">参照した口コミ：${(S.cited_ids || []).slice(0, 12).map((id, i) => `<a href="/community/post/?id=${esc(id)}">${i + 1}</a>`).join(' ') || 'なし'}</p>
<p class="adm__note">AI が口コミの内容だけをもとにまとめたものです。口コミに書かれていないことは補っていません。</p>`;
    };
    const [cached] = await select('ai_summaries', { select: '*', target: `eq.${path}`, lang: 'eq.ja' }).catch(() => []);
    if (cached && cached.review_count === s.review_count) { draw(cached); return; }
    const [cfg] = await select('ai_config', { select: 'enabled' }).catch(() => []);
    if (!cfg?.enabled || !uid()) { if (cached) draw(cached); else box2.remove(); return; }
    box2.innerHTML = `<button class="btn btn--ghost btn--sm" type="button" data-aisum>${icon('sparkles', 16)}AI で口コミを要約する</button>`;
    $('[data-aisum]', box2).addEventListener('click', async (e) => {
      try {
        const x = await busy(e.currentTarget, async () => {
          const res = await fetch(`${CFG.url}/functions/v1/night-ai`, { method: 'POST', headers: { apikey: CFG.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summary', target: path, lang: 'ja' }) });
          const j = await res.json(); if (!res.ok) throw new ApiError(j.error, j.error); return j;
        });
        if (x.status === 'ok') draw(x); else box2.innerHTML = '<p class="adm__note">口コミが3件以上になると要約できます。</p>';
      } catch (ex) { toast(ex.code === 'ai_quota' ? '今日の利用回数の上限に達しました' : '要約できませんでした'); }
    });
  }
  // 評価の推移（月ごとの総合評価の平均。口コミが 5 件以上・2 か月以上あるときだけ）
  async function trend(el) {
    const rows = await select('post_feed', { select: 'published_at,ratings', article_path: `eq.${path}`, type: 'eq.review', status: 'eq.published', order: 'published_at.asc', limit: 300 }).catch(() => []);
    const m = new Map();
    rows.forEach((r) => { const o = r.ratings?.overall; if (!o) return; const k = r.published_at.slice(0, 7); const v = m.get(k) || [0, 0]; v[0] += o; v[1]++; m.set(k, v); });
    if (rows.length < 5 || m.size < 2) return;
    const pts = [...m.entries()].slice(-12);
    el.insertAdjacentHTML('beforeend', `<div><p class="adm__note">評価の推移（月ごとの平均）</p><ul class="trend" aria-label="月ごとの総合評価">${pts.map(([k, [a, n]]) => `<li data-h="${((a / n) / 5) * 100}" title="${esc(k)}：${(a / n).toFixed(1)}（${n}件）"><span class="sr">${esc(k)} ${(a / n).toFixed(1)}</span></li>`).join('')}</ul></div>`);
    $$('[data-h]', el).forEach((e) => { e.style.height = `${e.dataset.h}%`; });
  }
  async function show(k) {
    $$('[data-arev-tab]', box).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.arevTab === k)));
    list.innerHTML = '<p class="cside__empty">読み込み中…</p>';
    const f = { select: POST_SELECT, article_path: `eq.${path}`, status: 'eq.published', limit: 5 };
    if (k === 'question') { f.type = 'eq.question'; f.order = 'published_at.desc'; }
    else { f.type = 'eq.review'; f.order = k === 'helpful' ? 'helpful_count.desc,published_at.desc' : 'published_at.desc'; }
    try {
      const rows = await select('post_feed', f);
      rows.length ? await renderPosts(rows, list) : (list.innerHTML = `<p class="cside__empty">${k === 'question' ? 'この記事への質問はまだありません。' : 'まだ口コミがありません。'}</p>`);
    } catch (e) { list.innerHTML = errorHTML(e); }
  }
  $$('[data-arev-tab]', box).forEach((b) => b.addEventListener('click', () => show(b.dataset.arevTab)));
})();

(async function homeDigest() {
  const box = $('[data-home-community]');
  if (!box || !READY) return;
  const el = $('[data-home-com-list]', box);
  const io = new IntersectionObserver(async (es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    try {
      const rows = await select('post_feed', { select: POST_SELECT, status: 'eq.published', type: 'in.(review,question,recommend)', order: 'published_at.desc', limit: 6 });
      rows.length ? await renderPosts(rows, el) : (el.innerHTML = stateHTML('users', 'コミュニティの投稿はまだありません', '最初の口コミや質問を投稿してみませんか。', '<a class="btn btn--primary btn--sm" href="/community/">コミュニティを見る</a>'));
    } catch (e) { el.innerHTML = errorHTML(e); }
  }, { rootMargin: '300px' });
  io.observe(box);
})();
