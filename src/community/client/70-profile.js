// ---------- プロフィール：/community/me/（自分）と /community/u/?h=（公開） ----------
function profileCard(p, { self = false } = {}) {
  return `${avatar(p.avatar_seed, 'av--lg')}<div><h2 class="prof__n">${esc(p.display_name)}</h2><p class="prof__h">@${esc(p.handle)}</p></div>
${p.bio ? `<p class="prof__bio">${esc(p.bio)}</p>` : ''}
<dl class="prof__stats"><div><dt>投稿</dt><dd>${Number(p.post_count || 0)}</dd></div><div><dt>参考になった</dt><dd>${Number(p.helpful_received || 0)}</dd></div>${has('social') ? `<div><dt>フォロワー</dt><dd data-followers>${Number(p.follower_count || 0)}</dd></div><div><dt>フォロー</dt><dd>${Number(p.following_count || 0)}</dd></div>` : ''}<div><dt>参加</dt><dd>${esc(new Date(p.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' }))}</dd></div></dl>
${has('social') ? '<div class="prof__p2" data-prof-p2></div>' : ''}
<p class="prof__note">${icon('shield', 14)}${Number(p.post_count || 0) < 3 ? '投稿がまだ少ないため、信頼の目安はまだ表示していません（データ不足）。' : '投稿数・参考になった数は、公開中の投稿だけを数えています。'}</p>
${self ? '' : '<div class="prof__acts" data-prof-acts></div>'}`;
}

// ランク・バッジ・TRUST SCORE（Phase 2）
async function profileP2(root, id) {
  const el = $('[data-prof-p2]', root);
  if (!el) return;
  try {
    const [[x], bs, t] = await Promise.all([
      select('user_experience', { select: 'xp,rank', user_id: `eq.${id}` }),
      select('user_badges', { select: 'badge,awarded_at', user_id: `eq.${id}`, order: 'awarded_at.asc' }),
      rpc('trust_score', { p_user: id }),
    ]);
    const B = await badgeList();
    el.innerHTML = `<div class="prof__rank">${rankEmblem(x?.rank || 'Rookie', 56)}<div><p class="prof__rk">${esc(x?.rank || 'Rookie')}</p><p class="prof__xp">${Number(x?.xp || 0).toLocaleString('ja-JP')} XP</p></div></div>
<div class="prof__tr">${trustHTML(t)}</div>
${bs.length ? `<ul class="bdg bdg--sm">${bs.map((b) => `<li class="bdg__i is-on" title="${esc(B[b.badge]?.description || '')}">${badgeSvg(b.badge, true)}<span>${esc(B[b.badge]?.name || b.badge)}</span></li>`).join('')}</ul>` : ''}`;
    applyWidths(el);
  } catch { el.innerHTML = ''; }
}
let badgesP = null;
const badgeList = () => (badgesP ||= select('badges', { select: 'code,name,description,sort', order: 'sort' }).then((r) => Object.fromEntries(r.map((b) => [b.code, b]))).catch(() => ({})));

(async function mePage() {
  const box = $('[data-me]');
  if (!box || !READY) return;
  if (!uid()) { $('[data-need-login]').hidden = false; return; }
  let p;
  try { p = await myProfile(true); } catch (e) { box.hidden = false; box.innerHTML = errorHTML(e); return; }
  if (!p) { $('[data-need-login]').hidden = false; return; }
  box.hidden = false;
  const card = $('[data-me-card]');
  const drawCard = () => { card.innerHTML = profileCard(p, { self: true }) + `${has('social') ? '<a class="btn btn--ghost btn--sm prof__pp" href="/community/passport/">NIGHT PASSPORT を見る</a>' : ''}<div class="prof__acts"><a class="btn btn--ghost btn--sm" href="/community/u/?h=${encodeURIComponent(p.handle)}">公開プロフィールを見る</a>${p.roles?.length ? '<a class="btn btn--ghost btn--sm" href="/admin/community/">管理画面</a>' : ''}</div>`; };
  drawCard();
  profileP2(card, p.id);
  if (p.status !== 'active') card.insertAdjacentHTML('beforeend', `<p class="cform__err">${esc(ERR[p.status === 'banned' ? 'account_banned' : 'account_limited'])}</p>`);

  const panels = {
    async posts(el) { const rows = await select('post_feed', { select: POST_SELECT, author_id: `eq.${uid()}`, status: 'neq.draft', order: 'created_at.desc', limit: 50 }); rows.length ? await renderPosts(rows, el) : (el.innerHTML = stateHTML('pencil', 'まだ投稿していません', '', '<a class="btn btn--primary" href="/community/new/">投稿する</a>')); },
    async drafts(el) {
      const rows = await select('post_feed', { select: 'id,type,title,body,updated_at', author_id: `eq.${uid()}`, status: 'eq.draft', order: 'updated_at.desc', limit: 50 });
      el.innerHTML = rows.length ? rows.map((d) => `<div class="arow"><p class="arow__hd"><span class="ptag ptag--type">${esc(TYPE_L[d.type])}</span><span>${esc(ago(d.updated_at))}に保存</span></p><p class="arow__body">${esc((d.title || d.body).slice(0, 120))}</p><p class="arow__acts"><a class="btn btn--primary btn--sm" href="/community/new/?edit=${esc(d.id)}">続きを書く</a></p></div>`).join('') : stateHTML('file', '下書きはありません');
    },
    async saved(el) {
      const b = await select('post_bookmarks', { select: 'post_id,created_at', user_id: `eq.${uid()}`, order: 'created_at.desc', limit: 100 });
      if (!b.length) { el.innerHTML = stateHTML('bookmark', '保存した投稿はありません', '投稿の保存ボタンを押すと、ここに表示されます。'); return; }
      const rows = await select('post_feed', { select: POST_SELECT, id: inList(b.map((x) => x.post_id)) });
      const order = new Map(b.map((x, i) => [x.post_id, i]));
      rows.sort((x, y) => order.get(x.id) - order.get(y.id));
      rows.length ? await renderPosts(rows, el) : (el.innerHTML = stateHTML('bookmark', '保存した投稿は、削除または非公開になりました'));
    },
    async blocks(el) {
      const b = await select('user_blocks', { select: 'blocked_id', blocker_id: `eq.${uid()}` });
      if (!b.length) { el.innerHTML = `<li>${stateHTML('ban', 'ブロック中のユーザーはいません')}</li>`; return; }
      const us = await select('user_profiles', { select: 'id,handle,display_name,avatar_seed', id: inList(b.map((x) => x.blocked_id)) });
      el.innerHTML = us.map((u) => `<li>${avatar(u.avatar_seed)}<span>${esc(u.display_name)} <small>@${esc(u.handle)}</small></span><button class="btn btn--ghost btn--sm" type="button" data-unblock="${esc(u.id)}">解除</button></li>`).join('');
      el.onclick = async (e) => { const x = e.target.closest('[data-unblock]'); if (!x) return; try { await busy(x, () => rpc('set_block', { p_user: x.dataset.unblock, p_block: false })); x.closest('li').remove(); toast('ブロックを解除しました'); } catch (ex) { toast(errText(ex)); } };
    },
  };
  const loaded = {};
  async function show(k) {
    $$('[data-me-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.meTab === k)));
    $$('[data-me-panel]').forEach((x) => { x.hidden = x.dataset.mePanel !== k; });
    const el = $(`[data-me-panel="${k}"] [data-me-${k}]`);
    if (panels[k] && !loaded[k]) { loaded[k] = true; el.innerHTML = '<p class="cside__empty">読み込み中…</p>'; try { await panels[k](el); } catch (e) { el.innerHTML = errorHTML(e); loaded[k] = false; } }
  }
  $$('[data-me-tab]').forEach((b) => b.addEventListener('click', () => { history.replaceState(null, '', '#' + b.dataset.meTab); show(b.dataset.meTab); }));
  show(/^#(posts|drafts|saved|settings|blocks)$/.test(location.hash) ? location.hash.slice(1) : 'posts');

  // 設定
  const f = $('[data-profile-form]');
  f.display_name.value = p.display_name; f.handle.value = p.handle; f.bio.value = p.bio || ''; f.is_private.checked = p.is_private;
  if (p.age_confirmed_at) $('[data-age-row]').hidden = true;
  const [pref] = await select('user_preferences', { user_id: `eq.${uid()}`, select: '*' }).catch(() => []);
  const reg = await initRegion($('[data-region="pref"]', f), pref ? { country: pref.country_code, city: pref.city_id, area: pref.area_id } : {});
  const ferr = $('[data-form-error]', f);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    ferr.hidden = true;
    try {
      await busy($('[type=submit]', f), async () => {
        const r = await rpc('update_profile', { p_handle: f.handle.value.trim().toLowerCase(), p_display_name: f.display_name.value, p_bio: f.bio.value, p_is_private: f.is_private.checked, p_confirm_age: f.confirm_age.checked });
        const g = reg.get();
        await rpc('update_preferences', { p_country: g.country, p_city: g.city, p_area: g.area, p_lang: null });
        p = { ...r, roles: p.roles }; me = p;
      }, { done: true });
      drawCard();
      if (p.age_confirmed_at) $('[data-age-row]').hidden = true;
      toast('保存しました');
    } catch (ex) { ferr.textContent = errText(ex); ferr.hidden = false; }
  });
  $('[data-logout]').addEventListener('click', async (e) => { await busy(e.currentTarget, () => auth.signOut()); location.href = '/community/'; });
})();

(async function publicProfile() {
  const box = $('[data-profile]');
  if (!box || !READY) return;
  const h = (qs.get('h') || '').toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(h)) { box.innerHTML = stateHTML('alert', 'ユーザーが見つかりません'); return; }
  let p;
  try { [p] = await select('user_profiles', { select: `id,handle,display_name,avatar_seed,bio,is_private,post_count,helpful_received,created_at${has('social') ? ',follower_count,following_count' : ''}`, handle: `eq.${h}` }); }
  catch (e) { box.innerHTML = errorHTML(e); return; }
  box.setAttribute('aria-busy', 'false');
  if (!p) { box.innerHTML = stateHTML('alert', 'ユーザーが見つかりません', '退会したか、利用を停止されている可能性があります。'); return; }
  document.title = `${p.display_name}（@${p.handle}）| GLOBAL NIGHT COMMUNITY`;
  box.className = 'prof';
  box.innerHTML = profileCard(p);
  profileP2(box, p.id);
  const acts = $('[data-prof-acts]', box);
  if (uid() && uid() !== p.id) {
    const [blk] = await select('user_blocks', { select: 'blocked_id', blocker_id: `eq.${uid()}`, blocked_id: `eq.${p.id}` }).catch(() => []);
    let blocked = !!blk;
    let following = false;
    if (has('social')) following = !!(await select('user_follows', { select: 'followee_id', follower_id: `eq.${uid()}`, followee_id: `eq.${p.id}` }).catch(() => []))[0];
    const draw = () => { acts.innerHTML = `${has('social') && !blocked ? followBtn(following) : ''}<button class="btn btn--${blocked ? 'ghost' : 'danger'} btn--sm" type="button" data-block>${icon('ban', 16)}${blocked ? 'ブロックを解除' : 'ブロックする'}</button><button class="btn btn--ghost btn--sm" type="button" data-report-user>${icon('flag', 16)}通報する</button>`; };
    draw();
    acts.addEventListener('click', async (e) => {
      if (e.target.closest('[data-report-user]')) openReport('user', p.id);
      const fb = e.target.closest('[data-follow]');
      if (fb) {
        try {
          await busy(fb, () => rpc('set_follow', { p_user: p.id, p_on: !following }));
          following = !following;
          const fc = $('[data-followers]', box); if (fc) fc.textContent = String(Math.max(0, Number(fc.textContent) + (following ? 1 : -1)));
          draw(); toast(following ? 'フォローしました' : 'フォローを外しました');
        } catch (ex) { toast(errText(ex)); }
        return;
      }
      const b = e.target.closest('[data-block]');
      if (!b) return;
      if (!blocked && !(await confirmBox(`@${p.handle} をブロックしますか？`, 'この人の投稿とコメントが表示されなくなり、あなたの投稿にコメントできなくなります。', 'ブロックする'))) return;
      try { await busy(b, () => rpc('set_block', { p_user: p.id, p_block: !blocked })); blocked = !blocked; draw(); toast(blocked ? 'ブロックしました' : 'ブロックを解除しました'); if (blocked) $('[data-profile-posts]').innerHTML = ''; } catch (ex) { toast(errText(ex)); }
    });
  } else if (!uid()) acts.innerHTML = '';
  else acts.innerHTML = '<a class="btn btn--ghost btn--sm" href="/community/me/#settings">プロフィールを編集</a>';
  const list = $('[data-profile-posts]');
  if (p.is_private && uid() !== p.id) { list.innerHTML = stateHTML('lock', '投稿の一覧は非公開に設定されています'); return; }
  try {
    const rows = await select('post_feed', { select: POST_SELECT, author_id: `eq.${p.id}`, status: 'eq.published', order: 'published_at.desc', limit: 30 });
    rows.length ? await renderPosts(rows, list) : (list.innerHTML = stateHTML('message', 'まだ投稿はありません'));
  } catch (e) { list.innerHTML = errorHTML(e); }
})();
