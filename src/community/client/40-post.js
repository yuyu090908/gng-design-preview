// ---------- /community/post/?id=：投稿の詳細とコメント ----------
// 翻訳（キャッシュがあればそれを使う。無ければ AI が有効なときだけ翻訳する。原文にいつでも戻せる）
const TR_LANGS = [['en', 'English'], ['th', 'ไทย'], ['ko', '한국어'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'], ['ja', '日本語']];
async function translateBar(view, post) {
  const bodyEl = $('.pc__body', view), titleEl = $('.pc__title', view);
  if (!bodyEl) return;
  const orig = { body: bodyEl.textContent, title: titleEl?.textContent || '' };
  const bar = document.createElement('p');
  bar.className = 'trbar';
  bar.innerHTML = `${icon('globe', 14)}<label><span class="sr">翻訳する言語</span><select class="input input--sm" data-tr><option value="">原文</option>${TR_LANGS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><span class="trbar__s" data-tr-state></span>`;
  bodyEl.before(bar);
  const st = $('[data-tr-state]', bar), sel = $('[data-tr]', bar);
  sel.addEventListener('change', async () => {
    const lang = sel.value;
    if (!lang) { bodyEl.textContent = orig.body; if (titleEl) titleEl.textContent = orig.title; st.textContent = ''; return; }
    st.textContent = '翻訳中…';
    try {
      let [t] = await select('post_translations', { select: 'title,body', post_id: `eq.${post.id}`, lang: `eq.${lang}` }).catch(() => []);
      if (!t) {
        const [cfg] = await select('ai_config', { select: 'enabled' }).catch(() => []);
        if (!cfg?.enabled) { st.textContent = '翻訳は準備中です'; sel.value = ''; return; }
        if (!uid()) { st.textContent = 'ログインすると翻訳できます'; sel.value = ''; return; }
        const res = await fetch(`${CFG.url}/functions/v1/night-ai`, { method: 'POST', headers: { apikey: CFG.key, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'translate', post_id: post.id, lang }) });
        t = await res.json();
        if (!res.ok) throw new ApiError(t.error, t.error);
      }
      bodyEl.textContent = t.body; if (titleEl && t.title) titleEl.textContent = t.title;
      st.textContent = 'AI による翻訳です';
    } catch (e) { st.textContent = e.code === 'ai_quota' ? '今日の利用回数の上限に達しました' : '翻訳できませんでした'; sel.value = ''; bodyEl.textContent = orig.body; }
  });
}

(async function postPage() {
  const view = $('[data-post-view]');
  if (!view || !READY) return;
  const id = qs.get('id');
  if (!id || !UUID.test(id)) { view.innerHTML = stateHTML('alert', '投稿が見つかりません', 'URL が正しいか確認してください。', '<a class="btn btn--ghost" href="/community/">コミュニティへ</a>'); return; }
  let post;
  try {
    [post] = await select('post_feed', { select: POST_SELECT, id: `eq.${id}` });
  } catch (e) { view.innerHTML = errorHTML(e); return; }
  view.setAttribute('aria-busy', 'false');
  if (!post) { view.innerHTML = stateHTML('alert', '投稿が見つかりません', '削除されたか、非公開になった可能性があります。', '<a class="btn btn--ghost" href="/community/">コミュニティへ</a>'); return; }
  await renderPosts([post], view, { detail: true });
  document.title = `${(post.title || post.body).slice(0, 40)} | GLOBAL NIGHT COMMUNITY`;
  // 評価の項目別の表示
  const r = post.ratings || {};
  const asp = Object.entries(r).filter(([k]) => k !== 'overall');
  if (post.type === 'review' && asp.length) $('.pc__rate', view)?.insertAdjacentHTML('afterend', `<ul class="rbars">${asp.map(([k, v]) => `<li><span>${esc(ASPECT_L[k] || k)}</span><span class="rbars__bar"><span data-w="${Number(v) * 20}"></span></span><b>${Number(v).toFixed(1)}</b></li>`).join('')}</ul>`);
  $$('[data-w]', view).forEach((e) => { e.style.width = `${e.dataset.w}%`; });
  if (post.type === 'review') view.insertAdjacentHTML('beforeend', '<p class="adm__note">「訪問確認済み」は訪問の事実を運営が確認したことを示し、内容の正確さを保証するものではありません。</p>');
  if (post.status !== 'published') return;
  if (has('ai')) translateBar(view, post);

  // コメント
  const box = $('[data-comments]'), list = $('[data-comment-list]'), form = $('[data-comment-form]');
  box.hidden = false; box.id = 'comments';
  $('[data-comment-count]').textContent = post.comment_count || '';
  if (uid()) form.hidden = false; else { const l = $('[data-comment-login]'); l.hidden = false; $('a', l).href = loginHref(); }
  let parent = null;
  const replyTo = $('[data-reply-to]');
  const comment = (c) => {
    const mine = uid() && c.author_id === uid();
    const gone = c.status !== 'published';
    const best = post.best_comment_id && post.best_comment_id === c.id;
    const canBest = has('social') && post.type === 'question' && !post.best_comment_id && post.author_id === uid() && !mine && !c.parent_id && !gone;
    return `<li><div class="cmt${best ? ' cmt--best' : ''}" data-cmt="${esc(c.id)}">
${best ? `<p class="cmt__best">${icon('award', 14)}ベストアンサー</p>` : ''}
<div class="cmt__hd">${avatar(c.author_avatar)}<a href="/community/u/?h=${encodeURIComponent(c.author_handle)}">${esc(c.author_name)}</a><time datetime="${esc(c.created_at)}">${esc(ago(c.created_at))}${c.edited_at ? '（編集済み）' : ''}</time></div>
<p class="cmt__body${gone ? ' cmt__body--gone' : ''}">${gone ? (c.status === 'removed' ? 'このコメントは削除されました' : 'このコメントは運営により非表示になっています') : esc(c.body)}</p>
${gone ? '' : `<div class="cmt__acts">${canBest ? `<button class="pact pact--gold" type="button" data-c-best>${icon('award', 14)}ベストアンサーに選ぶ</button>` : ''}${c.parent_id ? '' : `<button class="pact" type="button" data-c-reply>${icon('message', 14)}返信</button>`}${mine ? `<button class="pact" type="button" data-c-edit>${icon('pencil', 14)}編集</button><button class="pact" type="button" data-c-del>${icon('trash', 14)}削除</button>` : `<button class="pact" type="button" data-c-report>${icon('flag', 14)}通報</button>`}</div>`}
</div>${c.replies?.length ? `<ol>${c.replies.map(comment).join('')}</ol>` : ''}</li>`;
  };
  async function loadComments() {
    try {
      const rows = await select('comment_list', { select: '*', post_id: `eq.${id}`, order: 'created_at.asc,id.asc', limit: 300 });
      const top = rows.filter((c) => !c.parent_id);
      top.forEach((c) => { c.replies = rows.filter((x) => x.parent_id === c.id); });
      // 返信の無い削除済みコメントは出さない
      const shown = top.filter((c) => c.status === 'published' || c.replies.length);
      if (post.best_comment_id) shown.sort((a, b) => (b.id === post.best_comment_id) - (a.id === post.best_comment_id));
      list.innerHTML = shown.length ? shown.map(comment).join('') : `<li class="cside__empty">まだコメントはありません。</li>`;
    } catch (e) { list.innerHTML = `<li>${errorHTML(e)}</li>`; }
  }
  loadComments();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = form.body.value.trim();
    if (!body) return;
    try {
      await busy($('[type=submit]', form), () => rpc('add_comment', { p_post: id, p_body: body, p_parent: parent }));
      form.reset(); parent = null; replyTo.hidden = true;
      toast('コメントしました');
      loadComments();
    } catch (ex) { toast(errText(ex)); }
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); const c = e.target.closest('[data-cmt]');
    if (!b || !c) return;
    const cid = c.dataset.cmt;
    if (b.matches('[data-c-reply]')) {
      if (needLogin()) return;
      parent = cid;
      replyTo.innerHTML = `${icon('message', 14)}${esc($('.cmt__hd a', c).textContent)} さんに返信 <button class="tbtn" type="button" data-reply-cancel>取り消す</button>`;
      replyTo.hidden = false;
      form.body.focus();
    }
    if (b.matches('[data-c-report]')) openReport('comment', cid);
    if (b.matches('[data-c-best]')) {
      if (!(await confirmBox('このコメントをベストアンサーに選びますか？', '選んだあとは変更できません。回答した人に通知と XP が届きます。', '選ぶ'))) return;
      try { await busy(b, () => rpc('mark_best_answer', { p_post: id, p_comment: cid })); post.best_comment_id = cid; toast('ベストアンサーに選びました'); loadComments(); } catch (ex) { toast(errText(ex)); }
    }
    if (b.matches('[data-c-del]')) {
      if (!(await confirmBox('コメントを削除しますか？', '削除したコメントは元に戻せません。', '削除する'))) return;
      try { await rpc('delete_comment', { p_id: cid }); toast('削除しました'); loadComments(); } catch (ex) { toast(errText(ex)); }
    }
    if (b.matches('[data-c-edit]')) {
      const p = $('.cmt__body', c);
      const ta = document.createElement('textarea');
      ta.className = 'input ta'; ta.maxLength = 2000; ta.value = p.textContent; ta.setAttribute('aria-label', 'コメントを編集');
      const bar = document.createElement('div'); bar.className = 'cmt-form__bar';
      bar.innerHTML = '<button class="btn btn--ghost btn--sm" type="button" data-x>やめる</button><button class="btn btn--primary btn--sm" type="button" data-ok>保存</button>';
      p.replaceWith(ta); ta.after(bar); ta.focus();
      $('[data-x]', bar).onclick = () => loadComments();
      $('[data-ok]', bar).onclick = async (ev) => { try { await busy(ev.currentTarget, () => rpc('edit_comment', { p_id: cid, p_body: ta.value })); loadComments(); } catch (ex) { toast(errText(ex)); } };
    }
  });
  replyTo.addEventListener('click', (e) => { if (e.target.closest('[data-reply-cancel]')) { parent = null; replyTo.hidden = true; } });
  if (location.hash === '#comments') setTimeout(() => box.scrollIntoView(), 50);
})();
