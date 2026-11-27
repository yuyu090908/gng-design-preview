// ---------- 投稿カード（一覧・詳細・プレビューで共通） ----------
const POST_SELECT = '*';
let myHelpful = new Set(), myBookmarks = new Set();
async function loadMyMarks(ids) {
  if (!uid() || !ids.length) return;
  const [h, b] = await Promise.all([
    select('post_reactions', { select: 'post_id', user_id: `eq.${uid()}`, post_id: inList(ids) }).catch(() => []),
    select('post_bookmarks', { select: 'post_id', user_id: `eq.${uid()}`, post_id: inList(ids) }).catch(() => []),
  ]);
  h.forEach((r) => myHelpful.add(r.post_id));
  b.forEach((r) => myBookmarks.add(r.post_id));
}

function postCard(p, { detail = false, preview = false, articleTitles = {} } = {}) {
  const mine = uid() && p.author_id === uid();
  const url = `/community/post/?id=${encodeURIComponent(p.id)}`;
  const region = [p.country_name, p.city_name, p.area_name].filter(Boolean).join(' / ');
  const art = safePath(p.article_path);
  const tags = [
    p.type === 'live' ? '<span class="ptag ptag--live"><span class="ldot" aria-hidden="true"></span>NIGHT LIVE</span>' : `<span class="ptag ptag--type">${esc(TYPE_L[p.type] || '')}</span>`,
    p.category && CAT_L[p.category] && p.category !== p.type ? `<span class="ptag">${esc(CAT_L[p.category])}</span>` : '',
    p.venue_name ? `<span class="ptag">${icon('pin', 12)}${esc(p.venue_name)}</span>` : '',
    art ? `<a class="ptag" href="${esc(art)}" data-lift>${icon('file', 12)}${esc((articleTitles[art] || '記事').slice(0, 28))}</a>` : '',
    region ? `<span class="ptag">${icon('globe', 12)}${esc(region)}</span>` : '',
    p.type === 'review' ? (p.is_verified ? `<span class="ptag ptag--ok">${icon('badge', 12)}訪問確認済み</span>` : '<span class="ptag ptag--muted">訪問未確認</span>') : '',
    p.status && p.status !== 'published' ? `<span class="ptag ptag--warn">${esc(STATUS_L[p.status] || p.status)}</span>` : '',
  ].join('');
  const r = p.ratings || {};
  const rate = p.type === 'review' && r.overall ? `<p class="pc__rate">${stars(r.overall)}<b>${Number(r.overall).toFixed(1)}</b>${Object.entries(r).filter(([k]) => k !== 'overall').map(([k, v]) => `<span>${esc(ASPECT_L[k] || k)} ${Number(v)}</span>`).join('')}</p>` : '';
  const extra = p.type === 'review' ? [p.visit_date ? `訪問 ${esc(String(p.visit_date).replace(/-/g, '.'))}` : '', p.spend_amount != null ? `利用金額 ${money(p.spend_amount, p.spend_currency)}` : '', p.revisit ? `再訪：${{ yes: '行きたい', maybe: 'どちらとも', no: '行かない' }[p.revisit] || ''}` : ''].filter(Boolean).join('　') : '';
  const media = (p.media || []).map((m) => ({ src: m.src || mediaUrl(m.path), alt: m.alt || '' })).filter((m) => m.src).slice(0, 4);
  const long = !detail && (p.body || '').length > 180;
  const title = p.title || (p.type === 'question' ? '質問' : '');
  return `<article class="pc${detail ? ' pc--detail' : ''}" data-post="${esc(p.id)}">
<header class="pc__hd">${avatar(p.author_avatar)}<div class="pc__who"><a class="pc__name" href="/community/u/?h=${encodeURIComponent(p.author_handle || '')}" data-lift>${esc(p.author_name || 'Night Insider')}</a>${rankChip(p.author_rank)}<span class="pc__sub"><span>@${esc(p.author_handle || '')}</span><span>投稿 ${Number(p.author_posts || 0)}・参考になった ${Number(p.author_helpful || 0)}</span><time datetime="${esc(p.published_at || p.created_at)}">${esc(ago(p.published_at || p.created_at))}</time>${p.edited_at ? '<span>（編集済み）</span>' : ''}</span></div>
${preview ? '' : `<button class="ibtn ibtn--sm pc__menu" type="button" data-post-menu aria-label="その他の操作" aria-haspopup="menu" data-lift>${icon('more', 18)}</button>`}</header>
<p class="pc__tags">${tags}</p>
${title ? `<h${detail ? 1 : 3} class="pc__title">${detail || preview ? esc(title) : `<a href="${url}">${esc(title)}</a>`}</h${detail ? 1 : 3}>` : ''}
${rate}
${p.type === 'live' ? liveInfo(p) : ''}
<p class="pc__body${long ? ' is-clamped' : ''}">${esc(p.body)}</p>
${long ? '<button class="pc__more" type="button" data-more>続きを読む</button>' : ''}
${extra ? `<p class="pc__spend">${extra}</p>` : ''}
${media.length ? `<div class="pc__media pc__media--${Math.min(media.length, 2) === 1 ? 1 : 2}" data-media='${esc(JSON.stringify(media))}'>${media.map((m, i) => `<button type="button" data-media-i="${i}" aria-label="画像 ${i + 1} を拡大"><img src="${esc(m.src)}" alt="${esc(m.alt)}" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}
${preview ? '' : `<footer class="pc__acts">
<button class="pact" type="button" data-helpful aria-pressed="${myHelpful.has(p.id)}"${mine ? ' disabled title="自分の投稿には押せません"' : ''}>${icon('thumb', 18)}<span>参考になった</span><span data-helpful-n>${Number(p.helpful_count || 0)}</span></button>
<a class="pact" href="${url}#comments">${icon('message', 18)}<span class="sr">コメント</span><span>${Number(p.comment_count || 0)}</span></a>
<button class="pact" type="button" data-bookmark aria-pressed="${myBookmarks.has(p.id)}" aria-label="保存">${icon('bookmark', 18)}</button>
<button class="pact" type="button" data-share aria-label="共有">${icon('share', 18)}</button>
${mine ? '' : `<button class="pact pact--end" type="button" data-report aria-label="通報">${icon('flag', 16)}</button>`}
</footer>`}
</article>`;
}

// タイトルの無い投稿でもカード全体を押せるように、本文のリンクを補う
function fixCardLinks(root) {
  $$('.pc', root).forEach((c) => {
    if ($('.pc__title a', c) || c.classList.contains('pc--detail')) return;
    const id = c.dataset.post;
    if (!id || !UUID.test(id)) return;
    const a = document.createElement('a');
    a.href = `/community/post/?id=${id}`; a.className = 'pc__cover'; a.setAttribute('aria-label', '投稿を開く');
    c.prepend(a);
  });
}

async function renderPosts(list, el, opts = {}) {
  const titles = {};
  const arts = [...new Set(list.map((p) => safePath(p.article_path)).filter(Boolean))];
  if (arts.length) { const A = await articles(); arts.forEach((u) => { const a = A.find((x) => x.u === u); if (a) titles[u] = a.t; }); }
  await loadMyMarks(list.map((p) => p.id));
  const html = list.map((p) => postCard(p, { ...opts, articleTitles: titles })).join('');
  if (opts.append) el.insertAdjacentHTML('beforeend', html); else el.innerHTML = html;
  fixCardLinks(el);
}

// カードの操作（一覧・詳細・プロフィールで共通。イベントは 1 か所で受ける）
document.addEventListener('click', async (e) => {
  const card = e.target.closest('.pc[data-post]');
  if (!card) return;
  const id = card.dataset.post;
  const b = e.target.closest('button');
  if (!b) return;
  if (b.matches('[data-more]')) { $('.pc__body', card).classList.remove('is-clamped'); b.remove(); return; }
  if (b.matches('[data-media-i]')) { openViewer(JSON.parse(b.closest('[data-media]').dataset.media), Number(b.dataset.mediaI)); return; }
  if (b.matches('[data-share]')) { share(`/community/post/?id=${id}`, $('.pc__title', card)?.textContent || 'GLOBAL NIGHT COMMUNITY'); return; }
  if (b.matches('[data-report]')) { openReport('post', id); return; }
  if (b.matches('[data-helpful]')) {
    if (needLogin()) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));  // 先に表示を変え（Optimistic UI）、失敗したら戻す
    const n = $('[data-helpful-n]', b); const before = Number(n.textContent); n.textContent = before + (on ? 1 : -1);
    try { n.textContent = await rpc('toggle_helpful', { p_post: id, p_on: on }); on ? myHelpful.add(id) : myHelpful.delete(id); }
    catch (ex) { b.setAttribute('aria-pressed', String(!on)); n.textContent = before; toast(errText(ex)); }
    return;
  }
  if (b.matches('[data-bookmark]')) {
    if (needLogin()) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    try { await rpc('toggle_bookmark', { p_post: id, p_on: on }); on ? myBookmarks.add(id) : myBookmarks.delete(id); toast(on ? '保存しました' : '保存を外しました'); }
    catch (ex) { b.setAttribute('aria-pressed', String(!on)); toast(errText(ex)); }
    return;
  }
  if (b.matches('[data-post-menu]')) { postMenu(card, b); }
});

// 「…」メニュー（自分の投稿：編集・削除／他人：通報・ブロック）
function postMenu(card, btn) {
  $$('.pmenu').forEach((m) => m.remove());
  const id = card.dataset.post;
  const mine = $('[data-helpful]', card)?.disabled && uid();
  const handle = ($('.pc__sub span', card)?.textContent || '').replace(/^@/, '');
  const items = mine
    ? [['edit', 'pencil', '編集する'], ['delete', 'trash', '削除する']]
    : [['report', 'flag', '通報する'], ['block', 'ban', `@${handle} をブロック`]];
  const m = document.createElement('div');
  m.className = 'pmenu'; m.setAttribute('role', 'menu');
  m.innerHTML = items.map(([k, ic, l]) => `<button class="pact" type="button" role="menuitem" data-act="${k}"${k === 'delete' || k === 'block' ? ' data-danger' : ''}>${icon(ic, 16)}${esc(l)}</button>`).join('');
  card.append(m);
  btn.setAttribute('aria-expanded', 'true');
  $('button', m).focus();
  const close = () => { m.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', outside, true); document.removeEventListener('keydown', esc_); };
  const outside = (e) => { if (!m.contains(e.target)) close(); };
  const esc_ = (e) => { if (e.key === 'Escape') { close(); btn.focus(); } };
  setTimeout(() => document.addEventListener('click', outside, true));
  document.addEventListener('keydown', esc_);
  m.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (!a) return;
    e.stopPropagation();
    close();
    if (a === 'edit') location.href = `/community/new/?edit=${encodeURIComponent(id)}`;
    if (a === 'report') openReport('post', id);
    if (a === 'delete') {
      if (!(await confirmBox('この投稿を削除しますか？', 'コメント・参考になった・画像もまとめて削除され、元に戻せません。', '削除する'))) return;
      try { await rpc('delete_post', { p_id: id }); card.remove(); toast('削除しました'); if (document.body.classList.contains('p-com-post')) location.href = '/community/me/'; }
      catch (ex) { toast(errText(ex)); }
    }
    if (a === 'block') {
      if (needLogin()) return;
      const [u] = await select('user_profiles', { select: 'id', handle: `eq.${handle}` }).catch(() => []);
      if (!u) return;
      if (!(await confirmBox(`@${handle} をブロックしますか？`, 'この人の投稿とコメントが表示されなくなり、あなたの投稿にコメントできなくなります。プロフィールからいつでも解除できます。', 'ブロックする'))) return;
      try { await rpc('set_block', { p_user: u.id, p_block: true }); $$(`.pc`).forEach((c) => { if (($('.pc__sub span', c)?.textContent || '') === '@' + handle) c.remove(); }); toast('ブロックしました'); }
      catch (ex) { toast(errText(ex)); }
    }
  });
}

// 確認ダイアログ（削除・ブロックなどの取り消せない操作の前）
function confirmBox(title, text, ok) {
  return new Promise((resolve) => {
    const w = document.createElement('div');
    w.className = 'modal'; w.hidden = true;
    w.innerHTML = `<div class="modal__bg" data-modal-close></div><div class="modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="cb-t" aria-describedby="cb-d" tabindex="-1"><h2 class="modal__t" id="cb-t">${esc(title)}</h2><p class="modal__d" id="cb-d">${esc(text)}</p><div class="modal__btns"><button class="btn btn--danger" type="button" data-ok>${esc(ok)}</button><button class="btn btn--ghost" type="button" data-modal-close>やめる</button></div></div>`;
    document.body.append(w);
    let result = false;
    const close = modal(w);
    $('[data-ok]', w).onclick = () => { result = true; close(); };
    const obs = new MutationObserver(() => { if (w.hidden) { obs.disconnect(); w.remove(); resolve(result); } });
    obs.observe(w, { attributes: true, attributeFilter: ['hidden'] });
  });
}
