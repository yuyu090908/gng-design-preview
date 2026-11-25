// 目次の折りたたみ（スマホでは最初は大見出しだけ表示）と、ページ先頭へ戻るボタン
{
  const toc = document.getElementById('toc_container');
  if (toc) {
    const title = toc.querySelector('.toc_title');
    const subs = toc.querySelectorAll('.toc_list ul');
    if (title && subs.length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toc-btn';
      const set = (folded) => {
        toc.classList.toggle('is-folded', folded);
        btn.textContent = folded ? 'すべて表示' : '大見出しだけ';
        btn.setAttribute('aria-expanded', String(!folded));
      };
      set(window.matchMedia('(max-width: 767px)').matches);
      btn.addEventListener('click', () => set(!toc.classList.contains('is-folded')));
      title.appendChild(btn);
    }
  }
  const top = document.querySelector('.totop');
  if (top) {
    const onScroll = () => top.classList.toggle('is-on', window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    top.addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0 }); });
  }
}
