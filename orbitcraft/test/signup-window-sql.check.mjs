// Scratch PostgreSQL test. Install PGlite outside the repo and set PGLITE_MODULE
// to its dist/index.js, or install @electric-sql/pglite in your test environment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const sql=await readFile(new URL('../../chat/migration-signup-approval-window.sql',import.meta.url),'utf8');
const value=async(sql,params=[])=>Object.values((await db.query(sql,params)).rows[0])[0];
const identity=async id=>db.query("select set_config('test.uid',$1,false)",[id]);
try{
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; grant usage on schema auth to authenticated,anon;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key default gen_random_uuid(),email text,raw_app_meta_data jsonb default '{}');
 create table public.server_members(server_id int,user_id uuid,role text);
 insert into public.server_members values
 (1,'00000000-0000-0000-0000-000000000001','owner'),
 (1,'00000000-0000-0000-0000-000000000002','admin'),
 (1,'00000000-0000-0000-0000-000000000003','moderator'),
 (1,'00000000-0000-0000-0000-000000000004','member'),
 (1,'00000000-0000-0000-0000-000000000005','support');
 create function public.main_server() returns int language sql as $$select 1$$;
 create function public.lock_exempt(text) returns boolean language sql as $$select false$$;
 create table public.allowed_emails(email text primary key);
 insert into public.allowed_emails values('30approveda@tesdk12.net');
 create table public.signup_requests(email text primary key,status text default 'pending',requested_at timestamptz default now(),reviewed_at timestamptz,reviewed_by uuid);
 insert into public.signup_requests(email) values('30pendinga@tesdk12.net');
 create table public.mod_settings(id int,enabled boolean);
 insert into public.mod_settings values(1,true);
 create function public.mod_scan(value text,kind text) returns jsonb language sql as $$select case when value ilike '%blocked%' then '{"blocked":true}'::jsonb else null end$$;
 create table public.audit(action text,detail jsonb);
 create function public.log_action(a text,b uuid,c jsonb) returns void language sql as $$insert into public.audit values(a,c)$$;
 `);
 await db.exec(sql);
 assert.equal(await value('select public.signup_approval_paused()'),false);
 assert.match(await value("select public.signup_email_problem('30pendinga@tesdk12.net')"),/Approval required/);
 await assert.rejects(db.exec("insert into auth.users(email) values('30pendinga@tesdk12.net')"),/approved/);
 for(const suffix of ['000004','000005']){
  await identity('00000000-0000-0000-0000-000000'+suffix);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select public.admin_set_signup_window(true)'),/Only the owner/);
  await assert.rejects(db.exec('select * from public.signup_approval_window'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role anon');
 await assert.rejects(db.exec('select public.admin_set_signup_window(true)'),/permission denied/);
 await db.exec('reset role');
 for(const n of [1,2,3]){
  await identity('00000000-0000-0000-0000-00000000000'+n);await db.exec('set role authenticated');
  const open=await value('select public.admin_set_signup_window(true)');
  assert.equal(open.open,true);
  const delta=Date.parse(open.open_until)-Date.parse(open.server_now);assert.ok(delta>118000&&delta<=120000);
  const again=await value('select public.admin_set_signup_window(true)');assert.equal(again.open_until,open.open_until);
  await value('select public.admin_set_signup_window(false)');assert.equal((await value('select public.admin_signup_window_status()')).open,false);
  await db.exec('reset role');
 }
 await value('select public.admin_set_signup_window(true)');
 assert.equal(await value("select public.signup_email_problem('30pendinga@tesdk12.net')"),null);
 assert.match(await value("select public.signup_email_problem('29othera@tesdk12.net')"),/starting with 30/);
 assert.match(await value("select public.signup_email_problem('person@gmail.com')"),/school email/);
 assert.match(await value("select public.signup_email_problem('30blockeda@tesdk12.net')"),/language/);
 assert.equal(await value("select public.mod_signup_check('30pendinga@tesdk12.net',false)->>'problem'"),null);
 await db.exec("insert into auth.users(email) values('30pendinga@tesdk12.net')");
 assert.equal(await value("select status from public.signup_requests where email='30pendinga@tesdk12.net'"),'pending');
 assert.equal(await value('select count(*)::int from public.allowed_emails'),1);
 assert.match(await value("select public.request_school_signup('30newa@tesdk12.net')"),/already register/);
 await db.exec("update public.signup_approval_window set open_until=clock_timestamp()-interval '1 millisecond'");
 assert.equal(await value('select public.signup_approval_paused()'),false);
 await assert.rejects(db.exec("insert into auth.users(email) values('30newa@tesdk12.net')"),/approved/);
 assert.match(await value("select public.signup_email_problem('30newa@tesdk12.net')"),/Approval required/);
 assert.match(await value("select public.mod_signup_check('30newa@tesdk12.net',false)->>'problem'"),/approved/);
 assert.equal(await value("select public.signup_email_problem('30approveda@tesdk12.net')"),null);
 assert.equal(await value('select count(*)::int from auth.users'),1);
 // Re-running the migration must not open the window or remove existing data.
 await db.exec(sql);assert.equal(await value('select public.signup_approval_paused()'),false);
 assert.equal(await value('select count(*)::int from auth.users'),1);
 console.log('PASS PostgreSQL: staff permissions, anon/member rejection, exact two-minute window, no accidental extensions, precheck + insert guard + moderation roster gate, expiry, early close and idempotent migration.');
}finally{await db.close();}
