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
      if (has('social')) {
        try {
          const s2 = await rpc('admin_stats_phase2');
          const rk = Object.entries(s2.ranks || {}).map(([k, v]) => `${k} ${v}`).join('・') || 'なし';
          $('[data-adm-kpis]').insertAdjacentHTML('beforeend', [['付与した XP（累計）', s2.xp_total], ['付与した XP（24時間）', s2.xp_24h], ['獲得されたバッジ', s2.badges], ['フォロー', s2.follows], ['NIGHT LIVE（24時間）', s2.live_24h], ['30日継続率', s2.retention_30d == null ? '—' : `${s2.retention_30d}%`]].map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v ?? 0)}</dd></div>`).join('') + `<div class="kpis__wide"><dt>ランクの分布</dt><dd>${esc(rk)}</dd></div>`);
        } catch {}
      }
      if (has('ai') || has('radar')) {
        try {
          const s3 = await rpc('admin_stats_phase3');
          const tk = s3.ai_tokens_30d || {};
          $('[data-adm-kpis]').insertAdjacentHTML('beforeend', [['NIGHT AI', s3.ai_enabled ? 'ON' : 'OFF'], ['AI の利用（24時間）', s3.ai_24h], ['キャッシュで応答（24時間）', s3.ai_cached_24h], ['AI のトークン（30日・入力/出力）', `${tk.input ?? 0} / ${tk.output ?? 0}`], ['AI 審査補助（未対応）', s3.flags_open], ['位置を登録した店舗', s3.venues_located]].map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v ?? 0)}</dd></div>`).join(''));
        } catch {}
      }
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
<p class="arow__acts"><a class="btn btn--ghost btn--sm" href="/community/u/?h=${esc(u.handle)}" target="_blank" rel="noopener">プロフィール</a>${u.status !== 'active' ? '<button class="btn btn--ghost btn--sm" data-a="u-active">制限を解除</button>' : ''}${u.status !== 'limited' ? '<button class="btn btn--danger btn--sm" data-a="u-limited">投稿を制限</button>' : ''}${isAdmin && u.status !== 'banned' ? '<button class="btn btn--danger btn--sm" data-a="u-banned">利用停止</button>' : ''}${isAdmin && has('social') ? '<span class="adm__xp"><input class="input input--sm" type="number" step="1" min="-5000" max="5000" data-xp aria-label="調整する XP"><button class="btn btn--ghost btn--sm" data-a="u-xp">XP を調整</button></span>' : ''}${isAdmin ? (rs.includes('moderator') ? '<button class="btn btn--ghost btn--sm" data-a="r-mod-off">モデレーターを外す</button>' : '<button class="btn btn--ghost btn--sm" data-a="r-mod-on">モデレーターにする</button>') : ''}</p></div>`; }).join('') : empty('該当するユーザーはいません');
    },
    async flags() {
      const rows = await select('flag_queue', { select: '*', status: 'eq.open', order: 'score.desc,created_at.asc', limit: 100 });
      list('flags').innerHTML = rows.length ? rows.map((f) => `<div class="arow" data-id="${esc(f.id)}" data-tt="${esc(f.target_type)}" data-tid="${esc(f.target_id)}"><p class="arow__hd">${(f.labels || []).map((l) => `<span class="ptag ptag--warn">${esc(l)}</span>`).join('')}<b>${esc({ post: '投稿', comment: 'コメント' }[f.target_type])}</b><span>確からしさ ${Math.round(Number(f.score) * 100)}%</span><span>${esc(ago(f.created_at))}</span></p><p class="arow__body">${esc(f.target_excerpt || '（対象は削除済み）')}</p>${f.reason ? `<p class="adm__note">AI の理由：${esc(f.reason)}</p>` : ''}
<p class="arow__acts">${f.target_type === 'post' ? `<a class="btn btn--ghost btn--sm" href="/community/post/?id=${esc(f.target_id)}" target="_blank" rel="noopener">開く</a><button class="btn btn--danger btn--sm" data-a="f-hide-post">投稿を非表示</button>` : '<button class="btn btn--danger btn--sm" data-a="f-hide-comment">コメントを非表示</button>'}<button class="btn btn--ghost btn--sm" data-a="f-dismiss">問題なし</button></p></div>`).join('') : empty('確認待ちはありません');
    },
    async venues() {
      const rows = await select('venues', { select: '*', status: `eq.${filt('venues')}`, order: 'created_at.desc', limit: 100 });
      list('venues').innerHTML = rows.length ? rows.map((v) => `<div class="arow" data-id="${esc(v.id)}" data-v='${esc(JSON.stringify(v))}'><p class="arow__hd"><b>${esc(v.name)}</b><span>${esc(VENUE_L[v.category])}</span><span>${esc(v.country_code || '')}</span>${v.article_path ? `<a href="${esc(safePath(v.article_path) || '#')}" target="_blank" rel="noopener">記事</a>` : ''}<span>${esc(ago(v.created_at))}</span></p><p class="arow__acts">${has('radar') ? `<span class="adm__xp"><input class="input input--sm" data-lat inputmode="decimal" aria-label="緯度" placeholder="緯度" value="${esc(v.lat ?? '')}"><input class="input input--sm" data-lng inputmode="decimal" aria-label="経度" placeholder="経度" value="${esc(v.lng ?? '')}"><button class="btn btn--ghost btn--sm" data-a="v-loc">位置を保存</button></span>` : ''}${v.status !== 'published' ? '<button class="btn btn--primary btn--sm" data-a="v-publish">公開する</button>' : ''}${v.status !== 'hidden' ? '<button class="btn btn--danger btn--sm" data-a="v-hide">非表示</button>' : ''}</p></div>`).join('') : empty('該当する店舗はありません');
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
      'u-xp': () => { const v = Number($('[data-xp]', row)?.value || 0); if (!v || !n().trim()) { throw new ApiError('note_required'); } return rpc('admin_adjust_xp', { p_user: id, p_points: v, p_note: n() }); },
      'f-hide-post': async () => { await rpc('mod_set_post_status', { p_id: row.dataset.tid, p_status: 'hidden', p_note: n() || 'AI 審査補助から確認' }); return rpc('mod_handle_flag', { p_id: id, p_status: 'confirmed' }); },
      'f-hide-comment': async () => { await rpc('mod_set_comment_status', { p_id: row.dataset.tid, p_status: 'hidden', p_note: n() || 'AI 審査補助から確認' }); return rpc('mod_handle_flag', { p_id: id, p_status: 'confirmed' }); },
      'f-dismiss': () => rpc('mod_handle_flag', { p_id: id, p_status: 'dismissed' }),
      'v-loc': () => { const la = $('[data-lat]', row).value.trim(), lo = $('[data-lng]', row).value.trim(); return rpc('mod_set_venue_location', { p_id: id, p_lat: la === '' ? null : Number(la), p_lng: lo === '' ? null : Number(lo) }); },
      'v-publish': () => rpc('mod_upsert_venue', { p: { ...JSON.parse(row.dataset.v), status: 'published' } }),
      'v-hide': () => rpc('mod_upsert_venue', { p: { ...JSON.parse(row.dataset.v), status: 'hidden' } }),
    };
    if (M[a]) act(b, M[a], '更新しました');
  });

  // NIGHT AI の設定（管理者のみ）
  const aif = $('[data-adm-ai]');
  if (aif) {
    aif.hidden = !isAdmin;
    const [c] = await select('ai_config', { select: '*' }).catch(() => []);
    if (c) { aif.enabled.checked = c.enabled; aif.user.value = c.user_daily_limit; aif.global.value = c.global_daily_limit; }
    aif.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await busy($('button', aif), () => rpc('admin_ai_config', { p_enabled: aif.enabled.checked, p_user_limit: Number(aif.user.value), p_global_limit: Number(aif.global.value) })); toast('保存しました'); }
      catch (ex) { toast(errText(ex)); }
    });
  }

  // 運営からのお知らせ（管理者のみ・通知センターの上部に表示）
  const af = $('[data-adm-announce]');
  if (af) {
    af.hidden = !isAdmin;
    af.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await busy($('button', af), () => rpc('admin_announce', { p_title: af.title.value, p_body: af.body.value, p_days: Number(af.days.value) || 14 })); af.reset(); toast('お知らせを公開しました'); }
      catch (ex) { toast(errText(ex)); }
    });
  }

  const vf = $('[data-adm-venue-form]');
  const vreg = await initRegion($('[data-region="admvenue"]', vf));
  vf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = vreg.get();
    try { await busy($('button', vf), () => rpc('mod_upsert_venue', { p: { name: vf.name.value, category: vf.category.value, country_code: r.country, city_id: r.city, area_id: r.area, article_path: safePath(vf.article_path.value) || null, status: 'published' } })); vf.reset(); toast('店舗を登録しました'); if (cur === 'venues') reload(); }
    catch (ex) { toast(errText(ex)); }
  });
})();
