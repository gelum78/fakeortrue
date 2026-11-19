-- Applied to Supabase project txtyojzboembjwledmwr (eu-west-1) on 2026-11-19.
-- Waitlist for Fake or True. RLS is ON with no policies, so the public key
-- cannot read or write the table directly. The site inserts only through
-- join_waitlist(), which validates the email and ignores duplicates.

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null unique,
  lang        text,
  source      text,
  created_at  timestamptz not null default now()
);
alter table public.waitlist enable row level security;

create or replace function public.join_waitlist(p_email text, p_lang text default null, p_source text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or length(p_email) > 254 or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
    raise exception 'invalid_email';
  end if;
  insert into public.waitlist(email, lang, source)
  values (lower(trim(p_email)), left(p_lang, 10), left(p_source, 64))
  on conflict (email) do nothing;
end;
$$;
revoke all on function public.join_waitlist(text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;
