// 機能フラグ（GLOBAL NIGHT COMMUNITY を段階的に公開するためのスイッチ）
//
//   GNG_FEATURES   カンマ区切りで有効にする機能。既定は空＝既存サイトと同じ表示
//                   community … コミュニティ（掲示板・投稿・プロフィール・ログイン）と、ナビへの追加
//                   reviews   … 記事ページの「口コミ・質問」欄と、TOP のコミュニティのダイジェスト
//                   admin     … 運営管理画面 /admin/community/
//                   all       … Phase 1 の機能をすべて
//   SUPABASE_URL / SUPABASE_ANON_KEY
//                   接続先（公開してよい anon キー。サービスロールのキーは絶対に入れない）
//
// Phase 2 以降の機能（live / passport / ai / radar など）は、実装とテストが済んだものから足していく。
const PHASE1 = ['community', 'reviews', 'admin'];
const raw = (process.env.GNG_FEATURES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const list = new Set(raw.includes('all') ? PHASE1 : raw.filter((f) => PHASE1.includes(f)));
// 口コミ欄と管理画面は、コミュニティ本体が有効なときだけ使える
if (!list.has('community')) list.clear();

export const FEATURES = list;
export const feature = (name) => FEATURES.has(name);
export const COMMUNITY = feature('community');

const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (process.env.SUPABASE_ANON_KEY || '').trim();
if (key && /service_role/.test(Buffer.from((key.split('.')[1] || ''), 'base64').toString())) {
  throw new Error('SUPABASE_ANON_KEY にサービスロールのキーが設定されています。公開用の anon キーを設定してください');
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) {
  throw new Error(`SUPABASE_URL の形式が正しくありません: ${url}`);
}
export const BACKEND = { url, key, ready: !!(url && key) };

// ブラウザに渡す設定（公開してよい値だけ）
export const clientConfig = () => JSON.stringify({ url: BACKEND.url, key: BACKEND.key, features: [...FEATURES] }).replace(/</g, '\\u003c');
