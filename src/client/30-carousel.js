// ---------- 横スワイプのカルーセル（CSS Scroll Snap が基本。ボタン・キーボード・マウスのドラッグにも対応） ----------
function initCarousel(c) {
  const track = c.querySelector('.carousel__track');
  const prev = c.querySelector('[data-prev]');
  const next = c.querySelector('[data-next]');
  if (!track) return;
  const step = () => {
    const item = track.querySelector('.carousel__item');
    if (!item) return track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const per = Math.max(1, Math.floor((track.clientWidth + gap) / (item.offsetWidth + gap)));
    return per * (item.offsetWidth + gap);
  };
  const go = (dir) => track.scrollBy({ left: dir * step(), behavior: reduced() ? 'auto' : 'smooth' });
  // ドット（表示中の位置を示す。ページ数＝はみ出した分＋1）
  const dots = c.querySelector('[data-dots]');
  const pos = c.querySelector('[data-pos]');
  const live = c.querySelector('[data-live]');
  const total = track.children.length;
  let pages = 0, lastFirst = -1, liveTimer = 0;
  const sync = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= max;
    c.classList.toggle('is-static', max <= 0);
    if (dots) {
      const n = max <= 0 ? 0 : Math.min(8, Math.ceil(track.scrollWidth / Math.max(1, track.clientWidth)));
      if (n !== pages) { pages = n; dots.innerHTML = '<span></span>'.repeat(n); }
      const i = n ? Math.round((track.scrollLeft / Math.max(1, max)) * (n - 1)) : 0;
      [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i));
    }
    // 位置の表示（何件目から見えているか）。読み上げは止まってから 1 回だけ
    const items = [...track.children];
    const left = track.scrollLeft;
    let first = items.findIndex((it) => it.offsetLeft - track.offsetLeft + it.offsetWidth / 2 > left + (parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0));
    if (first < 0) first = items.length - 1;
    const per = Math.max(1, Math.round(track.clientWidth / Math.max(1, items[0]?.offsetWidth || 1)));
    const lastShown = Math.min(total, first + per);
    if (pos) pos.textContent = (first + 1) + '–' + lastShown + ' / ' + total;
    if (live && first !== lastFirst && lastFirst !== -1) { clearTimeout(liveTimer); liveTimer = setTimeout(() => { live.textContent = total + '件中 ' + (first + 1) + '件目から表示'; }, 400); }
    lastFirst = first;
  };
  prev?.addEventListener('click', () => go(-1));
  next?.addEventListener('click', () => go(1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'Home') { e.preventDefault(); track.scrollTo({ left: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
    if (e.key === 'End') { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: reduced() ? 'auto' : 'smooth' }); }
  });
  let raf = 0;
  track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
  new ResizeObserver(sync).observe(track);
  sync();

  // マウスでのドラッグ（タッチは標準のスクロールに任せる）
  let down = null, moved = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = { x: e.clientX, left: track.scrollLeft };
    moved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); }
    if (moved) track.scrollLeft = down.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = null;
    if (moved) {
      track.classList.remove('is-dragging');
      // ドラッグ後に一番近いカードの位置へ合わせる
      const items = [...track.children];
      const left = track.scrollLeft;
      const near = items.reduce((a, b) => (Math.abs(b.offsetLeft - track.offsetLeft - left) < Math.abs(a.offsetLeft - track.offsetLeft - left) ? b : a), items[0]);
      if (near) track.scrollTo({ left: near.offsetLeft - track.offsetLeft - parseFloat(getComputedStyle(track).scrollPaddingLeft || 0), behavior: reduced() ? 'auto' : 'smooth' });
    }
  });
  // ドラッグした直後のクリックでリンクが開かないようにする
  track.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}
$$('[data-carousel]').forEach(initCarousel);
