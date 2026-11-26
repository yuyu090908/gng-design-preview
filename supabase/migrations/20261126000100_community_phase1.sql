-- =====================================================================
-- GLOBAL NIGHT COMMUNITY — Phase 1（コミュニティ基盤）
-- 対象：Supabase（PostgreSQL 15+）。既存の WordPress には触れない、追加だけのマイグレーション。
--
-- 方針
--  * 読み取りは行単位の権限（RLS）で制御する。
--  * 書き込みはすべてサーバー側の関数（RPC）経由にする。テーブルへの直接の
--    insert / update / delete は API 用のロールから取り上げる。関数の中で
--    本人確認・入力検証・回数制限・集計の更新・監査ログを 1 つのトランザクションで行う。
--  * 架空のデータは入れない。最初に入れるのは国・都市・エリアの名前だけ。
-- =====================================================================

-- ---------- 共通 ----------
create extension if not exists pgcrypto with schema extensions;

create or replace function public.gn_now() returns timestamptz language sql stable as $$ select now() $$;

-- ---------- 地域 ----------
create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'),
  name_ja text not null,
  name_en text not null,
  sort int not null default 100
);
create table public.cities (
  id bigint generated always as identity primary key,
  country_code char(2) not null references public.countries(code),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ja text not null,
  name_en text not null,
  unique (country_code, slug)
);
create table public.areas (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities(id),
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ja text not null,
  name_en text not null,
  unique (city_id, slug)
);

-- ---------- ユーザー ----------
create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 30),
  avatar_seed text not null default encode(extensions.gen_random_bytes(6), 'hex'),
  bio text not null default '' check (char_length(bio) <= 160),
  status text not null default 'active' check (status in ('active', 'limited', 'banned')),
  is_private boolean not null default false,
  age_confirmed_at timestamptz,
  post_count int not null default 0,
  helpful_received int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.user_profiles is '公開プロフィール。メールアドレスなどは auth.users にだけあり、ここには持たない';

create table public.user_preferences (
  user_id uuid primary key references public.user_profiles(id) on delete cascade,
  country_code char(2) references public.countries(code),
  city_id bigint references public.cities(id),
  area_id bigint references public.areas(id),
  lang text not null default 'ja' check (lang in ('ja', 'en', 'th', 'ko', 'zh-Hans', 'zh-Hant')),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  granted_by uuid references public.user_profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.user_blocks (
  blocker_id uuid not null references public.user_profiles(id) on delete cascade,
  blocked_id uuid not null references public.user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- 利用状況（DAU/WAU/MAU 用。ログイン中に 1 日 1 回だけ記録。閲覧したページは記録しない）
create table public.user_activity_days (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

-- 回数制限用（投稿・コメント・通報などの連続実行を防ぐ）
create table public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null,
  at timestamptz not null default now()
);
create index rate_events_user_kind_at on public.rate_events (user_id, kind, at desc);

-- ---------- 店舗 ----------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('bar', 'club', 'karaoke', 'cabaret', 'soapland', 'delivery', 'massage', 'restaurant', 'other')),
  country_code char(2) references public.countries(code),
  city_id bigint references public.cities(id),
  area_id bigint references public.areas(id),
  article_path text unique check (article_path is null or (char_length(article_path) <= 300 and article_path ~ '^/[^\s<>"'']+$')),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden')),
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index venues_region on public.venues (country_code, city_id, area_id) where status = 'published';

-- ---------- 投稿 ----------
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null check (type in ('review', 'live', 'question', 'recommend', 'event', 'talk')),
  category text not null check (category in ('review', 'recommend', 'question', 'budget', 'event', 'local', 'beginner', 'chat', 'caution', 'region')),
  title text not null default '' check (char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 5000),
  country_code char(2) references public.countries(code),
  city_id bigint references public.cities(id),
  area_id bigint references public.areas(id),
  venue_id uuid references public.venues(id) on delete set null,
  article_path text check (article_path is null or (char_length(article_path) <= 300 and article_path ~ '^/[^\s<>"'']+$')),
  visit_date date,
  spend_amount numeric(12, 2) check (spend_amount is null or spend_amount between 0 and 100000000),
  spend_currency char(3) check (spend_currency is null or spend_currency ~ '^[A-Z]{3}$'),
  revisit text check (revisit is null or revisit in ('yes', 'maybe', 'no')),
  status text not null default 'published' check (status in ('draft', 'published', 'pending', 'hidden', 'removed')),
  is_verified boolean not null default false,
  lang text not null default 'ja',
  helpful_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  published_at timestamptz
);
create index posts_feed on public.community_posts (published_at desc, id desc) where status = 'published';
create index posts_popular on public.community_posts (helpful_count desc, published_at desc) where status = 'published';
create index posts_author on public.community_posts (author_id, created_at desc);
create index posts_article on public.community_posts (article_path, published_at desc) where status = 'published';
create index posts_venue on public.community_posts (venue_id, published_at desc) where status = 'published';
create index posts_region on public.community_posts (country_code, city_id, area_id, published_at desc) where status = 'published';

-- 評価（項目ごとに 1〜5）。店舗の種類によって使う項目が変わる
create table public.review_ratings (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  aspect text not null check (aspect in ('overall', 'service', 'atmosphere', 'cleanliness', 'price_clarity', 'value', 'safety', 'drinks', 'music')),
  score smallint not null check (score between 1 and 5),
  primary key (post_id, aspect)
);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  path text not null check (path ~ '^[0-9a-f-]{36}/[0-9a-zA-Z_.-]{1,80}$'),
  width int check (width between 1 and 8000),
  height int check (height between 1 and 8000),
  alt text not null default '' check (char_length(alt) <= 200),
  sort smallint not null default 0 check (sort between 0 and 3),
  unique (post_id, sort)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.user_profiles(id) on delete cascade,
  parent_id uuid references public.post_comments(id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index comments_post on public.post_comments (post_id, created_at, id);

create table public.post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  kind text not null default 'helpful' check (kind in ('helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index reactions_user on public.post_reactions (user_id, created_at desc);

create table public.post_bookmarks (
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ---------- 通報・審査・監査 ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.user_profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'abuse', 'privacy', 'threat', 'impersonation', 'fake_review', 'illegal', 'non_consensual', 'other')),
  detail text not null default '' check (char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  resolution text not null default '' check (char_length(resolution) <= 1000),
  handled_by uuid references public.user_profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_open on public.reports (status, created_at) where status in ('open', 'reviewing');

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.user_profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index audit_at on public.admin_audit_logs (at desc);

-- =====================================================================
-- 権限の判定
-- =====================================================================
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and (role = r or role = 'admin'))
$$;
create or replace function public.is_admin() returns boolean language sql stable as $$ select public.has_role('admin') $$;
create or replace function public.is_moderator() returns boolean language sql stable as $$ select public.has_role('moderator') $$;

-- 書き込みできる本人か（ログイン済み・利用停止でない・年齢確認済み）
create or replace function public.gn_actor(need_post boolean default true) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); p user_profiles;
begin
  if uid is null then raise exception 'login_required' using errcode = '28000'; end if;
  select * into p from user_profiles where id = uid;
  if not found then raise exception 'profile_missing' using errcode = 'P0002'; end if;
  if p.status = 'banned' then raise exception 'account_banned' using errcode = '42501'; end if;
  if need_post and p.status = 'limited' then raise exception 'account_limited' using errcode = '42501'; end if;
  if need_post and p.age_confirmed_at is null then raise exception 'age_unconfirmed' using errcode = '42501'; end if;
  return uid;
end $$;

-- 回数制限：直近 per の間に max 回を超えたら止める
create or replace function public.gn_rate(uid uuid, k text, max_n int, per interval) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from rate_events where user_id = uid and kind = k and at > now() - per) >= max_n then
    raise exception 'rate_limited' using errcode = '54000', detail = k;
  end if;
  insert into rate_events (user_id, kind) values (uid, k);
end $$;

create or replace function public.gn_audit(a text, tt text, tid text, d jsonb default '{}') returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into admin_audit_logs (actor_id, action, target_type, target_id, detail) values (auth.uid(), a, tt, tid, coalesce(d, '{}'))
$$;

-- 文字列の整形（前後の空白を削り、制御文字を取り除く）。HTML は保存時ではなく表示時に必ずエスケープする
create or replace function public.gn_clean(s text) returns text language sql immutable as $$
  select btrim(regexp_replace(coalesce(s, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'))
$$;

-- =====================================================================
-- 新規登録時のプロフィール作成（本名は使わず、ランダムなニックネームで始める）
-- =====================================================================
create or replace function public.gn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare h text;
begin
  loop
    h := 'night_' || substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8);
    exit when not exists (select 1 from user_profiles where handle = h);
  end loop;
  insert into user_profiles (id, handle, display_name) values (new.id, h, 'Night Insider');
  insert into user_preferences (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.gn_handle_new_user();

-- =====================================================================
-- RPC：プロフィール
-- =====================================================================
create or replace function public.update_profile(p_handle text, p_display_name text, p_bio text, p_is_private boolean, p_confirm_age boolean default false)
returns user_profiles language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); r user_profiles; h text := lower(gn_clean(p_handle));
begin
  perform gn_rate(uid, 'profile', 20, interval '1 hour');
  if h !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid_handle' using errcode = '22023'; end if;
  if h in ('admin', 'administrator', 'moderator', 'official', 'support', 'staff', 'gng', 'globalnightguide', 'system')
     or h like 'admin%' or h like 'official%' or h like 'gng_%' then
    raise exception 'reserved_handle' using errcode = '22023';
  end if;
  if exists (select 1 from user_profiles where handle = h and id <> uid) then raise exception 'handle_taken' using errcode = '23505'; end if;
  update user_profiles set
    handle = h,
    display_name = coalesce(nullif(left(gn_clean(p_display_name), 30), ''), display_name),
    bio = left(gn_clean(p_bio), 160),
    is_private = coalesce(p_is_private, is_private),
    age_confirmed_at = case when p_confirm_age and age_confirmed_at is null then now() else age_confirmed_at end,
    updated_at = now()
  where id = uid returning * into r;
  return r;
end $$;

create or replace function public.update_preferences(p_country char(2), p_city bigint, p_area bigint, p_lang text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false);
begin
  if p_city is not null and not exists (select 1 from cities where id = p_city and country_code = p_country) then raise exception 'invalid_region' using errcode = '22023'; end if;
  if p_area is not null and not exists (select 1 from areas where id = p_area and city_id = p_city) then raise exception 'invalid_region' using errcode = '22023'; end if;
  update user_preferences set country_code = p_country, city_id = p_city, area_id = p_area, lang = coalesce(p_lang, lang), updated_at = now() where user_id = uid;
end $$;

-- 1 日 1 回の利用記録（DAU/WAU/MAU の集計用）
create or replace function public.ping() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then return; end if;
  insert into user_activity_days (user_id, day) select auth.uid(), current_date
  where exists (select 1 from user_profiles where id = auth.uid()) on conflict do nothing;
end $$;

create or replace function public.set_block(p_user uuid, p_block boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false);
begin
  if p_user = uid then raise exception 'cannot_block_self' using errcode = '22023'; end if;
  if p_block then
    perform gn_rate(uid, 'block', 60, interval '1 hour');
    insert into user_blocks (blocker_id, blocked_id) values (uid, p_user) on conflict do nothing;
  else
    delete from user_blocks where blocker_id = uid and blocked_id = p_user;
  end if;
  return p_block;
end $$;

-- =====================================================================
-- RPC：投稿（作成・編集・下書き・削除を 1 つの関数で扱う）
--   p: { id?, type, category, title, body, country_code, city_id, area_id, venue_id, article_path,
--        visit_date, spend_amount, spend_currency, revisit, status: 'draft'|'published',
--        ratings: { overall: 1-5, ... }, media: [{ path, width, height, alt }] }
-- =====================================================================
create or replace function public.save_post(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := gn_actor(true);
  pid uuid := nullif(p->>'id', '')::uuid;
  cur community_posts;
  t text := p->>'type';
  st text := coalesce(p->>'status', 'published');
  v_body text := left(gn_clean(p->>'body'), 5000);
  v_title text := left(gn_clean(p->>'title'), 120);
  vd date := nullif(p->>'visit_date', '')::date;
  ap text := nullif(gn_clean(p->>'article_path'), '');
  vid uuid := nullif(p->>'venue_id', '')::uuid;
  cc char(2) := nullif(upper(p->>'country_code'), '');
  ci bigint := nullif(p->>'city_id', '')::bigint;
  ar bigint := nullif(p->>'area_id', '')::bigint;
  k text; v jsonb; m jsonb; i int := 0;
begin
  if st not in ('draft', 'published') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if t is null or t not in ('review', 'live', 'question', 'recommend', 'event', 'talk') then raise exception 'invalid_type' using errcode = '22023'; end if;
  if char_length(v_body) < (case when st = 'draft' then 1 when t = 'review' then 30 else 5 end) then raise exception 'body_too_short' using errcode = '22023'; end if;
  if vd is not null and (vd > current_date + 1 or vd < current_date - interval '3 years') then raise exception 'invalid_visit_date' using errcode = '22023'; end if;
  if vid is not null and not exists (select 1 from venues where id = vid and status = 'published') then raise exception 'invalid_venue' using errcode = '22023'; end if;
  if ci is not null and not exists (select 1 from cities where id = ci and country_code = cc) then raise exception 'invalid_region' using errcode = '22023'; end if;
  if ar is not null and not exists (select 1 from areas where id = ar and city_id = ci) then raise exception 'invalid_region' using errcode = '22023'; end if;
  if st = 'published' and t = 'review' then
    if vid is null and ap is null then raise exception 'review_needs_target' using errcode = '22023'; end if;
    if coalesce((p->'ratings'->>'overall')::int, 0) not between 1 and 5 then raise exception 'review_needs_overall' using errcode = '22023'; end if;
  end if;
  if jsonb_typeof(coalesce(p->'media', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'media', '[]')) > 4 then raise exception 'too_many_media' using errcode = '22023'; end if;

  if pid is null then
    perform gn_rate(uid, 'post', 10, interval '1 hour');
    perform gn_rate(uid, 'post_day', 30, interval '1 day');
    insert into community_posts (author_id, type, category, title, body, country_code, city_id, area_id, venue_id, article_path,
      visit_date, spend_amount, spend_currency, revisit, status, published_at)
    values (uid, t, coalesce(p->>'category', 'chat'), v_title, v_body, cc, ci, ar, vid, ap,
      vd, nullif(p->>'spend_amount', '')::numeric, nullif(upper(p->>'spend_currency'), ''), nullif(p->>'revisit', ''), st,
      case when st = 'published' then now() end)
    returning id into pid;
  else
    select * into cur from community_posts where id = pid for update;
    if not found or cur.author_id <> uid then raise exception 'not_owner' using errcode = '42501'; end if;
    if cur.status not in ('draft', 'published') then raise exception 'locked_by_moderation' using errcode = '42501'; end if;
    perform gn_rate(uid, 'edit', 30, interval '1 hour');
    update community_posts set type = t, category = coalesce(p->>'category', category), title = v_title, body = v_body,
      country_code = cc, city_id = ci, area_id = ar, venue_id = vid, article_path = ap, visit_date = vd,
      spend_amount = nullif(p->>'spend_amount', '')::numeric, spend_currency = nullif(upper(p->>'spend_currency'), ''),
      revisit = nullif(p->>'revisit', ''), status = st,
      published_at = coalesce(published_at, case when st = 'published' then now() end),
      edited_at = case when cur.status = 'published' then now() else edited_at end,
      updated_at = now()
    where id = pid;
  end if;

  -- 評価は入れ直す
  delete from review_ratings where post_id = pid;
  if t = 'review' and jsonb_typeof(p->'ratings') = 'object' then
    for k, v in select * from jsonb_each(p->'ratings') loop
      if v is not null and jsonb_typeof(v) = 'number' then
        insert into review_ratings (post_id, aspect, score) values (pid, k, (v #>> '{}')::smallint);
      end if;
    end loop;
  end if;

  -- 画像（本人のフォルダにアップロードしたものだけ）
  delete from post_media where post_id = pid;
  for m in select * from jsonb_array_elements(coalesce(p->'media', '[]')) loop
    if split_part(m->>'path', '/', 1) <> uid::text then raise exception 'invalid_media' using errcode = '42501'; end if;
    insert into post_media (post_id, path, width, height, alt, sort)
    values (pid, m->>'path', nullif(m->>'width', '')::int, nullif(m->>'height', '')::int, left(gn_clean(m->>'alt'), 200), i);
    i := i + 1;
  end loop;

  update user_profiles set post_count = (select count(*) from community_posts where author_id = uid and status = 'published') where id = uid;
  return pid;
end $$;

create or replace function public.delete_post(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); a uuid;
begin
  select author_id into a from community_posts where id = p_id for update;
  if a is null or a <> uid then raise exception 'not_owner' using errcode = '42501'; end if;
  delete from community_posts where id = p_id;
  update user_profiles set post_count = (select count(*) from community_posts where author_id = uid and status = 'published') where id = uid;
end $$;

-- =====================================================================
-- RPC：コメント
-- =====================================================================
create or replace function public.add_comment(p_post uuid, p_body text, p_parent uuid default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(true); b text := left(gn_clean(p_body), 2000); cid uuid; pa uuid; post_author uuid;
begin
  if char_length(b) < 1 then raise exception 'body_too_short' using errcode = '22023'; end if;
  select author_id into post_author from community_posts where id = p_post and status = 'published';
  if post_author is null then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  if exists (select 1 from user_blocks where blocker_id = post_author and blocked_id = uid) then raise exception 'blocked' using errcode = '42501'; end if;
  if p_parent is not null then
    select coalesce(parent_id, id) into pa from post_comments where id = p_parent and post_id = p_post;
    if pa is null then raise exception 'parent_not_found' using errcode = 'P0002'; end if;
  end if;
  perform gn_rate(uid, 'comment', 30, interval '1 hour');
  insert into post_comments (post_id, author_id, parent_id, body) values (p_post, uid, pa, b) returning id into cid;
  update community_posts set comment_count = (select count(*) from post_comments where post_id = p_post and status = 'published') where id = p_post;
  return cid;
end $$;

create or replace function public.edit_comment(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(true); b text := left(gn_clean(p_body), 2000);
begin
  if char_length(b) < 1 then raise exception 'body_too_short' using errcode = '22023'; end if;
  update post_comments set body = b, edited_at = now() where id = p_id and author_id = uid and status = 'published';
  if not found then raise exception 'not_owner' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_comment(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); pid uuid;
begin
  update post_comments set status = 'removed', body = '' where id = p_id and author_id = uid returning post_id into pid;
  if pid is null then raise exception 'not_owner' using errcode = '42501'; end if;
  update community_posts set comment_count = (select count(*) from post_comments where post_id = pid and status = 'published') where id = pid;
end $$;

-- =====================================================================
-- RPC：参考になった・保存
-- =====================================================================
create or replace function public.toggle_helpful(p_post uuid, p_on boolean) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); a uuid; n int;
begin
  select author_id into a from community_posts where id = p_post and status = 'published';
  if a is null then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  if a = uid then raise exception 'cannot_rate_own' using errcode = '42501'; end if;
  if p_on then
    perform gn_rate(uid, 'helpful', 120, interval '1 hour');
    insert into post_reactions (post_id, user_id) values (p_post, uid) on conflict do nothing;
  else
    delete from post_reactions where post_id = p_post and user_id = uid;
  end if;
  update community_posts set helpful_count = (select count(*) from post_reactions where post_id = p_post) where id = p_post returning helpful_count into n;
  update user_profiles set helpful_received = (select count(*) from post_reactions r join community_posts c on c.id = r.post_id where c.author_id = a) where id = a;
  return n;
end $$;

create or replace function public.toggle_bookmark(p_post uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false);
begin
  if p_on then
    if not exists (select 1 from community_posts where id = p_post and status = 'published') then raise exception 'post_not_found' using errcode = 'P0002'; end if;
    perform gn_rate(uid, 'bookmark', 200, interval '1 hour');
    insert into post_bookmarks (user_id, post_id) values (uid, p_post) on conflict do nothing;
  else
    delete from post_bookmarks where user_id = uid and post_id = p_post;
  end if;
  return p_on;
end $$;

-- =====================================================================
-- RPC：通報（同じ対象への重複通報はできない。通報の数だけで自動的に処分はしない）
-- =====================================================================
create or replace function public.report_content(p_type text, p_id uuid, p_reason text, p_detail text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(false); rid uuid;
begin
  if p_type = 'post' and not exists (select 1 from community_posts where id = p_id) then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  if p_type = 'comment' and not exists (select 1 from post_comments where id = p_id) then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  if p_type = 'user' and not exists (select 1 from user_profiles where id = p_id) then raise exception 'target_not_found' using errcode = 'P0002'; end if;
  perform gn_rate(uid, 'report', 20, interval '1 day');
  insert into reports (reporter_id, target_type, target_id, reason, detail) values (uid, p_type, p_id, p_reason, left(gn_clean(p_detail), 1000))
  on conflict (reporter_id, target_type, target_id) do nothing returning id into rid;
  if rid is null then raise exception 'already_reported' using errcode = '23505'; end if;
  return rid;
end $$;

-- 新しい店舗の提供（運営の確認後に公開）
create or replace function public.suggest_venue(p_name text, p_category text, p_country char(2), p_city bigint, p_area bigint, p_article_path text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := gn_actor(true); vid uuid;
begin
  perform gn_rate(uid, 'venue', 10, interval '1 day');
  insert into venues (name, category, country_code, city_id, area_id, article_path, status, created_by)
  values (left(gn_clean(p_name), 80), p_category, p_country, p_city, p_area, nullif(gn_clean(p_article_path), ''), 'pending', uid) returning id into vid;
  return vid;
end $$;

-- =====================================================================
-- RPC：運営（モデレーター・管理者）。すべて監査ログに残す
-- =====================================================================
create or replace function public.gn_require(r text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not has_role(r) then raise exception 'forbidden' using errcode = '42501'; end if;
  return auth.uid();
end $$;

create or replace function public.mod_set_post_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a uuid; old text;
begin
  perform gn_require('moderator');
  if p_status not in ('published', 'pending', 'hidden', 'removed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select author_id, status into a, old from community_posts where id = p_id for update;
  if a is null then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  update community_posts set status = p_status, updated_at = now(), published_at = coalesce(published_at, case when p_status = 'published' then now() end) where id = p_id;
  update user_profiles set post_count = (select count(*) from community_posts where author_id = a and status = 'published') where id = a;
  perform gn_audit('post.status', 'post', p_id::text, jsonb_build_object('from', old, 'to', p_status, 'note', left(p_note, 500)));
end $$;

create or replace function public.mod_set_post_verified(p_id uuid, p_verified boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  update community_posts set is_verified = p_verified where id = p_id;
  if not found then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  perform gn_audit('post.verified', 'post', p_id::text, jsonb_build_object('verified', p_verified, 'note', left(p_note, 500)));
end $$;

create or replace function public.mod_set_comment_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  perform gn_require('moderator');
  if p_status not in ('published', 'hidden', 'removed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update post_comments set status = p_status where id = p_id returning post_id into pid;
  if pid is null then raise exception 'comment_not_found' using errcode = 'P0002'; end if;
  update community_posts set comment_count = (select count(*) from post_comments where post_id = pid and status = 'published') where id = pid;
  perform gn_audit('comment.status', 'comment', p_id::text, jsonb_build_object('to', p_status, 'note', left(p_note, 500)));
end $$;

create or replace function public.mod_set_user_status(p_id uuid, p_status text, p_note text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare old text;
begin
  perform gn_require('moderator');
  if p_status not in ('active', 'limited', 'banned') then raise exception 'invalid_status' using errcode = '22023'; end if;
  -- 利用停止（banned）は管理者だけ。運営スタッフ同士の処分もできない
  if p_status = 'banned' and not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from user_roles where user_id = p_id) and not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id = auth.uid() then raise exception 'cannot_moderate_self' using errcode = '42501'; end if;
  select status into old from user_profiles where id = p_id for update;
  if old is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  update user_profiles set status = p_status, updated_at = now() where id = p_id;
  perform gn_audit('user.status', 'user', p_id::text, jsonb_build_object('from', old, 'to', p_status, 'note', left(p_note, 500)));
end $$;

create or replace function public.mod_handle_report(p_id uuid, p_status text, p_resolution text default '') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  if p_status not in ('reviewing', 'resolved', 'dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update reports set status = p_status, resolution = left(gn_clean(p_resolution), 1000), handled_by = auth.uid(), handled_at = now() where id = p_id;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
  perform gn_audit('report.' || p_status, 'report', p_id::text, jsonb_build_object('resolution', left(p_resolution, 500)));
end $$;

create or replace function public.mod_upsert_venue(p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare vid uuid := nullif(p->>'id', '')::uuid;
begin
  perform gn_require('moderator');
  if vid is null then
    insert into venues (name, category, country_code, city_id, area_id, article_path, status, created_by)
    values (left(gn_clean(p->>'name'), 80), p->>'category', nullif(p->>'country_code', ''), nullif(p->>'city_id', '')::bigint, nullif(p->>'area_id', '')::bigint,
      nullif(gn_clean(p->>'article_path'), ''), coalesce(p->>'status', 'published'), auth.uid()) returning id into vid;
    perform gn_audit('venue.create', 'venue', vid::text, p);
  else
    update venues set name = left(gn_clean(p->>'name'), 80), category = p->>'category', country_code = nullif(p->>'country_code', ''),
      city_id = nullif(p->>'city_id', '')::bigint, area_id = nullif(p->>'area_id', '')::bigint,
      article_path = nullif(gn_clean(p->>'article_path'), ''), status = coalesce(p->>'status', status), updated_at = now()
    where id = vid;
    if not found then raise exception 'venue_not_found' using errcode = 'P0002'; end if;
    perform gn_audit('venue.update', 'venue', vid::text, p);
  end if;
  return vid;
end $$;

create or replace function public.admin_set_role(p_user uuid, p_role text, p_grant boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('admin');
  if p_role not in ('admin', 'moderator') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if p_user = auth.uid() and not p_grant then raise exception 'cannot_revoke_self' using errcode = '42501'; end if;
  if p_grant then
    insert into user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid()) on conflict do nothing;
  else
    delete from user_roles where user_id = p_user and role = p_role;
  end if;
  perform gn_audit(case when p_grant then 'role.grant' else 'role.revoke' end, 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

-- 管理ダッシュボードの数値（実データの集計のみ）
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare out jsonb;
begin
  perform gn_require('moderator');
  select jsonb_build_object(
    'users', (select count(*) from user_profiles),
    'users_7d', (select count(*) from user_profiles where created_at > now() - interval '7 days'),
    'dau', (select count(*) from user_activity_days where day = current_date),
    'wau', (select count(distinct user_id) from user_activity_days where day > current_date - 7),
    'mau', (select count(distinct user_id) from user_activity_days where day > current_date - 30),
    'posts', (select count(*) from community_posts where status = 'published'),
    'posts_24h', (select count(*) from community_posts where status = 'published' and published_at > now() - interval '24 hours'),
    'reviews', (select count(*) from community_posts where status = 'published' and type = 'review'),
    'comments', (select count(*) from post_comments where status = 'published'),
    'posters_30d', (select count(distinct author_id) from community_posts where published_at > now() - interval '30 days'),
    'reports_open', (select count(*) from reports where status in ('open', 'reviewing')),
    'reports_total', (select count(*) from reports),
    'venues_pending', (select count(*) from venues where status = 'pending'),
    'by_country', coalesce((select jsonb_object_agg(coalesce(country_code, '--'), n) from (select country_code, count(*) n from community_posts where status = 'published' group by 1) s), '{}'),
    'generated_at', now()
  ) into out;
  return out;
end $$;

-- =====================================================================
-- 集計ビュー（口コミの平均点など。口コミが 0 件なら行が無い＝「まだ口コミがありません」）
-- =====================================================================
create view public.review_summary with (security_invoker = true) as
select coalesce(p.venue_id::text, p.article_path) as target,
       p.venue_id, p.article_path,
       count(distinct p.id) as review_count,
       count(distinct p.id) filter (where p.is_verified) as verified_count,
       round(avg(r.score) filter (where r.aspect = 'overall'), 2) as overall,
       max(p.published_at) as last_review_at
from public.community_posts p
left join public.review_ratings r on r.post_id = p.id
where p.status = 'published' and p.type = 'review'
group by p.venue_id, p.article_path;

create view public.review_aspect_summary with (security_invoker = true) as
select coalesce(p.venue_id::text, p.article_path) as target, r.aspect, round(avg(r.score), 2) as score, count(*) as n
from public.community_posts p join public.review_ratings r on r.post_id = p.id
where p.status = 'published' and p.type = 'review'
group by 1, 2;

-- =====================================================================
-- 行単位の権限（RLS）
-- =====================================================================
alter table public.countries enable row level security;
alter table public.cities enable row level security;
alter table public.areas enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_blocks enable row level security;
alter table public.user_activity_days enable row level security;
alter table public.rate_events enable row level security;
alter table public.venues enable row level security;
alter table public.community_posts enable row level security;
alter table public.review_ratings enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_bookmarks enable row level security;
alter table public.reports enable row level security;
alter table public.admin_audit_logs enable row level security;

-- 書き込みは関数経由だけにする
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on public.rate_events, public.user_activity_days from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.has_role(text), public.is_admin(), public.is_moderator(), public.gn_clean(text), public.gn_now() to anon, authenticated;
-- 内部用の関数は直接呼べないようにする
revoke execute on function public.gn_rate(uuid, text, int, interval), public.gn_audit(text, text, text, jsonb), public.gn_handle_new_user() from authenticated;

create policy "地域は誰でも読める" on public.countries for select using (true);
create policy "地域は誰でも読める" on public.cities for select using (true);
create policy "地域は誰でも読める" on public.areas for select using (true);

create policy "公開プロフィール" on public.user_profiles for select using (status <> 'banned' or id = auth.uid() or public.is_moderator());
create policy "自分の設定だけ" on public.user_preferences for select using (user_id = auth.uid());
create policy "自分の権限か管理者" on public.user_roles for select using (user_id = auth.uid() or public.is_admin());
create policy "自分のブロックだけ" on public.user_blocks for select using (blocker_id = auth.uid());

create policy "公開中の店舗" on public.venues for select using (status = 'published' or created_by = auth.uid() or public.is_moderator());

create policy "公開中の投稿・自分の投稿" on public.community_posts for select using (
  (status = 'published'
    and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = author_id)
    and exists (select 1 from public.user_profiles u where u.id = author_id and u.status <> 'banned'))
  or author_id = auth.uid()
  or public.is_moderator()
);
create policy "見える投稿の評価" on public.review_ratings for select using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy "見える投稿の画像" on public.post_media for select using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy "見える投稿のコメント" on public.post_comments for select using (
  exists (select 1 from public.community_posts p where p.id = post_id)
  and (status = 'published' or author_id = auth.uid() or public.is_moderator() or status = 'removed')
  and not exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = author_id)
);
-- 誰が「参考になった」を押したかは公開しない（自分の分だけ見える）
create policy "自分のリアクション" on public.post_reactions for select using (user_id = auth.uid() or public.is_moderator());
create policy "自分の保存" on public.post_bookmarks for select using (user_id = auth.uid());
create policy "自分の通報か運営" on public.reports for select using (reporter_id = auth.uid() or public.is_moderator());
create policy "管理者だけ" on public.admin_audit_logs for select using (public.is_admin());

-- 削除・非表示のコメントは本文を返さない
create or replace view public.comment_feed with (security_invoker = true) as
select c.id, c.post_id, c.author_id, c.parent_id,
       case when c.status = 'published' or c.author_id = auth.uid() or public.is_moderator() then c.body else '' end as body,
       c.status, c.created_at, c.edited_at
from public.post_comments c;

-- 画面で使う一覧（著者・店舗・地域・評価・画像をまとめたもの）。RLS は元のテーブルのものがそのまま効く
create view public.post_feed with (security_invoker = true) as
select p.id, p.author_id, p.type, p.category, p.title, p.body, p.country_code, p.city_id, p.area_id, p.venue_id, p.article_path,
       p.visit_date, p.spend_amount, p.spend_currency, p.revisit, p.status, p.is_verified, p.lang,
       p.helpful_count, p.comment_count, p.created_at, p.updated_at, p.edited_at, p.published_at,
       u.handle as author_handle, u.display_name as author_name, u.avatar_seed as author_avatar,
       u.post_count as author_posts, u.helpful_received as author_helpful,
       v.name as venue_name, v.category as venue_category,
       co.name_ja as country_name, ci.name_ja as city_name, ar.name_ja as area_name,
       (select jsonb_object_agg(r.aspect, r.score) from public.review_ratings r where r.post_id = p.id) as ratings,
       (select jsonb_agg(jsonb_build_object('path', m.path, 'width', m.width, 'height', m.height, 'alt', m.alt) order by m.sort) from public.post_media m where m.post_id = p.id) as media
from public.community_posts p
join public.user_profiles u on u.id = p.author_id
left join public.venues v on v.id = p.venue_id
left join public.countries co on co.code = p.country_code
left join public.cities ci on ci.id = p.city_id
left join public.areas ar on ar.id = p.area_id;

create view public.comment_list with (security_invoker = true) as
select c.id, c.post_id, c.parent_id, c.body, c.status, c.created_at, c.edited_at, c.author_id,
       u.handle as author_handle, u.display_name as author_name, u.avatar_seed as author_avatar
from public.comment_feed c join public.user_profiles u on u.id = c.author_id;

-- 運営用：通報の一覧（対象の中身を添える）。reports の RLS により運営だけが行を得る
create view public.report_queue with (security_invoker = true) as
select r.*, ru.handle as reporter_handle,
       case r.target_type
         when 'post' then (select left(p.body, 200) from public.community_posts p where p.id = r.target_id)
         when 'comment' then (select left(c.body, 200) from public.post_comments c where c.id = r.target_id)
         when 'user' then (select u.handle from public.user_profiles u where u.id = r.target_id) end as target_excerpt,
       (select count(*) from public.reports r2 where r2.target_type = r.target_type and r2.target_id = r.target_id) as same_target_reports
from public.reports r left join public.user_profiles ru on ru.id = r.reporter_id;

grant select on all tables in schema public to anon, authenticated;
revoke select on public.rate_events, public.user_activity_days from anon, authenticated;

grant execute on function
  public.update_profile(text, text, text, boolean, boolean), public.update_preferences(char, bigint, bigint, text), public.ping(),
  public.set_block(uuid, boolean), public.save_post(jsonb), public.delete_post(uuid),
  public.add_comment(uuid, text, uuid), public.edit_comment(uuid, text), public.delete_comment(uuid),
  public.toggle_helpful(uuid, boolean), public.toggle_bookmark(uuid, boolean), public.report_content(text, uuid, text, text),
  public.suggest_venue(text, text, char, bigint, bigint, text),
  public.mod_set_post_status(uuid, text, text), public.mod_set_post_verified(uuid, boolean, text), public.mod_set_comment_status(uuid, text, text),
  public.mod_set_user_status(uuid, text, text), public.mod_handle_report(uuid, text, text), public.mod_upsert_venue(jsonb),
  public.admin_set_role(uuid, text, boolean), public.admin_stats()
to authenticated;

-- =====================================================================
-- 画像の保存先（Supabase Storage）。本人のフォルダ（<ユーザーID>/）にだけアップロードできる
-- 位置情報（EXIF）はブラウザ側で画像を描き直して取り除いてから送る
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "post-media 読み取り" on storage.objects for select using (bucket_id = 'post-media');
create policy "post-media 本人のフォルダに追加" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from public.user_profiles u where u.id = auth.uid() and u.status = 'active' and u.age_confirmed_at is not null));
create policy "post-media 本人のファイルを削除" on storage.objects for delete to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 地域の初期データ（実在する国・都市・エリアの名前だけ。店舗や口コミは入れない）
-- =====================================================================
insert into public.countries (code, name_ja, name_en, sort) values
  ('JP', '日本', 'Japan', 1), ('TH', 'タイ', 'Thailand', 2), ('KR', '韓国', 'South Korea', 3), ('TW', '台湾', 'Taiwan', 4),
  ('VN', 'ベトナム', 'Vietnam', 5), ('PH', 'フィリピン', 'Philippines', 6), ('KH', 'カンボジア', 'Cambodia', 7),
  ('ID', 'インドネシア', 'Indonesia', 8), ('SG', 'シンガポール', 'Singapore', 9), ('MY', 'マレーシア', 'Malaysia', 10),
  ('DE', 'ドイツ', 'Germany', 11), ('MM', 'ミャンマー', 'Myanmar', 12), ('MN', 'モンゴル', 'Mongolia', 13),
  ('LA', 'ラオス', 'Laos', 14), ('UZ', 'ウズベキスタン', 'Uzbekistan', 15)
on conflict do nothing;

insert into public.cities (country_code, slug, name_ja, name_en) values
  ('JP', 'tokyo', '東京', 'Tokyo'), ('JP', 'osaka', '大阪', 'Osaka'), ('JP', 'fukuoka', '福岡', 'Fukuoka'), ('JP', 'sapporo', '札幌', 'Sapporo'), ('JP', 'nagoya', '名古屋', 'Nagoya'),
  ('TH', 'bangkok', 'バンコク', 'Bangkok'), ('TH', 'pattaya', 'パタヤ', 'Pattaya'), ('TH', 'phuket', 'プーケット', 'Phuket'), ('TH', 'chiang-mai', 'チェンマイ', 'Chiang Mai'),
  ('KR', 'seoul', 'ソウル', 'Seoul'), ('KR', 'busan', '釜山', 'Busan'),
  ('TW', 'taipei', '台北', 'Taipei'), ('TW', 'kaohsiung', '高雄', 'Kaohsiung'),
  ('VN', 'ho-chi-minh', 'ホーチミン', 'Ho Chi Minh City'), ('VN', 'hanoi', 'ハノイ', 'Hanoi'), ('VN', 'da-nang', 'ダナン', 'Da Nang'),
  ('PH', 'manila', 'マニラ', 'Manila'), ('PH', 'angeles', 'アンヘレス', 'Angeles'), ('PH', 'cebu', 'セブ', 'Cebu'),
  ('KH', 'phnom-penh', 'プノンペン', 'Phnom Penh'), ('KH', 'siem-reap', 'シェムリアップ', 'Siem Reap'),
  ('ID', 'jakarta', 'ジャカルタ', 'Jakarta'), ('ID', 'bali', 'バリ', 'Bali'),
  ('SG', 'singapore', 'シンガポール', 'Singapore'),
  ('MY', 'kuala-lumpur', 'クアラルンプール', 'Kuala Lumpur'),
  ('DE', 'berlin', 'ベルリン', 'Berlin'), ('DE', 'frankfurt', 'フランクフルト', 'Frankfurt'),
  ('MM', 'yangon', 'ヤンゴン', 'Yangon'), ('MN', 'ulaanbaatar', 'ウランバートル', 'Ulaanbaatar'),
  ('LA', 'vientiane', 'ビエンチャン', 'Vientiane'), ('UZ', 'tashkent', 'タシケント', 'Tashkent')
on conflict do nothing;

insert into public.areas (city_id, slug, name_ja, name_en)
select c.id, a.slug, a.ja, a.en from (values
  ('bangkok', 'sukhumvit', 'スクンビット', 'Sukhumvit'), ('bangkok', 'silom', 'シーロム', 'Silom'), ('bangkok', 'thonglor', 'トンロー', 'Thong Lo'), ('bangkok', 'ratchada', 'ラチャダー', 'Ratchada'),
  ('pattaya', 'walking-street', 'ウォーキングストリート', 'Walking Street'), ('pattaya', 'soi-buakhao', 'ソイブッカオ', 'Soi Buakhao'),
  ('tokyo', 'shinjuku', '新宿', 'Shinjuku'), ('tokyo', 'ikebukuro', '池袋', 'Ikebukuro'), ('tokyo', 'shibuya', '渋谷', 'Shibuya'), ('tokyo', 'ginza', '銀座', 'Ginza'), ('tokyo', 'yoshiwara', '吉原', 'Yoshiwara'),
  ('osaka', 'umeda', '梅田', 'Umeda'), ('osaka', 'namba', '難波', 'Namba'),
  ('seoul', 'gangnam', '江南', 'Gangnam'), ('seoul', 'itaewon', '梨泰院', 'Itaewon'),
  ('ho-chi-minh', 'district-1', '1区', 'District 1'), ('manila', 'makati', 'マカティ', 'Makati')
) a(city, slug, ja, en) join public.cities c on c.slug = a.city
on conflict do nothing;
