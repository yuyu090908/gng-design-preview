// ---------- /admin/community/：運営管理（表示も操作もサーバー側で権限を確認している） ----------
(async function adminPage() {
  const box = $('[data-admin]');
  if (!box || !READY) return;
  const denied = $('[data-admin-denied]');
  const p = uid() ? await myProfile(true).catch(() => null) : null;
  if (!p || !p.roles?.length) { denied.hidden = false; return; }
  box.hidden = false;
  const isAdmin = p.roles.includes('admin');
  const act = async (btn, fn, msg) => { try { await busy(btn, fn); toast(msg); reload(); } catch (ex) { toast(errText(ex)); } };
  const tabs = $$('[data-adm-tab]');
  let cur = 'dash';
  const list = (k) => $(`[data-adm-list="${k}"]`);
  const filt = (k) => $(`[data-adm-filter="${k}"]`)?.value ?? '';
  const empty = (t) => stateHTML('check', t);

  const loaders = {
    async dash() {
      const s = await rpc('admin_stats');
      const items = [['登録ユーザー', s.users], ['新規（7日）', s.users_7d], ['DAU', s.dau], ['WAU', s.wau], ['MAU', s.mau], ['公開中の投稿', s.posts], ['新規投稿（24時間）', s.posts_24h], ['口コミ', s.reviews], ['コメント', s.comments], ['投稿したユーザー（30日）', s.posters_30d], ['投稿率（30日）', s.mau ? `${Math.round((s.posters_30d / s.mau) * 100)}%` : '—'], ['未対応の通報', s.reports_open], ['通報（累計）', s.reports_total], ['申請中の店舗', s.venues_pending]];
      $('[data-adm-kpis]').innerHTML = items.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v ?? 0)}</dd></div>`).join('');
      const bc = Object.entries(s.by_country || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k === '--' ? '地域なし' : k} ${v}`).join('・');
      $('[data-adm-gen]').textContent = `集計：${new Date(s.generated_at).toLocaleString('ja-JP')}　国別の投稿：${bc || 'なし'}　※ DAU などは、ログイン中に操作した日を数えています（閲覧したページは記録していません）。AI の利用回数・費用は Phase 3 で追加します。`;
    },
    async reports() {
      const st = filt('reports');
      const rows = await select('report_queue', { select: '*', ...(st ? { status: `in.(${st})` } : {}), order: 'created_at.asc', limit: 100 });
      list('reports').innerHTML = rows.length ? rows.map((r) => `<div class="arow" data-id="${esc(r.id)}" data-tt="${esc(r.target_type)}" data-tid="${esc(r.target_id)}">
<p class="arow__hd"><span class="ptag ptag--warn">${esc(r.reason)}</span><b>${esc({ post: '投稿', comment: 'コメント', user: 'ユーザー' }[r.target_type])}</b><span>通報者 @${esc(r.reporter_handle || '?')}</span><span>${esc(ago(r.created_at))}</span><span>同じ対象への通報 ${Number(r.same_target_reports)}件</span><span>${esc(r.status)}</span></p>
<p class="arow__body">${esc(r.target_excerpt || '（対象は削除済み）')}</p>${r.detail ? `<p class="arow__body">詳細：${esc(r.detail)}</p>` : ''}${r.resolution ? `<p class="adm__note">対応：${esc(r.resolution)}</p>` : ''}
<p class="arow__acts">${r.target_type === 'post' ? `<a class="btn btn--ghost btn--sm" href="/community/post/?id=${esc(r.target_id)}" target="_blank" rel="noopener">投稿を開く</a><button class="btn btn--danger btn--sm" data-a="hide-post">投稿を非表示</button>` : ''}${r.target_type === 'comment' ? '<button class="btn btn--danger btn--sm" data-a="hide-comment">コメントを非表示</button>' : ''}${r.target_type === 'user' ? '<button class="btn btn--danger btn--sm" data-a="limit-user">投稿を制限</button>' : ''}
${['open', 'reviewing'].includes(r.status) ? '<button class="btn btn--ghost btn--sm" data-a="resolve">対応済みにする</button><button class="btn btn--ghost btn--sm" data-a="dismiss">問題なしで閉じる</button>' : ''}</p></div>`).join('') : empty('未対応の通報はありません');
    },
    async posts() {
      const rows = await select('post_feed', { select: 'id,type,title,body,status,is_verified,author_handle,created_at,helpful_count,comment_count', status: `eq.${filt('posts')}`, order: 'created_at.desc', limit: 50 });
      list('posts').innerHTML = rows.length ? rows.map((r) => `<div class="arow" data-id="${esc(r.id)}"><p class="arow__hd"><span class="ptag ptag--type">${esc(TYPE_L[r.type])}</span><b>@${esc(r.author_handle)}</b><span>${esc(ago(r.created_at))}</span><span>参考 ${r.helpful_count}・コメント ${r.comment_count}</span>${r.type === 'review' ? `<span>${r.is_verified ? '訪問確認済み' : '訪問未確認'}</span>` : ''}</p><p class="arow__body">${esc((r.title ? r.title + '\n' : '') + r.body.slice(0, 300))}</p>
<p class="arow__acts"><a class="btn btn--ghost btn--sm" href="/community/post/?id=${esc(r.id)}" target="_blank" rel="noopener">開く</a>${r.status !== 'published' ? '<button class="btn btn--ghost btn--sm" data-a="publish">公開に戻す</button>' : ''}${r.status !== 'hidden' ? '<button class="btn btn--danger btn--sm" data-a="hide">非表示</button>' : ''}${r.status !== 'removed' ? '<button class="btn btn--danger btn--sm" data-a="remove">削除扱い</button>' : ''}${r.type === 'review' ? `<button class="btn btn--ghost btn--sm" data-a="${r.is_verified ? 'unverify' : 'verify'}">${r.is_verified ? '訪問確認を取り消す' : '訪問確認済みにする'}</button>` : ''}</p></div>`).join('') : empty('該当する投稿はありません');
    },
    async comments() {
      const rows = await select('comment_list', { select: '*', status: `eq.${filt('comments')}`, order: 'created_at.desc', limit: 50 });
      list('comments').innerHTML = rows.length ? rows.map((r) => `<div class="arow" data-id="${esc(r.id)}"><p class="arow__hd"><b>@${esc(r.author_handle)}</b><span>${esc(ago(r.created_at))}</span><a href="/community/post/?id=${esc(r.post_id)}" target="_blank" rel="noopener">投稿を開く</a></p><p class="arow__body">${esc(r.body)}</p><p class="arow__acts">${r.status !== 'published' ? '<button class="btn btn--ghost btn--sm" data-a="c-publish">公開に戻す</button>' : '<button class="btn btn--danger btn--sm" data-a="c-hide">非表示</button>'}</p></div>`).join('') : empty('該当するコメントはありません');
    },
    async users() {
      const q = $('[data-adm-user-search]').q.value.trim().toLowerCase();
      const rows = await select('user_profiles', { select: 'id,handle,display_name,status,post_count,helpful_received,created_at', ...(q ? { handle: `ilike.${like(q)}` } : {}), order: 'created_at.desc', limit: 50 });
      const roles = isAdmin ? await select('user_roles', { select: 'user_id,role' }).catch(() => []) : [];
      list('users').innerHTML = rows.length ? rows.map((u) => { const rs = roles.filter((r) => r.user_id === u.id).map((r) => r.role); return `<div class="arow" data-id="${esc(u.id)}"><p class="arow__hd"><b>${esc(u.display_name)}</b><span>@${esc(u.handle)}</span><span class="ptag${u.status === 'active' ? '' : ' ptag--warn'}">${esc({ active: '通常', limited: '投稿制限', banned: '利用停止' }[u.status])}</span>${rs.map((r) => `<span class="ptag ptag--type">${esc(r)}</span>`).join('')}<span>投稿 ${u.post_count}・参考 ${u.helpful_received}</span><span>${esc(ago(u.created_at))}に登録</span></p>
<p class="arow__acts"><a class="btn btn--ghost btn--sm" href="/community/u/?h=${esc(u.handle)}" target="_blank" rel="noopener">プロフィール</a>${u.status !== 'active' ? '<button class="btn btn--ghost btn--sm" data-a="u-active">制限を解除</button>' : ''}${u.status !== 'limited' ? '<button class="btn btn--danger btn--sm" data-a="u-limited">投稿を制限</button>' : ''}${isAdmin && u.status !== 'banned' ? '<button class="btn btn--danger btn--sm" data-a="u-banned">利用停止</button>' : ''}${isAdmin ? (rs.includes('moderator') ? '<button class="btn btn--ghost btn--sm" data-a="r-mod-off">モデレーターを外す</button>' : '<button class="btn btn--ghost btn--sm" data-a="r-mod-on">モデレーターにする</button>') : ''}</p></div>`; }).join('') : empty('該当するユーザーはいません');
    },
    async venues() {
      const rows = await select('venues', { select: '*', status: `eq.${filt('venues')}`, order: 'created_at.desc', limit: 100 });
      list('venues').innerHTML = rows.length ? rows.map((v) => `<div class="arow" data-id="${esc(v.id)}" data-v='${esc(JSON.stringify(v))}'><p class="arow__hd"><b>${esc(v.name)}</b><span>${esc(VENUE_L[v.category])}</span><span>${esc(v.country_code || '')}</span>${v.article_path ? `<a href="${esc(safePath(v.article_path) || '#')}" target="_blank" rel="noopener">記事</a>` : ''}<span>${esc(ago(v.created_at))}</span></p><p class="arow__acts">${v.status !== 'published' ? '<button class="btn btn--primary btn--sm" data-a="v-publish">公開する</button>' : ''}${v.status !== 'hidden' ? '<button class="btn btn--danger btn--sm" data-a="v-hide">非表示</button>' : ''}</p></div>`).join('') : empty('該当する店舗はありません');
    },
    async audit() {
      if (!isAdmin) { list('audit').innerHTML = stateHTML('lock', '監査ログは管理者だけが見られます'); return; }
      const rows = await select('admin_audit_logs', { select: '*', order: 'at.desc', limit: 200 });
      const hs = await select('user_profiles', { select: 'id,handle', id: inList([...new Set(rows.map((r) => r.actor_id).filter(Boolean))]) }).catch(() => []);
      const H = Object.fromEntries(hs.map((x) => [x.id, x.handle]));
      list('audit').innerHTML = rows.length ? rows.map((r) => `<div class="arow"><p class="arow__hd"><b>${esc(r.action)}</b><span>@${esc(H[r.actor_id] || '?')}</span><span>${esc(r.target_type)} ${esc(String(r.target_id).slice(0, 8))}</span><time>${esc(new Date(r.at).toLocaleString('ja-JP'))}</time></p>${r.detail?.note ? `<p class="arow__body">${esc(r.detail.note)}</p>` : ''}</div>`).join('') : empty('記録はまだありません');
    },
  };
  async function reload() {
    const el = list(cur);
    try {
      await loaders[cur]();
      // 操作の理由を書く欄（監査ログに残る）
      $$('.arow__acts', el || box).forEach((a) => { if ($('[data-a]', a) && !$('[data-note]', a)) a.insertAdjacentHTML('afterbegin', '<input class="input input--sm" data-note maxlength="500" aria-label="操作のメモ" placeholder="メモ（任意・監査ログに残ります）">'); });
    } catch (e) { (el || $('[data-adm-kpis]')).innerHTML = errorHTML(e); }
  }
  const show = (k) => { cur = k; tabs.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.admTab === k))); $$('[data-adm-panel]').forEach((x) => { x.hidden = x.dataset.admPanel !== k; }); reload(); };
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.admTab)));
  $$('[data-adm-filter]').forEach((s) => s.addEventListener('change', reload));
  $('[data-adm-user-search]').addEventListener('submit', (e) => { e.preventDefault(); reload(); });
  show('dash');

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const row = b.closest('[data-id]'); const id = row.dataset.id; const a = b.dataset.a;
    const n = () => $('[data-note]', row)?.value || '';
    const M = {
      'hide-post': () => rpc('mod_set_post_status', { p_id: row.dataset.tid, p_status: 'hidden', p_note: n() || '' }),
      'hide-comment': () => rpc('mod_set_comment_status', { p_id: row.dataset.tid, p_status: 'hidden', p_note: n() || '' }),
      'limit-user': () => rpc('mod_set_user_status', { p_id: row.dataset.tid, p_status: 'limited', p_note: n() || '' }),
      resolve: () => rpc('mod_handle_report', { p_id: id, p_status: 'resolved', p_resolution: n() || '' }),
      dismiss: () => rpc('mod_handle_report', { p_id: id, p_status: 'dismissed', p_resolution: n() || '' }),
      publish: () => rpc('mod_set_post_status', { p_id: id, p_status: 'published', p_note: n() || '' }),
      hide: () => rpc('mod_set_post_status', { p_id: id, p_status: 'hidden', p_note: n() || '' }),
      remove: () => rpc('mod_set_post_status', { p_id: id, p_status: 'removed', p_note: n() || '' }),
      verify: () => rpc('mod_set_post_verified', { p_id: id, p_verified: true, p_note: n() || '' }),
      unverify: () => rpc('mod_set_post_verified', { p_id: id, p_verified: false, p_note: n() || '' }),
      'c-hide': () => rpc('mod_set_comment_status', { p_id: id, p_status: 'hidden', p_note: n() || '' }),
      'c-publish': () => rpc('mod_set_comment_status', { p_id: id, p_status: 'published', p_note: n() || '' }),
      'u-active': () => rpc('mod_set_user_status', { p_id: id, p_status: 'active', p_note: n() || '' }),
      'u-limited': () => rpc('mod_set_user_status', { p_id: id, p_status: 'limited', p_note: n() || '' }),
      'u-banned': () => rpc('mod_set_user_status', { p_id: id, p_status: 'banned', p_note: n() || '' }),
      'r-mod-on': () => rpc('admin_set_role', { p_user: id, p_role: 'moderator', p_grant: true }),
      'r-mod-off': () => rpc('admin_set_role', { p_user: id, p_role: 'moderator', p_grant: false }),
      'v-publish': () => rpc('mod_upsert_venue', { p: { ...JSON.parse(row.dataset.v), status: 'published' } }),
      'v-hide': () => rpc('mod_upsert_venue', { p: { ...JSON.parse(row.dataset.v), status: 'hidden' } }),
    };
    if (M[a]) act(b, M[a], '更新しました');
  });

  const vf = $('[data-adm-venue-form]');
  const vreg = await initRegion($('[data-region="admvenue"]', vf));
  vf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = vreg.get();
    try { await busy($('button', vf), () => rpc('mod_upsert_venue', { p: { name: vf.name.value, category: vf.category.value, country_code: r.country, city_id: r.city, area_id: r.area, article_path: safePath(vf.article_path.value) || null, status: 'published' } })); vf.reset(); toast('店舗を登録しました'); if (cur === 'venues') reload(); }
    catch (ex) { toast(errText(ex)); }
  });
})();
