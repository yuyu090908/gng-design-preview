// ---------- この端末だけに保存するデータ（外部には送信しない） ----------
const KEY = 'gng:v1';
const AGE_KEY = 'gng:age';
const DEFAULT = () => ({ settings: { theme: 'dark', fontSize: 'm', historyEnabled: false, sidebarCollapsed: false, acc: {} }, folders: ['あとで読む'], saved: [], history: [], progress: {} });
const store = {
  read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (!v || typeof v !== 'object') return DEFAULT();
      const d = DEFAULT();
      return { ...d, ...v, settings: { ...d.settings, ...(v.settings || {}) } };
    } catch { return DEFAULT(); }
  },
  write(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { toast('この端末に保存できませんでした（プライベートブラウズ中の可能性があります）'); }
    document.dispatchEvent(new CustomEvent('gng:store'));
  },
  update(fn) { const v = store.read(); fn(v); store.write(v); return v; },
  wipe() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(AGE_KEY); } catch {}
    document.dispatchEvent(new CustomEvent('gng:store'));
  },
};
// 保存できる値だけを取り出す（XSS 対策：URL はサイト内のパスに限る）
const safePath = (u) => (typeof u === 'string' && /^\/[^/]/.test(u) && !/[<>"'\s]/.test(u) ? u : null);
const safeImg = (u) => (typeof u === 'string' && /^(https:\/\/globalnightguide\.com\/|\/_vercel\/image\?)/.test(u) && !/[<>"'\s]/.test(u) ? u : '');
const clip = (s, n) => String(s || '').slice(0, n);
