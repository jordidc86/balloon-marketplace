import { createClient, createAdminClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { trackedSearchUrl } from '@/utils/traffic.mjs'
export const dynamic = 'force-dynamic'
type Report = { views: number; visitorDays: number; contactVisitors: number; contacts: number; since: string | null; daily: {day:string;views:number;visitors:number}[]; sources:{source:string;campaign:string;visitors:number;contacts:number}[]; pages:{path:string;views:number}[] }
export default async function TrafficPage() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await client.from('users').select('role').eq('id',user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc('web_traffic_report')
  if (error || !data) return <div role="alert">Traffic data is temporarily unavailable. This does not mean there were zero visits.</div>
  const report = data as Report
  const today = new Date().toISOString().slice(0,10)
  const todayVisitors = report.daily.find(d=>d.day===today)?.visitors || 0
  const maxViews = Math.max(1,...report.daily.map(d=>d.views))
  return <div className="mx-auto max-w-6xl space-y-8">
    <header><h1 className="text-3xl font-bold">Traffic & contacts</h1><p className="mt-2 text-muted-foreground">Public website activity over the last 30 days. Daily totals use UTC.</p><p className="mt-1 text-sm text-muted-foreground">{report.since ? `First visit in this window: ${new Date(report.since).toLocaleDateString('en-GB',{timeZone:'UTC'})}.` : 'Measurement is ready. Waiting for the first visitor.'} Earlier website traffic cannot be reconstructed here.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Visitors today',todayVisitors],['Page views · 30 days',report.views],['Contact requests · 30 days',report.contacts],['Visitors who contacted us',report.contactVisitors]].map(([label,value])=><div key={label} className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold text-primary">{value}</p></div>)}</div>
    <p className="text-sm text-muted-foreground">Visitors are estimated browsers or signed-in accounts, deduplicated each day. Returning on another day counts again. {report.visitorDays} visitor-days recorded; {report.visitorDays ? `${(100*report.contactVisitors/report.visitorDays).toFixed(1)}%` : '—'} made a stored enquiry or request during the same tracked day. Total requests also include contacts without an attributable visit. Contact reveals are not counted as sent requests.</p>
    <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">Daily activity</h2><div className="mt-4 space-y-3">{report.daily.length ? report.daily.map(d=><div key={d.day} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3 text-sm"><span>{d.day}</span><div className="h-3 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{width:`${100*d.views/maxViews}%`}} /></div><span>{d.visitors} visitors · {d.views} views</span></div>):<p>No visits recorded yet.</p>}</div></section>
    <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">Where visitors come from</h2><p className="mt-1 text-sm text-muted-foreground">First recorded source per visitor-day. “Direct” means the source was not available; it does not necessarily mean a typed address.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Source / campaign</th><th className="p-2">Visitor-days</th><th className="p-2">Visitors contacting us</th></tr></thead><tbody>{report.sources.map(s=><tr key={`${s.source}:${s.campaign}`} className="border-t"><td className="p-2 break-all">{s.source}<span className="block text-muted-foreground">{s.campaign}</span></td><td className="p-2">{s.visitors}</td><td className="p-2">{s.contacts}</td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">Most viewed pages</h2>{report.pages.map(p=><p key={p.path} className="mt-3 flex justify-between gap-4 break-all"><span>{p.path}</span><strong>{p.views}</strong></p>)}</section>
    <section className="rounded-2xl border bg-card p-6"><h2 className="text-xl font-semibold">Links for the search campaign</h2><p className="mt-2 text-sm text-muted-foreground">Copy the matching link into a clickable placement. Instagram captions and image-only stories do not provide a clickable link: use the profile link or add a story link sticker manually.</p>{(['instagram','facebook','whatsapp'] as const).map(source=><div className="mt-4" key={source}><label htmlFor={`link-${source}`} className="block font-medium capitalize">{source}</label><input id={`link-${source}`} readOnly value={trackedSearchUrl(source,source==='instagram'?'bio':source==='whatsapp'?'status':'post')} className="mt-1 w-full rounded border bg-background p-3 text-sm" /></div>)}</section>
    <p className="text-xs text-muted-foreground">Excludes signed-in administrators, private pages, common bots and browsers requesting Do Not Track or Global Privacy Control. Blocking, missing referrers and changing devices can affect counts. No IP addresses, full referrers, search text or contact details are stored in the traffic dataset.</p>
  </div>
}
