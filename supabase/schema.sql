-- Run once in Supabase: SQL Editor > New query.
-- Dashboard first: Authentication > Providers > enable "Anonymous sign-ins" (and turn on CAPTCHA/rate limits).

create table public.classes (id int primary key default 1 check (id = 1), code text not null);
create table public.members (user_id uuid primary key references auth.users on delete cascade,
                             display_name text not null, joined_at timestamptz default now());
create table public.passages (name text primary key, source text not null, version int not null default 1,
                              updated_by uuid, updated_name text, updated_at timestamptz default now());
create table public.locks (name text primary key, user_id uuid not null, display_name text not null,
                           expires_at timestamptz not null);
create table public.publish_log (id int primary key default 1 check (id = 1), last_at timestamptz not null);

alter table public.classes     enable row level security;   -- no policies: unreadable from the browser
alter table public.publish_log enable row level security;
alter table public.members     enable row level security;
alter table public.passages    enable row level security;
alter table public.locks       enable row level security;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where user_id = auth.uid()) $$;

create policy members_read  on public.members  for select using (public.is_member());
create policy passages_read on public.passages for select using (public.is_member());
create policy locks_read    on public.locks    for select using (public.is_member());
-- No insert/update/delete policies: all writes go through the functions below.

create or replace function public.join_class(p_code text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 40 then raise exception 'bad_name'; end if;
  if not exists (select 1 from classes where lower(code) = lower(trim(coalesce(p_code,'')))) then
    raise exception 'bad_code';
  end if;
  insert into members (user_id, display_name) values (auth.uid(), trim(p_name))
  on conflict (user_id) do update set display_name = excluded.display_name;
end $$;

create or replace function public.acquire_lock(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me members%rowtype; l locks%rowtype;
begin
  select * into me from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  delete from locks where expires_at < now();
  insert into locks (name, user_id, display_name, expires_at)
  values (p_name, auth.uid(), me.display_name, now() + interval '2 minutes')
  on conflict (name) do update
    set user_id = excluded.user_id, display_name = excluded.display_name, expires_at = excluded.expires_at
    where locks.user_id = auth.uid() or locks.expires_at < now();
  select * into l from locks where name = p_name;
  return jsonb_build_object('ok', l.user_id = auth.uid(), 'holder', l.display_name);
end $$;

create or replace function public.release_lock(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from locks where name = p_name and user_id = auth.uid();
end $$;

create or replace function public.save_passage(p_name text, p_source text, p_expected int) returns int
language plpgsql security definer set search_path = public as $$
declare me members%rowtype; lk locks%rowtype; v int; header text; tagstr text;
begin
  select * into me from members where user_id = auth.uid();
  if not found then raise exception 'not_member'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 120 then raise exception 'bad_name'; end if;
  if p_name in ('StoryData','StoryInit','StoryTitle','StoryInterface','Story JavaScript','Story Stylesheet') then
    raise exception 'reserved_name';
  end if;
  if length(p_source) > 100000 then raise exception 'too_large'; end if;
  if not starts_with(p_source, ':: ' || p_name) then raise exception 'bad_source'; end if;
  if p_source ~ E'\n:: ' then raise exception 'bad_source'; end if;      -- no smuggling a second passage
  header := split_part(p_source, E'\n', 1);
  tagstr := substring(header from '\[([^\]]*)\]\s*$');
  if tagstr ~* '\m(script|stylesheet|widget|init|startup)\M' then raise exception 'forbidden_tag'; end if;

  select * into lk from locks where name = p_name and expires_at > now();
  if found and lk.user_id <> auth.uid() then raise exception 'locked_by:%', lk.display_name; end if;

  if p_expected = 0 then
    begin
      insert into passages (name, source, version, updated_by, updated_name)
      values (p_name, p_source, 1, auth.uid(), me.display_name);
    exception when unique_violation then raise exception 'exists';
    end;
    return 1;
  end if;

  update passages set source = p_source, version = version + 1, updated_by = auth.uid(),
         updated_name = me.display_name, updated_at = now()
   where name = p_name and version = p_expected
   returning version into v;
  if v is null then raise exception 'conflict'; end if;
  return v;
end $$;

create or replace function public.delete_passage(p_name text, p_expected int) returns void
language plpgsql security definer set search_path = public as $$
declare lk locks%rowtype; n int;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  if p_name = 'Start' then raise exception 'cannot_delete_start'; end if;
  select * into lk from locks where name = p_name and expires_at > now();
  if found and lk.user_id <> auth.uid() then raise exception 'locked_by:%', lk.display_name; end if;
  delete from passages where name = p_name and version = p_expected;
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from passages where name = p_name) then raise exception 'conflict'; end if;
  delete from locks where name = p_name;
end $$;

-- Public on purpose: the published story is public anyway. Used by the GitHub Action (and keeps the project awake).
create or replace function public.export_twee() returns text
language sql stable security definer set search_path = public as
$$ select coalesce(string_agg(source, E'\n' order by (name <> 'Start'), name), '') from public.passages $$;
grant execute on function public.export_twee() to anon, authenticated;

create or replace function public.claim_publish() returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  insert into publish_log (id, last_at) values (1, now())
  on conflict (id) do update set last_at = now() where publish_log.last_at < now() - interval '30 seconds';
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Realtime
alter publication supabase_realtime add table public.passages, public.locks;

-- Media bucket: public read, members upload images/audio up to 10 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/*','audio/*'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/*','audio/*'];
create policy media_member_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member());

-- Seed: set YOUR class code (long and random, e.g. three words) and the empty starting story
insert into public.classes (id, code) values (1, 'CHANGE-ME-class-code');
insert into public.passages (name, source) values
 ('Start', E':: Start\nWelcome. Replace this text with your opening, then link the first locations below.\n');
