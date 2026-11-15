import {createRequire} from 'node:module';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(process.argv[2] || new URL('../package.json',import.meta.url));const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
set request.jwt.claim.role='service_role';
create table marketplace_inquiries(id text,journey_key text,created_at timestamptz);
create table quote_requests(id text,journey_key text,created_at timestamptz);
create table wanted_requests(id text,journey_key text,created_at timestamptz);`);
const root=new URL('../',import.meta.url).pathname;
await db.exec(readFileSync(root+'supabase/migrations/20261103150000_web_traffic.sql','utf8'));
await db.exec(readFileSync(root+'supabase/migrations/20261115110000_traffic_history.sql','utf8'));
await db.exec(readFileSync(root+'supabase/migrations/20261115120000_contact_clicks.sql','utf8'));
const day="date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'";
await db.exec(`insert into web_traffic_events(event_id,journey_key,path,source,created_at) values
 ('11111111-1111-4111-8111-111111111111',repeat('a',64),'/','facebook',${day}-interval '40 days'+interval '1 hour'),
 ('22222222-2222-4222-8222-222222222222',repeat('a',64),'/catalog','google',${day}-interval '40 days'+interval '2 hours'),
 ('33333333-3333-4333-8333-333333333333',repeat('b',64),'/','ig',${day}-interval '1 day'+interval '1 hour');
 insert into marketplace_inquiries values ('1',repeat('a',64),${day}-interval '40 days'+interval '3 hours'),('2',repeat('a',64),${day}-interval '40 days'+interval '4 hours');
 insert into quote_requests values ('3',null,${day}-interval '40 days'+interval '5 hours');
 insert into web_contact_clicks(journey_key,listing_id,channel,source,created_at) values(repeat('a',64),'11111111-1111-4111-8111-111111111111','email','facebook',${day}-interval '40 days'+interval '2 hours');
 select record_web_traffic('44444444-4444-4444-8444-444444444444',repeat('c',64),'/','direct','','');`);
const archive=(await db.query('select * from web_traffic_daily_history order by day')).rows;
assert.equal(archive[0].report.contactClicks.clicks,1);assert.equal(archive[0].report.contactClicks.sources[0].source,'facebook');assert.equal(archive.length,40);assert.equal(archive[0].report.views,2);assert.equal(archive[0].report.visitorDays,1);assert.equal(archive[0].report.contactVisitors,1);assert.equal(archive[0].report.contacts,3);assert.equal(archive[0].report.sources[0].source,'facebook');
assert.equal((await db.query('select count(*)::int n from web_traffic_events')).rows[0].n,2);
await db.exec('select archive_web_traffic_days();');
assert.deepEqual((await db.query('select * from web_traffic_daily_history order by day')).rows,archive);
const history=(await db.query('select web_traffic_history_report() r')).rows[0].r;assert.equal(history.length,41);assert.equal(history.at(-1).report.views,1);
await db.exec(`select record_contact_click(repeat('c',64),'11111111-1111-4111-8111-111111111111','phone','direct','');select record_contact_click(repeat('c',64),'11111111-1111-4111-8111-111111111111','phone','direct','');select record_contact_click(repeat('c',64),'11111111-1111-4111-8111-111111111111','email','direct','');`);
const clicks=(await db.query("select web_contact_click_report(now()-interval '1 day',now()+interval '1 second') r")).rows[0].r;
assert.equal(clicks.clicks,2);assert.equal(clicks.visitors,1);assert.equal(clicks.channels.length,2);
assert.equal((await db.query('select count(*)::int n from web_contact_clicks')).rows[0].n,2);
assert.equal((await db.query('select report from web_traffic_daily_history order by day limit 1')).rows[0].report.contactClicks.clicks,1);
await assert.rejects(db.query("select record_contact_click(repeat('c',64),'11111111-1111-4111-8111-111111111111','invalid','direct','')"),/check constraint/);
for(const role of ['anon','authenticated']) {
 await db.exec(`set role ${role};set request.jwt.claim.role='${role}';`);
 for(const sql of ['select * from web_traffic_daily_history','select * from web_contact_clicks',"select web_contact_click_report(now(),now())",'select web_traffic_history_report()','select archive_web_traffic_days()',"select web_traffic_range(now(),now())"]) await assert.rejects(db.query(sql),/permission denied/);
 await db.exec('reset role');
}
console.log('PASS: contact clicks deduplicated, separate channels, private RPC, archived before retention; full UTC-day archive before retention, first-touch attribution, multiple requests deduplicated for conversion, unattributed contacts, 40 days including zero days, immutable retry, current day provisional, anon/authenticated denied.');await db.close();
