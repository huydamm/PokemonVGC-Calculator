-- Keepalive heartbeat. Free projects pause after a week of low database activity, and the anon
-- read of `teams` (RLS returns []) did not count: the project paused three days after a
-- successful ping. The workflow calls this instead, so every ping is a real write.
-- Apply in the Supabase SQL editor.

create table public.keepalive (
  id         boolean primary key default true check (id),
  pinged_at  timestamptz not null default now()
);
insert into public.keepalive default values;

-- RLS on with no policies: nobody reads or writes the table directly.
alter table public.keepalive enable row level security;

-- Runs as the owner so anon can bump the one row and nothing else.
create function public.keepalive() returns timestamptz
language sql security definer set search_path = '' as $$
  update public.keepalive set pinged_at = now() returning pinged_at;
$$;
revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
