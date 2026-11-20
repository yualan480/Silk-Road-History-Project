-- Run in the ORBIT CHAT Supabase SQL Editor, after migration-signup-requests.sql,
-- migration-signup-requests-staff.sql and the existing moderation migrations.
-- Installs the control; it does NOT open signups until staff press the button.
begin;

create table if not exists public.signup_approval_window (
  id integer primary key default 1 check (id = 1),
  open_until timestamptz not null default '-infinity',
  opened_by uuid
);
insert into public.signup_approval_window(id) values (1) on conflict do nothing;
alter table public.signup_approval_window enable row level security;
revoke all on public.signup_approval_window from public, anon, authenticated;

create or replace function public.signup_approval_paused() returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
  select coalesce((select open_until > clock_timestamp()
    from public.signup_approval_window where id=1), false)
$$;
revoke execute on function public.signup_approval_paused() from public, anon, authenticated;

create or replace function public.admin_signup_window_status() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare until_time timestamptz; server_time timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not exists (
    select 1 from public.server_members sm
    where sm.server_id=public.main_server() and sm.user_id=auth.uid()
      and sm.role in ('owner','admin','moderator')
  ) then raise exception 'Only the owner, admins, or moderators can change signup approval.'; end if;
  select open_until into until_time from public.signup_approval_window where id=1;
  return jsonb_build_object('open',coalesce(until_time > server_time,false),
    'open_until',case when until_time > server_time then until_time else null end,
    'server_now',server_time);
end $$;
revoke execute on function public.admin_signup_window_status() from public, anon;
grant execute on function public.admin_signup_window_status() to authenticated;

create or replace function public.admin_set_signup_window(p_open boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  -- Authenticate before touching the singleton row, using the same staff roles
  -- as the existing request-review functions.
  perform public.admin_signup_window_status();
  update public.signup_approval_window set
    open_until=case when p_open is true then
      case when open_until > clock_timestamp() then open_until
        else clock_timestamp() + interval '2 minutes' end
      else clock_timestamp() end,
    opened_by=case when p_open is true then auth.uid() else opened_by end
    where id=1;
  result := public.admin_signup_window_status();
  perform public.log_action('signup.approval_window',null,jsonb_build_object(
    'open',result->'open','open_until',result->'open_until','staff_id',auth.uid()));
  return result;
end $$;
revoke execute on function public.admin_set_signup_window(boolean) from public, anon;
grant execute on function public.admin_set_signup_window(boolean) to authenticated;

-- The roster check in handle_new_user's moderation helper must recognize the
-- window too. Name moderation, email format and device checks remain in force.
create or replace function public.mod_signup_check(p_email text, p_oauth boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
declare e text := lower(btrim(coalesce(p_email, ''))); lp text; m text[]; r jsonb; on_roster boolean; ex boolean;
begin
  if e !~ '^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$' then
    return jsonb_build_object('problem', 'Only school email addresses (like 30yua@tesdk12.net) can sign up.');
  end if;
  ex := lock_exempt(e);
  on_roster := exists (select 1 from allowed_emails where email = e);
  if not ex and exists (select 1 from allowed_emails) and not on_roster and not public.signup_approval_paused() then
    return jsonb_build_object('problem', 'That email is not on the approved school list. Check for typos, or ask the owner to add it.');
  end if;
  if not coalesce((select enabled from mod_settings where id = 1), false) then return '{}'::jsonb; end if;
  lp := split_part(e, '@', 1);
  m := regexp_match(lp, '^([0-9]{2})([a-z]+)([a-z])([0-9]*)$');
  r := mod_scan(initcap(m[2]), 'name');
  if r is null then r := mod_scan(m[3], 'name'); end if;
  if r is null then r := mod_scan(regexp_replace(lp, '[0-9]', '', 'g'), 'name'); end if;
  if r is not null then
    if ex or on_roster or p_oauth then return jsonb_build_object('rename', true); end if;   -- trusted sign-in: never block, ask for a new display name
    return jsonb_build_object('problem', 'That email can''t be used to sign up because the name in it contains language that isn''t allowed here. If it is your real school email, ask the owner to add it to the approved list.');
  end if;
  return '{}'::jsonb;
end $$;


create or replace function public.signup_request_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare e text:=lower(trim(coalesce(new.email,'')));
begin
  -- Preserve the existing personal Gmail OAuth flow.
  if coalesce(new.raw_app_meta_data->>'provider','') = 'google'
     and e like '%@gmail.com' then return new; end if;
  if public.lock_exempt(e) then return new; end if;
  if e ~ '^30[a-z]{2,}[0-9]*@tesdk12\.net$' and public.signup_approval_paused() then return new; end if;
  if not exists(select 1 from public.allowed_emails where email=e) then
    raise exception 'Your signup request must be approved before creating an account.';
  end if;
  return new;
end $$;
revoke execute on function public.signup_request_guard() from public,anon,authenticated;
drop trigger if exists signup_request_approval_guard on auth.users;
create trigger signup_request_approval_guard before insert on auth.users
  for each row execute function public.signup_request_guard();


create or replace function public.signup_email_problem(p_email text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e text:=lower(trim(coalesce(p_email,'')));
begin
  if e !~ '^30[a-z]{2,}[0-9]*@tesdk12\.net$' then
    return 'Use your school email starting with 30 and ending with @tesdk12.net.';
  end if;
  if public.lock_exempt(e) then return null; end if;
  if public.signup_approval_paused() then return (public.mod_signup_check(e,false))->>'problem'; end if;
  if not exists(select 1 from public.allowed_emails where email=e) then
    return 'Approval required. Select Request access below to send a signup request.';
  end if;
  return null;
end $$;
grant execute on function public.signup_email_problem(text) to anon,authenticated;

create or replace function public.request_school_signup(p_email text) returns text
language plpgsql security definer set search_path = public,pg_temp as $$
declare e text := lower(trim(coalesce(p_email,''))); old public.signup_requests%rowtype;
begin
  if e !~ '^30[a-z]{2,}[0-9]*@tesdk12\.net$' then
    raise exception 'Use a valid class of 2030 school email.';
  end if;
  if public.signup_approval_paused() or public.lock_exempt(e) or exists(select 1 from public.allowed_emails where email=e) then
    return 'This address can already register. Go back to Create account.';
  end if;
  select * into old from public.signup_requests where email=e for update;
  if found then
    if old.status='approved' then return 'Approved! Go back to Create account.'; end if;
    if old.status='pending' then return 'Your request is pending review.'; end if;
    if old.requested_at > now() - interval '24 hours' then
      return 'A request was already reviewed. Please wait before submitting again.';
    end if;
    update public.signup_requests set status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null where email=e;
  else
    insert into public.signup_requests(email) values(e);
  end if;
  return 'Request submitted. After approval, return here to create your account.';
end $$;
revoke execute on function public.request_school_signup(text) from public;
grant execute on function public.request_school_signup(text) to anon, authenticated;


commit;
