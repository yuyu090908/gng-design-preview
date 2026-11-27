// ---------- Phase 2 の共通部品：ランク・ライブ情報・バッジ・TRUST SCORE・フォロー・未読の通知 ----------
const RANKS = [['Rookie', 0], ['Night Explorer', 500], ['Night Expert', 2000], ['Night Master', 5000], ['Night Legend', 15000], ['Global VIP', 50000]];
const RANK_TONE = { Rookie: ['#B98A5E', '#5A3B22'], 'Night Explorer': ['#D9DEE8', '#69707D'], 'Night Expert': ['#E8CF99', '#8A6A2E'], 'Night Master': ['#B79CFF', '#4B2E9A'], 'Night Legend': ['#8DB6FF', '#1F3F86'], 'Global VIP': ['#F4F1EA', '#9C8A63'] };
const rankSlug = (r) => String(r || 'Rookie').toLowerCase().replace(/[^a-z]+/g, '-');
function rankChip(rank) {
  if (!has('social') || !rank) return '';
  return `<span class="rk rk--${rankSlug(rank)}" title="ランク">${esc(rank)}</span>`;
}
function nextRank(xp) { const n = RANKS.find(([, x]) => x > xp); return n ? { name: n[0], at: n[1] } : null; }
function rankStart(xp) { return [...RANKS].reverse().find(([, x]) => x <= xp)?.[1] || 0; }

// ランクの紋章（SVG。色はランクごとの金属の色味）
let svgN = 0;
function rankEmblem(rank, size = 96) {
  const [a, b] = RANK_TONE[rank] || RANK_TONE.Rookie;
  const id = `rg${++svgN}`;
  const tier = Math.max(0, RANKS.findIndex(([n]) => n === rank));
  const stars = Array.from({ length: tier }, (_, i) => { const ang = (-90 + (i - (tier - 1) / 2) * 22) * Math.PI / 180; return `<circle cx="${(48 + Math.cos(ang) * 40).toFixed(1)}" cy="${(48 + Math.sin(ang) * 40).toFixed(1)}" r="2.4" fill="${a}"/>`; }).join('');
  return `<svg class="emb" width="${size}" height="${size}" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
<circle cx="48" cy="48" r="34" fill="#0F121A" stroke="url(#${id})" stroke-width="4"/><circle cx="48" cy="48" r="27" fill="none" stroke="${a}" stroke-opacity=".35" stroke-width="1"/>
<path d="M48 30l4.6 9.4 10.4 1.5-7.5 7.3 1.8 10.3L48 53.6l-9.3 4.9 1.8-10.3-7.5-7.3 10.4-1.5z" fill="url(#${id})"/>${stars}</svg>`;
}

// バッジ（メタリックな SVG。未獲得は色を落とす）
const BADGE_ICON = {
  first_review: 'M48 32l4 8 9 1.3-6.5 6.3 1.5 9-8-4.2-8 4.2 1.5-9L35 41.3l9-1.3z',
  bangkok_expert: 'M36 58h24M40 58V44l8-10 8 10v14M46 58v-7h4v7',
  tokyo_expert: 'M48 30v28M40 58l8-22 8 22M36 44h24M38 50h20',
  global_explorer: 'M48 30a16 16 0 1 0 0 32a16 16 0 1 0 0-32M32 46h32M48 30c-6 8-6 24 0 32M48 30c6 8 6 24 0 32',
  trusted_reviewer: 'M48 30l13 5v9c0 8-6 14-13 17-7-3-13-9-13-17v-9zM42 46l4 4 8-8',
  hidden_gem_finder: 'M38 40l5-6h10l5 6-10 18zM38 40h20M43 34l5 6 5-6M48 40v18',
  community_contributor: 'M38 54c0-6 4-9 10-9s10 3 10 9M48 41a5 5 0 1 0 0-10a5 5 0 1 0 0 10M33 50c0-4 2-6 6-6M63 50c0-4-2-6-6-6',
  night_legend: 'M54 30a14 14 0 1 0 8 25a12 12 0 1 1-8-25z',
};
function badgeSvg(code, earned) {
  const id = `bg${++svgN}`;
  const [a, b] = earned ? ['#F1DDAA', '#8A6A2E'] : ['#4A4F5C', '#262A33'];
  return `<svg class="bdg__svg" viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
<path d="M48 8l34 19.6v40.8L48 88 14 68.4V27.6z" fill="#11141C" stroke="url(#${id})" stroke-width="3.5"/><path d="M48 16l27 15.6v32.8L48 80 21 64.4V31.6z" fill="none" stroke="${a}" stroke-opacity=".25"/>
<path d="${BADGE_ICON[code] || BADGE_ICON.first_review}" fill="none" stroke="url(#${id})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// TRUST SCORE（データ不足のときは点数を出さない）
const TRUST_L = { usefulness: '投稿の有用性', verified: '訪問確認の実績', continuity: '継続性', peer: '評価した人の数', compliance: 'ルールの遵守' };
function trustHTML(t) {
  if (!t) return stateHTML('shield', 'TRUST SCORE を表示できません');
  if (t.status !== 'ok') return `<div class="trust trust--na"><span class="trust__v">—</span><div><p class="trust__l">データ不足</p><p class="trust__d">公開中の投稿が3件になると表示します（現在 ${Number(t.posts || 0)} 件）。</p></div></div>`;
  const c = t.components || {};
  return `<div class="trust"><span class="trust__v">${Number(t.score)}</span><div class="trust__main"><p class="trust__l">TRUST SCORE <small>/ 100</small></p>
<ul class="rbars">${Object.entries(TRUST_L).map(([k, l]) => `<li><span>${esc(l)}</span><span class="rbars__bar"><span data-w="${Number(c[k] || 0)}"></span></span><b>${Number(c[k] || 0)}</b></li>`).join('')}</ul></div></div>`;
}
const applyWidths = (root) => $$('[data-w]', root).forEach((e) => { e.style.width = `${Math.max(0, Math.min(100, Number(e.dataset.w)))}%`; });

// ライブ情報（混雑・雰囲気・営業状況）
const CROWD_L = { 1: '空いている', 2: 'やや空き', 3: 'ふつう', 4: '混んでいる', 5: 'とても混んでいる' };
const VIBE_L = { calm: '落ち着いている', lively: '賑やか', party: '盛り上がっている', quiet: '静か' };
const OPEN_L = { open: '営業していた', closed: '閉まっていた' };
function liveInfo(p) {
  const n = Number(p.live_crowd) || 0;
  const parts = [
    n ? `<span class="lv__crowd" title="混雑の体感"><span class="lv__m" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i${i <= n ? ' class="on"' : ''}></i>`).join('')}</span>${esc(CROWD_L[n])}</span>` : '',
    p.live_vibe ? `<span>${esc(VIBE_L[p.live_vibe] || '')}</span>` : '',
    OPEN_L[p.live_open] ? `<span>${esc(OPEN_L[p.live_open])}</span>` : '',
    p.live_event ? `<span class="lv__ev">${icon('calendar', 12)}イベント開催中</span>` : '',
    p.live_price ? `<span>${icon('tag', 12)}${esc(p.live_price)}</span>` : '',
  ].filter(Boolean);
  return parts.length ? `<p class="lv">${parts.join('')}</p>` : '';
}

// フォローボタン
function followBtn(on) { return `<button class="btn btn--${on ? 'ghost' : 'primary'} btn--sm" type="button" data-follow aria-pressed="${on}">${icon(on ? 'usercheck' : 'userplus', 16)}${on ? 'フォロー中' : 'フォローする'}</button>`; }

// 未読の通知の件数（メニューのバッジ）。画面が表示されているときだけ 90 秒ごとに確認する
async function refreshNotifCount() {
  const els = $$('[data-notif-count]');
  if (!els.length || !READY || !has('social') || !uid()) { els.forEach((e) => { e.hidden = true; }); return; }
  try {
    const r = await select('notifications', { select: 'id', user_id: `eq.${uid()}`, read_at: 'is.null', limit: 1 }, { count: true });
    els.forEach((e) => { e.textContent = r.total > 99 ? '99+' : String(r.total); e.hidden = !r.total; e.setAttribute('aria-label', `未読 ${r.total} 件`); });
  } catch {}
}
if (READY && has('social')) {
  refreshNotifCount();
  onAuth(refreshNotifCount);
  setInterval(() => { if (!document.hidden) refreshNotifCount(); }, 90000);
}
