"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { emptyPlan, budgetStatus, type Plan } from "@/lib/plan";
import { toICS } from "@/lib/ics";

type Msg = { role: "user" | "model"; text: string };
const KEY = "event-copilot-v1";
const SAMPLES = [
  "Plan a Marwari wedding in Jaipur on 2027-02-14, 300 guests, budget 8 lakh",
  "मेरी बेटी का 5वां जन्मदिन 2026-12-20 को पुणे में, 40 मेहमान, बजट 50,000. हिंदी में प्लान बनाओ",
  "College tech fest at MSRUAS Bengaluru on 2027-01-25, 800 people, 3 lakh budget, add sponsors and volunteers",
];
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [plan, setPlan] = useState<Plan>(emptyPlan());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { setMsgs(s.msgs ?? []); setPlan(s.plan ?? emptyPlan()); } } catch { /* ignore corrupt storage */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify({ msgs, plan })); }, [msgs, plan, loaded]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, text: t.slice(0, 4000) }];
    setMsgs(next); setInput(""); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-20), plan }) });
      const j = await r.json();
      if (j.plan) setPlan(j.plan);
      if (!r.ok) throw new Error(j.error || "Request failed");
      setMsgs([...next, { role: "model", text: j.reply || "Plan updated." }]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); send(input); };
  const reset = () => { if (confirm("Clear this plan and chat?")) { setMsgs([]); setPlan(emptyPlan()); } };
  const exportICS = () => {
    const url = URL.createObjectURL(new Blob([toICS(plan)], { type: "text/calendar" }));
    const a = document.createElement("a"); a.href = url; a.download = "event-plan.ics"; a.click(); URL.revokeObjectURL(url);
  };
  const toggleTask = (id: string) => setPlan((p) => ({ ...p, tasks: p.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  const bs = budgetStatus(plan);
  const maxBar = Math.max(1, ...plan.budget.map((b) => Math.max(b.planned, b.spent)));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a href="#chat-input" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-white">Skip to chat input</a>
      <header className="no-print border-b bg-white px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">🎉 Community Event Copilot</h1>
        <div className="flex gap-2">
          <button onClick={exportICS} disabled={!plan.event} className="btn">Export .ics</button>
          <button onClick={() => window.print()} disabled={!plan.event} className="btn">Export PDF</button>
          <button onClick={reset} className="btn">New plan</button>
        </div>
      </header>
      <main className="grid lg:grid-cols-2 gap-4 p-4 max-w-7xl mx-auto">
        <section aria-label="Chat" className="no-print bg-white rounded-xl border flex flex-col h-[80vh]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
            {msgs.length === 0 && (
              <div>
                <p className="mb-3 text-slate-700">Plan a wedding, birthday or community event. English or Hindi. Try one:</p>
                <ul className="space-y-2">{SAMPLES.map((s) => <li key={s}><button className="text-left w-full rounded-lg border border-indigo-200 bg-indigo-50 p-3 hover:bg-indigo-100 focus:outline-2 focus:outline-indigo-700" onClick={() => send(s)}>{s}</button></li>)}</ul>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`rounded-lg p-3 whitespace-pre-wrap ${m.role === "user" ? "bg-indigo-700 text-white ml-8" : "bg-slate-100 mr-8"}`}>
                <span className="sr-only">{m.role === "user" ? "You said:" : "Copilot said:"}</span><Rich text={m.text} />
              </div>
            ))}
            {busy && <p className="text-slate-600" role="status">Planning…</p>}
            {err && <p className="text-red-700" role="alert">{err}</p>}
            <div ref={endRef} />
          </div>
          <form onSubmit={onSubmit} className="border-t p-3 flex gap-2">
            <label htmlFor="chat-input" className="sr-only">Message</label>
            <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} placeholder="e.g. Spent 20k on decor" className="flex-1 rounded-lg border border-slate-400 px-3 py-2" />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-indigo-700 text-white px-4 py-2 disabled:opacity-50">Send</button>
          </form>
        </section>

        <section aria-label="Event plan" className="space-y-4 print-area">
          <Card title="Event">
            {plan.event ? <p><strong>{plan.event.name}</strong> · {plan.event.type.replace("_", " ")} · {plan.event.date} · {plan.event.city} · {plan.event.guests} guests</p> : <p className="text-slate-600">No event yet. Start chatting.</p>}
          </Card>
          <Card title={`Budget ${plan.totalBudget ? `(${inr(bs.spent)} spent of ${inr(plan.totalBudget)})` : ""}`}>
            {bs.alerts.map((a) => <p key={a} role="alert" className="mb-1 rounded bg-red-50 border border-red-300 text-red-800 px-2 py-1">⚠ {a}</p>)}
            {plan.budget.length === 0 ? <p className="text-slate-600">No budget yet.</p> : (
              <ul className="space-y-2">{plan.budget.map((b) => (
                <li key={b.category}>
                  <div className="flex justify-between text-sm"><span className="capitalize">{b.category}</span><span>{inr(b.spent)} / {inr(b.planned)}</span></div>
                  <div className="h-2 bg-slate-200 rounded" role="img" aria-label={`${b.category}: planned ${inr(b.planned)}, spent ${inr(b.spent)}`}>
                    <div className="h-2 rounded bg-indigo-600" style={{ width: `${(b.planned / maxBar) * 100}%` }} />
                    <div className={`h-2 -mt-2 rounded ${b.spent > b.planned ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${(b.spent / maxBar) * 100}%` }} />
                  </div>
                </li>))}</ul>)}
          </Card>
          <Card title={`Timeline (${plan.tasks.filter((t) => t.done).length}/${plan.tasks.length} done)`}>
            <ul className="space-y-1">{plan.tasks.map((t) => (
              <li key={t.id}><label className="flex gap-2 items-start"><input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} className="mt-1" />
                <span className={t.done ? "line-through text-slate-500" : ""}><span className="font-mono text-sm text-slate-600">{t.due}</span> {t.title}{t.owner ? ` (${t.owner})` : ""}</span></label></li>))}</ul>
          </Card>
          <Card title="Vendor checklist">
            <ul className="space-y-1">{plan.vendors.map((v) => (
              <li key={v.id} className="flex justify-between gap-2"><span><span className="capitalize text-slate-600">{v.category}:</span> {v.name}{v.notes ? `, ${v.notes}` : ""}</span>
                <span className={`text-xs rounded px-2 py-0.5 h-fit ${v.status === "booked" ? "bg-emerald-100 text-emerald-900" : v.status === "shortlisted" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"}`}>{v.status}{v.quote ? ` ${inr(v.quote)}` : ""}</span></li>))}</ul>
          </Card>
          <Card title={`Guests / RSVP (${plan.guests.filter((g) => g.status === "yes").reduce((s, g) => s + 1 + g.plusOnes, 0)} confirmed)`}>
            <ul className="text-sm">{plan.guests.map((g) => <li key={g.id}>{g.name}: {g.status}{g.plusOnes ? ` +${g.plusOnes}` : ""}</li>)}</ul>
          </Card>
          <Card title="Ideas for you">
            <ul className="space-y-2">{plan.ideas.map((i, k) => <li key={k}><strong>{i.title}</strong>: {i.detail}</li>)}</ul>
          </Card>
        </section>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border p-4"><h2 className="font-semibold mb-2">{title}</h2>{children}</div>;
}

/** Tiny safe formatter: **bold** and "* " bullets, no HTML injection. */
function Rich({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => {
    const bullet = /^\s*[*-]\s+/.test(line);
    const body = line.replace(/^\s*[*-]\s+/, "").split(/\*\*(.+?)\*\*/g).map((seg, k) => k % 2 ? <strong key={k}>{seg}</strong> : seg);
    return <span key={i} className="block">{bullet ? "• " : ""}{body}</span>;
  })}</>;
}
