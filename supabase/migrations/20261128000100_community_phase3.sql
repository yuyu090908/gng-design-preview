-- =====================================================================
-- GLOBAL NIGHT COMMUNITY — Phase 3（NIGHT RADAR・NIGHT ACTIVITY INDEX・NIGHT AI の土台）
-- Phase 1・2 の上に追加するだけのマイグレーション（既存の表・データは変更しない。列の追加と初期値の設定のみ）。
--
-- 位置の方針
--  * 地図に出す位置は「都市・エリアの中心（目安）」と、運営が確認して登録した店舗の位置だけ。
--  * 利用者の現在地・行動履歴は保存も表示もしない。集計は都市・エリア・店舗の単位で行う。
-- AI の方針
--  * AI の呼び出しはサーバー（Supabase Edge Function）だけが行い、API キーはブラウザに渡さない。
--  * 要約・翻訳・審査補助の結果はキャッシュの表に保存し、書き込めるのは service_role（Edge Function）だけ。
--  * 1 日の利用回数に上限を設ける（利用者ごと・全体）。AI の判定だけで投稿を削除・非表示にはしない。
-- =====================================================================

-- ---------- 位置（都市・エリアの中心の目安／店舗は運営が確認したものだけ） ----------
alter table public.cities add column if not exists lat numeric(8, 5) check (lat between -90 and 90), add column if not exists lng numeric(8, 5) check (lng between -180 and 180);
alter table public.areas add column if not exists lat numeric(8, 5) check (lat between -90 and 90), add column if not exists lng numeric(8, 5) check (lng between -180 and 180);
alter table public.venues add column if not exists lat numeric(8, 5) check (lat between -90 and 90), add column if not exists lng numeric(8, 5) check (lng between -180 and 180),
  add column if not exists located_by uuid references public.user_profiles(id) on delete set null, add column if not exists located_at timestamptz;

update public.cities c set lat = v.lat, lng = v.lng from (values
  ('tokyo', 35.68120, 139.76710), ('osaka', 34.70250, 135.49590), ('fukuoka', 33.59020, 130.40170), ('sapporo', 43.06180, 141.35450), ('nagoya', 35.17090, 136.88150),
  ('bangkok', 13.75630, 100.50180), ('pattaya', 12.92360, 100.88250), ('phuket', 7.88040, 98.39230), ('chiang-mai', 18.78830, 98.98530),
  ('seoul', 37.56650, 126.97800), ('busan', 35.17960, 129.07560), ('taipei', 25.03300, 121.56540), ('kaohsiung', 22.62730, 120.30140),
  ('ho-chi-minh', 10.77690, 106.70090), ('hanoi', 21.02780, 105.83420), ('da-nang', 16.05440, 108.20220),
  ('manila', 14.59950, 120.98420), ('angeles', 15.14500, 120.58870), ('cebu', 10.31570, 123.88540),
  ('phnom-penh', 11.55640, 104.92820), ('siem-reap', 13.36710, 103.84480), ('jakarta', -6.20880, 106.84560), ('bali', -8.67050, 115.21260),
  ('singapore', 1.35210, 103.81980), ('kuala-lumpur', 3.13900, 101.68690), ('berlin', 52.52000, 13.40500), ('frankfurt', 50.11090, 8.68210),
  ('yangon', 16.84090, 96.17350), ('ulaanbaatar', 47.88640, 106.90570), ('vientiane', 17.97570, 102.63310), ('tashkent', 41.29950, 69.24010)
) v(slug, lat, lng) where c.slug = v.slug and c.lat is null;

update public.areas a set lat = v.lat, lng = v.lng from (values
  ('bangkok', 'sukhumvit', 13.73750, 100.56060), ('bangkok', 'silom', 13.72890, 100.53400), ('bangkok', 'thonglor', 13.73160, 100.58300), ('bangkok', 'ratchada', 13.77900, 100.57400),
  ('pattaya', 'walking-street', 12.92760, 100.87400), ('pattaya', 'soi-buakhao', 12.92900, 100.88400),
  ('tokyo', 'shinjuku', 35.69380, 139.70340), ('tokyo', 'ikebukuro', 35.72950, 139.71090), ('tokyo', 'shibuya', 35.65800, 139.70160), ('tokyo', 'ginza', 35.67170, 139.76500), ('tokyo', 'yoshiwara', 35.72250, 139.79350),
  ('osaka', 'umeda', 34.70550, 135.49830), ('osaka', 'namba', 34.66620, 135.50080),
  ('seoul', 'gangnam', 37.49790, 127.02760), ('seoul', 'itaewon', 37.53450, 126.99460),
  ('ho-chi-minh', 'district-1', 10.77560, 106.70190), ('manila', 'makati', 14.55470, 121.02440)
) v(city, slug, lat, lng) join public.cities c on c.slug = v.city where a.city_id = c.id and a.slug = v.slug and a.lat is null;

-- 店舗の位置は運営だけが登録する（申請者の申告をそのまま地図に出さない）
create or replace function public.mod_set_venue_location(p_id uuid, p_lat numeric, p_lng numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid_location' using errcode = '22023'; end if;
  update venues set lat = round(p_lat, 5), lng = round(p_lng, 5), located_by = auth.uid(), located_at = now(), updated_at = now() where id = p_id;
  if not found then raise exception 'venue_not_found' using errcode = 'P0002'; end if;
  perform gn_audit('venue.location', 'venue', p_id::text, jsonb_build_object('lat', p_lat, 'lng', p_lng));
end $$;

-- ---------- NIGHT ACTIVITY INDEX ----------
-- 直近 6 時間の NIGHT LIVE の報告から、店舗・エリア・都市ごとの「情報の盛り上がり」を 0〜100 で示す。
-- 実際の混雑率や来店人数ではない。報告者が 2 人未満なら「情報不足」で、点数は出さない。
--   量（新しさで重み付けした報告の数 × 報告者の信頼度）45% / 混雑の体感の平均 35% / 報告の一致度 10% / 複数人が報告したイベント 10%
-- 直近 6 時間のライブ報告（対象：店舗 > エリア > 都市）
create or replace function public.gn_live_window(p_venue uuid, p_area bigint, p_city bigint)
returns table (user_id uuid, crowd numeric, event_now boolean, at timestamptz) language sql stable security definer set search_path = public, pg_temp as $$
  select p.author_id, l.crowd::numeric, l.event_now, p.published_at
  from community_posts p join live_reports l on l.post_id = p.id join user_profiles u on u.id = p.author_id
  where p.type = 'live' and p.status = 'published' and u.status = 'active' and p.published_at > now() - interval '6 hours'
    and ((p_venue is not null and p.venue_id = p_venue) or (p_venue is null and p_area is not null and p.area_id = p_area) or (p_venue is null and p_area is null and p.city_id = p_city))
$$;
create or replace function public.gn_activity(p_venue uuid, p_area bigint, p_city bigint) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r record; reporters int; reports int; vol numeric := 0; crowd_avg numeric; crowd_sd numeric; ev int; t jsonb; tw numeric; score numeric; last_at timestamptz;
begin
  select count(distinct a.user_id), count(*), avg(a.crowd), coalesce(stddev_pop(a.crowd), 0), count(distinct a.user_id) filter (where a.event_now), max(a.at)
    into reporters, reports, crowd_avg, crowd_sd, ev, last_at from gn_live_window(p_venue, p_area, p_city) a;
  if reporters < 2 then
    return jsonb_build_object('status', 'insufficient', 'reporters', reporters, 'reports', reports);
  end if;
  for r in select a.user_id, sum(exp(-extract(epoch from now() - a.at) / 7200.0)) w from gn_live_window(p_venue, p_area, p_city) a group by a.user_id loop
    t := gn_trust(r.user_id);
    tw := case when t->>'status' = 'ok' then 0.6 + 0.4 * (t->>'score')::numeric / 100 else 0.7 end;
    vol := vol + least(r.w, 1.5) * tw;   -- 1 人の連投で量が増えすぎないように、1 人あたり 1.5 件分まで
  end loop;
  score := 100 * (0.45 * (1 - exp(-vol / 3)) + 0.35 * coalesce((crowd_avg - 1) / 4, 0.5) + 0.10 * greatest(0, 1 - crowd_sd / 2) + 0.10 * case when ev >= 2 then 1 else 0 end);
  return jsonb_build_object('status', 'ok', 'score', round(least(100, greatest(0, score)))::int, 'reporters', reporters, 'reports', reports,
    'crowd', round(crowd_avg, 1), 'agreement', round(greatest(0, 1 - crowd_sd / 2) * 100)::int, 'event', ev >= 2, 'last_report_at', last_at);
end $$;

create or replace function public.activity_index(p_kind text, p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return case p_kind
    when 'venue' then gn_activity(p_id::uuid, null, null)
    when 'area' then gn_activity(null, p_id::bigint, null)
    when 'city' then gn_activity(null, null, p_id::bigint)
    else null end || jsonb_build_object('kind', p_kind, 'id', p_id, 'window_hours', 6);
end $$;

-- ---------- NIGHT RADAR（地図の集計） ----------
-- 期間内の公開投稿を都市・エリア単位で数える。件数 3 件未満か投稿者 2 人未満は「データ不足」として、色を付けない。
create or replace function public.radar(p_period text default '7d') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare span interval := case p_period when '24h' then interval '24 hours' when '30d' then interval '30 days' else interval '7 days' end;
        since timestamptz := now() - span; out jsonb;
begin
  with pub as (
    select p.* from community_posts p join user_profiles u on u.id = p.author_id where p.status = 'published' and u.status = 'active' and p.published_at > since
  )
  select jsonb_build_object(
    'period', p_period, 'generated_at', now(),
    'cities', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name_ja, 'country', co.name_ja, 'lat', c.lat, 'lng', c.lng, 'n', s.n, 'users', s.users, 'live', s.live,
                   'level', case when coalesce(s.n, 0) < 3 or coalesce(s.users, 0) < 2 then 'insufficient' when s.n >= 20 then 'very_active' when s.n >= 8 then 'active' else 'normal' end) order by c.id)
               from cities c join countries co on co.code = c.country_code
               left join (select city_id, count(*) n, count(distinct author_id) users, count(*) filter (where type = 'live') live from pub group by city_id) s on s.city_id = c.id
               where c.lat is not null), '[]'),
    'areas', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'city_id', a.city_id, 'name', a.name_ja, 'lat', a.lat, 'lng', a.lng, 'n', s.n, 'users', s.users,
                   'level', case when coalesce(s.n, 0) < 3 or coalesce(s.users, 0) < 2 then 'insufficient' when s.n >= 20 then 'very_active' when s.n >= 8 then 'active' else 'normal' end) order by a.id)
               from areas a left join (select area_id, count(*) n, count(distinct author_id) users from pub group by area_id) s on s.area_id = a.id
               where a.lat is not null), '[]'),
    'venues', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'category', v.category, 'lat', v.lat, 'lng', v.lng, 'city_id', v.city_id, 'article_path', v.article_path,
                   'reviews', coalesce(rs.review_count, 0), 'overall', rs.overall, 'last_review_at', rs.last_review_at,
                   'latest', (select left(p.body, 80) from community_posts p where p.venue_id = v.id and p.type = 'review' and p.status = 'published' order by p.published_at desc limit 1)))
               from venues v left join review_summary rs on rs.venue_id = v.id
               where v.status = 'published' and v.lat is not null), '[]')
  ) into out;
  return out;
end $$;

-- ---------- NIGHT AI：利用回数の上限・キャッシュ・審査補助 ----------
create table public.ai_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,                -- 管理者が ON にするまで AI は動かない
  user_daily_limit int not null default 20 check (user_daily_limit between 0 and 1000),
  guest_daily_limit int not null default 0 check (guest_daily_limit between 0 and 1000),
  global_daily_limit int not null default 2000 check (global_daily_limit between 0 and 1000000),
  updated_at timestamptz not null default now()
);
insert into public.ai_config default values on conflict do nothing;

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.user_profiles(id) on delete set null,
  kind text not null check (kind in ('search', 'summary', 'translate', 'moderate')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cached boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_usage_day on public.ai_usage (created_at);
create index ai_usage_user on public.ai_usage (user_id, created_at);

-- 口コミの要約（対象ごと・言語ごと。対象の口コミが増えたら作り直す）
create table public.ai_summaries (
  target text not null,                                 -- 店舗の id か記事のパス（review_summary.target と同じ）
  lang text not null default 'ja' check (lang in ('ja', 'en', 'th', 'ko', 'zh-Hans', 'zh-Hant')),
  summary jsonb not null,                               -- { good: [], improve: [], price: '', trend: '', beginner: '', sources: [post_id] }
  review_count int not null,
  last_review_at timestamptz,
  model text not null,
  generated_at timestamptz not null default now(),
  primary key (target, lang)
);

-- 投稿の翻訳（同じ投稿を何度も翻訳しない）
create table public.post_translations (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  lang text not null check (lang in ('ja', 'en', 'th', 'ko', 'zh-Hans', 'zh-Hant')),
  title text not null default '',
  body text not null,
  source_hash text not null,                            -- 原文が編集されたら作り直すための目印
  model text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, lang)
);

-- AI による審査の補助（運営の確認待ちに並べるだけ。自動で非表示・削除はしない）
create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  labels text[] not null default '{}',
  score numeric(4, 3) not null check (score between 0 and 1),
  reason text not null default '' check (char_length(reason) <= 500),
  model text not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  handled_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (target_type, target_id)
);

-- 利用回数を 1 回分確保する（Edge Function が利用者の JWT のまま呼ぶ。上限を超えたら止める）
create or replace function public.ai_take(p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg ai_config; uid uuid := auth.uid(); used int; total int; st text;
begin
  select * into cfg from ai_config where id;
  if not cfg.enabled then raise exception 'ai_disabled' using errcode = '55000'; end if;
  if p_kind not in ('search', 'summary', 'translate') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  select count(*) into total from ai_usage where created_at > now() - interval '1 day' and not cached;
  if total >= cfg.global_daily_limit then raise exception 'ai_quota' using errcode = '54000', detail = 'global'; end if;
  if uid is null then
    if cfg.guest_daily_limit = 0 then raise exception 'login_required' using errcode = '28000'; end if;
  else
    select status into st from user_profiles where id = uid;
    if st is null or st = 'banned' then raise exception 'account_banned' using errcode = '42501'; end if;
    select count(*) into used from ai_usage where user_id = uid and created_at > now() - interval '1 day' and not cached;
    if used >= cfg.user_daily_limit then raise exception 'ai_quota' using errcode = '54000', detail = 'user'; end if;
  end if;
  return jsonb_build_object('ok', true, 'remaining', case when uid is null then null else cfg.user_daily_limit - used - 1 end);
end $$;

create or replace function public.admin_ai_config(p_enabled boolean, p_user_limit int, p_global_limit int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('admin');
  update ai_config set enabled = coalesce(p_enabled, enabled), user_daily_limit = coalesce(p_user_limit, user_daily_limit),
    global_daily_limit = coalesce(p_global_limit, global_daily_limit), updated_at = now() where id;
  perform gn_audit('ai.config', 'ai', 'config', jsonb_build_object('enabled', p_enabled, 'user', p_user_limit, 'global', p_global_limit));
end $$;

create or replace function public.mod_handle_flag(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  if p_status not in ('confirmed', 'dismissed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update moderation_flags set status = p_status, handled_by = auth.uid() where id = p_id;
  perform gn_audit('ai_flag.' || p_status, 'flag', p_id::text, '{}');
end $$;

create or replace function public.admin_stats_phase3() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform gn_require('moderator');
  return jsonb_build_object(
    'ai_enabled', (select enabled from ai_config where id),
    'ai_24h', (select count(*) from ai_usage where created_at > now() - interval '24 hours' and not cached),
    'ai_cached_24h', (select count(*) from ai_usage where created_at > now() - interval '24 hours' and cached),
    'ai_tokens_30d', (select jsonb_build_object('input', coalesce(sum(input_tokens), 0), 'output', coalesce(sum(output_tokens), 0)) from ai_usage where created_at > now() - interval '30 days'),
    'ai_by_kind_30d', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from ai_usage where created_at > now() - interval '30 days' group by kind) s), '{}'),
    'flags_open', (select count(*) from moderation_flags where status = 'open'),
    'venues_located', (select count(*) from venues where status = 'published' and lat is not null)
  );
end $$;

-- 審査の補助キュー（運営用）
create view public.flag_queue with (security_invoker = true) as
select f.*, case f.target_type when 'post' then (select left(coalesce(nullif(p.title, ''), p.body), 200) from public.community_posts p where p.id = f.target_id)
                               else (select left(c.body, 200) from public.post_comments c where c.id = f.target_id) end as target_excerpt
from public.moderation_flags f;

-- ---------- 権限 ----------
alter table public.ai_config enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_summaries enable row level security;
alter table public.post_translations enable row level security;
alter table public.moderation_flags enable row level security;
revoke insert, update, delete, truncate on public.ai_config, public.ai_usage, public.ai_summaries, public.post_translations, public.moderation_flags from anon, authenticated;

create policy "AI の設定は誰でも読める（ON/OFF と上限）" on public.ai_config for select using (true);
create policy "AI の利用記録は本人と運営" on public.ai_usage for select using (user_id = auth.uid() or public.is_moderator());
create policy "口コミの要約は公開" on public.ai_summaries for select using (true);
create policy "見える投稿の翻訳" on public.post_translations for select using (exists (select 1 from public.community_posts p where p.id = post_id));
create policy "審査の補助は運営だけ" on public.moderation_flags for select using (public.is_moderator());

grant select on public.ai_config, public.ai_summaries, public.post_translations to anon, authenticated;
grant select on public.ai_usage, public.moderation_flags, public.flag_queue to authenticated;
-- Edge Function（service_role）だけがキャッシュ・利用記録・審査補助を書く
grant select, insert, update, delete on public.ai_usage, public.ai_summaries, public.post_translations, public.moderation_flags to service_role;
grant select on public.ai_config to service_role;

revoke execute on function public.gn_activity(uuid, bigint, bigint), public.gn_live_window(uuid, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.activity_index(text, text), public.radar(text), public.ai_take(text), public.admin_ai_config(boolean, int, int),
  public.mod_handle_flag(uuid, text), public.admin_stats_phase3(), public.mod_set_venue_location(uuid, numeric, numeric) from public;
grant execute on function public.activity_index(text, text), public.radar(text), public.ai_take(text) to anon, authenticated;
grant execute on function public.admin_ai_config(boolean, int, int), public.mod_handle_flag(uuid, text), public.admin_stats_phase3(), public.mod_set_venue_location(uuid, numeric, numeric) to authenticated;
