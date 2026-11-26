// ---------- /community/post/?id=：投稿の詳細とコメント ----------
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
    return `<li><div class="cmt" data-cmt="${esc(c.id)}">
<div class="cmt__hd">${avatar(c.author_avatar)}<a href="/community/u/?h=${encodeURIComponent(c.author_handle)}">${esc(c.author_name)}</a><time datetime="${esc(c.created_at)}">${esc(ago(c.created_at))}${c.edited_at ? '（編集済み）' : ''}</time></div>
<p class="cmt__body${gone ? ' cmt__body--gone' : ''}">${gone ? (c.status === 'removed' ? 'このコメントは削除されました' : 'このコメントは運営により非表示になっています') : esc(c.body)}</p>
${gone ? '' : `<div class="cmt__acts">${c.parent_id ? '' : `<button class="pact" type="button" data-c-reply>${icon('message', 14)}返信</button>`}${mine ? `<button class="pact" type="button" data-c-edit>${icon('pencil', 14)}編集</button><button class="pact" type="button" data-c-del>${icon('trash', 14)}削除</button>` : `<button class="pact" type="button" data-c-report>${icon('flag', 14)}通報</button>`}</div>`}
</div>${c.replies?.length ? `<ol>${c.replies.map(comment).join('')}</ol>` : ''}</li>`;
  };
  async function loadComments() {
    try {
      const rows = await select('comment_list', { select: '*', post_id: `eq.${id}`, order: 'created_at.asc,id.asc', limit: 300 });
      const top = rows.filter((c) => !c.parent_id);
      top.forEach((c) => { c.replies = rows.filter((x) => x.parent_id === c.id); });
      // 返信の無い削除済みコメントは出さない
      const shown = top.filter((c) => c.status === 'published' || c.replies.length);
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
