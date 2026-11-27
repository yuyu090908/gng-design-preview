-- =====================================================================
-- GLOBAL NIGHT COMMUNITY — Phase 2（SNS・ゲーミフィケーション）
--   NIGHT LIVE / NIGHT PASSPORT（XP・ランク・バッジ）/ TRUST SCORE / フォロー / 通知 / NIGHT PULSE（トレンド）
-- Phase 1 の上に追加するだけのマイグレーション（既存の表・データは変更しない）。
--
-- XP の方針
--  * XP はサーバー側（このファイルのトリガー・関数）だけで付与する。クライアントから XP を書く経路は無い。
--  * 付与は台帳（experience_transactions）に 1 行ずつ記録し、(user_id, idem_key) の一意制約で二重付与を防ぐ（冪等）。
--  * 自分への評価・作られたばかりのアカウント・同じ相手同士の繰り返しからは XP が入らない。
--  * 利用金額・飲酒量・訪問回数では XP は増えない。XP と TRUST SCORE は別に計算する。
-- =====================================================================

-- ---------- ランク ----------
create or replace function public.rank_for(xp int) returns text language sql immutable as $$
  select case when xp >= 50000 then 'Global VIP' when xp >= 15000 then 'Night Legend' when xp >= 5000 then 'Night Master'
              when xp >= 2000 then 'Night Expert' when xp >= 500 then 'Night Explorer' else 'Rookie' end
$$;
create or replace function public.next_rank_xp(xp int) returns int language sql immutable as $$
  select case when xp < 500 then 500 when xp < 2000 then 2000 when xp < 5000 then 5000 when xp < 15000 then 15000 when xp < 50000 then 50000 else null end
$$;

-- ---------- XP ----------
create table public.user_experience (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  xp int not null default 0,
  rank text not null default 'Rookie',
  updated_at timestamptz not null default now()
);
create table public.experience_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  action text not null check (action in ('helpful_review', 'verified_review', 'helpful_received', 'best_answer', 'venue_added', 'venue_correction', 'adjustment')),
  points int not null,
  idem_key text not null,
  source_type text,
  source_id uuid,
  actor_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, idem_key)
);
create index xp_tx_user on public.experience_transactions (user_id, created_at desc);

-- 既存ユーザーにも行を作る
insert into public.user_experience (user_id) select id from public.user_profiles on conflict do nothing;

-- 通知（下で定義）を前方参照するため、先に表を作る
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'helpful', 'follow', 'mention', 'badge', 'rank_up', 'moderation', 'best_answer', 'venue')),
  actor_id uuid references public.user_profiles(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  data jsonb not null default '{}',
  count int not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notif_user on public.notifications (user_id, created_at desc, id desc);
create index notif_unread on public.notifications (user_id) where read_at is null;

-- 通知の設定（種類ごとの ON/OFF。メール・Web Push は利用者が自分で有効にするまで OFF）
alter table public.user_preferences
  add column if not exists notify jsonb not null default '{"comment":true,"reply":true,"helpful":true,"follow":true,"mention":true,"badge":true,"rank_up":true,"moderation":true,"best_answer":true,"venue":true}',
  add column if not exists notify_email boolean not null default false,
  add column if not exists notify_push boolean not null default false;

-- 通知を作る（本人宛・ブロック中の相手から・設定で OFF の種類は作らない。「参考になった」は投稿ごとに 1 時間に 1 件にまとめる）
create or replace function public.gn_notify(p_user uuid, p_kind text, p_actor uuid default null, p_post uuid default null, p_comment uuid default null, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare n uuid;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and exists (select 1 from user_blocks where blocker_id = p_user and blocked_id = p_actor) then return; end if;
  if exists (select 1 from user_preferences where user_id = p_user and coalesce((notify->>p_kind)::boolean, true) = false) then return; end if;
  if p_kind = 'helpful' then
    -- 同じ人が押し直しても、24 時間は通知を増やさない（人数を水増ししない）
    if exists (select 1 from notifications where user_id = p_user and kind = 'helpful' and post_id = p_post and created_at > now() - interval '24 hours' and data->'actors' ? p_actor::text) then return; end if;
    select id into n from notifications where user_id = p_user and kind = 'helpful' and post_id = p_post and read_at is null and created_at > now() - interval '1 hour' limit 1;
    if n is not null then
      update notifications set count = count + 1, actor_id = p_actor, created_at = now(), data = jsonb_set(data, '{actors}', coalesce(data->'actors', '[]') || to_jsonb(p_actor::text)) where id = n;
      return;
    end if;
    p_data := coalesce(p_data, '{}') || jsonb_build_object('actors', jsonb_build_array(p_actor::text));
  end if;
  insert into notifications (user_id, kind, actor_id, post_id, comment_id, data) values (p_user, p_kind, p_actor, p_post, p_comment, coalesce(p_data, '{}'));
end $$;

-- XP を付与する（冪等）。ランクが上がったら通知、バッジを判定する
create or replace function public.gn_award(p_user uuid, p_action text, p_points int, p_key text, p_src_type text default null, p_src uuid default null, p_actor uuid default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare before_rank text; after_rank text; new_xp int; inserted int;
begin
  insert into experience_transactions (user_id, action, points, idem_key, source_type, source_id, actor_id)
  values (p_user, p_action, p_points, p_key, p_src_type, p_src, p_actor) on conflict (user_id, idem_key) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return false; end if;
  insert into user_experience (user_id) values (p_user) on conflict do nothing;
  select rank into before_rank from user_experience where user_id = p_user for update;
  update user_experience set xp = greatest(0, xp + p_points), updated_at = now() where user_id = p_user returning xp into new_xp;
  after_rank := rank_for(new_xp);
  update user_experience set rank = after_rank where user_id = p_user;
  if after_rank <> before_rank and new_xp > 0 and p_points > 0 then perform gn_notify(p_user, 'rank_up', null, null, null, jsonb_build_object('rank', after_rank)); end if;
  perform gn_eval_badges(p_user);
  return true;
end $$;

-- ---------- バッジ ----------
create table public.badges (
  code text primary key,
  name text not null,
  description text not null,
  sort int not null default 100
);
create table public.user_badges (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  badge text not null references public.badges(code),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge)
);
insert into public.badges (code, name, description, sort) values
  ('first_review', 'First Review', '初めての店舗の感想を公開した', 1),
  ('bangkok_expert', 'Bangkok Expert', 'バンコクの投稿 5 件以上で、参考になった 10 件以上', 2),
  ('tokyo_expert', 'Tokyo Expert', '東京の投稿 5 件以上で、参考になった 10 件以上', 3),
  ('global_explorer', 'Global Explorer', '5 か国以上について投稿した', 4),
  ('trusted_reviewer', 'Trusted Reviewer', '店舗の感想 10 件以上（訪問確認済み 3 件以上）で、TRUST SCORE 70 以上', 5),
  ('hidden_gem_finder', 'Hidden Gem Finder', '登録申請した店舗が公開され、他の人の感想が 3 件以上ついた', 6),
  ('community_contributor', 'Community Contributor', '参考になった 50 件、またはベストアンサー 5 件', 7),
  ('night_legend', 'Night Legend', 'ランク Night Legend（15,000 XP）に到達', 8)
on conflict do nothing;

create or replace function public.gn_give_badge(p_user uuid, p_badge text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into user_badges (user_id, badge) values (p_user, p_badge) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform gn_notify(p_user, 'badge', null, null, null, jsonb_build_object('badge', p_badge)); end if;
end $$;

create or replace function public.gn_eval_badges(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare reviews int; verified int; xp_ int; city_posts int; city_help int; countries int; helpful int; best int; ts jsonb;
begin
  select count(*) filter (where type = 'review'), count(*) filter (where type = 'review' and is_verified), count(distinct country_code)
    into reviews, verified, countries from community_posts where author_id = p_user and status = 'published';
  if reviews >= 1 then perform gn_give_badge(p_user, 'first_review'); end if;
  if countries >= 5 then perform gn_give_badge(p_user, 'global_explorer'); end if;
  select count(*), coalesce(sum(helpful_count), 0) into city_posts, city_help from community_posts p join cities c on c.id = p.city_id where p.author_id = p_user and p.status = 'published' and c.slug = 'bangkok';
  if city_posts >= 5 and city_help >= 10 then perform gn_give_badge(p_user, 'bangkok_expert'); end if;
  select count(*), coalesce(sum(helpful_count), 0) into city_posts, city_help from community_posts p join cities c on c.id = p.city_id where p.author_id = p_user and p.status = 'published' and c.slug = 'tokyo';
  if city_posts >= 5 and city_help >= 10 then perform gn_give_badge(p_user, 'tokyo_expert'); end if;
  select helpful_received into helpful from user_profiles where id = p_user;
  select count(*) into best from experience_transactions where user_id = p_user and action = 'best_answer' and points > 0;
  if helpful >= 50 or best >= 5 then perform gn_give_badge(p_user, 'community_contributor'); end if;
  select xp into xp_ from user_experience where user_id = p_user;
  if xp_ >= 15000 then perform gn_give_badge(p_user, 'night_legend'); end if;
  if reviews >= 10 and verified >= 3 then
    ts := gn_trust(p_user);
    if (ts->>'score')::int >= 70 then perform gn_give_badge(p_user, 'trusted_reviewer'); end if;
  end if;
  if exists (select 1 from venues v where v.created_by = p_user and v.status = 'published'
             and (select count(*) from community_posts p where p.venue_id = v.id and p.type = 'review' and p.status = 'published' and p.author_id <> p_user) >= 3) then
    perform gn_give_badge(p_user, 'hidden_gem_finder');
  end if;
end $$;

-- ---------- TRUST SCORE（XP とは別。投稿が 3 件未満は「データ不足」で、低い点にはしない） ----------
create table public.trust_score_history (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  day date not null default current_date,
  score int,
  components jsonb not null,
  primary key (user_id, day)
);
create or replace function public.gn_trust(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare posts int; reviews int; verified int; helpful int; raters int; months int; violations int; st text;
        c_use numeric; c_ver numeric; c_cont numeric; c_peer numeric; c_rule numeric; score numeric;
begin
  select count(*) filter (where status = 'published'), count(*) filter (where status = 'published' and type = 'review'),
         count(*) filter (where status = 'published' and type = 'review' and is_verified),
         count(distinct date_trunc('month', published_at)) filter (where status = 'published' and published_at > now() - interval '6 months'),
         count(*) filter (where status in ('hidden', 'removed'))
    into posts, reviews, verified, months, violations from community_posts where author_id = p_user;
  select helpful_received, status into helpful, st from user_profiles where id = p_user;
  select count(distinct r.user_id) into raters from post_reactions r join community_posts c on c.id = r.post_id where c.author_id = p_user;
  if posts < 3 then
    return jsonb_build_object('score', null, 'status', 'insufficient', 'posts', posts, 'needed', 3);
  end if;
  c_use := least(1, helpful::numeric / greatest(1, posts * 2));            -- 投稿の有用性
  c_ver := case when reviews > 0 then verified::numeric / reviews else 0 end;  -- 訪問確認実績
  c_cont := least(1, months / 6.0);                                         -- 継続性
  c_peer := least(1, raters / 10.0);                                        -- 他ユーザーからの有効な評価（人数）
  c_rule := greatest(0, 1 - violations * 0.25);                             -- ルール遵守（運営が確認した違反のみ。通報の数は使わない）
  score := 100 * (0.30 * c_use + 0.25 * c_ver + 0.15 * c_cont + 0.15 * c_peer + 0.15 * c_rule);
  if st = 'limited' then score := score - 20; end if;                       -- 確認された不正は別に減点
  return jsonb_build_object('score', greatest(0, round(score))::int, 'status', 'ok',
    'components', jsonb_build_object('usefulness', round(c_use * 100), 'verified', round(c_ver * 100), 'continuity', round(c_cont * 100), 'peer', round(c_peer * 100), 'compliance', round(c_rule * 100)));
end $$;

-- 誰でも見られる形（公開プロフィール用）。計算の材料は公開情報だけ
create or replace function public.trust_score(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare t jsonb;
begin
  if not exists (select 1 from user_profiles where id = p_user and status <> 'banned') then return null; end if;
  t := gn_trust(p_user);
  if t->>'status' = 'ok' then
    insert into trust_score_history (user_id, score, components) values (p_user, (t->>'score')::int, t->'components') on conflict (user_id, day) do update set score = excluded.score, components = excluded.components;
  end if;
  return t;
end $$;

-- ---------- フォロー ----------
create table public.user_follows (
  follower_id uuid not null references public.user_profiles(id) on delete cascade,
  followee_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.user_follows (followee_id);
alter table public.user_profiles add column if not exists follower_count int not null default 0, add column if not exists following_count int not null default 0;

create or replace function public.set_follow(p_user uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); n int;
begin
  if p_user = uid then raise exception 'cannot_follow_self' using errcode = '22023'; end if;
  if not exists (select 1 from user_profiles where id = p_user and status <> 'banned') then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if p_on then
    if exists (select 1 from user_blocks where (blocker_id = p_user and blocked_id = uid) or (blocker_id = uid and blocked_id = p_user)) then raise exception 'blocked' using errcode = '42501'; end if;
    perform gn_rate(uid, 'follow', 100, interval '1 hour');
    insert into user_follows (follower_id, followee_id) values (uid, p_user) on conflict do nothing;
    get diagnostics n = row_count;
    -- 同じ相手への「フォロー」通知は 1 日 1 回まで（付け外しの繰り返しで通知を送り続けられないように）
    if n > 0 and not exists (select 1 from notifications where user_id = p_user and kind = 'follow' and actor_id = uid and created_at > now() - interval '1 day') then
      perform gn_notify(p_user, 'follow', uid);
    end if;
  else
    delete from user_follows where follower_id = uid and followee_id = p_user;
  end if;
  update user_profiles set follower_count = (select count(*) from user_follows where followee_id = p_user) where id = p_user;
  update user_profiles set following_count = (select count(*) from user_follows where follower_id = uid) where id = uid;
  return p_on;
end $$;

-- ブロックしたらフォロー関係を解消する
create or replace function public.gn_on_block() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from user_follows where (follower_id = new.blocker_id and followee_id = new.blocked_id) or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  update user_profiles u set follower_count = (select count(*) from user_follows where followee_id = u.id), following_count = (select count(*) from user_follows where follower_id = u.id) where u.id in (new.blocker_id, new.blocked_id);
  return new;
end $$;
create trigger on_block after insert on public.user_blocks for each row execute function public.gn_on_block();

-- ---------- 自動の付与・通知（トリガー） ----------
-- 「参考になった」：投稿者に通知。XP は次の条件をすべて満たすときだけ +5
--   押した人のアカウントが作成から 24 時間以上・通常の状態 / 同じ人から同じ人へは 30 日に 3 回まで / 受け取る XP は 1 日 100 まで
--   店舗の感想が初めて他の人から「参考になった」を受けたら「有益な店舗レビュー」+30
create or replace function public.gn_on_helpful() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; t text; actor user_profiles;
begin
  select author_id, type into a, t from community_posts where id = new.post_id;
  select * into actor from user_profiles where id = new.user_id;
  perform gn_notify(a, 'helpful', new.user_id, new.post_id);
  if actor.status <> 'active' or actor.created_at > now() - interval '24 hours' then return new; end if;
  if (select count(*) from experience_transactions where user_id = a and action = 'helpful_received' and actor_id = new.user_id and created_at > now() - interval '30 days') >= 3 then return new; end if;
  if coalesce((select sum(points) from experience_transactions where user_id = a and action in ('helpful_received', 'helpful_review') and created_at > now() - interval '1 day'), 0) >= 100 then return new; end if;
  perform gn_award(a, 'helpful_received', 5, 'helpful:' || new.post_id || ':' || new.user_id, 'post', new.post_id, new.user_id);
  if t = 'review' then perform gn_award(a, 'helpful_review', 30, 'review:' || new.post_id, 'post', new.post_id, new.user_id); end if;
  return new;
end $$;
create trigger on_helpful after insert on public.post_reactions for each row execute function public.gn_on_helpful();

-- コメント：投稿者・返信先・@メンションに通知
create or replace function public.gn_on_comment() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pa uuid; ca uuid; h text; m uuid; n int := 0;
begin
  select author_id into pa from community_posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into ca from post_comments where id = new.parent_id;
    perform gn_notify(ca, 'reply', new.author_id, new.post_id, new.id);
  end if;
  if pa is distinct from ca then perform gn_notify(pa, 'comment', new.author_id, new.post_id, new.id); end if;
  for h in select distinct lower(x[1]) from regexp_matches(new.body, '@([a-z0-9_]{3,20})', 'gi') as x limit 5 loop
    select id into m from user_profiles where handle = h and status <> 'banned';
    if m is not null and m is distinct from pa and m is distinct from ca then perform gn_notify(m, 'mention', new.author_id, new.post_id, new.id); n := n + 1; end if;
  end loop;
  return new;
end $$;
create trigger on_comment after insert on public.post_comments for each row execute function public.gn_on_comment();

-- 投稿の公開・審査：@メンション、バッジの判定、運営の処分結果の通知
create or replace function public.gn_on_post() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare h text; m uuid;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if tg_op = 'INSERT' or old.published_at is null then
      for h in select distinct lower(x[1]) from regexp_matches(new.body, '@([a-z0-9_]{3,20})', 'gi') as x limit 5 loop
        select id into m from user_profiles where handle = h and status <> 'banned';
        perform gn_notify(m, 'mention', new.author_id, new.id);
      end loop;
    end if;
    perform gn_eval_badges(new.author_id);
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('hidden', 'removed', 'pending') and auth.uid() is distinct from new.author_id then
    perform gn_notify(new.author_id, 'moderation', null, new.id, null, jsonb_build_object('status', new.status));
  end if;
  if tg_op = 'UPDATE' and old.status in ('hidden', 'pending') and new.status = 'published' and auth.uid() is distinct from new.author_id then
    perform gn_notify(new.author_id, 'moderation', null, new.id, null, jsonb_build_object('status', 'published'));
  end if;
  -- 訪問確認：確認されたら +50（取り消したら同じ点数を戻す。再確認しても二重には付かない）
  if tg_op = 'UPDATE' and new.type = 'review' and old.is_verified is distinct from new.is_verified then
    if new.is_verified then perform gn_award(new.author_id, 'verified_review', 50, 'verified:' || new.id, 'post', new.id);
    elsif exists (select 1 from experience_transactions where user_id = new.author_id and idem_key = 'verified:' || new.id) then
      perform gn_award(new.author_id, 'verified_review', -50, 'verified-revoked:' || new.id, 'post', new.id);
    end if;
  end if;
  return new;
end $$;
create trigger on_post after insert or update on public.community_posts for each row execute function public.gn_on_post();

-- 店舗の登録申請が公開されたら、申請した人に +25 と通知
create or replace function public.gn_on_venue() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.created_by is not null and new.status = 'published' and old.status = 'pending' and not exists (select 1 from user_roles where user_id = new.created_by) then
    perform gn_award(new.created_by, 'venue_added', 25, 'venue:' || new.id, 'venue', new.id);
    perform gn_notify(new.created_by, 'venue', null, null, null, jsonb_build_object('venue', new.name));
  end if;
  return new;
end $$;
create trigger on_venue after update of status on public.venues for each row execute function public.gn_on_venue();

-- 新規ユーザーの XP の行
create or replace function public.gn_on_profile() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin insert into user_experience (user_id) values (new.id) on conflict do nothing; return new; end $$;
create trigger on_profile after insert on public.user_profiles for each row execute function public.gn_on_profile();

-- ---------- ベストアンサー（質問した人が、他の人のコメントを 1 つ選ぶ。回答者に +15） ----------
alter table public.community_posts add column if not exists best_comment_id uuid references public.post_comments(id) on delete set null;
create or replace function public.mark_best_answer(p_post uuid, p_comment uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); p community_posts; c post_comments;
begin
  select * into p from community_posts where id = p_post for update;
  if p.id is null or p.author_id <> uid then raise exception 'not_owner' using errcode = '42501'; end if;
  if p.type <> 'question' then raise exception 'not_question' using errcode = '22023'; end if;
  if p.best_comment_id is not null then raise exception 'already_chosen' using errcode = '23505'; end if;
  select * into c from post_comments where id = p_comment and post_id = p_post and status = 'published';
  if c.id is null then raise exception 'comment_not_found' using errcode = 'P0002'; end if;
  if c.author_id = uid then raise exception 'cannot_rate_own' using errcode = '42501'; end if;
  update community_posts set best_comment_id = p_comment where id = p_post;
  perform gn_award(c.author_id, 'best_answer', 15, 'best:' || p_post, 'post', p_post, uid);
  perform gn_notify(c.author_id, 'best_answer', uid, p_post, p_comment);
end $$;

-- ---------- 通知の操作 ----------
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); n int;
begin
  update notifications set read_at = now() where user_id = uid and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.update_notify_settings(p_notify jsonb, p_email boolean, p_push boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); k text; clean jsonb := '{}';
begin
  for k in select * from jsonb_object_keys(coalesce(p_notify, '{}')) loop
    if k in ('comment', 'reply', 'helpful', 'follow', 'mention', 'badge', 'rank_up', 'moderation', 'best_answer', 'venue') then clean := clean || jsonb_build_object(k, (p_notify->>k)::boolean); end if;
  end loop;
  -- 運営からの審査結果は止められない（処分を知らないままにならないように）
  clean := clean || '{"moderation": true}';
  update user_preferences set notify = notify || clean, notify_email = coalesce(p_email, false), notify_push = coalesce(p_push, false), updated_at = now() where user_id = uid;
end $$;

-- 運営からのお知らせ（全員に表示。通知の表ではなく別の表に 1 行だけ置く）
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  created_by uuid references public.user_profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  expires_at timestamptz
);
create or replace function public.admin_announce(p_title text, p_body text, p_days int default 14) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare aid uuid;
begin
  perform gn_require('admin');
  insert into announcements (title, body, created_by, expires_at) values (left(gn_clean(p_title), 120), left(gn_clean(p_body), 2000), auth.uid(), now() + make_interval(days => greatest(1, least(p_days, 90)))) returning id into aid;
  perform gn_audit('announcement.create', 'announcement', aid::text, jsonb_build_object('title', p_title));
  return aid;
end $$;

-- ---------- NIGHT LIVE（現地のリアルタイム情報） ----------
-- 投稿者の現在地は扱わない。対象は店舗か都市・エリア（公開情報）だけ。
-- ライブの一覧には 24 時間以内のものだけを出し、その後は通常の投稿履歴として残る（公開範囲は通常の投稿と同じ）。
create table public.live_reports (
  post_id uuid primary key references public.community_posts(id) on delete cascade,
  crowd smallint check (crowd between 1 and 5),                 -- 混雑の体感（1：空いている〜5：とても混んでいる）
  vibe text check (vibe in ('calm', 'lively', 'party', 'quiet')), -- 店内の雰囲気
  open_status text not null default 'unknown' check (open_status in ('open', 'closed', 'unknown')),
  event_now boolean not null default false,
  price_note text not null default '' check (char_length(price_note) <= 120)
);
create or replace function public.post_live(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(true); pid uuid;
begin
  if nullif(p->>'venue_id', '') is null and nullif(p->>'city_id', '') is null then raise exception 'live_needs_place' using errcode = '22023'; end if;
  perform gn_rate(uid, 'live', 6, interval '1 hour');
  perform set_config('gn.live', '1', true);
  pid := save_post(p || jsonb_build_object('type', 'live', 'category', 'local', 'status', 'published', 'ratings', '{}'::jsonb, 'id', null));
  perform set_config('gn.live', '', true);
  insert into live_reports (post_id, crowd, vibe, open_status, event_now, price_note)
  values (pid, nullif(p->>'crowd', '')::smallint, nullif(p->>'vibe', ''), coalesce(nullif(p->>'open_status', ''), 'unknown'), coalesce((p->>'event_now')::boolean, false), left(gn_clean(p->>'price_note'), 120));
  return pid;
end $$;

-- ライブ投稿は post_live からだけ作れる（混雑などの情報が無いライブ投稿を作らせない）
create or replace function public.gn_live_guard() returns trigger language plpgsql as $$
begin
  if new.type = 'live' and (tg_op = 'INSERT' or old.type is distinct from 'live') and coalesce(current_setting('gn.live', true), '') <> '1' then
    raise exception 'use_post_live' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.type = 'live' and new.type <> 'live' then raise exception 'use_post_live' using errcode = '22023'; end if;
  return new;
end $$;
create trigger live_guard before insert or update of type on public.community_posts for each row execute function public.gn_live_guard();

-- ---------- 画面用のビュー（Phase 1 の post_feed に列を足す） ----------
create or replace view public.post_feed with (security_invoker = true) as
select p.id, p.author_id, p.type, p.category, p.title, p.body, p.country_code, p.city_id, p.area_id, p.venue_id, p.article_path,
       p.visit_date, p.spend_amount, p.spend_currency, p.revisit, p.status, p.is_verified, p.lang,
       p.helpful_count, p.comment_count, p.created_at, p.updated_at, p.edited_at, p.published_at,
       u.handle as author_handle, u.display_name as author_name, u.avatar_seed as author_avatar,
       u.post_count as author_posts, u.helpful_received as author_helpful,
       v.name as venue_name, v.category as venue_category,
       co.name_ja as country_name, ci.name_ja as city_name, ar.name_ja as area_name,
       (select jsonb_object_agg(r.aspect, r.score) from public.review_ratings r where r.post_id = p.id) as ratings,
       (select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height, 'alt', m.alt) order by m.sort) from public.post_media m where m.post_id = p.id) as media,
       x.rank as author_rank, x.xp as author_xp,
       l.crowd as live_crowd, l.vibe as live_vibe, l.open_status as live_open, l.event_now as live_event, l.price_note as live_price,
       p.best_comment_id
from public.community_posts p
join public.user_profiles u on u.id = p.author_id
left join public.user_experience x on x.user_id = p.author_id
left join public.live_reports l on l.post_id = p.id
left join public.venues v on v.id = p.venue_id
left join public.countries co on co.code = p.country_code
left join public.cities ci on ci.id = p.city_id
left join public.areas ar on ar.id = p.area_id;

create view public.notification_feed with (security_invoker = true) as
select n.id, n.kind, n.post_id, n.comment_id, n.data - 'actors' as data, n.count, n.read_at, n.created_at,
       a.handle as actor_handle, a.display_name as actor_name, a.avatar_seed as actor_avatar,
       left(coalesce(nullif(p.title, ''), p.body), 60) as post_excerpt
from public.notifications n
left join public.user_profiles a on a.id = n.actor_id
left join public.community_posts p on p.id = n.post_id;

-- ---------- NIGHT PULSE（トレンド） ----------
-- 閲覧数は使わない。公開中の投稿・ユニークユーザー数・「参考になった」（作成 24 時間以上のアカウント・通常の状態のみ）・鮮度で決める。
-- 広告やスポンサーの情報は参照しない（料金で順位は変わらない）。件数が少ないものは出さない。
create or replace function public.pulse(p_period text default '7d') returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare span interval := case p_period when '24h' then interval '24 hours' when '30d' then interval '30 days' else interval '7 days' end;
        since timestamptz := now() - span; prev timestamptz := now() - 2 * span; out jsonb;
begin
  with valid_reactions as (
    select r.post_id, r.user_id, r.created_at from post_reactions r join user_profiles u on u.id = r.user_id
    where u.status = 'active' and u.created_at < r.created_at - interval '24 hours'
  ), pub as (
    select p.* from community_posts p join user_profiles u on u.id = p.author_id where p.status = 'published' and u.status = 'active'
  )
  select jsonb_build_object(
    'period', p_period, 'generated_at', now(),
    -- 話題の投稿：期間内の有効な「参考になった」の人数 ＋ コメント数、新しさで少し加点
    'posts', coalesce((select jsonb_agg(x order by x->>'score' desc) from (
      select jsonb_build_object('id', p.id, 'title', left(coalesce(nullif(p.title, ''), p.body), 60), 'type', p.type,
             'score', round((count(distinct vr.user_id) * 3 + least(p.comment_count, 20) + case when p.published_at > since then 2 else 0 end)::numeric, 1),
             'helpful', count(distinct vr.user_id)) as x
      from pub p left join valid_reactions vr on vr.post_id = p.id and vr.created_at > since
      where p.published_at > now() - greatest(span, interval '7 days')
      group by p.id, p.title, p.body, p.type, p.comment_count, p.published_at
      having count(distinct vr.user_id) >= 1 or p.comment_count >= 2
      order by 1 desc limit 10) s), '[]'),
    -- 評価が上がっている対象：期間内と前の期間の平均の差（それぞれ 3 件以上あるものだけ）
    'rising', coalesce((select jsonb_agg(jsonb_build_object('target', target, 'venue_id', venue_id, 'article_path', article_path, 'name', name, 'now', round(now_avg, 2), 'before', round(prev_avg, 2), 'n', n_now) order by now_avg - prev_avg desc) from (
      select coalesce(p.venue_id::text, p.article_path) target, p.venue_id, p.article_path, max(v.name) name,
             avg(r.score) filter (where p.published_at > since) now_avg, avg(r.score) filter (where p.published_at <= since and p.published_at > prev) prev_avg,
             count(distinct p.id) filter (where p.published_at > since) n_now, count(distinct p.id) filter (where p.published_at <= since and p.published_at > prev) n_prev
      from pub p join review_ratings r on r.post_id = p.id and r.aspect = 'overall' left join venues v on v.id = p.venue_id
      where p.type = 'review' and p.published_at > prev group by 1, 2, 3) s where n_now >= 3 and n_prev >= 3 and now_avg > prev_avg limit 10), '[]'),
    -- 投稿が増えているエリア（都市単位。期間内 3 件以上・投稿者 2 人以上）
    'areas', coalesce((select jsonb_agg(jsonb_build_object('city_id', city_id, 'name', name, 'n', n, 'before', b, 'users', users) order by n - b desc, n desc) from (
      select p.city_id, max(c.name_ja || '（' || co.name_ja || '）') name, count(*) filter (where p.published_at > since) n,
             count(*) filter (where p.published_at <= since and p.published_at > prev) b, count(distinct p.author_id) filter (where p.published_at > since) users
      from pub p join cities c on c.id = p.city_id join countries co on co.code = c.country_code where p.published_at > prev group by p.city_id) s where n >= 3 and users >= 2 limit 10), '[]'),
    'new_venues', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'category', category) order by created_at desc) from (
      select id, name, category, created_at from venues where status = 'published' and created_at > since order by created_at desc limit 10) s), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', left(coalesce(nullif(title, ''), body), 60), 'helpful', helpful_count) order by helpful_count desc) from (
      select id, title, body, helpful_count from pub where type = 'event' and published_at > since order by helpful_count desc, published_at desc limit 10) s), '[]'),
    'helpful_reviews', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', left(coalesce(nullif(title, ''), body), 60), 'helpful', n) order by n desc) from (
      select p.id, p.title, p.body, count(distinct vr.user_id) n from pub p join valid_reactions vr on vr.post_id = p.id and vr.created_at > since
      where p.type = 'review' group by p.id, p.title, p.body order by n desc limit 10) s), '[]')
  ) into out;
  return out;
end $$;

-- 管理画面の数値に Phase 2 の分を足す
create or replace function public.admin_stats_phase2() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  return jsonb_build_object(
    'xp_total', (select coalesce(sum(points), 0) from experience_transactions),
    'xp_24h', (select coalesce(sum(points), 0) from experience_transactions where created_at > now() - interval '24 hours'),
    'badges', (select count(*) from user_badges),
    'follows', (select count(*) from user_follows),
    'live_24h', (select count(*) from community_posts where type = 'live' and status = 'published' and published_at > now() - interval '24 hours'),
    'ranks', coalesce((select jsonb_object_agg(rank, n) from (select rank, count(*) n from user_experience group by rank) s), '{}'),
    'retention_30d', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where exists (select 1 from user_activity_days d where d.user_id = u.id and d.day >= (u.created_at + interval '7 days')::date)) / count(*)) end
                      from user_profiles u where u.created_at between now() - interval '60 days' and now() - interval '30 days')
  );
end $$;
-- XP の手動調整（管理者のみ・理由は監査ログに残る）
create or replace function public.admin_adjust_xp(p_user uuid, p_points int, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('admin');
  if coalesce(btrim(p_note), '') = '' then raise exception 'note_required' using errcode = '22023'; end if;
  perform gn_award(p_user, 'adjustment', p_points, 'adjust:' || gen_random_uuid(), 'user', p_user, auth.uid());
  perform gn_audit('xp.adjust', 'user', p_user::text, jsonb_build_object('points', p_points, 'note', left(p_note, 500)));
end $$;

-- ---------- 権限 ----------
alter table public.user_experience enable row level security;
alter table public.experience_transactions enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.trust_score_history enable row level security;
alter table public.user_follows enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.live_reports enable row level security;

revoke insert, update, delete, truncate on public.user_experience, public.experience_transactions, public.badges, public.user_badges, public.trust_score_history,
  public.user_follows, public.notifications, public.announcements, public.live_reports from anon, authenticated;

create policy "XP は公開（ランク表示用）" on public.user_experience for select using (true);
create policy "XP の台帳は本人と運営だけ" on public.experience_transactions for select using (user_id = auth.uid() or public.is_moderator());
create policy "バッジは公開" on public.badges for select using (true);
create policy "獲得バッジは公開" on public.user_badges for select using (true);
create policy "信頼スコアの履歴は本人と運営" on public.trust_score_history for select using (user_id = auth.uid() or public.is_moderator());
-- フォロー関係は本人同士には見える。第三者には、両方が「非公開」にしていない場合だけ見える
create policy "フォローは非公開設定を尊重" on public.user_follows for select using (
  follower_id = auth.uid() or followee_id = auth.uid() or public.is_moderator()
  or not exists (select 1 from public.user_profiles u where u.id in (follower_id, followee_id) and u.is_private));
create policy "通知は本人だけ" on public.notifications for select using (user_id = auth.uid());
create policy "お知らせは公開中のもの" on public.announcements for select using (published_at <= now() and (expires_at is null or expires_at > now()) or public.is_admin());
create policy "見える投稿のライブ情報" on public.live_reports for select using (exists (select 1 from public.community_posts p where p.id = post_id));

grant select on public.user_experience, public.badges, public.user_badges, public.user_follows, public.live_reports, public.announcements, public.notification_feed, public.post_feed to anon, authenticated;
grant select on public.experience_transactions, public.trust_score_history, public.notifications to authenticated;

revoke execute on function public.gn_notify(uuid, text, uuid, uuid, uuid, jsonb), public.gn_award(uuid, text, int, text, text, uuid, uuid), public.gn_give_badge(uuid, text),
  public.gn_eval_badges(uuid), public.gn_trust(uuid), public.gn_on_block(), public.gn_on_helpful(), public.gn_on_comment(), public.gn_on_post(), public.gn_on_venue(), public.gn_on_profile(), public.gn_live_guard()
  from public, anon, authenticated;
revoke execute on function public.trust_score(uuid), public.pulse(text), public.set_follow(uuid, boolean), public.mark_best_answer(uuid, uuid), public.mark_notifications_read(uuid[]),
  public.update_notify_settings(jsonb, boolean, boolean), public.admin_announce(text, text, int), public.post_live(jsonb), public.admin_stats_phase2(), public.admin_adjust_xp(uuid, int, text),
  public.rank_for(int), public.next_rank_xp(int) from public;
grant execute on function public.trust_score(uuid), public.pulse(text), public.rank_for(int), public.next_rank_xp(int) to anon, authenticated;
grant execute on function public.set_follow(uuid, boolean), public.mark_best_answer(uuid, uuid), public.mark_notifications_read(uuid[]), public.update_notify_settings(jsonb, boolean, boolean),
  public.admin_announce(text, text, int), public.post_live(jsonb), public.admin_stats_phase2(), public.admin_adjust_xp(uuid, int, text) to authenticated;
