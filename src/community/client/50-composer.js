// ---------- /community/new/：投稿フォーム（種類によって入力項目が変わる） ----------
(async function composer() {
  const form = $('[data-composer]');
  if (!form || !READY) return;
  if (!uid()) { $('[data-need-login]').hidden = false; return; }
  form.hidden = false;
  const profile = await myProfile().catch(() => null);
  const err = $('[data-form-error]', form);
  const showErr = (m) => { err.innerHTML = m; err.hidden = !m; if (m) err.scrollIntoView({ block: 'center' }); };
  if (profile && !profile.age_confirmed_at) showErr(`投稿するには18歳以上であることの確認が必要です。<a href="/community/me/#settings">プロフィール設定で確認する</a>`);
  if (profile && profile.status !== 'active') showErr(esc(ERR[profile.status === 'banned' ? 'account_banned' : 'account_limited']));

  let editing = null;
  const step2 = $('[data-step="2"]', form);
  const DEFAULT_CAT = { review: 'review', question: 'question', recommend: 'recommend', event: 'event', talk: 'chat', live: 'local' };
  const BODY = {
    review: ['感想', '雰囲気・接客・料金の分かりやすさなど、実際に体験したことを30文字以上で書いてください。スタッフや他の利用者を特定できる情報は書かないでください。'],
    question: ['質問の内容', '予算・エリア・日程など、答えやすくなる情報を添えてください。'],
    recommend: ['おすすめの内容', 'どんな人に・どんな場面でおすすめかを書いてください。'],
    event: ['イベントの内容', '日時・場所・料金など、確認できた情報を書いてください。公式の告知がある場合はその旨も。'],
    talk: ['本文', 'ナイトライフに関する話題を自由にどうぞ。'],
  };
  // 店舗の種類ごとの評価項目
  const ASPECTS_BY = {
    bar: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value', 'drinks'],
    club: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value', 'drinks', 'music'],
    karaoke: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value', 'drinks'],
    cabaret: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value', 'safety'],
    soapland: ['overall', 'service', 'cleanliness', 'price_clarity', 'value', 'safety'],
    delivery: ['overall', 'service', 'price_clarity', 'value', 'safety'],
    massage: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value'],
    restaurant: ['overall', 'service', 'atmosphere', 'cleanliness', 'value', 'drinks'],
    other: ['overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value'],
  };
  const vcat = $('[data-venue-cat]', form);
  const syncAspects = () => { const on = ASPECTS_BY[vcat.value] || ASPECTS_BY.other; $$('[data-aspect]', form).forEach((f) => { f.hidden = !on.includes(f.dataset.aspect); }); };
  vcat.addEventListener('change', () => { syncAspects(); autosave(); });
  syncAspects();

  // 星の評価
  const paintStars = (fs) => { const v = Number($('input:checked', fs)?.value || 0); $$('.stars__s', fs).forEach((s, i) => s.classList.toggle('is-on', i < v)); };
  $$('[data-aspect]', form).forEach((fs) => {
    fs.addEventListener('change', () => { paintStars(fs); autosave(); });
    $('[data-star-clear]', fs).addEventListener('click', () => { $$('input', fs).forEach((i) => { i.checked = false; }); paintStars(fs); autosave(); });
  });
  const ratingVals = () => { const o = {}; $$('[data-aspect]:not([hidden])', form).forEach((fs) => { const v = $('input:checked', fs)?.value; if (v) o[fs.dataset.aspect] = Number(v); }); return o; };

  // 投稿の種類
  const typeVal = () => form.querySelector('[name=type]:checked')?.value || '';
  function syncType() {
    const t = typeVal();
    step2.hidden = !t;
    $$('[data-only]', form).forEach((e) => { e.hidden = e.dataset.only !== t; });
    $('[data-venue-suggest]').hidden = t !== 'review';
    if (!t) return;
    $('[data-step2-title]').textContent = { review: '店舗の感想', question: '質問', recommend: 'おすすめ情報', event: 'イベント情報', talk: 'フリートーク' }[t];
    const [l, h] = BODY[t]; $('[data-body-label]').textContent = l; $('[data-body-hint]').textContent = h;
    form.body.minLength = t === 'review' ? 30 : 5;
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'type') { if (!editing) form.category.value = DEFAULT_CAT[e.target.value] || 'chat'; syncType(); autosave(); } });

  const region = await initRegion($('[data-region="composer"]', form), {}, () => autosave());

  // 口コミの対象（サイトの記事 or 運営が登録した店舗）
  let target = null;
  const tq = $('[data-target-q]'), tl = $('[data-target-list]'), tc = $('[data-target-chosen]');
  const showTarget = () => {
    tc.hidden = !target; tq.hidden = !!target; tl.innerHTML = '';
    if (target) tc.innerHTML = `${icon(target.kind === 'venue' ? 'pin' : 'file', 16)}<span>${esc(target.label)}</span><button class="tbtn" type="button" data-target-x>変更</button>`;
  };
  tc.addEventListener('click', (e) => { if (e.target.closest('[data-target-x]')) { target = null; showTarget(); tq.focus(); autosave(); } });
  let tTimer;
  tq.addEventListener('input', () => {
    clearTimeout(tTimer);
    const q = tq.value.trim();
    if (q.length < 2) { tl.innerHTML = ''; return; }
    tTimer = setTimeout(async () => {
      const [A, V] = await Promise.all([articles(), select('venues', { select: 'id,name,category,article_path', status: 'eq.published', name: `ilike.${like(q)}`, limit: 6 }).catch(() => [])]);
      const words = q.toLowerCase().split(/\s+/);
      const arts = A.filter((a) => words.every((w) => a.t.toLowerCase().includes(w))).slice(0, 6);
      tl.innerHTML = [...V.map((v) => `<li><button type="button" role="option" data-v="${esc(v.id)}" data-vc="${esc(v.category)}" data-l="${esc(v.name)}">${esc(v.name)}<small>店舗・${esc(VENUE_L[v.category] || '')}</small></button></li>`),
        ...arts.map((a) => `<li><button type="button" role="option" data-a="${esc(a.u)}" data-l="${esc(a.t)}">${esc(a.t)}<small>記事・${esc(a.c || '')}</small></button></li>`)].join('') || '<li class="cside__empty">見つかりませんでした。下の「店舗を登録申請」から申請できます。</li>';
    }, 250);
  });
  tl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    target = b.dataset.v ? { kind: 'venue', id: b.dataset.v, label: b.dataset.l } : { kind: 'article', path: safePath(b.dataset.a), label: b.dataset.l };
    if (b.dataset.vc) { vcat.value = b.dataset.vc; syncAspects(); }
    showTarget(); autosave();
  });

  // 画像：端末で描き直して位置情報などを消し、本人のフォルダにアップロードする
  const media = [];
  const upList = $('[data-up-list]'), addBtn = $('.up__add', form), fileIn = $('[data-file]', form);
  const drawUp = () => {
    upList.innerHTML = media.map((m, i) => `<li class="${m.busy ? 'is-busy' : ''}"><img src="${esc(m.src)}" alt=""><button type="button" data-up-x="${i}" aria-label="画像 ${i + 1} を外す">${icon('x', 16)}</button></li>`).join('');
    addBtn.classList.toggle('is-off', media.length >= 4);
  };
  async function process(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new ApiError('', 'JPEG・PNG・WebP の画像を選んでください');
    if (file.size > 20 * 1024 * 1024) throw new ApiError('', '画像が大きすぎます（20MB まで）');
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
    let ext = 'webp';
    if (!blob || blob.type !== 'image/webp') { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85)); ext = 'jpg'; }
    if (blob.size > 5 * 1024 * 1024) throw new ApiError('', '画像を小さくできませんでした');
    return { blob, w, h, ext };
  }
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files].slice(0, 4 - media.length);
    fileIn.value = '';
    for (const f of files) {
      const m = { src: URL.createObjectURL(f), busy: true };
      media.push(m); drawUp();
      try {
        const { blob, w, h, ext } = await process(f);
        const path = `${uid()}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await raw(`/storage/v1/object/post-media/${path}`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'false' } });
        Object.assign(m, { path, width: w, height: h, busy: false, src: mediaUrl(path) });
      } catch (ex) { media.splice(media.indexOf(m), 1); toast(errText(ex)); }
      drawUp(); autosave();
    }
  });
  upList.addEventListener('click', (e) => { const b = e.target.closest('[data-up-x]'); if (b) { media.splice(Number(b.dataset.upX), 1); drawUp(); autosave(); } });

  // 文字数
  const count = $('[data-count]');
  const syncCount = () => { count.textContent = `${form.body.value.length} / 5000`; };
  form.body.addEventListener('input', syncCount);

  // 入力内容 → 送信データ
  function payload(status) {
    const t = typeVal(), r = region.get();
    return {
      id: editing || undefined, type: t, category: form.category.value, title: form.title.value, body: form.body.value, status,
      country_code: r.country, city_id: r.city, area_id: r.area,
      venue_id: t === 'review' && target?.kind === 'venue' ? target.id : null,
      article_path: target?.kind === 'article' ? target.path : null,
      visit_date: t === 'review' ? form.visit_date.value || null : null,
      spend_amount: t === 'review' && form.spend_amount.value !== '' ? Number(form.spend_amount.value) : null,
      spend_currency: t === 'review' && form.spend_amount.value !== '' ? form.spend_currency.value : null,
      revisit: t === 'review' ? form.querySelector('[name=revisit]:checked')?.value || null : null,
      ratings: t === 'review' ? ratingVals() : {},
      media: media.filter((m) => m.path).map((m) => ({ path: m.path, width: m.width, height: m.height, alt: '' })),
    };
  }
  // 端末への自動保存（途中保存）。投稿したら消す
  let saveTimer;
  const LOCAL = 'draft';
  function autosave() {
    if (editing) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { store.set(LOCAL, { ...payload('draft'), target, venue_category: vcat.value, at: Date.now() }); $('[data-autosave]').textContent = 'この端末に下書きを自動保存しました'; }, 700);
  }
  form.addEventListener('input', autosave);
  function fill(d) {
    const ty = form.querySelector(`[name=type][value="${d.type}"]`); if (ty) ty.checked = true;
    syncType();
    if (d.category) form.category.value = d.category;
    form.title.value = d.title || ''; form.body.value = d.body || ''; syncCount();
    region.set({ country: d.country_code, city: d.city_id, area: d.area_id });
    if (d.venue_category) { vcat.value = d.venue_category; syncAspects(); }
    form.visit_date.value = d.visit_date || '';
    if (d.spend_amount != null) { form.spend_amount.value = d.spend_amount; form.spend_currency.value = d.spend_currency || 'JPY'; }
    if (d.revisit) { const rv = form.querySelector(`[name=revisit][value="${d.revisit}"]`); if (rv) rv.checked = true; }
    for (const [k, v] of Object.entries(d.ratings || {})) { const i = form.querySelector(`[name="r_${k}"][value="${v}"]`); if (i) { i.checked = true; paintStars(i.closest('[data-aspect]')); } }
    (d.media || []).forEach((m) => { if (mediaUrl(m.path)) media.push({ ...m, src: mediaUrl(m.path) }); }); drawUp();
    target = d.target || (d.venue_id ? { kind: 'venue', id: d.venue_id, label: d.venue_name || '店舗' } : d.article_path ? { kind: 'article', path: d.article_path, label: d.article_path } : null);
    showTarget();
  }
  // 編集（?edit=ID）・URL での指定（?type=review&article=/2965/）・端末の下書き
  const vd = form.visit_date; vd.max = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (qs.get('edit') && UUID.test(qs.get('edit'))) {
    const [p] = await select('post_feed', { select: POST_SELECT, id: `eq.${qs.get('edit')}`, author_id: `eq.${uid()}` }).catch(() => []);
    if (!p) { form.hidden = true; form.insertAdjacentHTML('beforebegin', stateHTML('alert', '編集できる投稿が見つかりません', '自分の投稿だけ編集できます。削除された可能性もあります。', '<a class="btn btn--ghost" href="/community/me/">自分の投稿を見る</a>')); return; }
    editing = p.id;
    fill({ ...p, venue_category: p.venue_category });
    if (p.article_path) { const t = await articleTitle(p.article_path); if (t) { target.label = t; showTarget(); } }
    $('[data-submit-l]').textContent = p.status === 'draft' ? '投稿する' : '更新する';
    document.querySelector('.ph__t').textContent = '投稿を編集';
  } else if (qs.get('type') || qs.get('article')) {
    const ty = form.querySelector(`[name=type][value="${qs.get('type')}"]`); if (ty) { ty.checked = true; form.category.value = DEFAULT_CAT[ty.value]; }
    syncType();
    const ap = safePath(qs.get('article'));
    if (ap) { const t = await articleTitle(ap); target = { kind: 'article', path: ap, label: t || ap }; showTarget(); }
  } else {
    const d = store.get(LOCAL);
    if (d && d.body && Date.now() - (d.at || 0) < 14 * 86400000) {
      fill(d);
      $('[data-autosave]').innerHTML = `前回の下書きを復元しました <button class="tbtn" type="button" data-discard>破棄する</button>`;
      $('[data-discard]').onclick = () => { store.del(LOCAL); location.reload(); };
    }
  }
  syncType();

  // 入力の確認（サーバーでも同じ確認をする）
  function check() {
    const t = typeVal();
    if (!t) return '投稿の種類を選んでください。';
    const len = form.body.value.trim().length;
    if (len < (t === 'review' ? 30 : 5)) return t === 'review' ? '感想は30文字以上で書いてください。' : '本文を5文字以上で書いてください。';
    if (t === 'review' && !target) return '口コミの対象（記事か店舗）を選んでください。';
    if (t === 'review' && !ratingVals().overall) return '総合評価を選んでください。';
    if (media.some((m) => m.busy)) return '画像の処理が終わるまでお待ちください。';
    if (!form.agree.checked) return 'コミュニティのルールへの同意にチェックしてください。';
    return '';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = check(); showErr(esc(m)); if (m) return;
    try {
      const id = await busy($('[data-submit]'), () => rpc('save_post', { p: payload('published') }));
      store.del(LOCAL);
      location.href = `/community/post/?id=${encodeURIComponent(id)}`;
    } catch (ex) { showErr(esc(errText(ex))); }
  });
  $('[data-save-draft]').addEventListener('click', async (e) => {
    if (!typeVal() || !form.body.value.trim()) { showErr('種類を選び、本文を少しでも書くと下書きを保存できます。'); return; }
    try {
      editing = await busy(e.currentTarget, () => rpc('save_post', { p: payload('draft') }), { done: true });
      store.del(LOCAL); showErr('');
      toast('下書きを保存しました（プロフィールの「下書き」から開けます）');
    } catch (ex) { showErr(esc(errText(ex))); }
  });
  // プレビュー
  const pv = $('[data-preview-box]');
  $('[data-preview]').addEventListener('click', async () => {
    const p = payload('published');
    const r = region.get(), R = await regions();
    const obj = { ...p, id: 'preview', author_name: profile?.display_name, author_handle: profile?.handle, author_avatar: profile?.avatar_seed, author_posts: profile?.post_count, author_helpful: profile?.helpful_received,
      published_at: new Date().toISOString(), venue_name: target?.kind === 'venue' ? target.label : '', country_name: R.countries.find((x) => x.code === r.country)?.name_ja, city_name: R.cities.find((x) => x.id === r.city)?.name_ja, area_name: R.areas.find((x) => x.id === r.area)?.name_ja,
      media: media.filter((m) => m.src).map((m) => ({ src: m.src })) };
    $('[data-preview-body]').innerHTML = postCard(obj, { preview: true, detail: true, articleTitles: target?.kind === 'article' ? { [target.path]: target.label } : {} });
    pv.hidden = false; form.hidden = true; pv.scrollIntoView();
  });
  $('[data-preview-close]').addEventListener('click', () => { pv.hidden = true; form.hidden = false; });

  // 店舗の登録申請
  const vf = $('[data-venue-form]');
  const vreg = await initRegion($('[data-region="venue"]', vf));
  vf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = vreg.get();
    if (!vf.name.value.trim()) return;
    try {
      await busy($('[type=submit]', vf), () => rpc('suggest_venue', { p_name: vf.name.value, p_category: vf.category.value, p_country: r.country, p_city: r.city, p_area: r.area, p_article_path: null }));
      vf.reset(); toast('申請しました。運営が確認してから公開します');
    } catch (ex) { toast(errText(ex)); }
  });
})();
