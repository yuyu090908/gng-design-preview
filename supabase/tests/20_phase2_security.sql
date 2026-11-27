-- Phase 2 の権限・不正防止のテスト（10_phase1_security.sql の補助関数 t.* を使う）
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;

-- テスト専用のユーザー（e1〜e4 は作成から 3 日、e5 は作ったばかり）
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e4', 'e4@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e5', 'e5@test.invalid');
update user_profiles set created_at = now() - interval '3 days' where id in
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4');
create or replace function t.u(n text) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000' || n)::uuid $$;
grant execute on function t.u(text) to anon, authenticated;
create or replace function t.xp(n text) returns int language sql security definer as $$ select xp from public.user_experience where user_id = t.u(n) $$;
grant execute on function t.xp(text) to anon, authenticated;

-- 1. 新しいユーザーにも XP の行ができる（0 XP・Rookie）
select t.eq((select count(*) from user_experience where user_id in (t.u('e1'), t.u('e5')) and xp = 0 and rank = 'Rookie')::int, 2, 'XP の行の自動作成');
select t.eq(rank_for(0), 'Rookie', 'rank 0'); select t.eq(rank_for(500), 'Night Explorer', 'rank 500');
select t.eq(rank_for(15000), 'Night Legend', 'rank 15000'); select t.eq(next_rank_xp(2100), 5000, '次のランク');

call t.login(t.u('e1')); select update_profile('e_one', 'イーワン', '', false, true);
call t.login(t.u('e2')); select update_profile('e_two', 'イーツー', '', false, true);
call t.login(t.u('e3')); select update_profile('e_three', 'イースリー', '', false, true);
call t.login(t.u('e4')); select update_profile('e_four', 'イーフォー', '', true, true);
call t.login(t.u('e5')); select update_profile('e_five', 'イーファイブ', '', false, true);

-- 2. XP・バッジ・通知・フォローの表へ直接は書けない。内部の関数も呼べない
call t.login(t.u('e1'));
select t.fails($$insert into experience_transactions (user_id, action, points, idem_key) values (auth.uid(), 'adjustment', 9999, 'x')$$, 'permission denied');
select t.fails($$update user_experience set xp = 99999 where user_id = auth.uid()$$, 'permission denied');
select t.fails($$insert into user_badges (user_id, badge) values (auth.uid(), 'night_legend')$$, 'permission denied');
select t.fails($$insert into notifications (user_id, kind) values (auth.uid(), 'badge')$$, 'permission denied');
select t.fails($$insert into user_follows (follower_id, followee_id) values (auth.uid(), t.u('e2'))$$, 'permission denied');
select t.fails($$select gn_award(auth.uid(), 'adjustment', 9999, 'x')$$, 'permission denied');
select t.fails($$select gn_give_badge(auth.uid(), 'night_legend')$$, 'permission denied');
select t.fails($$select gn_notify(t.u('e2'), 'badge')$$, 'permission denied');
select t.fails($$select admin_adjust_xp(auth.uid(), 9999, 'ずる')$$, 'forbidden');

-- 3. 初めての店舗の感想でバッジと通知
insert into t.ids select 'e_review', save_post('{"type":"review","category":"review","article_path":"/2965/","body":"料金表が入口にあり、スタッフの説明も丁寧でした。落ち着いて飲めました。","ratings":{"overall":4}}');
select t.eq((select count(*) from user_badges where user_id = auth.uid() and badge = 'first_review')::int, 1, 'First Review バッジ');
select t.eq((select count(*) from notifications where kind = 'badge')::int, 1, 'バッジの通知（本人にだけ見える）');
insert into t.ids select 'e_t' || g, save_post(format('{"type":"talk","category":"chat","body":"雑談の投稿その%s です。よろしくお願いします"}', g)::jsonb) from generate_series(1, 4) g;

-- 4. 他の人（作成 24 時間以上）からの「参考になった」で +5、店舗の感想が初めて評価されたら +30
call t.login(t.u('e2'));
select toggle_helpful((select v from t.ids where k = 'e_review'), true);
select t.eq(t.xp('e1'), 35, '参考になった +5 と 有益な店舗レビュー +30');
-- 付け外しを繰り返しても XP は増えない（冪等）
select toggle_helpful((select v from t.ids where k = 'e_review'), false);
select toggle_helpful((select v from t.ids where k = 'e_review'), true);
select t.eq(t.xp('e1'), 35, '付け外しで XP が増えない');
-- 他人の XP 台帳は見えない
select t.eq((select count(*) from experience_transactions where user_id = t.u('e1'))::int, 0, '他人の XP 台帳は見えない');
select t.eq((select count(*) from notifications)::int, 0, '他人の通知は見えない');

-- 5. 作ったばかりのアカウントからの「参考になった」では XP は入らない（通知は届く）
call t.login(t.u('e5'));
select toggle_helpful((select v from t.ids where k = 'e_t1'), true);
select t.eq(t.xp('e1'), 35, '新しいアカウントからは XP なし');

-- 6. 同じ人から同じ人へは 30 日に 3 回まで
call t.login(t.u('e3'));
select toggle_helpful(v, true) from t.ids where k in ('e_t1', 'e_t2', 'e_t3', 'e_t4');
select t.eq(t.xp('e1'), 50, '同じ相手からは 3 回まで（+15）');

-- 7. 受け取る XP は 1 日 100 まで
reset role;
insert into experience_transactions (user_id, action, points, idem_key) values (t.u('e1'), 'helpful_received', 100, 'test:cap');
update user_experience set xp = xp + 100 where user_id = t.u('e1');
call t.login(t.u('e4'));
select toggle_helpful((select v from t.ids where k = 'e_t1'), true);
select t.eq(t.xp('e1'), 150, '1 日の上限を超えたら XP なし');

-- 8. 通知：本人の通知だけが見え、既読にできる。OFF にした種類は届かない
call t.login(t.u('e1'));
select t.eq((select count(*) from notification_feed where kind = 'helpful' and post_id = (select v from t.ids where k = 'e_review'))::int, 1, '参考になった の通知は 1 件にまとまる');
select t.eq((select count from notifications where kind = 'helpful' and post_id = (select v from t.ids where k = 'e_review')), 1, '同じ人の押し直しで人数が増えない');
select t.eq(mark_notifications_read() > 0, true, '既読にできる');
select t.eq((select count(*) from notifications where read_at is null)::int, 0, '未読なし');
select update_notify_settings('{"comment": false, "moderation": false, "bogus": true}', true, false);
select t.eq((select notify->>'moderation' from user_preferences where user_id = auth.uid()), 'true', '運営からの通知は止められない');
select t.eq((select notify ? 'bogus' from user_preferences where user_id = auth.uid()), false, '知らない種類は保存しない');
call t.login(t.u('e2'));
select add_comment((select v from t.ids where k = 'e_t2'), 'とても参考になりました。ありがとうございます', null);
call t.login(t.u('e1'));
select t.eq((select count(*) from notifications where kind = 'comment')::int, 0, 'OFF にした種類は届かない');

-- 9. フォロー：自分はフォローできない。ブロックした相手とはフォロー関係が解消される。通知は 1 日 1 回まで
call t.login(t.u('e2'));
select t.fails($$select set_follow(auth.uid(), true)$$, 'cannot_follow_self');
select set_follow(t.u('e1'), true); select set_follow(t.u('e1'), false); select set_follow(t.u('e1'), true);
select t.eq((select follower_count from user_profiles where id = t.u('e1')), 1, 'フォロワー数');
call t.login(t.u('e1'));
select t.eq((select count(*) from notifications where kind = 'follow')::int, 1, 'フォロー通知は 1 日 1 回');
select set_block(t.u('e2'), true);
select t.eq((select follower_count from user_profiles where id = t.u('e1')), 0, 'ブロックでフォロー解消');
call t.login(t.u('e2'));
select t.fails(format($$select set_follow('%s', true)$$, t.u('e1')), 'blocked');

-- 10. 非公開の人のフォロー関係は第三者に見えない
call t.login(t.u('e3'));
select set_follow(t.u('e4'), true);
call t.login(t.u('e2'));
select t.eq((select count(*) from user_follows where followee_id = t.u('e4'))::int, 0, '非公開ユーザーのフォロー関係');
call t.login(t.u('e4'));
select t.eq((select count(*) from user_follows where followee_id = t.u('e4'))::int, 1, '本人には見える');

-- 11. TRUST SCORE：投稿 3 件未満は「データ不足」で点数を出さない
call t.login(null);
select t.eq(trust_score(t.u('e2'))->>'status', 'insufficient', '投稿が少ない人はデータ不足');
select t.eq(trust_score(t.u('e2'))->'score', 'null'::jsonb, 'データ不足のときは点数なし');
select t.eq(trust_score(t.u('e1'))->>'status', 'ok', '投稿 3 件以上は計算する');
select t.eq((trust_score(t.u('e1'))->>'score')::int between 0 and 100, true, '0〜100 の範囲');

-- 12. ベストアンサー：質問者だけが、他の人のコメントを 1 つ選べる（+15）
call t.login(t.u('e3'));
insert into t.ids select 'e_q', save_post('{"type":"question","category":"question","body":"バンコクで料金表がはっきりしているバーはどこですか？"}');
call t.login(t.u('e2'));
insert into t.ids select 'e_ans', add_comment((select v from t.ids where k = 'e_q'), 'アソーク周辺のホテルバーは料金表が明確でした', null);
select t.fails(format($$select mark_best_answer('%s', '%s')$$, (select v from t.ids where k = 'e_q'), (select v from t.ids where k = 'e_ans')), 'not_owner');
call t.login(t.u('e3'));
select mark_best_answer((select v from t.ids where k = 'e_q'), (select v from t.ids where k = 'e_ans'));
select t.eq(t.xp('e2'), 15, 'ベストアンサー +15');
select t.fails(format($$select mark_best_answer('%s', '%s')$$, (select v from t.ids where k = 'e_q'), (select v from t.ids where k = 'e_ans')), 'already_chosen');

-- 13. 訪問確認：+50、取り消すと戻る、再確認しても二重にならない
call t.login(t.u('c3'));
select mod_set_post_verified((select v from t.ids where k = 'e_review'), true);
select t.eq(t.xp('e1'), 200, '訪問確認 +50');
select mod_set_post_verified((select v from t.ids where k = 'e_review'), false);
select mod_set_post_verified((select v from t.ids where k = 'e_review'), true);
select t.eq(t.xp('e1'), 150, '取り消し後の再確認では増えない');

-- 14. XP の手動調整は管理者のみ・理由が必要・監査ログに残る
select t.fails(format($$select admin_adjust_xp('%s', 10, '')$$, t.u('e3')), 'note_required');
select admin_adjust_xp(t.u('e3'), 10, 'テストの調整');
select t.eq(t.xp('e3'), 10, '手動調整');
select t.eq((select count(*) from admin_audit_logs where action = 'xp.adjust')::int, 1, '監査ログ');
call t.login(t.u('d4'));
select t.fails(format($$select admin_adjust_xp('%s', 10, 'x')$$, t.u('e3')), 'forbidden');
select t.eq((admin_stats_phase2() ? 'xp_total'), true, '運営は数値を見られる');
call t.login(t.u('e1'));
select t.fails($$select admin_stats_phase2()$$, 'forbidden');

-- 15. NIGHT LIVE：店舗か都市が必要。1 時間に 6 件まで。現在地は保存しない
call t.login(t.u('e3'));
select t.fails($$select post_live('{"body":"今とても混んでいます"}')$$, 'live_needs_place');
insert into t.ids select 'e_live', post_live(jsonb_build_object('city_id', (select id from cities where slug = 'bangkok' limit 1), 'country_code', 'TH', 'body', 'スクンビット周辺、今夜はかなり賑わっています', 'crowd', 4, 'vibe', 'lively', 'open_status', 'open'));
select t.eq((select live_crowd from post_feed where id = (select v from t.ids where k = 'e_live')), 4::smallint, 'ライブ情報の保存');
select t.eq((select type from post_feed where id = (select v from t.ids where k = 'e_live')), 'live', 'ライブ投稿の種類');
select t.fails($$select post_live(jsonb_build_object('city_id', (select id from cities where slug = 'bangkok' limit 1), 'country_code', 'TH', 'body', '今夜は少し空いています、ゆっくりできます', 'crowd', 9))$$, 'check');
select t.fails($$select save_post('{"type":"live","category":"local","body":"今夜は混んでいます、入場待ちあり"}')$$, 'use_post_live');
select t.fails(format($$select save_post('{"id":"%s","type":"talk","category":"chat","body":"ライブから雑談に変えてみる"}')$$, (select v from t.ids where k = 'e_live')), 'use_post_live');
select t.eq((select count(*) from information_schema.columns where table_name = 'live_reports' and column_name ~ 'lat|lng|lon|geo|location')::int, 0, '位置情報の列が無い');

-- 16. NIGHT PULSE：誰でも見られる。作ったばかりのアカウントの「参考になった」は数えない
call t.login(null);
select t.eq(pulse('7d') ? 'posts', true, 'トレンドを取得できる');
select t.eq((select count(*) from jsonb_array_elements(pulse('24h')->'helpful_reviews') x where x->>'id' = (select v from t.ids where k = 'e_review')::text)::int, 1, '有用なレビューに出る');
select t.eq((select (x->>'helpful')::int from jsonb_array_elements(pulse('7d')->'posts') x where x->>'id' = (select v from t.ids where k = 'e_t1')::text), 2, '新しいアカウントの分は数えない（e3・e4 の 2 人）');
select t.fails($$select set_follow('00000000-0000-0000-0000-0000000000e1', true)$$, 'login_required');

reset role;
select 'phase2 security: all passed';
