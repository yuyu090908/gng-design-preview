// ---------- /community/notifications/：通知センター ----------
const NOTIF_TEXT = {
  comment: (n) => `${n.actor_name || '誰か'} さんがあなたの投稿にコメントしました`,
  reply: (n) => `${n.actor_name || '誰か'} さんがあなたのコメントに返信しました`,
  helpful: (n) => (n.count > 1 ? `${n.actor_name || '誰か'} さんほか ${n.count - 1} 人が「参考になった」を押しました` : `${n.actor_name || '誰か'} さんが「参考になった」を押しました`),
  follow: (n) => `${n.actor_name || '誰か'} さんがあなたをフォローしました`,
  mention: (n) => `${n.actor_name || '誰か'} さんがあなたをメンションしました`,
  best_answer: (n) => `${n.actor_name || '誰か'} さんがあなたの回答をベストアンサーに選びました`,
  badge: (n) => `バッジ「${n.data?.badge_name || n.data?.badge || ''}」を獲得しました`,
  rank_up: (n) => `ランクが ${n.data?.rank || ''} に上がりました`,
  venue: (n) => `登録を申請した店舗「${n.data?.venue || ''}」が公開されました`,
  moderation: (n) => ({ hidden: 'あなたの投稿が運営により非表示になりました', removed: 'あなたの投稿が運営により削除扱いになりました', pending: 'あなたの投稿が審査待ちになりました', published: 'あなたの投稿が公開に戻りました' }[n.data?.status] || '運営からのお知らせがあります'),
};
const NOTIF_IC = { comment: 'message', reply: 'message', helpful: 'thumb', follow: 'userplus', mention: 'users', best_answer: 'award', badge: 'award', rank_up: 'trend', venue: 'pin', moderation: 'shield' };
(async function notificationsPage() {
  const box = $('[data-notifs]');
  if (!box || !READY) return;
  if (!uid()) { $('[data-need-login]').hidden = false; return; }
  box.hidden = false;
  const listEl = $('[data-n-list]'), moreBtn = $('[data-n-more]'), kindSel = $('[data-n-kind]');
  const PAGE = 30;
  let tab = 'all', cursor = null;
  const B = await badgeList();

  // 運営からのお知らせ（公開中のもの）
  select('announcements', { select: 'id,title,body,published_at', order: 'published_at.desc', limit: 3 }).then((rows) => {
    const el = $('[data-announcements]');
    if (!rows.length) return;
    el.innerHTML = rows.map((a) => `<li><p class="ann__t">${icon('bell', 14)}${esc(a.title)}<time>${esc(ago(a.published_at))}</time></p>${a.body ? `<p class="ann__b">${esc(a.body)}</p>` : ''}</li>`).join('');
    el.hidden = false;
  }).catch(() => {});

  const link = (n) => (n.post_id ? `/community/post/?id=${encodeURIComponent(n.post_id)}${n.comment_id ? '#comments' : ''}` : n.kind === 'follow' && n.actor_handle ? `/community/u/?h=${encodeURIComponent(n.actor_handle)}` : ['badge', 'rank_up'].includes(n.kind) ? '/community/passport/' : '');
  const item = (n) => {
    if (n.kind === 'badge' && n.data?.badge) n.data.badge_name = B[n.data.badge]?.name;
    const href = link(n);
    const inner = `<span class="nl__ic">${n.actor_avatar && !['badge', 'rank_up', 'moderation', 'venue'].includes(n.kind) ? avatar(n.actor_avatar) : icon(NOTIF_IC[n.kind] || 'bell', 18)}</span>
<span class="nl__main"><span class="nl__t">${esc(NOTIF_TEXT[n.kind]?.(n) || '')}</span>${n.post_excerpt ? `<span class="nl__ex">${esc(n.post_excerpt)}</span>` : ''}<time datetime="${esc(n.created_at)}">${esc(ago(n.created_at))}</time></span>${n.read_at ? '' : '<span class="nl__dot" aria-label="未読"></span>'}`;
    return `<li class="nl${n.read_at ? '' : ' is-unread'}" data-n="${esc(n.id)}">${href ? `<a class="nl__a" href="${esc(href)}">${inner}</a>` : `<div class="nl__a">${inner}</div>`}</li>`;
  };
  async function load(reset) {
    if (reset) { cursor = null; listEl.innerHTML = '<li class="cside__empty">読み込み中…</li>'; }
    const f = { select: '*', order: 'created_at.desc,id.desc', limit: PAGE };
    if (tab === 'unread') f.read_at = 'is.null';
    if (kindSel.value) f.kind = `eq.${kindSel.value}`;
    if (cursor) f.created_at = `lt.${cursor}`;
    try {
      const rows = await select('notification_feed', f);
      if (reset && !rows.length) listEl.innerHTML = `<li>${stateHTML('bell', tab === 'unread' ? '未読の通知はありません' : 'まだ通知はありません', 'コメント・フォロー・「参考になった」などがあると、ここにお知らせします。')}</li>`;
      else listEl.insertAdjacentHTML(reset ? 'afterbegin' : 'beforeend', rows.map(item).join(''));
      if (reset && rows.length) $$('.cside__empty', listEl).forEach((e) => e.remove());
      cursor = rows[rows.length - 1]?.created_at || cursor;
      moreBtn.hidden = rows.length < PAGE;
    } catch (e) { listEl.innerHTML = `<li>${errorHTML(e)}</li>`; }
  }
  // 開いた通知は既読にする
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('.nl.is-unread');
    if (li) rpc('mark_notifications_read', { p_ids: [li.dataset.n] }).then(refreshNotifCount).catch(() => {});
  });
  $('[data-n-readall]').addEventListener('click', async (e) => {
    try { await busy(e.currentTarget, () => rpc('mark_notifications_read', {})); $$('.nl.is-unread', listEl).forEach((li) => { li.classList.remove('is-unread'); $('.nl__dot', li)?.remove(); }); refreshNotifCount(); toast('すべて既読にしました'); if (tab === 'unread') load(true); }
    catch (ex) { toast(errText(ex)); }
  });
  moreBtn.addEventListener('click', () => busy(moreBtn, () => load(false)));
  kindSel.addEventListener('change', () => load(true));

  // 設定
  const sf = $('[data-n-settings]');
  const [pref] = await select('user_preferences', { select: 'notify', user_id: `eq.${uid()}` }).catch(() => []);
  const cur = pref?.notify || {};
  $$('input[type=checkbox]', sf).forEach((c) => { if (!c.disabled) c.checked = cur[c.name] !== false; });
  sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = {};
    $$('input[type=checkbox]', sf).forEach((c) => { n[c.name] = c.checked; });
    try { await busy($('[type=submit]', sf), () => rpc('update_notify_settings', { p_notify: n, p_email: false, p_push: false }), { done: true }); toast('保存しました'); }
    catch (ex) { toast(errText(ex)); }
  });

  const tabs = $$('[data-n-tab]');
  const show = (k) => {
    tab = k;
    tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.nTab === k)));
    const settings = k === 'settings';
    $('[data-n-panel="list"]').hidden = settings; sf.hidden = !settings;
    $('[data-n-kind-wrap]').hidden = settings; $('[data-n-readall]').hidden = settings;
    if (!settings) load(true);
  };
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.nTab)));
  show(location.hash === '#settings' ? 'settings' : 'all');
})();
