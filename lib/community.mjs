// GLOBAL NIGHT COMMUNITY のページ（Phase 1）
// ページの枠（見出し・タブ・フォーム・空の状態）だけを静的に書き出し、投稿などの中身はブラウザが
// Supabase から読み込んで描く。架空の投稿・評価・ユーザーは一切書き出さない。
import { icon } from './icons.mjs';
import { href } from './content.mjs';
import { AppShell, Breadcrumbs, breadcrumbLd, EmptyState, esc, SITE } from './components.mjs';
import { Cinematic } from './pages.mjs';
import { BACKEND, feature } from './features.mjs';

// 投稿の種類・掲示板のカテゴリ・評価項目（画面と DB で同じ値を使う）
export const POST_TYPES = [
  ['review', '店舗の感想', 'star', '行ったお店の感想と評価'],
  ['question', '質問', 'help', '料金・エリア・はじめての不安など'],
  ['recommend', 'おすすめ情報', 'sparkles', 'おすすめの店舗・エリア・過ごし方'],
  ['event', 'イベント情報', 'calendar', '開催予定・開催中のイベント'],
  ['talk', 'フリートーク', 'message', 'ナイトライフ全般の雑談'],
];
export const FORUM_CATS = [
  ['review', '店舗レビュー'], ['recommend', 'おすすめ店舗'], ['question', '質問・相談'], ['budget', '料金・予算情報'], ['event', 'イベント情報'],
  ['local', '現地情報'], ['beginner', 'ナイトライフ初心者'], ['chat', '雑談'], ['caution', '注意事項・トラブル情報'], ['region', '国・都市別'],
];
export const VENUE_CATS = [['bar', 'バー'], ['club', 'クラブ'], ['karaoke', 'カラオケ'], ['cabaret', 'キャバクラ・ラウンジ'], ['soapland', 'ソープランド'], ['delivery', 'デリバリー'], ['massage', 'マッサージ'], ['restaurant', '飲食店'], ['other', 'その他']];

const crumbs = (list) => [{ name: 'ホーム', path: '/' }, ...list];
const NotReady = () => `<div data-com-offline hidden>${EmptyState({ ic: 'alert', title: 'コミュニティは準備中です', text: '接続の設定が終わると、ここに投稿が表示されます。' })}</div>`;
const Shell = (site, assets, o) => AppShell(site, assets, { ...o, community: true, body: `${o.body}${NotReady()}` });
const ComHead = ({ en, title, desc, list }) => `<header class="ph cph">${Breadcrumbs(crumbs(list))}<p class="ph__en">${esc(en)}</p><h1 class="ph__t">${esc(title)}</h1>${desc ? `<p class="ph__d">${esc(desc)}</p>` : ''}</header>`;

// 地域の絞り込み（国 → 都市 → エリア）。選択肢は DB から読み込む
const RegionSelects = (id) => `<div class="cf__region" data-region="${id}">
<label class="cf__f"><span class="sr">国</span><select class="input input--sm" data-region-country><option value="">すべての国</option></select></label>
<label class="cf__f"><span class="sr">都市</span><select class="input input--sm" data-region-city disabled><option value="">すべての都市</option></select></label>
<label class="cf__f"><span class="sr">エリア</span><select class="input input--sm" data-region-area disabled><option value="">すべてのエリア</option></select></label>
</div>`;

// ---------- /community/ ----------
export function communityPage(site, assets) {
  const tabs = [['foryou', 'For You'], ['latest', '最新投稿'], ['popular', '人気投稿'], ['review', '店舗レビュー'], ['question', '質問・相談']];
  const hero = Cinematic('heroes/overseas-bangkok', { cls: 'nhero__cv', prio: 1, eager: true, toggle: true });
  const body = `
<section class="nhero" aria-labelledby="nhero-t">
  ${hero}
  <div class="nhero__in">
    <p class="nhero__en">Discover. Connect. Experience.</p>
    <h1 class="nhero__t" id="nhero-t">GLOBAL NIGHT COMMUNITY</h1>
    <p class="nhero__sub" lang="en">Discover the night through real experiences.</p>
    <p class="nhero__lead">世界の夜を、リアルな体験から発見する。</p>
    <p class="nhero__cta">
      <a class="btn btn--primary" href="/community/login/?mode=signup" data-when="guest">${icon('users', { size: 18 })}コミュニティに参加する</a>
      <a class="btn btn--primary" href="/community/new/" data-when="member" hidden>${icon('pencil', { size: 18 })}投稿する</a>
      <a class="btn btn--glass" href="#feed">最新の投稿を見る${icon('down', { size: 16 })}</a>
    </p>
  </div>
</section>

<div class="clay">
<div class="clay__main">
  <nav class="ctabs" aria-label="投稿の並び" data-feed-tabs>
    <ul class="ctabs__list">${tabs.map(([k, l], i) => `<li><button class="ctab" type="button" data-tab="${k}" aria-pressed="${i === 1}">${esc(l)}</button></li>`).join('')}</ul>
  </nav>
  <details class="cf" data-filters>
    <summary class="cf__sum">${icon('filter', { size: 16 })}<span>絞り込み</span><span class="cf__now" data-filter-summary>すべての地域</span>${icon('down', { size: 16, cls: 'cf__chev' })}</summary>
    <form class="cf__body" data-filter-form>
      ${RegionSelects('feed')}
      <label class="cf__f"><span class="sr">カテゴリー</span><select class="input input--sm" name="category"><option value="">すべてのカテゴリー</option>${FORUM_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
      <label class="cf__f"><span class="sr">投稿タイプ</span><select class="input input--sm" name="type"><option value="">すべての投稿タイプ</option>${POST_TYPES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
      <p class="cf__act"><button class="btn btn--ghost btn--sm" type="reset" data-filter-reset>条件をクリア</button><span class="cf__note">${icon('check', { size: 14 })}選んだ地域は次回も使います</span></p>
    </form>
  </details>
  <p class="cnew" data-new-banner hidden><button class="btn btn--primary btn--sm" type="button" data-new-load>${icon('up', { size: 14 })}<span data-new-count></span></button></p>
  <section id="feed" class="feed" aria-label="投稿" aria-busy="true" data-feed>
    <div class="feed__list" data-feed-list>${SkeletonPosts(3)}</div>
    <div class="feed__more"><button class="btn btn--ghost btn--more" type="button" data-feed-more hidden>さらに読み込む</button></div>
  </section>
</div>
<aside class="clay__side" aria-label="コミュニティの補助情報">
  <section class="cside" aria-labelledby="cs-pop"><h2 class="cside__t" id="cs-pop">${icon('thumb', { size: 16 })}今週参考になった投稿</h2><ol class="cside__list" data-side-popular><li class="cside__empty">読み込み中…</li></ol></section>
  <section class="cside" aria-labelledby="cs-area"><h2 class="cside__t" id="cs-area">${icon('pin', { size: 16 })}投稿の多いエリア（30日）</h2><ol class="cside__list" data-side-areas><li class="cside__empty">読み込み中…</li></ol></section>
  <section class="cside" aria-labelledby="cs-rule"><h2 class="cside__t" id="cs-rule">${icon('shield', { size: 16 })}コミュニティのルール</h2><ul class="cside__rules"><li>実際の体験だけを書く</li><li>スタッフ・他の利用者を特定できる情報は書かない</li><li>本人の同意のない写真は載せない</li><li>違法なサービスの勧誘・依頼は禁止</li></ul><a class="tbtn" href="/community/rules/">ルールを詳しく見る${icon('right', { size: 14 })}</a></section>
</aside>
</div>
<a class="fab" href="/community/new/" data-fab aria-label="新しく投稿する">${icon('pencil', { size: 22 })}<span class="fab__l">投稿する</span></a>
${ReportDialogCom()}
${ImageViewer()}`;
  return Shell(site, assets, {
    path: '/community/', title: 'GLOBAL NIGHT COMMUNITY', description: '世界の夜を、リアルな体験から発見する。ナイトライフの口コミ・質問・現地情報を共有するコミュニティ。',
    body, bodyClass: 'p-com p-com-top', jsonld: [breadcrumbLd(crumbs([{ name: 'コミュニティ' }]))],
  });
}

export const SkeletonPosts = (n) => `<div aria-hidden="true">${'<div class="pc pc--sk"><div class="pc__hd"><span class="sk-c"></span><span class="sk-l"></span></div><span class="sk-l sk-l--w"></span><span class="sk-l sk-l--w"></span><span class="sk-l"></span></div>'.repeat(n)}</div>`;

// ---------- /community/post/?id= ----------
export function postPage(site, assets) {
  const body = `
${ComHead({ en: 'COMMUNITY POST', title: '投稿', list: [{ name: 'コミュニティ', path: '/community/' }, { name: '投稿' }] })}
<div class="clay clay--narrow">
<div class="clay__main">
  <div data-post-view aria-busy="true">${SkeletonPosts(1)}</div>
  <section class="cmts" aria-labelledby="cmts-t" data-comments hidden>
    <h2 class="cmts__t" id="cmts-t">${icon('message', { size: 18 })}コメント<span class="cmts__n" data-comment-count></span></h2>
    <form class="cmt-form" data-comment-form hidden>
      <label class="sr" for="cmt-body">コメント</label>
      <textarea class="input ta" id="cmt-body" name="body" rows="3" maxlength="2000" required placeholder="丁寧な言葉でコメントしましょう（2000文字まで）"></textarea>
      <div class="cmt-form__bar"><span class="cmt-form__reply" data-reply-to hidden></span><button class="btn btn--primary btn--sm" type="submit">${icon('send', { size: 16 })}コメントする</button></div>
    </form>
    <p class="cmts__login" data-comment-login hidden><a class="btn btn--ghost btn--sm" href="/community/login/">ログインしてコメントする</a></p>
    <ol class="cmt-list" data-comment-list></ol>
  </section>
</div>
</div>
${ReportDialogCom()}
${ImageViewer()}`;
  return Shell(site, assets, { path: '/community/post/', title: 'コミュニティの投稿', body, bodyClass: 'p-com p-com-post', robots: 'noindex,follow' });
}

// ---------- /community/new/ ----------
const ASPECTS = [['overall', '総合評価'], ['service', '接客'], ['atmosphere', '雰囲気'], ['cleanliness', '清潔感'], ['price_clarity', '料金の明確さ'], ['value', 'コストパフォーマンス'], ['safety', '安心感'], ['drinks', 'ドリンク'], ['music', '音楽']];
const Stars = (name, label, req = false) => `<fieldset class="stars" data-aspect="${name}"${name === 'overall' ? '' : ' data-optional'}><legend class="stars__l">${esc(label)}${req ? '<span class="req">必須</span>' : ''}</legend><div class="stars__b">${[1, 2, 3, 4, 5].map((n) => `<label class="stars__s"><input class="sr" type="radio" name="r_${name}" value="${n}"${req && n === 1 ? ' required' : ''}><span aria-hidden="true">★</span><span class="sr">${n}</span></label>`).join('')}<button class="stars__x" type="button" data-star-clear aria-label="${esc(label)}の評価を取り消す">${icon('x', { size: 14 })}</button></div></fieldset>`;
export function composerPage(site, assets) {
  const types = POST_TYPES.map(([v, l, ic, d]) => `<label class="ptype"><input class="sr" type="radio" name="type" value="${v}" required><span class="ptype__b">${icon(ic, { size: 22 })}<b>${esc(l)}</b><small>${esc(d)}</small></span></label>`).join('');
  const body = `
${ComHead({ en: 'NEW POST', title: '投稿する', desc: '実際の体験・確かな情報だけを書いてください。投稿は誰でも読めます。', list: [{ name: 'コミュニティ', path: '/community/' }, { name: '投稿する' }] })}
<div class="clay clay--narrow">
<div class="clay__main">
<div data-need-login hidden>${EmptyState({ ic: 'lock', title: '投稿するにはログインが必要です', text: 'ニックネームで参加できます。本名やメールアドレスが公開されることはありません。', action: '<a class="btn btn--primary" href="/community/login/?mode=signup&amp;next=/community/new/">無料で参加する</a> <a class="btn btn--ghost" href="/community/login/?next=/community/new/">ログイン</a>' })}</div>
<form class="cform" data-composer hidden novalidate>
  <fieldset class="cform__sec"><legend class="cform__h"><span class="cform__n">1</span>投稿の種類</legend><div class="ptypes">${types}</div></fieldset>

  <div class="cform__sec" data-step="2" hidden>
    <h2 class="cform__h"><span class="cform__n">2</span><span data-step2-title>内容</span></h2>
    <div class="cform__grid">
      <label class="field"><span>掲示板のカテゴリー</span><select class="input" name="category">${FORUM_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
      <div class="field"><span>地域（任意）</span>${RegionSelects('composer')}</div>
    </div>

    <div data-only="review" hidden>
      <div class="field"><span>口コミの対象<span class="req">必須</span></span>
        <div class="target" data-target-box>
          <label class="sr" for="target-q">記事・店舗を検索</label>
          <input class="input" id="target-q" type="search" placeholder="記事のタイトル・店舗名で検索" autocomplete="off" data-target-q>
          <ul class="target__list" data-target-list role="listbox" aria-label="候補"></ul>
          <p class="target__chosen" data-target-chosen hidden></p>
        </div>
        <small class="field__hint">サイトの記事か、運営が登録した店舗から選びます。見つからない店舗は「店舗を登録申請」から送ってください（確認後に公開）。</small>
      </div>
      <div class="cform__grid">
        <label class="field"><span>店舗の種類（評価項目が変わります）</span><select class="input" name="venue_category" data-venue-cat>${VENUE_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <label class="field"><span>訪問日（任意）</span><input class="input" type="date" name="visit_date" data-visit-date></label>
      </div>
      <div class="ratings" data-ratings>${ASPECTS.map(([k, l]) => Stars(k, l, k === 'overall')).join('')}</div>
      <div class="cform__grid">
        <div class="field"><span>実際の利用金額（任意）</span><div class="money"><input class="input" type="number" name="spend_amount" min="0" step="1" inputmode="numeric" placeholder="例：3000"><select class="input" name="spend_currency" aria-label="通貨">${['JPY', 'THB', 'KRW', 'TWD', 'VND', 'PHP', 'KHR', 'IDR', 'SGD', 'MYR', 'EUR', 'USD'].map((c) => `<option>${c}</option>`).join('')}</select></div></div>
        <fieldset class="field"><legend>また行きたい？（任意）</legend><div class="seg seg--wide">${[['yes', '行きたい'], ['maybe', 'どちらとも'], ['no', '行かない']].map(([v, l]) => `<label class="seg__b"><input class="sr" type="radio" name="revisit" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
      </div>
    </div>

    <label class="field"><span>タイトル（任意・120文字まで）</span><input class="input" name="title" maxlength="120" autocomplete="off"></label>
    <label class="field"><span data-body-label>本文</span><span class="req">必須</span><textarea class="input ta" name="body" rows="8" maxlength="5000" required data-body></textarea><small class="field__hint"><span data-body-hint>体験したことを具体的に書いてください。</span> <span class="count" data-count>0 / 5000</span></small></label>

    <div class="field"><span>画像（任意・4枚まで）</span>
      <div class="up" data-uploader>
        <label class="up__add"><input class="sr" type="file" accept="image/jpeg,image/png,image/webp" multiple data-file>${icon('image', { size: 20 })}<span>画像を追加</span></label>
        <ul class="up__list" data-up-list></ul>
      </div>
      <small class="field__hint">${icon('shield', { size: 13 })}位置情報などの撮影データは、送信前にこの端末で削除します。人の顔や、本人の同意のない写真は載せないでください。</small>
    </div>

    <p class="cform__rules"><label class="check"><input type="checkbox" name="agree" required><span><a href="/community/rules/" target="_blank" rel="noopener">コミュニティのルール</a>を守り、実際の体験・確かな情報だけを投稿します</span></label></p>
    <p class="cform__err" role="alert" data-form-error hidden></p>
    <div class="cform__bar">
      <span class="cform__saved" data-autosave aria-live="polite"></span>
      <button class="btn btn--ghost" type="button" data-preview>${icon('eye', { size: 16 })}プレビュー</button>
      <button class="btn btn--ghost" type="button" data-save-draft>下書き保存</button>
      <button class="btn btn--primary" type="submit" data-submit>${icon('send', { size: 16 })}<span data-submit-l>投稿する</span></button>
    </div>
  </div>
</form>
<section class="cprev" data-preview-box hidden aria-labelledby="prev-t"><h2 class="cform__h" id="prev-t">${icon('eye', { size: 18 })}プレビュー（まだ投稿されていません）</h2><div data-preview-body></div><button class="btn btn--ghost btn--sm" type="button" data-preview-close>編集に戻る</button></section>
<details class="vsug" data-venue-suggest hidden><summary>${icon('plus', { size: 16 })}店舗を登録申請する</summary>
<form class="cform__grid" data-venue-form>
<label class="field"><span>店舗名</span><input class="input" name="name" maxlength="80" required></label>
<label class="field"><span>種類</span><select class="input" name="category">${VENUE_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
<div class="field"><span>地域</span>${RegionSelects('venue')}</div>
<p><button class="btn btn--ghost btn--sm" type="submit">申請する</button> <small class="field__hint">運営が確認してから公開します。</small></p>
</form></details>
</div>
</div>`;
  return Shell(site, assets, { path: '/community/new/', title: '投稿する', body, bodyClass: 'p-com p-com-new', robots: 'noindex,nofollow' });
}

// ---------- /community/login/ ----------
export function loginPage(site, assets) {
  const body = `
${ComHead({ en: 'JOIN THE COMMUNITY', title: 'ログイン・新規登録', desc: 'ニックネームで参加できます。本名・メールアドレスは公開されません。', list: [{ name: 'コミュニティ', path: '/community/' }, { name: 'ログイン' }] })}
<div class="clay clay--narrow"><div class="clay__main">
<div class="auth" data-auth>
  <div class="seg seg--wide auth__mode" role="group" aria-label="ログインか新規登録か"><button class="seg__b" type="button" data-mode="login" aria-pressed="true">ログイン</button><button class="seg__b" type="button" data-mode="signup" aria-pressed="false">新規登録</button></div>
  <form class="auth__f" data-auth-form novalidate>
    <label class="field"><span>メールアドレス</span><input class="input" type="email" name="email" autocomplete="email" required maxlength="254"></label>
    <label class="field" data-pw><span>パスワード（8文字以上）</span><input class="input" type="password" name="password" autocomplete="current-password" minlength="8" maxlength="72" required></label>
    <div data-only-signup hidden>
      <label class="check"><input type="checkbox" name="age" value="1"><span>18歳以上です</span></label>
      <label class="check"><input type="checkbox" name="rules" value="1"><span><a href="/community/rules/" target="_blank" rel="noopener">コミュニティのルール</a>と、投稿が誰でも読めることに同意します</span></label>
    </div>
    <p class="cform__err" role="alert" data-auth-error hidden></p>
    <p class="auth__ok" role="status" data-auth-ok hidden></p>
    <button class="btn btn--primary btn--block" type="submit" data-auth-submit><span data-auth-submit-l>ログイン</span></button>
    <p class="auth__alt"><button class="tbtn" type="button" data-magic>${icon('mail', { size: 14 })}パスワードを使わず、メールのリンクでログイン</button> <button class="tbtn" type="button" data-forgot>パスワードを忘れた</button></p>
  </form>
  <ul class="auth__notes">
    <li>${icon('shield', { size: 14 })}メールアドレスはログインと大切なお知らせにだけ使い、他の利用者には表示しません。</li>
    <li>${icon('userc', { size: 14 })}登録後に、表示するニックネームを決められます。</li>
  </ul>
</div>
<div data-auth-done hidden>${EmptyState({ ic: 'check', title: 'ログインしています', action: '<a class="btn btn--primary" href="/community/">コミュニティへ</a> <a class="btn btn--ghost" href="/community/me/">プロフィール</a>' })}</div>
</div></div>`;
  return Shell(site, assets, { path: '/community/login/', title: 'ログイン・新規登録', body, bodyClass: 'p-com p-com-auth', robots: 'noindex,nofollow' });
}

// ---------- /community/me/（自分のプロフィール・設定） ----------
export function mePage(site, assets) {
  const body = `
${ComHead({ en: 'NIGHT INSIDER', title: 'プロフィール', list: [{ name: 'コミュニティ', path: '/community/' }, { name: 'プロフィール' }] })}
<div class="clay clay--narrow"><div class="clay__main">
<div data-need-login hidden>${EmptyState({ ic: 'lock', title: 'ログインしていません', action: '<a class="btn btn--primary" href="/community/login/?next=/community/me/">ログイン</a>' })}</div>
<div data-me hidden>
  <div class="prof" data-me-card></div>
  <nav class="ctabs" aria-label="プロフィールの表示"><ul class="ctabs__list">${[['posts', '自分の投稿'], ['drafts', '下書き'], ['saved', '保存した投稿'], ['settings', 'プロフィール設定'], ['blocks', 'ブロック中']].map(([k, l], i) => `<li><button class="ctab" type="button" data-me-tab="${k}" aria-pressed="${i === 0}">${l}</button></li>`).join('')}</ul></nav>
  <div data-me-panel="posts"><div class="feed__list" data-me-posts></div></div>
  <div data-me-panel="drafts" hidden><div class="feed__list" data-me-drafts></div></div>
  <div data-me-panel="saved" hidden><div class="feed__list" data-me-saved></div></div>
  <div data-me-panel="settings" hidden>
    <form class="cform" data-profile-form novalidate>
      <label class="field"><span>ニックネーム（表示名・30文字まで）</span><input class="input" name="display_name" maxlength="30" required></label>
      <label class="field"><span>ユーザー名（英小文字・数字・_ の 3〜20 文字）</span><input class="input" name="handle" pattern="[a-z0-9_]{3,20}" maxlength="20" required autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>自己紹介（160文字まで）</span><textarea class="input ta" name="bio" rows="3" maxlength="160"></textarea></label>
      <label class="check"><input type="checkbox" name="is_private"><span>プロフィールページに投稿の一覧を表示しない</span></label>
      <label class="check" data-age-row><input type="checkbox" name="confirm_age"><span>18歳以上です（投稿・コメントに必要です）</span></label>
      <div class="field"><span>よく見る地域（フィードの「For You」に使います）</span>${RegionSelects('pref')}</div>
      <p class="cform__err" role="alert" data-form-error hidden></p>
      <div class="cform__bar"><button class="btn btn--primary" type="submit">保存する</button></div>
    </form>
    <div class="setrow setrow--danger"><div><p class="setrow__t">ログアウト</p><p class="setrow__d">この端末からログアウトします。</p></div><button class="btn btn--ghost btn--sm" type="button" data-logout>${icon('logout', { size: 16 })}ログアウト</button></div>
  </div>
  <div data-me-panel="blocks" hidden><ul class="blist" data-me-blocks></ul></div>
</div>
</div></div>`;
  return Shell(site, assets, { path: '/community/me/', title: 'プロフィール', body, bodyClass: 'p-com p-com-me', robots: 'noindex,nofollow' });
}

// ---------- /community/u/?h=（公開プロフィール） ----------
export function profilePage(site, assets) {
  const body = `
${ComHead({ en: 'NIGHT INSIDER', title: 'プロフィール', list: [{ name: 'コミュニティ', path: '/community/' }, { name: 'プロフィール' }] })}
<div class="clay clay--narrow"><div class="clay__main">
<div data-profile aria-busy="true">${SkeletonPosts(1)}</div>
<div class="feed__list" data-profile-posts></div>
</div></div>
${ReportDialogCom()}`;
  return Shell(site, assets, { path: '/community/u/', title: 'プロフィール', body, bodyClass: 'p-com p-com-user', robots: 'noindex,follow' });
}

// ---------- /community/rules/ ----------
export function rulesPage(site, assets) {
  const rules = [
    ['実際の体験・確かな情報だけ', '自分で体験したこと、確認できた情報だけを書いてください。広告・宣伝、他人の体験の転載、AI で作った文章の口コミは禁止です。店舗の関係者による自店の口コミも書けません。'],
    ['人を特定できる情報を書かない', 'スタッフ・キャスト・他の利用者の本名、顔写真、連絡先、SNS アカウント、住所など、個人を特定できる情報は書かないでください。容姿など、人そのものを評価・採点する書き込みも禁止です。'],
    ['同意のない写真を載せない', '人が写っている写真、店内の無断撮影、本人の同意のない画像は投稿できません。画像の位置情報は送信前に自動で削除します。'],
    ['違法な行為を勧めない・依頼しない', '国・地域の法律で禁止されているサービスの勧誘・依頼・あっせん、薬物、未成年に関わる内容は、いかなる形でも禁止です。見つけた場合は削除し、必要に応じて関係機関に通報します。'],
    ['相手を尊重する', '誹謗中傷・差別・脅迫・なりすまし・しつこい書き込みは禁止です。意見が違うときは、事実と体験にもとづいて冷静に書いてください。'],
    ['18歳以上の方だけ', 'コミュニティは18歳以上の方を対象としています。'],
  ];
  const process = [
    ['通報', '問題のある投稿・コメント・ユーザーは、各画面の「通報」から運営に知らせてください。通報した人が相手に知らされることはありません。'],
    ['審査', '通報は運営スタッフが内容を確認して判断します。通報の数だけで自動的に削除・処分することはありません。'],
    ['処分と異議申し立て', '非表示・投稿の制限・利用停止などの処分に納得できない場合は、お問い合わせから異議を申し立てられます。'],
    ['店舗の方へ', '店舗が利用者の口コミを削除・変更することはできません。事実と異なる内容は、運営への審査申請をご利用ください。'],
  ];
  const body = `
${ComHead({ en: 'COMMUNITY GUIDELINES', title: 'コミュニティのルール', desc: '安心して情報を共有できる場にするための約束です。', list: [{ name: 'コミュニティ', path: '/community/' }, { name: 'ルール' }] })}
<div class="clay clay--narrow"><div class="clay__main prose">
<ol class="rules">${rules.map(([t, d]) => `<li><h2>${esc(t)}</h2><p>${esc(d)}</p></li>`).join('')}</ol>
<h2 class="rules__h">通報と審査</h2>
<dl class="rules__dl">${process.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
<h2 class="rules__h">表示について</h2>
<ul class="rules__ul">
<li>「訪問確認済み」は、運営が訪問の事実を確認したことを示します。口コミの内容が正しいことを保証するものではありません。</li>
<li>評価の平均や件数は、公開中の口コミだけを集計しています。口コミが無い店舗に、評価を作って表示することはありません。</li>
<li>投稿は誰でも読めます。メールアドレスなどの登録情報は、他の利用者に表示されません。</li>
</ul>
</div></div>`;
  return Shell(site, assets, { path: '/community/rules/', title: 'コミュニティのルール', description: 'GLOBAL NIGHT COMMUNITY のルール。実体験だけを書く、個人を特定しない、違法行為を勧めない など。', body, bodyClass: 'p-com p-com-rules', jsonld: [breadcrumbLd(crumbs([{ name: 'コミュニティ', path: '/community/' }, { name: 'ルール' }]))] });
}

// ---------- /admin/community/ ----------
export function adminPage(site, assets) {
  const tabs = [['dash', 'ダッシュボード'], ['reports', '通報'], ['posts', '投稿'], ['comments', 'コメント'], ['users', 'ユーザー'], ['venues', '店舗'], ['audit', '監査ログ']];
  const body = `
<header class="ph cph"><p class="ph__en">ADMIN</p><h1 class="ph__t">コミュニティ管理</h1><p class="ph__d">${icon('lock', { size: 14 })}運営スタッフ専用です。表示する内容も、操作の実行も、サーバー側で権限を確認しています。</p></header>
<div data-admin-denied hidden>${EmptyState({ ic: 'lock', title: 'この画面を開く権限がありません', text: '運営スタッフのアカウントでログインしてください。', action: '<a class="btn btn--ghost" href="/community/login/?next=/admin/community/">ログイン</a>' })}</div>
<div class="adm" data-admin hidden>
  <nav class="ctabs" aria-label="管理メニュー"><ul class="ctabs__list">${tabs.map(([k, l], i) => `<li><button class="ctab" type="button" data-adm-tab="${k}" aria-pressed="${i === 0}">${l}</button></li>`).join('')}</ul></nav>
  <section data-adm-panel="dash"><dl class="kpis kpis--adm" data-adm-kpis></dl><p class="adm__note" data-adm-gen></p></section>
  <section data-adm-panel="reports" hidden><div class="adm__bar"><label><span class="sr">状態</span><select class="input input--sm" data-adm-filter="reports"><option value="open,reviewing">未対応</option><option value="resolved,dismissed">対応済み</option><option value="">すべて</option></select></label></div><div class="adm__list" data-adm-list="reports"></div></section>
  <section data-adm-panel="posts" hidden><div class="adm__bar"><label><span class="sr">状態</span><select class="input input--sm" data-adm-filter="posts"><option value="published">公開中</option><option value="pending">審査待ち</option><option value="hidden">非表示</option><option value="removed">削除</option></select></label></div><div class="adm__list" data-adm-list="posts"></div></section>
  <section data-adm-panel="comments" hidden><div class="adm__bar"><label><span class="sr">状態</span><select class="input input--sm" data-adm-filter="comments"><option value="published">公開中</option><option value="hidden">非表示</option><option value="removed">削除</option></select></label></div><div class="adm__list" data-adm-list="comments"></div></section>
  <section data-adm-panel="users" hidden><form class="adm__bar" data-adm-user-search><label><span class="sr">ユーザー名</span><input class="input input--sm" name="q" placeholder="ユーザー名で検索" maxlength="20"></label><button class="btn btn--ghost btn--sm">検索</button></form><div class="adm__list" data-adm-list="users"></div></section>
  <section data-adm-panel="venues" hidden>
    <details class="vsug"><summary>${icon('plus', { size: 16 })}店舗を登録する</summary>
      <form class="cform__grid" data-adm-venue-form>
        <label class="field"><span>店舗名</span><input class="input" name="name" maxlength="80" required></label>
        <label class="field"><span>種類</span><select class="input" name="category">${VENUE_CATS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label>
        <div class="field"><span>地域</span>${RegionSelects('admvenue')}</div>
        <label class="field"><span>紹介記事の URL（任意・例：/2965/）</span><input class="input" name="article_path" pattern="/.+" maxlength="300"></label>
        <p><button class="btn btn--primary btn--sm">登録して公開</button></p>
      </form>
    </details>
    <div class="adm__bar"><label><span class="sr">状態</span><select class="input input--sm" data-adm-filter="venues"><option value="pending">申請中</option><option value="published">公開中</option><option value="hidden">非表示</option></select></label></div>
    <div class="adm__list" data-adm-list="venues"></div>
  </section>
  <section data-adm-panel="audit" hidden><div class="adm__list" data-adm-list="audit"></div></section>
</div>`;
  return Shell(site, assets, { path: '/admin/community/', title: 'コミュニティ管理', body, bodyClass: 'p-com p-admin', robots: 'noindex,nofollow' });
}

// ---------- 記事ページの「口コミ・質問」欄 ----------
export function ArticleCommunity(p) {
  if (!feature('reviews')) return '';
  const q = `article=${encodeURIComponent(href(p.path))}`;
  return `<section class="arev" aria-labelledby="arev-t" data-article-reviews data-path="${esc(href(p.path))}">
  <div class="arev__hd"><h2 class="arev__t" id="arev-t">${icon('star', { size: 20 })}口コミ・質問</h2><p class="arev__sub">GLOBAL NIGHT COMMUNITY の利用者による投稿です（編集部の記事とは別の内容です）</p></div>
  <div class="arev__sum" data-arev-summary aria-busy="true"><span class="sk-l sk-l--w"></span></div>
  <div class="arev__tabs ctabs"><ul class="ctabs__list"><li><button class="ctab" type="button" data-arev-tab="latest" aria-pressed="true">最新の口コミ</button></li><li><button class="ctab" type="button" data-arev-tab="helpful" aria-pressed="false">参考になった順</button></li><li><button class="ctab" type="button" data-arev-tab="question" aria-pressed="false">質問</button></li></ul></div>
  <div class="feed__list" data-arev-list></div>
  <p class="arev__act"><a class="btn btn--primary" href="/community/new/?type=review&amp;${q}">${icon('pencil', { size: 16 })}口コミを書く</a><a class="btn btn--ghost" href="/community/new/?type=question&amp;${q}">${icon('help', { size: 16 })}この記事について質問する</a></p>
</section>`;
}

// ---------- TOP のダイジェスト ----------
export function HomeCommunity() {
  if (!feature('reviews')) return '';
  return `<section class="sec hcom" aria-labelledby="sec-com" data-home-community>
  <div class="sh"><h2 class="sh__t" id="sec-com">${icon('users', { size: 20 })}<span>GLOBAL NIGHT COMMUNITY</span></h2><p class="sh__sub">利用者の最新の口コミと質問</p><div class="sh__aside"><a class="tbtn" href="/community/">コミュニティを見る${icon('right', { size: 14 })}</a></div></div>
  <div class="hcom__row" data-home-com-list>${SkeletonPosts(2)}</div>
  <p class="hcom__cta"><a class="btn btn--ghost btn--sm" href="/community/new/?type=question">${icon('help', { size: 16 })}質問する</a><a class="btn btn--primary btn--sm" href="/community/login/?mode=signup" data-when="guest">コミュニティに参加する</a></p>
</section>`;
}

// ---------- 共通のダイアログ ----------
export function ReportDialogCom() {
  const reasons = [['spam', 'スパム・宣伝'], ['fake_review', '事実と異なる口コミ・やらせ'], ['abuse', '誹謗中傷・嫌がらせ'], ['privacy', '個人情報・人を特定できる情報'], ['non_consensual', '同意のない写真・無断撮影'], ['illegal', '違法な行為の勧誘'], ['threat', '脅迫'], ['impersonation', 'なりすまし'], ['other', 'その他']];
  return `<div class="modal" id="com-report" hidden>
<div class="modal__bg" data-modal-close></div>
<div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="crep-t" tabindex="-1">
<div class="modal__hd"><h2 class="modal__t" id="crep-t">${icon('flag', { size: 20 })}運営に通報する</h2><button class="ibtn" type="button" data-modal-close aria-label="閉じる">${icon('x')}</button></div>
<form class="form" data-com-report-form novalidate>
<fieldset><legend>理由</legend>${reasons.map(([v, l], i) => `<label class="radio"><input type="radio" name="reason" value="${v}"${i === 0 ? ' checked' : ''}><span>${l}</span></label>`).join('')}</fieldset>
<label class="field"><span>詳しい内容（任意・1000文字まで）</span><textarea class="input ta" name="detail" rows="3" maxlength="1000"></textarea></label>
<p class="form__note">通報したことは相手に知らされません。運営が内容を確認して対応します。</p>
<p class="cform__err" role="alert" data-form-error hidden></p>
<div class="modal__btns"><button class="btn btn--primary" type="submit">通報する</button><button class="btn btn--ghost" type="button" data-modal-close>やめる</button></div>
</form></div></div>`;
}
function ImageViewer() {
  return `<div class="modal iv" id="com-viewer" hidden><div class="modal__bg" data-modal-close></div><div class="iv__panel" role="dialog" aria-modal="true" aria-label="画像" tabindex="-1"><button class="ibtn iv__x" type="button" data-modal-close aria-label="閉じる">${icon('x')}</button><img class="iv__img" alt="" data-iv-img><div class="iv__nav"><button class="ibtn" type="button" data-iv-prev aria-label="前の画像">${icon('left')}</button><span data-iv-count></span><button class="ibtn" type="button" data-iv-next aria-label="次の画像">${icon('right')}</button></div></div></div>`;
}

export const communityReady = () => BACKEND.ready;
export { SITE };
