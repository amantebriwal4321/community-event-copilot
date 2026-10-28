import { z } from "zod";

export const EVENT_TYPES = ["wedding", "birthday", "community", "college_fest", "society", "other"] as const;
export const BUDGET_CATEGORIES = ["venue", "food", "decor", "attire", "photography", "entertainment", "logistics", "invites", "gifts", "misc"] as const;

export type BudgetItem = { category: string; planned: number; spent: number };
export type Task = { id: string; title: string; due: string; done: boolean; owner?: string };
export type Guest = { id: string; name: string; status: "invited" | "yes" | "no" | "maybe"; plusOnes: number };
export type Vendor = { id: string; category: string; name: string; status: "todo" | "shortlisted" | "booked"; quote?: number; notes?: string };
export type Idea = { title: string; detail: string };

export type Plan = {
  event: { type: string; name: string; date: string; city: string; guests: number; language: "en" | "hi" } | null;
  totalBudget: number;
  budget: BudgetItem[];
  tasks: Task[];
  guests: Guest[];
  vendors: Vendor[];
  ideas: Idea[];
};

export const emptyPlan = (): Plan => ({ event: null, totalBudget: 0, budget: [], tasks: [], guests: [], vendors: [], ideas: [] });

const id = (p: string, n: number) => `${p}${n + 1}`;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const money = z.number().finite().min(0).max(1e10);

export const schemas = {
  set_event: z.object({
    type: z.enum(EVENT_TYPES), name: z.string().min(1).max(120), date: isoDate,
    city: z.string().max(80).default(""), guests: z.number().int().min(0).max(100000).default(0),
    language: z.enum(["en", "hi"]).default("en"),
  }),
  set_budget: z.object({
    total: money,
    split: z.array(z.object({ category: z.string().min(1).max(40), planned: money })).max(20),
  }),
  log_expense: z.object({ category: z.string().min(1).max(40), amount: money }),
  add_tasks: z.object({ tasks: z.array(z.object({ title: z.string().min(1).max(160), daysBefore: z.number().int().min(-30).max(730), owner: z.string().max(60).optional() })).min(1).max(40) }),
  complete_task: z.object({ id: z.string().max(10) }),
  update_rsvp: z.object({ guests: z.array(z.object({ name: z.string().min(1).max(80), status: z.enum(["invited", "yes", "no", "maybe"]), plusOnes: z.number().int().min(0).max(20).default(0) })).min(1).max(200) }),
  upsert_vendors: z.object({ vendors: z.array(z.object({ category: z.string().min(1).max(40), name: z.string().min(1).max(100), status: z.enum(["todo", "shortlisted", "booked"]), quote: money.optional(), notes: z.string().max(200).optional() })).min(1).max(40) }),
  add_ideas: z.object({ ideas: z.array(z.object({ title: z.string().min(1).max(100), detail: z.string().max(400) })).min(1).max(12) }),
};
export type ToolName = keyof typeof schemas;

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function budgetStatus(plan: Plan) {
  const planned = plan.budget.reduce((s, b) => s + b.planned, 0);
  const spent = plan.budget.reduce((s, b) => s + b.spent, 0);
  const overCategories = plan.budget.filter((b) => b.spent > b.planned).map((b) => b.category);
  const alerts: string[] = [];
  if (plan.totalBudget && planned > plan.totalBudget) alerts.push(`Planned split ${planned} exceeds total budget ${plan.totalBudget}`);
  if (plan.totalBudget && spent > plan.totalBudget) alerts.push(`Spent ${spent} exceeds total budget ${plan.totalBudget}`);
  for (const c of overCategories) alerts.push(`Over budget in ${c}`);
  return { total: plan.totalBudget, planned, spent, remaining: plan.totalBudget - spent, alerts };
}

/** Apply a tool call to the plan. Pure: returns a new plan and a result for the model. */
export function applyTool(plan: Plan, name: string, rawArgs: unknown): { plan: Plan; result: Record<string, unknown> } {
  if (!(name in schemas)) return { plan, result: { error: `unknown tool ${name}` } };
  const parsed = schemas[name as ToolName].safeParse(rawArgs ?? {});
  if (!parsed.success) return { plan, result: { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } };
  const a = parsed.data as never as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const p: Plan = structuredClone(plan);
  switch (name as ToolName) {
    case "set_event":
      p.event = { type: a.type, name: a.name, date: a.date, city: a.city, guests: a.guests, language: a.language };
      return { plan: p, result: { ok: true, event: p.event } };
    case "set_budget": {
      p.totalBudget = a.total;
      const old = new Map(p.budget.map((b) => [b.category.toLowerCase(), b.spent]));
      p.budget = a.split.map((s: { category: string; planned: number }) => ({ category: s.category.toLowerCase(), planned: s.planned, spent: old.get(s.category.toLowerCase()) ?? 0 }));
      return { plan: p, result: { ok: true, ...budgetStatus(p) } };
    }
    case "log_expense": {
      const cat = a.category.toLowerCase();
      let item = p.budget.find((b) => b.category === cat);
      if (!item) { item = { category: cat, planned: 0, spent: 0 }; p.budget.push(item); }
      item.spent += a.amount;
      return { plan: p, result: { ok: true, ...budgetStatus(p) } };
    }
    case "add_tasks": {
      if (!p.event) return { plan, result: { error: "call set_event first so tasks can be scheduled back from the event date" } };
      const ev = p.event;
      a.tasks.forEach((t: { title: string; daysBefore: number; owner?: string }) =>
        p.tasks.push({ id: id("t", p.tasks.length), title: t.title, due: addDays(ev.date, -t.daysBefore), done: false, owner: t.owner }));
      p.tasks.sort((x, y) => x.due.localeCompare(y.due));
      return { plan: p, result: { ok: true, count: p.tasks.length } };
    }
    case "complete_task": {
      const t = p.tasks.find((x) => x.id === a.id);
      if (!t) return { plan, result: { error: `no task ${a.id}` } };
      t.done = true;
      return { plan: p, result: { ok: true } };
    }
    case "update_rsvp": {
      for (const g of a.guests) {
        const ex = p.guests.find((x) => x.name.toLowerCase() === g.name.toLowerCase());
        if (ex) Object.assign(ex, { status: g.status, plusOnes: g.plusOnes });
        else p.guests.push({ id: id("g", p.guests.length), name: g.name, status: g.status, plusOnes: g.plusOnes });
      }
      const yes = p.guests.filter((g) => g.status === "yes").reduce((s, g) => s + 1 + g.plusOnes, 0);
      return { plan: p, result: { ok: true, guests: p.guests.length, confirmedHeadcount: yes } };
    }
    case "upsert_vendors": {
      for (const v of a.vendors) {
        const ex = p.vendors.find((x) => x.name.toLowerCase() === v.name.toLowerCase());
        if (ex) Object.assign(ex, v);
        else p.vendors.push({ id: id("v", p.vendors.length), ...v });
      }
      return { plan: p, result: { ok: true, vendors: p.vendors.length } };
    }
    case "add_ideas":
      p.ideas.push(...a.ideas);
      p.ideas = p.ideas.slice(-20);
      return { plan: p, result: { ok: true } };
  }
  return { plan, result: { error: "unhandled" } };
}

export const planSchema = z.object({
  event: z.any().nullable(), totalBudget: z.number(), budget: z.array(z.any()).max(50), tasks: z.array(z.any()).max(300),
  guests: z.array(z.any()).max(1000), vendors: z.array(z.any()).max(200), ideas: z.array(z.any()).max(50),
});
