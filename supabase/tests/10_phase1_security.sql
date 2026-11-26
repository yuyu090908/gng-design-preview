-- Phase 1 の権限・不正防止のテスト（素の PostgreSQL + 00_supabase_stub.sql で実行）
-- 実行：bash supabase/tests/run.sh
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- テスト用の補助（このファイルの中だけで使う）
create schema if not exists t;
grant usage on schema t to anon, authenticated;
create or replace procedure t.login(uid uuid) language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
  if uid is null then execute 'set role anon'; else execute 'set role authenticated'; end if;
end $$;
grant execute on procedure t.login(uuid) to anon, authenticated;
create or replace function t.fails(q text, expect text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like '%' || expect || '%' then return; end if;
    raise exception 'FAIL: % → 期待 "%" 実際 "%"', q, expect, sqlerrm;
  end;
  raise exception 'FAIL: % → エラーにならなかった（期待 "%"）', q, expect;
end $$;
grant execute on function t.fails(text, text) to anon, authenticated;
create or replace function t.eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL: % → 期待 % 実際 %', label, want, got; end if;
end $$;
grant execute on function t.eq(anyelement, anyelement, text) to anon, authenticated;
create table t.ids (k text primary key, v uuid);
grant all on t.ids to anon, authenticated;

-- ユーザー（テスト専用。本番には入らない）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@test.invalid'),
  ('00000000-0000-0000-0000-0000000000c3', 'admin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000d4', 'mod@test.invalid');
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000c3', 'admin'), ('00000000-0000-0000-0000-0000000000d4', 'moderator');

-- 1. 登録するとランダムなニックネームのプロフィールができる
select t.eq((select count(*) from user_profiles where handle like 'night\_%')::int, 4, 'プロフィール自動作成');

-- 2. 年齢確認前は投稿できない
call t.login('00000000-0000-0000-0000-0000000000a1');
select t.fails($$select save_post('{"type":"talk","category":"chat","body":"こんにちは、はじめまして"}')$$, 'age_unconfirmed');
select update_profile('alpha_user', 'アルファ', '', false, true);
select t.fails($$select update_profile('admin_x', 'x', '', false, false)$$, 'reserved_handle');

-- 3. テーブルへの直接書き込みはできない
select t.fails($$insert into community_posts (author_id, type, category, body) values (auth.uid(), 'talk', 'chat', 'x')$$, 'permission denied');
select t.fails($$update user_profiles set status = 'active', helpful_received = 9999 where id = auth.uid()$$, 'permission denied');
select t.fails($$insert into user_roles (user_id, role) values (auth.uid(), 'admin')$$, 'permission denied');

-- 4. 投稿・レビューの検証
insert into t.ids select 'talk', save_post('{"type":"talk","category":"chat","body":"バンコクで初めての夜、おすすめはありますか？"}');
select t.fails($$select save_post('{"type":"review","category":"review","body":"とても良いお店でした。スタッフの対応も丁寧で、料金表も明確でした。また行きたいです。","ratings":{"overall":5}}')$$, 'review_needs_target');
select t.fails($$select save_post('{"type":"review","category":"review","article_path":"/2965/","body":"とても良いお店でした。スタッフの対応も丁寧で、料金表も明確でした。また行きたいです。"}')$$, 'review_needs_overall');
select t.fails($$select save_post('{"type":"review","category":"review","article_path":"/2965/","body":"短い","ratings":{"overall":5}}')$$, 'body_too_short');
select t.fails($$select save_post('{"type":"review","category":"review","article_path":"/2965/","body":"とても良いお店でした。スタッフの対応も丁寧で、料金表も明確でした。","ratings":{"overall":9}}')$$, 'review_needs_overall');
select t.fails($$select save_post('{"type":"review","category":"review","article_path":"/2965/","body":"とても良いお店でした。スタッフの対応も丁寧で、料金表も明確でした。","ratings":{"overall":4,"service":9}}')$$, 'review_ratings_score_check');
insert into t.ids select 'review', save_post('{"type":"review","category":"review","article_path":"/2965/","country_code":"TH","body":"とても良いお店でした。スタッフの対応も丁寧で、料金表も明確でした。また行きたいです。","ratings":{"overall":4,"service":5,"value":3},"revisit":"yes"}');
select t.eq((select overall from review_summary where article_path = '/2965/'), 4.00::numeric, '口コミの平均');
select t.fails($$select save_post('{"type":"talk","category":"chat","body":"画像付きの投稿です","media":[{"path":"00000000-0000-0000-0000-0000000000b2/x.jpg"}]}')$$, 'invalid_media');
-- 下書きは本人以外に見えない
insert into t.ids select 'draft', save_post('{"type":"talk","category":"chat","body":"下書き","status":"draft"}');

-- 5. 別のユーザーは編集・削除できない
call t.login('00000000-0000-0000-0000-0000000000b2');
select update_profile('bravo_user', 'ブラボー', '', false, true);
select t.fails(format($$select save_post('{"id":"%s","type":"talk","category":"chat","body":"他人の投稿を書き換える"}')$$, (select v from t.ids where k = 'talk')), 'not_owner');
select t.fails(format($$select delete_post('%s')$$, (select v from t.ids where k = 'talk')), 'not_owner');
select t.eq((select count(*) from community_posts where id = (select v from t.ids where k = 'draft'))::int, 0, '他人の下書きは見えない');

-- 6. 参考になった（自分の投稿には押せない・二重に数えない）
select toggle_helpful((select v from t.ids where k = 'review'), true);
select t.eq(toggle_helpful((select v from t.ids where k = 'review'), true), 1, '二重に押しても 1');
select toggle_bookmark((select v from t.ids where k = 'review'), true);
-- 7. 通報は同じ対象に 1 回だけ
select report_content('post', (select v from t.ids where k = 'talk'), 'spam', '宣伝のように見える');
select t.fails(format($$select report_content('post', '%s', 'spam', '')$$, (select v from t.ids where k = 'talk')), 'already_reported');
-- 一般ユーザーは運営の操作をできない
select t.fails(format($$select mod_set_post_status('%s', 'hidden')$$, (select v from t.ids where k = 'talk')), 'forbidden');
select t.fails($$select admin_stats()$$, 'forbidden');
select t.fails($$select admin_set_role(auth.uid(), 'admin', true)$$, 'forbidden');
select t.eq((select count(*) from admin_audit_logs)::int, 0, '監査ログは見えない');
call t.login('00000000-0000-0000-0000-0000000000a1');
select t.fails(format($$select toggle_helpful('%s', true)$$, (select v from t.ids where k = 'review')), 'cannot_rate_own');
-- 他人の「参考になった」「保存」は見えない
select t.eq((select count(*) from post_reactions)::int, 0, '他人のリアクションは見えない');
select t.eq((select count(*) from post_bookmarks)::int, 0, '他人の保存は見えない');
select t.eq((select helpful_received from user_profiles where id = auth.uid()), 1, '受け取った参考になった');

-- 8. 未ログインは読むだけ
call t.login(null);
select t.fails($$select save_post('{"type":"talk","category":"chat","body":"匿名で投稿"}')$$, 'permission denied');
select t.eq((select count(*) from community_posts)::int, 2, '未ログインでも公開投稿は読める');
select t.eq((select count(*) from reports)::int, 0, '通報は見えない');

-- 9. モデレーターが非表示にすると、一般には見えず、本人には見える。監査ログに残る
call t.login('00000000-0000-0000-0000-0000000000d4');
select t.eq((select count(*) from reports where status = 'open')::int, 1, 'モデレーターは通報を見られる');
select mod_set_post_status((select v from t.ids where k = 'talk'), 'hidden', 'スパムの疑い');
select mod_handle_report((select id from reports limit 1), 'resolved', '非表示にしました');
select t.fails($$select mod_set_user_status('00000000-0000-0000-0000-0000000000b2', 'banned')$$, 'forbidden'); -- 利用停止は管理者だけ
select t.fails($$select mod_set_user_status('00000000-0000-0000-0000-0000000000c3', 'limited')$$, 'forbidden'); -- 運営スタッフは処分できない
select t.fails($$select admin_set_role('00000000-0000-0000-0000-0000000000b2', 'moderator', true)$$, 'forbidden');
select t.eq((select count(*) from admin_audit_logs)::int, 0, 'モデレーターは監査ログを見られない');
call t.login(null);
select t.eq((select count(*) from community_posts)::int, 1, '非表示の投稿は見えない');
call t.login('00000000-0000-0000-0000-0000000000a1');
select t.eq((select count(*) from community_posts where id = (select v from t.ids where k = 'talk'))::int, 1, '本人には見える');
select t.fails(format($$select save_post('{"id":"%s","type":"talk","category":"chat","body":"非表示の投稿を再公開したい"}')$$, (select v from t.ids where k = 'talk')), 'locked_by_moderation');

-- 10. 管理者：監査ログ・利用停止・集計
call t.login('00000000-0000-0000-0000-0000000000c3');
select t.eq((select count(*) from admin_audit_logs)::int, 2, '監査ログ 2 件');
select mod_set_user_status('00000000-0000-0000-0000-0000000000b2', 'banned', 'テスト');
select t.eq((admin_stats()->>'reports_open')::int, 0, '未対応の通報 0');
select t.eq((admin_stats()->>'users')::int, 4, 'ユーザー数');

-- 11. 利用停止のユーザーは投稿できず、プロフィールも一般には見えない
call t.login('00000000-0000-0000-0000-0000000000b2');
select t.fails($$select save_post('{"type":"talk","category":"chat","body":"停止中に投稿"}')$$, 'account_banned');
call t.login(null);
select t.eq((select count(*) from user_profiles where id = '00000000-0000-0000-0000-0000000000b2')::int, 0, '停止ユーザーのプロフィールは見えない');

-- 12. ブロックした相手の投稿は見えない
call t.login('00000000-0000-0000-0000-0000000000c3');
select mod_set_user_status('00000000-0000-0000-0000-0000000000b2', 'active', '解除');
call t.login('00000000-0000-0000-0000-0000000000b2');
select set_block('00000000-0000-0000-0000-0000000000a1', true);
select t.eq((select count(*) from community_posts where author_id = '00000000-0000-0000-0000-0000000000a1')::int, 0, 'ブロック相手の投稿は見えない');
insert into t.ids select 'b_post', save_post('{"type":"question","category":"question","body":"ソウルの初心者向けのバーを教えてください"}');
call t.login('00000000-0000-0000-0000-0000000000a1');
select t.fails(format($$select add_comment('%s', 'コメント')$$, (select v from t.ids where k = 'b_post')), 'blocked');

-- 13. コメント：本人だけ編集・削除。削除すると本文は返らない
insert into t.ids select 'c1', add_comment((select v from t.ids where k = 'review'), '補足：予約がおすすめです');
call t.login('00000000-0000-0000-0000-0000000000d4');
select update_profile('mod_delta', 'モデレーター', '', false, true);
insert into t.ids select 'c2', add_comment((select v from t.ids where k = 'review'), '返信です', (select v from t.ids where k = 'c1'));
select t.fails(format($$select edit_comment('%s', '書き換え')$$, (select v from t.ids where k = 'c1')), 'not_owner');
select t.fails(format($$select delete_comment('%s')$$, (select v from t.ids where k = 'c1')), 'not_owner');
call t.login('00000000-0000-0000-0000-0000000000a1');
select t.eq((select comment_count from community_posts where id = (select v from t.ids where k = 'review')), 2, 'コメント数');
select delete_comment((select v from t.ids where k = 'c1'));
call t.login(null);
select t.eq((select body from comment_feed where id = (select v from t.ids where k = 'c1')), '', '削除したコメントの本文は返らない');
select t.eq((select comment_count from community_posts where id = (select v from t.ids where k = 'review')), 1, '削除後のコメント数');

-- 14. 回数制限（1 時間に 10 件まで）
call t.login('00000000-0000-0000-0000-0000000000a1');
do $$ begin for i in 1..7 loop perform save_post('{"type":"talk","category":"chat","body":"連続投稿のテストです"}'); end loop; end $$;
select t.fails($$select save_post('{"type":"talk","category":"chat","body":"11件目の投稿です"}')$$, 'rate_limited');

-- 15. 自分の投稿は削除できる
select delete_post((select v from t.ids where k = 'draft'));
select t.eq((select count(*) from community_posts where id = (select v from t.ids where k = 'draft'))::int, 0, '自分の投稿を削除');

reset role;
\echo 'phase1 security: all passed'
