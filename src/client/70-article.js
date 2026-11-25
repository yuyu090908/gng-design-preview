// ---------- 記事ページ：読書進捗、目次、文字サイズ、共有、訂正・報告、画像の拡大、閲覧履歴 ----------
const art = $('[data-article]');
if (art) {
  const entry = $('[data-entry]', art);
  const bar = $('.rp__bar');
  const u = safePath(art.dataset.u);

  // 読書進捗（本文の読み進み具合）
  let maxPct = 0, lastSaved = 0;
  const progress = () => {
    const r = entry.getBoundingClientRect();
    const total = r.height - window.innerHeight * 0.6;
    const pct = Math.min(100, Math.max(0, ((-r.top + window.innerHeight * 0.3) / Math.max(1, total)) * 100));
    if (bar) bar.style.transform = `scaleX(${pct / 100})`;
    maxPct = Math.max(maxPct, pct);
  };
  let tk = false;
  window.addEventListener('scroll', () => { if (!tk) { tk = true; requestAnimationFrame(() => { progress(); tk = false; }); } }, { passive: true });
  progress();

  // 閲覧履歴（設定で有効にしたときだけ記録する）
  const recordHistory = () => {
    const s = store.read();
    if (!s.settings.historyEnabled || !u) return;
    store.update((v) => {
      v.history = [{ u, t: clip(art.dataset.t, 200), i: safeImg(art.dataset.i), c: clip(art.dataset.c, 40), at: new Date().toISOString() }, ...v.history.filter((h) => h.u !== u)].slice(0, 200);
    });
  };
  const saveProgress = () => {
    if (!u || !store.read().settings.historyEnabled) return;
    const pct = Math.round(maxPct);
    if (pct - lastSaved < 5 && pct < 100) return;
    lastSaved = pct;
    store.update((v) => { v.progress[u] = Math.max(v.progress[u] || 0, pct); });
  };
  recordHistory();
  setInterval(saveProgress, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveProgress(); });

  // 目次：スマホでは最初は閉じる。PC では見えている見出しを強調する
  const toc = $('[data-toc]');
  if (toc) {
    if (!isDesktop() || matchMedia('(max-width: 1279px)').matches) toc.open = false;
    toc.addEventListener('click', (e) => {
      const a = e.target.closest('[data-toc-link]');
      if (a && matchMedia('(max-width: 1279px)').matches) toc.open = false;
    });
    const links = new Map($$('[data-toc-link]', toc).map((a) => [a.getAttribute('href').slice(1), a]));
    const heads = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting) en.target.dataset.seen = '1'; else if (en.boundingClientRect.top > 0) delete en.target.dataset.seen; });
      const current = heads.filter((h) => h.dataset.seen).pop() || heads.filter((h) => h.getBoundingClientRect().top < 120).pop();
      links.forEach((a) => a.removeAttribute('aria-current'));
      if (current) {
        const a = links.get(current.id);
        a?.setAttribute('aria-current', 'location');
        if (a && matchMedia('(min-width: 1280px)').matches) {
          const list = toc.querySelector('.toc__list');
          const top = a.offsetTop - list.clientHeight / 2;
          list.scrollTo({ top, behavior: 'auto' });
        }
      }
    }, { rootMargin: '-80px 0px -65% 0px' });
    heads.forEach((h) => io.observe(h));
  }

  // 表示設定（文字サイズ・テーマ・集中モード）はボトムシートで選ぶ
  const FSL = { s: '小', m: '標準', l: '大', xl: '特大' };
  const syncFs = () => {
    const f = store.read().settings.fontSize || 'm';
    root.dataset.fs = f;
    $$('[data-fontsize-label]').forEach((el) => { el.textContent = FSL[f] || '標準'; });
  };
  $$('[data-read-settings]').forEach((btn) => btn.addEventListener('click', () => {
    const st = store.read().settings;
    openSheet({
      title: '表示設定',
      html: `<fieldset class="opt"><legend>文字サイズ</legend>${chips('rs-fs', Object.entries(FSL), st.fontSize || 'm')}</fieldset>`
        + `<fieldset class="opt"><legend>表示モード</legend>${chips('rs-theme', [['system', '端末に合わせる'], ['dark', 'ダーク'], ['light', 'ライト']], st.theme || 'dark')}</fieldset>`
        + `<div class="opt"><p class="opt__t">集中モード</p><button class="btn btn--ghost btn--block" type="button" data-rs-focus>${icon('focus', 16)}${root.classList.contains('is-focus') ? '集中モードを終了する' : '本文だけを表示する'}</button></div>`,
      onOpen: (body, close) => {
        body.addEventListener('change', (e) => {
          if (e.target.name === 'rs-fs') { store.update((v) => { v.settings.fontSize = e.target.value; }); syncFs(); }
          if (e.target.name === 'rs-theme') { store.update((v) => { v.settings.theme = e.target.value; }); applySettings(); }
        });
        $('[data-rs-focus]', body).addEventListener('click', () => { close(); $('[data-focus]', art)?.click(); });
      },
    });
  }));
  syncFs();

  // 前回の続きから読む（閲覧履歴がオンで、途中まで読んだ記録があるときだけ。勝手にはスクロールしない）
  const resume = $('[data-resume]', art);
  {
    const v = store.read();
    const pct = u && v.settings.historyEnabled ? v.progress[u] || 0 : 0;
    if (resume && pct > 5 && pct < 95) {
      resume.hidden = false;
      $('[data-resume-label]', resume).textContent = `前回の続き（${Math.round(pct)}%）から読む`;
      $('[data-resume-btn]', resume).addEventListener('click', () => {
        const r = entry.getBoundingClientRect();
        const vh = window.innerHeight;
        const y = window.scrollY + r.top - vh * 0.3 + (pct / 100) * (r.height - vh * 0.6);
        window.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
        resume.hidden = true;
      });
    }
  }

  // 共有（使える端末では共有シート、無ければ URL をコピー）
  // 集中閲覧モード（メニューと目次を隠して本文だけにする。Esc でも戻る）
  const focusBtn = $('[data-focus]', art);
  if (focusBtn) {
    let exitBtn = null;
    const setFocus = (on) => {
      document.documentElement.classList.toggle('is-focus', on);
      focusBtn.setAttribute('aria-pressed', String(on));
      if (on && !exitBtn) {
        exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.className = 'btn btn--ghost btn--sm focus-exit';
        exitBtn.innerHTML = `${icon('x', 16)}集中閲覧モードを終了`;
        exitBtn.addEventListener('click', () => setFocus(false));
        document.body.appendChild(exitBtn);
      }
      if (exitBtn) exitBtn.hidden = !on;
      toast(on ? '集中閲覧モードにしました（Esc で終了）' : '集中閲覧モードを終了しました');
    };
    focusBtn.addEventListener('click', () => setFocus(!document.documentElement.classList.contains('is-focus')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.documentElement.classList.contains('is-focus') && !openStack.length) setFocus(false); });
  }

  $('[data-share]', art)?.addEventListener('click', async () => {
    const data = { title: document.title, url: location.origin + location.pathname };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      toast('記事の URL をコピーしました');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('共有できませんでした。アドレスバーの URL をコピーしてください');
    }
  });

  // 訂正・報告（送信はせず、内容をコピーしてお問い合わせへ）
  const rep = $('#report');
  let closeRep = null;
  $$('[data-report-open]').forEach((b) => b.addEventListener('click', () => { closeRep = openModal(rep); }));
  rep?.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) closeRep?.(); });
  $('[data-report-form]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const detail = String(f.get('detail') || '').trim().slice(0, 1000);
    const textOut = `【訂正・報告】\n対象：${f.get('page')}\n種類：${f.get('kind')}\n内容：${detail || '（なし）'}`;
    try { await navigator.clipboard.writeText(textOut); toast('内容をコピーしました。お問い合わせページに貼り付けてください'); }
    catch { toast('コピーできませんでした。内容を控えてからお問い合わせください'); }
  });

  // 画像の拡大表示（横スワイプ・ボタン・キーボードで前後へ）
  const lb = $('#lightbox');
  const imgs = $$('img', entry).filter((im) => !im.closest('a') && !im.closest('.faceicon') && (im.width >= 120 || im.closest('.gallery')));
  if (lb && imgs.length) {
    const track = $('.lb__track', lb);
    const count = $('.lb__count', lb);
    const zoomBtn = $('[data-lb-zoom]', lb);
    let closeLb = null, idx = 0;
    const show = (i, smooth = true) => {
      idx = (i + imgs.length) % imgs.length;
      track.children[idx]?.scrollIntoView({ behavior: smooth && !reduced() ? 'smooth' : 'auto', inline: 'start', block: 'nearest' });
      count.textContent = `${idx + 1} / ${imgs.length}`;
    };
    const setZoom = (on) => { lb.classList.toggle('is-zoom', on); zoomBtn.setAttribute('aria-pressed', String(on)); zoomBtn.setAttribute('aria-label', on ? '縮小' : '拡大'); };
    imgs.forEach((im, i) => {
      im.classList.add('zoomable');
      im.setAttribute('tabindex', '0');
      im.setAttribute('role', 'button');
      im.setAttribute('aria-label', (im.alt ? im.alt + '：' : '') + '画像を拡大');
      const open = () => {
        track.innerHTML = imgs.map((x) => `<li class="lb__item"><img src="${esc(x.currentSrc || x.src)}" alt="${esc(x.alt)}" decoding="async"></li>`).join('');
        setZoom(false);
        closeLb = openModal(lb);
        requestAnimationFrame(() => show(i, false));
      };
      im.addEventListener('click', open);
      im.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    track.addEventListener('scroll', () => {
      const w = track.clientWidth || 1;
      const i = Math.round(track.scrollLeft / w);
      if (i !== idx && i >= 0 && i < imgs.length) { idx = i; count.textContent = `${idx + 1} / ${imgs.length}`; setZoom(false); }
    }, { passive: true });
    $('[data-lb-prev]', lb).addEventListener('click', () => show(idx - 1));
    $('[data-lb-next]', lb).addEventListener('click', () => show(idx + 1));
    $('[data-lb-close]', lb).addEventListener('click', () => closeLb?.());
    zoomBtn.addEventListener('click', () => setZoom(!lb.classList.contains('is-zoom')));
    track.addEventListener('dblclick', () => setZoom(!lb.classList.contains('is-zoom')));
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); }
    });
  }
}
