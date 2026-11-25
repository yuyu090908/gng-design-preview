# GLOBAL NIGHT GUIDE 2.0

グローバルナイトガイドの記事を、オリジナルのデザインで配信する静的サイトです（Vercel で公開）。
コンセプトは「Premium International Night Editorial」。PC はダッシュボード型、スマホはアプリのような操作性です。

## 仕組み

- ビルド時に本番 WordPress の REST API（`/wp-json/wp/v2/`）から記事・カテゴリ・固定ページを取得し、全ページを静的 HTML として書き出します（SSG）。架空のデータは使いません。
- URL は本番と同じです（例：`/2965/`、`/category/海外風俗/`）。記事内の本番サイトへのリンクは、このサイトのページに書き換えます。
- 本番で記事を更新したら、Vercel の「Redeploy」で反映されます。

## 主な機能

| 機能 | 内容 |
| --- | --- |
| AppShell | PC：上部ヘッダー＋左サイドバー（開閉状態を保存、カテゴリはアコーディオン）／スマホ：低いヘッダー＋下部ナビ＋左ドロワー |
| TOP | コンパクトなヒーロー、実データの統計、Bento Grid（人気記事・エリア・サイト情報）、新着のスワイプカルーセル |
| カテゴリ | 共通レイアウト（パンくず・説明・件数・グリッド／リスト切替・新着／更新日／古い順・ページ送り・関連カテゴリ） |
| 記事 | 読書進捗バー、自動目次（PC は見ている見出しを強調）、文字サイズ、保存、共有、著者・出典、訂正・報告、画像ギャラリーと拡大表示 |
| マイダッシュボード `/my-dashboard/` | 保存記事（フォルダ管理）、閲覧履歴（初期オフ）、読書の進み具合、テーマ・文字サイズ、データの一括削除 |
| 検索 `/search/` | キーワード＋カテゴリで絞り込み（索引はサイト内の JSON。入力内容は外部に送らない） |

保存記事・履歴・設定はブラウザの localStorage にだけ保存し、外部には送信しません。

## ファイル構成

```
build.mjs            ビルドの流れ（取得 → ページ生成 → サイトマップ・robots.txt）
lib/data.mjs         WordPress からの取得とデータ整形（読了時間は本文の文字数 ÷ 500）
lib/content.mjs      本文の整形（リンク書き換え、危険な要素の除去、目次、ギャラリー）
lib/components.mjs   共通コンポーネント（AppShell, GlobalHeader, DesktopSidebar, MobileBottomNavigation, MobileDrawer, ArticleCard, SwipeCarousel, TabNavigation, Pagination, TableOfContents, EmptyState, ErrorState, SkeletonLoader, Footer など）
lib/pages.mjs        各ページ（TOP, CategoryLayout, 記事, 特集, 検索, マイダッシュボード, 404）
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
