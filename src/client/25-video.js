// ---------- SMART VIDEO PLAYBACK ENGINE ----------
// 背景映像は装飾。最初はポスター画像を表示し、条件がそろったときだけ動画を読み込んで再生する。
// 止める条件：画面外／タブが非表示／利用者が停止／データ節約／動きを減らす設定／読み込み失敗／より優先度の高い映像の再生
const cvs = $$('[data-cv]');
if (cvs.length) {
  const mqMobile = matchMedia('(max-width: 767px)');
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const conn = navigator.connection || {};
  const slowNet = () => !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
  const userOff = () => store.read().settings.video === 'off';
  const allowed = () => !userOff() && !mqReduce.matches && !slowNet() && document.visibilityState === 'visible';
  const maxPlaying = () => (mqMobile.matches ? 1 : 2);
  const visible = new Map();
  // 最初の表示（ポスター画像＝LCP）を優先し、動画の読み込みはページの読み込み完了後に始める
  let ready = false;

  const ensureVideo = (el) => {
    if (el._v) return el._v;
    const src = mqMobile.matches ? el.dataset.m || el.dataset.d : el.dataset.d;
    if (!src) return null;
    const v = document.createElement('video');
    v.className = 'cv__video';
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.setAttribute('tabindex', '-1');
    v.preload = 'auto';
    v.disablePictureInPicture = true;
    v.src = src;
    v.addEventListener('playing', () => el.classList.add('is-playing'));
    v.addEventListener('error', () => { el.classList.add('is-failed'); el.classList.remove('is-playing'); v.remove(); el._v = null; el.dataset.failed = '1'; });
    el.appendChild(v);
    el._v = v;
    return v;
  };
  const pause = (el) => { if (el._v && !el._v.paused) el._v.pause(); el.classList.remove('is-playing'); };

  // 表示中の映像のうち、優先度が高く画面に大きく見えているものから順に再生する
  const sync = () => {
    const ok = ready && allowed();
    const order = [...visible.entries()].filter(([el]) => !el.dataset.failed).sort((a, b) => (Number(a[0].dataset.prio) || 9) - (Number(b[0].dataset.prio) || 9) || b[1] - a[1]).map(([el]) => el);
    const play = ok ? order.slice(0, maxPlaying()) : [];
    cvs.forEach((el) => {
      if (!play.includes(el)) { pause(el); return; }
      const v = ensureVideo(el);
      if (!v) return;
      const p = v.play();
      if (p && p.catch) p.catch(() => pause(el)); // 自動再生を拒否されたらポスターのまま
    });
    $$('[data-cv-toggle]').forEach((b) => {
      const off = userOff();
      b.setAttribute('aria-pressed', String(off));
      b.setAttribute('aria-label', off ? '背景の映像を再生する' : '背景の映像を停止する');
      $('[data-cv-toggle-l]', b).textContent = off ? '映像を再生' : '映像を停止';
      b.hidden = mqReduce.matches;
    });
  };
  const io = new IntersectionObserver((ents) => {
    ents.forEach((en) => { if (en.isIntersecting && en.intersectionRatio >= 0.35) visible.set(en.target, en.intersectionRatio); else visible.delete(en.target); });
    sync();
  }, { threshold: [0, 0.35, 0.6, 1] });
  cvs.forEach((el) => io.observe(el));
  document.addEventListener('visibilitychange', sync);
  mqReduce.addEventListener?.('change', sync);
  conn.addEventListener?.('change', sync);
  document.addEventListener('gng:store', sync);
  // 画面幅がスマホ⇔PC で変わったら、その幅用の動画に入れ替える
  mqMobile.addEventListener?.('change', () => { cvs.forEach((el) => { if (el._v) { el._v.remove(); el._v = null; el.classList.remove('is-playing'); } }); sync(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cv-toggle]');
    if (!b) return;
    const off = !userOff();
    store.update((v) => { v.settings.video = off ? 'off' : 'auto'; });
    toast(off ? '背景の映像を停止しました（設定はこの端末に保存されます）' : '背景の映像を再生します');
  });
  const start = () => { ready = true; sync(); };
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 300));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
  sync();
}
