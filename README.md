# グローバルナイトガイド 新デザイン（Vercel 確認用サイト）

本番サイト（https://globalnightguide.com）の次のページを取得し、新しいデザインで表示する静的サイト。

| このサイト | 元のページ |
| --- | --- |
| `/` | トップ |
| `/about/` | 自己紹介 |
| `/contact/` | お問い合わせ（送信は本番のフォームへ案内） |
| `/category/海外風俗/` | 海外風俗カテゴリ |
| `/2965/` | 吉原おすすめソープランド80選 |
| `/design/` | 変更前・変更後の比較画像 |

ここに無いページへのリンクは本番サイトを開く。

## しくみ

- Vercel のビルド（`npm run build` → `build.mjs`）で本番のページを取得し、本文を取り出して `dist/` に書き出す
- 本番の記事を書き換えたら、Vercel で Redeploy するだけで中身も最新になる
- 見た目は `src/site.css`、目次の折りたたみなどは `src/site.js`
- ページを増やすときは `build.mjs` の `PAGES` に足す

## 手元で試す

```
npm install
npm run build   # dist/ ができる
```
