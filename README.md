# 新デザイン見本（Vercel で公開するページ）

テーマの新しい見た目（`wp-content/themes/sango-theme/library/css/gng-refresh.css`）を、リンクで確認するための静的ページ。
WordPress とは関係なく、このフォルダだけで動く。

- `index.html`：見本のページ（トップ・記事・ビフォー・アフター画像の切り替え）
- `style.css`：見本の見た目。デザインを変えるときはここを編集する
- `images/`：本番で撮ったビフォー・アフター画像

Vercel では Framework Preset を「Other」（ビルドなし）にし、Root Directory はそのまま（`./`）にする。
元のテーマの CSS は rinov/globalnightguide の `wp-content/themes/sango-theme/library/css/gng-refresh.css`。
GitHub に push すると自動で公開し直される。
