// ---------- /community/passport/：NIGHT PASSPORT（ランク・XP・バッジ・TRUST SCORE・投稿した都市・XP の履歴） ----------
const XP_L = { helpful_received: '「参考になった」を受けた', helpful_review: '店舗の感想が初めて「参考になった」を受けた', verified_review: '店舗の感想が訪問確認済みになった', best_answer: 'ベストアンサーに選ばれた', venue_added: '申請した店舗が公開された', venue_correction: '店舗情報の修正が採用された', adjustment: '運営による調整' };
(async function passportPage() {
  const box = $('[data-passport]');
  if (!box || !READY) return;
  if (!uid()) { $('[data-need-login]').hidden = false; return; }
  box.hidden = false;
  const card = $('[data-pp-card]');
  card.innerHTML = '<span class="sk-l sk-l--w"></span>';
  try {
    const [p, [x], mine, B, t, ledger, cities] = await Promise.all([
      myProfile(true),
      select('user_experience', { select: 'xp,rank', user_id: `eq.${uid()}` }),
      select('user_badges', { select: 'badge,awarded_at', user_id: `eq.${uid()}` }),
      badgeList(),
      rpc('trust_score', { p_user: uid() }),
      select('experience_transactions', { select: 'action,points,created_at', user_id: `eq.${uid()}`, order: 'created_at.desc', limit: 50 }),
      select('post_feed', { select: 'city_id,city_name,country_name,country_code', author_id: `eq.${uid()}`, status: 'eq.published', city_id: 'not.is.null', limit: 1000 }),
    ]);
    const xp = Number(x?.xp || 0), rank = x?.rank || 'Rookie';
    const nx = nextRank(xp), start = rankStart(xp);
    const pct = nx ? Math.round(((xp - start) / (nx.at - start)) * 100) : 100;
    card.innerHTML = `<div class="pp__emb">${rankEmblem(rank, 112)}</div>
<div class="pp__info"><p class="pp__en">RANK</p><h2 class="pp__rank" id="pp-rank">${esc(rank)}</h2><p class="pp__who">${esc(p?.display_name || '')} <small>@${esc(p?.handle || '')}</small></p>
<p class="pp__xp"><b>${xp.toLocaleString('ja-JP')}</b> XP</p>
<div class="pp__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="次のランクまでの進み具合"><span data-w="${pct}"></span></div>
<p class="pp__next">${nx ? `${esc(nx.name)} まであと ${(nx.at - xp).toLocaleString('ja-JP')} XP` : '最高ランクに到達しています'}</p></div>`;

    // バッジ：初めて見る獲得済みバッジだけ短く光らせる（動きを減らす設定では光らせない）
    const seen = new Set(store.get('seenBadges:' + uid(), []));
    const got = new Map(mine.map((b) => [b.badge, b.awarded_at]));
    $('[data-pp-badges]').innerHTML = Object.values(B).map((b) => {
      const on = got.has(b.code);
      return `<li class="bdg__i${on ? ' is-on' : ''}${on && !seen.has(b.code) ? ' is-new' : ''}">${badgeSvg(b.code, on)}<span class="bdg__n">${esc(b.name)}</span><span class="bdg__d">${esc(b.description)}</span><span class="bdg__s">${on ? `${esc(new Date(got.get(b.code)).toLocaleDateString('ja-JP'))} に獲得` : '未獲得'}</span></li>`;
    }).join('') || `<li>${stateHTML('award', 'バッジを読み込めませんでした')}</li>`;
    store.set('seenBadges:' + uid(), [...got.keys()]);

    $('[data-pp-trust]').innerHTML = trustHTML(t);

    const m = new Map();
    cities.forEach((c) => { const v = m.get(c.city_id) || { n: 0, name: c.city_name, country: c.country_name }; v.n++; m.set(c.city_id, v); });
    const cl = [...m.values()].sort((a, b) => b.n - a.n);
    $('[data-pp-cities]').innerHTML = cl.length ? cl.map((c) => `<li><span>${esc(c.name)}</span><small>${esc(c.country)}・${c.n}件</small></li>`).join('') : `<li class="cside__empty">都市を選んで投稿すると、ここに並びます。</li>`;

    $('[data-pp-ledger]').innerHTML = ledger.length ? ledger.map((l) => `<li><span>${esc(XP_L[l.action] || l.action)}</span><time datetime="${esc(l.created_at)}">${esc(ago(l.created_at))}</time><b class="${l.points < 0 ? 'neg' : ''}">${l.points > 0 ? '+' : ''}${Number(l.points)} XP</b></li>`).join('') : `<li class="cside__empty">まだ XP はありません。参考になる投稿をすると、ここに記録されます。</li>`;
    applyWidths(box);
  } catch (e) { card.innerHTML = errorHTML(e); }
})();
