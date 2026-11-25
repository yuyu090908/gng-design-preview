// ---------- タブ（JavaScript が無い環境では全パネルを表示したまま＝リンクも検索エンジンから見える） ----------
function initTabs(t) {
  const tabs = $$('[role="tab"]', t).filter((x) => x.closest('[data-tabs]') === t);
  const panels = tabs.map((x) => document.getElementById(x.getAttribute('aria-controls')));
  const select = (i, focus = false) => {
    tabs.forEach((x, k) => {
      const on = k === i;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      if (panels[k]) panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
    t.dispatchEvent(new CustomEvent('tabchange', { detail: { index: i } }));
  };
  tabs.forEach((x, i) => {
    x.addEventListener('click', () => select(i));
    x.addEventListener('keydown', (e) => {
      const n = tabs.length;
      if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % n, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select((i - 1 + n) % n, true); }
      if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      if (e.key === 'End') { e.preventDefault(); select(n - 1, true); }
    });
  });
  t.selectTab = select;
  select(Math.max(0, tabs.findIndex((x) => x.getAttribute('aria-selected') === 'true')));
}
$$('[data-tabs]').forEach(initTabs);
