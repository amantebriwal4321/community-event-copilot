import type { Plan } from "./plan";
const esc = (s: string) => s.replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
const d = (iso: string) => iso.replace(/-/g, "");
export function toICS(plan: Plan, stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Community Event Copilot//EN", "CALSCALE:GREGORIAN"];
  const add = (uid: string, date: string, summary: string) => {
    const next = new Date(date + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    lines.push("BEGIN:VEVENT", `UID:${uid}@event-copilot`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(date)}`, `DTEND;VALUE=DATE:${d(next.toISOString().slice(0, 10))}`, `SUMMARY:${esc(summary)}`, "END:VEVENT");
  };
  if (plan.event) add("event", plan.event.date, plan.event.name);
  for (const t of plan.tasks) add(t.id, t.due, `[Task] ${t.title}`);
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
