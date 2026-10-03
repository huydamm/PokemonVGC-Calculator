-- Synced team box (plans/2026-09-24-accounts-team-box, phase 2). Apply in the Supabase SQL editor
-- or with `supabase db push`. Row-level security does the access control: the browser talks to
-- this table directly with the public anon key, and Postgres only ever shows a user their own rows.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  format_id   text not null check (format_id in ('gen9ou', 'gen9doublesou', 'gen9champions')),
  paste       text not null check (char_length(paste) between 1 and 10000),
  updated_at  timestamptz not null default now()
);
create index teams_user_idx on public.teams (user_id, updated_at desc);

alter table public.teams enable row level security;
create policy "own teams" on public.teams
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Per-user cap, enforced server side (the client's 100 limit is only a courtesy). The client saves
-- with upsert, and BEFORE INSERT fires for upserts that end up updating, so an existing id passes.
create function public.enforce_team_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.teams where user_id = new.user_id) >= 100
     and not exists (select 1 from public.teams where id = new.id) then
    raise exception 'team box is full (100)';
  end if;
  return new;
end $$;
create trigger team_cap before insert on public.teams
  for each row execute function public.enforce_team_cap();

-- In-app account deletion. Runs as the owner to reach auth.users; deletes only the caller,
-- and the cascade takes their teams with it.
create function public.delete_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
