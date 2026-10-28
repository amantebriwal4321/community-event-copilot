import { describe, it, expect } from "vitest";
import { applyTool, emptyPlan, budgetStatus, addDays } from "../src/lib/plan";
import { toICS } from "../src/lib/ics";
import { rateLimit } from "../src/lib/ratelimit";

const withEvent = () => applyTool(emptyPlan(), "set_event", { type: "wedding", name: "Test Wedding", date: "2027-02-14", city: "Jaipur", guests: 300 }).plan;

describe("plan tools", () => {
  it("sets event with defaults", () => { expect(withEvent().event?.language).toBe("en"); });
  it("rejects bad dates", () => {
    const r = applyTool(emptyPlan(), "set_event", { type: "wedding", name: "x", date: "14/02/2027" });
    expect(r.result.error).toMatch(/date/); expect(r.plan.event).toBeNull();
  });
  it("rejects unknown tools and is pure", () => {
    const p = emptyPlan(); const r = applyTool(p, "rm_rf", {});
    expect(r.result.error).toBeDefined(); expect(r.plan).toBe(p);
  });
  it("schedules tasks backwards from event date, sorted", () => {
    const p = applyTool(withEvent(), "add_tasks", { tasks: [{ title: "Book venue", daysBefore: 90 }, { title: "Invites", daysBefore: 30 }] }).plan;
    expect(p.tasks.map((t) => t.due)).toEqual(["2026-11-16", "2027-01-15"]);
  });
  it("needs an event before tasks", () => {
    expect(applyTool(emptyPlan(), "add_tasks", { tasks: [{ title: "x", daysBefore: 1 }] }).result.error).toBeDefined();
  });
  it("tracks budget and raises over-budget alerts", () => {
    let p = applyTool(withEvent(), "set_budget", { total: 100000, split: [{ category: "Decor", planned: 20000 }, { category: "food", planned: 50000 }] }).plan;
    p = applyTool(p, "log_expense", { category: "decor", amount: 25000 }).plan;
    const s = budgetStatus(p);
    expect(s.spent).toBe(25000); expect(s.alerts).toContain("Over budget in decor");
    p = applyTool(p, "set_budget", { total: 100000, split: [{ category: "decor", planned: 30000 }] }).plan;
    expect(p.budget[0].spent).toBe(25000);
  });
  it("rejects negative expenses", () => {
    expect(applyTool(withEvent(), "log_expense", { category: "food", amount: -5 }).result.error).toBeDefined();
  });
  it("upserts RSVPs and counts headcount", () => {
    let r = applyTool(withEvent(), "update_rsvp", { guests: [{ name: "Riya", status: "yes", plusOnes: 1 }, { name: "Om", status: "maybe" }] });
    r = applyTool(r.plan, "update_rsvp", { guests: [{ name: "om", status: "yes" }] });
    expect(r.plan.guests).toHaveLength(2); expect(r.result.confirmedHeadcount).toBe(3);
  });
  it("upserts vendors by name", () => {
    let p = applyTool(withEvent(), "upsert_vendors", { vendors: [{ category: "food", name: "Caterer (to find)", status: "todo" }] }).plan;
    p = applyTool(p, "upsert_vendors", { vendors: [{ category: "food", name: "caterer (to find)", status: "booked", quote: 90000 }] }).plan;
    expect(p.vendors).toHaveLength(1); expect(p.vendors[0].status).toBe("booked");
  });
  it("completes tasks and caps ideas", () => {
    let p = applyTool(withEvent(), "add_tasks", { tasks: [{ title: "a", daysBefore: 1 }] }).plan;
    p = applyTool(p, "complete_task", { id: "t1" }).plan; expect(p.tasks[0].done).toBe(true);
    for (let i = 0; i < 3; i++) p = applyTool(p, "add_ideas", { ideas: Array.from({ length: 10 }, (_, k) => ({ title: `i${k}`, detail: "d" })) }).plan;
    expect(p.ideas.length).toBe(20);
  });
  it("addDays crosses months", () => { expect(addDays("2027-03-01", -1)).toBe("2027-02-28"); });
});

describe("ics export", () => {
  it("emits valid VEVENTs with escaping", () => {
    const p = applyTool(withEvent(), "add_tasks", { tasks: [{ title: "Book DJ, lights; sound", daysBefore: 10 }] }).plan;
    const ics = toICS(p, "20261028T000000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("Book DJ\\, lights\\; sound");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270214");
  });
});

describe("rate limit", () => {
  it("blocks after limit within window and frees after", () => {
    const k = "test-ip";
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 1000, 0)).toBe(true);
    expect(rateLimit(k, 3, 1000, 10)).toBe(false);
    expect(rateLimit(k, 3, 1000, 2000)).toBe(true);
  });
});
