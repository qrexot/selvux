-- Run this entire script once in Supabase SQL Editor.
-- It keeps existing users, binds them to a random browser device ID on their
-- next visit, and masks private leaderboard fields inside PostgreSQL.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.users
  add column if not exists device_id text,
  add column if not exists hide_nickname boolean not null default false,
  add column if not exists hide_time boolean not null default false;

create unique index if not exists users_device_id_unique
  on public.users (device_id)
  where device_id is not null;

create unique index if not exists users_nickname_unique
  on public.users (lower(nickname));

create or replace function public.nickname_exists(p_nickname text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where lower(nickname) = lower(p_nickname)
  );
$$;

create or replace function public.register_user(
  p_device_id text,
  p_nickname text,
  p_time_spent bigint default 0,
  p_hide_nickname boolean default false,
  p_hide_time boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_id is null or length(p_device_id) < 20 then
    raise exception 'Invalid device ID';
  end if;
  if p_nickname !~ '^[A-Za-z0-9_]{3,15}$' then
    raise exception 'Invalid nickname';
  end if;
  if exists (select 1 from public.users where lower(nickname) = lower(p_nickname)) then
    raise exception 'Nickname already exists';
  end if;

  insert into public.users (
    nickname, time_spent, device_id, hide_nickname, hide_time
  ) values (
    p_nickname,
    greatest(coalesce(p_time_spent, 0), 0),
    p_device_id,
    coalesce(p_hide_nickname, false),
    coalesce(p_hide_time, false)
  );
end;
$$;

create or replace function public.sync_user(
  p_device_id text,
  p_nickname text,
  p_time_spent bigint,
  p_hide_nickname boolean,
  p_hide_time boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  if p_device_id is null or length(p_device_id) < 20 then
    return false;
  end if;

  -- Existing devices update normally. A legacy row with no device ID is
  -- claimed once by the browser that already has its nickname saved.
  update public.users
  set device_id = coalesce(device_id, p_device_id),
      time_spent = greatest(time_spent, greatest(coalesce(p_time_spent, 0), 0)),
      hide_nickname = coalesce(p_hide_nickname, false),
      hide_time = coalesce(p_hide_time, false)
  where device_id = p_device_id
     or (
       device_id is null
       and lower(nickname) = lower(p_nickname)
     );

  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;

create or replace function public.get_public_leaderboard(p_limit integer default 50)
returns table (
  rank bigint,
  device_tag text,
  display_name text,
  display_time bigint,
  nickname_hidden boolean,
  time_hidden boolean
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    row_number() over (order by u.time_spent desc, u.nickname asc) as rank,
    case
      when u.device_id is null then null
      else encode(extensions.digest(u.device_id, 'sha256'), 'hex')
    end as device_tag,
    case
      when u.hide_nickname then 'Анонимный участник'
      else u.nickname
    end as display_name,
    case
      when u.hide_time then null
      else u.time_spent
    end as display_time,
    u.hide_nickname as nickname_hidden,
    u.hide_time as time_hidden
  from public.users u
  order by u.time_spent desc, u.nickname asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on table public.users from anon;
revoke all on table public.users from authenticated;

revoke all on function public.nickname_exists(text) from public;
revoke all on function public.register_user(text, text, bigint, boolean, boolean) from public;
revoke all on function public.sync_user(text, text, bigint, boolean, boolean) from public;
revoke all on function public.get_public_leaderboard(integer) from public;

grant execute on function public.nickname_exists(text) to anon, authenticated;
grant execute on function public.register_user(text, text, bigint, boolean, boolean) to anon, authenticated;
grant execute on function public.sync_user(text, text, bigint, boolean, boolean) to anon, authenticated;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;

alter table public.users enable row level security;
