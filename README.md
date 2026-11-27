# GLOBAL NIGHT GUIDE — REFERENCE-LOCK UI SYSTEM V2.0

グローバルナイトガイドの記事を、オリジナルのデザインで配信する静的サイトです（Vercel で公開）。
見た目は 2 枚の完成デザイン画像（TOP・海外カテゴリ）に合わせて固定しています。色・寸法は `src/styles/00-tokens.css` にまとめています。

## 仕組み

- ビルド時に本番 WordPress の REST API（`/wp-json/wp/v2/`）から記事・カテゴリ・固定ページを取得し、全ページを静的 HTML として書き出します（SSG）。架空のデータは使いません。
- URL は本番と同じです（例：`/2965/`、`/category/海外風俗/`）。記事内の本番サイトへのリンクは、このサイトのページに書き換えます。
- 本番で記事を更新したら、Vercel の「Redeploy」で反映されます。

## 主な機能

| 機能 | 内容 |
| --- | --- |
| AppShell | PC：左サイドバー 216px（金の地球ロゴ・メイン／カテゴリー／サイト情報、折りたたみ可）＋高さ 60px のヘッダー（カテゴリのピル）／スマホ：高さ 56px のヘッダー（メニュー・ロゴ・検索）＋下部ナビ（ホーム・探す・ランキング・保存・ダッシュボード） |
| TOP | 夜景ヒーロー（白い検索欄＋金の検索ボタン、実データの記事数・国数）、エリアカード、3 カラム（ランキング｜注目の特集記事｜ダッシュボード・保存した記事）、ピックアップのカルーセル、新着 |
| カテゴリ（共通レイアウト） | パンくず、夜景ヒーロー（カテゴリ内検索・件数）、絞り込み・並び替え・表示切替、エリアカード、世界地図の特集バナー（海外）、ランキング、読みごたえのある記事、お役立ちツール、記事グリッド、ページ送り |
| 記事 | 読書進捗バー、目次（PC は右側に固定）、集中閲覧モード、文字サイズ、保存、共有、著者・出典、訂正・報告、画像の拡大表示 |
| エリア情報 `/area/` | 国・エリアのカード、記事数と最新公開日の比較 |
| ランキング `/ranking/` | 元サイトの人気記事ウィジェットの順位（閲覧数は持っていないので表示しない。取得できなければ「編集部のピックアップ」として新着を表示） |
| はじめての方へ `/guide/`・よくある質問 `/faq/` | このサイトの使い方だけを説明（元サイトに同じ URL のページがあればそちらを優先） |
| ダッシュボード `/my-dashboard/` | 保存記事（フォルダ管理）、閲覧履歴（初期オフ）、表示設定、データの一括削除 |
| 検索 `/search/` | キーワード＋カテゴリ（`?cat=` でカテゴリ内検索） |

## 画像

- ヒーローの夜景（東京・バンコク）は Higgsfield で生成したイメージ画像です。Vercel の画像最適化（WebP / AVIF）で配信し、画面に「イメージ画像（AI生成）」と表示します。読み込めないときや Vercel 以外でビルドしたときは、`src/img/` の SVG イラストを使います。
- `src/img/hero-*.svg` は `node scripts/gen-art.mjs` で描いたオリジナルのイラスト、`src/img/asia-map.svg` は Natural Earth（パブリックドメイン）の地形から作ったアジアの地図です。地図は文化・旅行・安全の記事への入口で、店舗の場所は載せていません。
- エリアカードには、その国・カテゴリの記事のアイキャッチ画像を使います。

保存記事・履歴・設定はブラウザの localStorage にだけ保存し、外部には送信しません。

## ファイル構成

```
build.mjs            ビルドの流れ（取得 → ページ生成 → サイトマップ・robots.txt）
lib/data.mjs         WordPress からの取得とデータ整形（読了時間は本文の文字数 ÷ 500）
lib/content.mjs      本文の整形（リンク書き換え、危険な要素の除去、目次、ギャラリー）
lib/components.mjs   共通コンポーネント（AppShell, GlobalHeader, DesktopSidebar, MobileBottomNavigation, MobileDrawer, ArticleCard, SwipeCarousel, TabNavigation, Pagination, TableOfContents, EmptyState, ErrorState, SkeletonLoader, Footer など）
lib/pages.mjs        各ページ（TOP, CategoryLayout, 記事, 特集, エリア情報, ランキング, はじめての方へ, よくある質問, 検索, ダッシュボード, 404）
src/img/             夜景イラストとアジア地図（SVG）
scripts/gen-art.mjs  夜景イラストを描くスクリプト
lib/icons.mjs        Lucide のアイコン
src/styles/          デザイントークン（00-tokens.css）と各スタイル
src/client/          ブラウザ側の動き（テーマ、ドロワー、カルーセル、保存、履歴、検索、ダッシュボード）
tests/               回帰テスト（ビルド検査・Playwright の画面テスト）
```

## コマンド

```
npm ci
npm run build        # 本番から取得して dist/ を作る
npm test             # ビルド結果の検査
npm run test:e2e     # 画面の操作テスト（Playwright）
```

ネットワークなしで確認するときは `GNG_FIXTURES=<dir> npm run build`（`categories.json` / `pages.json` / `posts.json` / `home.html` を置いたフォルダ）。

## 公開時の設定（環境変数）

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `INDEXABLE` | なし | `1` で検索エンジンに登録（プレビュー中は noindex ＋ robots.txt で拒否） |
| `CANONICAL_ORIGIN` | `https://globalnightguide.com` | canonical・サイトマップの URL |
| `IMG_OPT` | Vercel 上で有効 | Vercel の画像最適化（AVIF / WebP）を使うか |

Lighthouse の集計は `npx lighthouse ... --output=json` の結果フォルダに対して `node scripts/lighthouse-summary.mjs <フォルダ>` で表にできます。

## GLOBAL NIGHT COMMUNITY（Phase 1〜2・機能フラグで段階公開）

コミュニティ（掲示板・口コミ・コメント・参考になった・保存・通報・ブロック・プロフィール・管理画面）は、
ブラウザから Supabase（PostgreSQL・Auth・Storage）に直接つなぐ。**既定ではすべて OFF** で、OFF のビルドは従来とまったく同じ HTML になる。

| 変数 | 説明 |
| --- | --- |
| `GNG_FEATURES` | `all`（実装済みすべて）、`phase1`（Phase 1 だけ）、または `community,reviews,admin,social,live,pulse` から選んで有効化。空なら無効。`social` / `live` / `pulse` は Phase 2 のマイグレーションを適用してから |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | 公開用の anon キー（**service_role キーは入れない**。入れるとビルドを止める） |

- DB：`supabase/migrations/*.sql` を Supabase の SQL Editor で順に実行する。追加だけで、既存のデータは変更しない
- 権限：読み取りは RLS、書き込みはすべて DB 関数（RPC）経由。本人確認・入力検証・回数制限・集計・監査ログを DB 側で行う
- 最初の管理者：SQL Editor で `insert into user_roles (user_id, role) select id, 'admin' from user_profiles where handle = '<ユーザー名>';`
- ページ：`/community/`（一覧）、`/community/new/`（投稿）、`/community/post/?id=`、`/community/u/?h=`、`/community/me/`、`/community/login/`、`/community/rules/`、`/admin/community/`。記事ページに「口コミ・質問」欄、TOP にダイジェスト
- Phase 2：`/community/live/`（NIGHT LIVE・24 時間以内）、`/community/pulse/`（NIGHT PULSE）、`/community/passport/`（ランク・XP・バッジ・TRUST SCORE）、`/community/notifications/`（通知センター）、プロフィールのフォロー、フィードの「フォロー中」、質問のベストアンサー、管理画面の XP 調整・お知らせ
- XP はサーバーだけで付与（台帳 `experience_transactions` に冪等キー付きで記録）。自分への評価・作成 24 時間以内のアカウント・同じ相手からの 30 日 4 回目以降・1 日 100 XP 超は付与しない

### テスト

```
npm run test:db          # DB の権限・不正防止（PostgreSQL が必要：PGHOST / PGPORT / PGUSER）
npm run test:community   # コミュニティを有効にしたビルドの画面テスト（本物の PostgreSQL + tests/support の API 代替）
```

### ロールバック

- 画面だけ戻す：Vercel の環境変数 `GNG_FEATURES` を消して Redeploy（コミュニティのページと導線が消え、従来の表示に戻る）
- コードを戻す：`backup/pre-community-2026-11-26` ブランチ（タグ `pre-community-v4.3`）が導入前の main
- DB：追加したテーブルは既存サイトから参照されないので、残しておいても表示に影響しない
