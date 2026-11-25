// 画面を描く前に、保存されている表示設定（テーマ・文字サイズ・サイドバー）を反映する
(function () {
  var d = document.documentElement, s = {};
  try { s = (JSON.parse(localStorage.getItem('gng:v1')) || {}).settings || {}; } catch (e) {}
  var t = s.theme || 'dark';
  if (t === 'system') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  d.dataset.theme = t;
  d.dataset.fs = s.fontSize || 'm';
  if (s.sidebarCollapsed) d.classList.add('sb-collapsed');
  d.classList.add('js');
})();
