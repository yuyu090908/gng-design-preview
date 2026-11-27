-- Phase 3 の権限・不正防止のテスト（10・20 のファイルの補助関数 t.* を使う）
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@test.invalid');
update user_profiles set created_at = now() - interval '3 days' where id in (t.u('f1'), t.u('f2'), t.u('f3'));
call t.login(t.u('f1')); select update_profile('f_one', 'エフワン', '', false, true);
call t.login(t.u('f2')); select update_profile('f_two', 'エフツー', '', false, true);
call t.login(t.u('f3')); select update_profile('f_three', 'エフスリー', '', false, true);
reset role;
create or replace function t.city(s text) returns bigint language sql stable as $$ select id from public.cities where slug = s $$;
create or replace function t.area(s text) returns bigint language sql stable as $$ select id from public.areas where slug = s $$;
grant execute on function t.city(text), t.area(text) to anon, authenticated;
grant usage on schema t to service_role;

-- 1. 都市・エリアの中心（目安）が入っている。店舗の位置は空のまま
select t.eq((select count(*) from cities where lat is null)::int, 0, '都市の位置');
select t.eq((select count(*) from areas where lat is null)::int, 0, 'エリアの位置');
select t.eq((select count(*) from venues where lat is not null)::int, 0, '店舗の位置は運営が入れるまで空');

-- 2. 店舗の位置は運営だけが登録できる
call t.login(t.u('c3'));
insert into t.ids select 'f_venue', (mod_upsert_venue(jsonb_build_object('name', 'テスト用の店舗F', 'category', 'bar', 'country_code', 'TH', 'city_id', t.city('bangkok'), 'area_id', t.area('sukhumvit'), 'status', 'published')))::uuid;
call t.login(t.u('f1'));
select t.fails(format($$select mod_set_venue_location('%s', 13.7, 100.5)$$, (select v from t.ids where k = 'f_venue')), 'forbidden');
select t.fails(format($$update venues set lat = 1 where id = '%s'$$, (select v from t.ids where k = 'f_venue')), 'permission denied');
call t.login(t.u('d4'));
select t.fails(format($$select mod_set_venue_location('%s', 120, 100.5)$$, (select v from t.ids where k = 'f_venue')), 'invalid_location');
select mod_set_venue_location((select v from t.ids where k = 'f_venue'), 13.737512345, 100.560612345);
select t.eq((select lat from venues where id = (select v from t.ids where k = 'f_venue')), 13.73751::numeric, '位置は小数 5 桁に丸める');

-- 3. NIGHT ACTIVITY INDEX：報告者が 1 人なら「情報不足」、2 人以上で 0〜100
call t.login(t.u('f1'));
select post_live(jsonb_build_object('country_code', 'TH', 'city_id', t.city('bangkok'), 'area_id', t.area('sukhumvit'), 'venue_id', (select v from t.ids where k = 'f_venue'), 'body', '入口に列があり、店内は満席に近いです', 'crowd', 5, 'event_now', true));
select post_live(jsonb_build_object('country_code', 'TH', 'city_id', t.city('bangkok'), 'area_id', t.area('sukhumvit'), 'venue_id', (select v from t.ids where k = 'f_venue'), 'body', 'さっきより少し落ち着いてきました', 'crowd', 4));
call t.login(null);
select t.eq(activity_index('venue', (select v from t.ids where k = 'f_venue')::text)->>'status', 'insufficient', '1 人の連投では情報不足');
call t.login(t.u('f2'));
select post_live(jsonb_build_object('country_code', 'TH', 'city_id', t.city('bangkok'), 'area_id', t.area('sukhumvit'), 'venue_id', (select v from t.ids where k = 'f_venue'), 'body', 'ステージでイベントをやっています', 'crowd', 5, 'event_now', true));
call t.login(null);
select t.eq(activity_index('venue', (select v from t.ids where k = 'f_venue')::text)->>'status', 'ok', '2 人以上で指数を出す');
select t.eq((activity_index('venue', (select v from t.ids where k = 'f_venue')::text)->>'score')::int between 50 and 100, true, '混雑の報告が多いと高め');
select t.eq((activity_index('venue', (select v from t.ids where k = 'f_venue')::text)->>'event')::boolean, true, '2 人が報告したイベント');
select t.eq(activity_index('area', t.area('sukhumvit')::text)->>'status', 'ok', 'エリア単位');
select t.eq(activity_index('area', t.area('silom')::text)->>'status', 'insufficient', '報告の無いエリアは情報不足');
select t.eq(activity_index('venue', (select v from t.ids where k = 'f_venue')::text)::text ~ '0000000000f', false, '報告者の id を出さない');
-- 6 時間より前の報告は数えない
reset role;
update community_posts set published_at = now() - interval '7 hours' where author_id = t.u('f2') and type = 'live';
call t.login(null);
select t.eq(activity_index('venue', (select v from t.ids where k = 'f_venue')::text)->>'status', 'insufficient', '古い報告は数えない');
select t.fails($$select gn_activity(null, null, 1)$$, 'permission denied');

-- 4. NIGHT RADAR：誰でも見られる。件数が少ない地域は「データ不足」。投稿者の情報は出さない
select t.eq((select x->>'level' from jsonb_array_elements(radar('7d')->'cities') x where (x->>'id')::bigint = t.city('tokyo')), 'insufficient', '投稿の無い都市はデータ不足');
select t.eq((select x->>'level' from jsonb_array_elements(radar('7d')->'cities') x where (x->>'id')::bigint = t.city('bangkok')) <> 'insufficient', true, '投稿の多い都市は色が付く');
select t.eq((select count(*) from jsonb_array_elements(radar('7d')->'venues'))::int, 1, '位置のある店舗だけ');
select t.eq(radar('7d')::text ~ '0000000000[a-f][0-9]', false, '利用者の id を出さない');

-- 5. NIGHT AI：管理者が ON にするまで動かない。上限を超えたら止まる。キャッシュは service_role だけが書ける
call t.login(t.u('f1'));
select t.fails($$select ai_take('search')$$, 'ai_disabled');
select t.fails($$select admin_ai_config(true, 2, 100)$$, 'forbidden');
call t.login(t.u('d4'));
select t.fails($$select admin_ai_config(true, 2, 100)$$, 'forbidden');
call t.login(t.u('c3'));
select admin_ai_config(true, 2, 100);
call t.login(null);
select t.fails($$select ai_take('search')$$, 'login_required');
call t.login(t.u('f1'));
select t.eq((ai_take('search')->>'remaining')::int, 1, '残り回数');
select t.fails($$select ai_take('moderate')$$, 'invalid_kind');
select t.fails($$insert into ai_usage (user_id, kind) values (auth.uid(), 'search')$$, 'permission denied');
select t.fails($$insert into ai_summaries (target, summary, review_count, model) values ('/x/', '{}', 1, 'm')$$, 'permission denied');
select t.fails($$insert into post_translations (post_id, lang, body, source_hash, model) select id, 'en', 'x', 'h', 'm' from community_posts limit 1$$, 'permission denied');
select t.fails($$update ai_config set enabled = false$$, 'permission denied');
reset role;
set role service_role;
insert into ai_usage (user_id, kind, input_tokens, output_tokens) values (t.u('f1'), 'search', 100, 50), (t.u('f1'), 'search', 100, 50);
insert into ai_usage (user_id, kind, cached) values (t.u('f1'), 'search', true);
insert into moderation_flags (target_type, target_id, labels, score, reason, model) select 'post', id, '{spam}', 0.9, 'テスト', 'test' from community_posts where author_id = t.u('f1') limit 1;
reset role;
call t.login(t.u('f1'));
select t.fails($$select ai_take('search')$$, 'ai_quota');
select t.eq((select count(*) from ai_usage)::int, 3, '自分の利用記録は見える');
select t.eq((select count(*) from moderation_flags)::int, 0, '審査の補助は一般の利用者に見えない');
call t.login(t.u('f2'));
select t.eq((select count(*) from ai_usage)::int, 0, '他人の利用記録は見えない');
select t.eq((ai_take('summary')->>'ok')::boolean, true, 'キャッシュ済みの分は回数に数えない（別の利用者）');
call t.login(t.u('d4'));
select t.eq((select count(*) from flag_queue)::int, 1, '運営は審査の補助を見られる');
select mod_handle_flag((select id from moderation_flags limit 1), 'dismissed');
select t.eq((admin_stats_phase3()->>'flags_open')::int, 0, '対応済み');
select t.eq((admin_stats_phase3()->>'ai_24h')::int, 2, 'キャッシュを除いた利用回数');
-- AI の判定だけでは投稿は非表示にならない
select t.eq((select count(*) from community_posts where author_id = t.u('f1') and status = 'published' and type = 'live')::int, 2, '投稿はそのまま');

reset role;
select 'phase3 security: all passed';
