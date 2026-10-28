const str = { type: "string" };
const num = { type: "number" };
export const functionDeclarations = [
  { name: "set_event", description: "Create or update the core event details. Call first for any new event.", parametersJsonSchema: { type: "object", properties: {
    type: { type: "string", enum: ["wedding", "birthday", "community", "college_fest", "society", "other"] }, name: str,
    date: { type: "string", description: "YYYY-MM-DD" }, city: str, guests: { type: "integer" }, language: { type: "string", enum: ["en", "hi"] } }, required: ["type", "name", "date"] } },
  { name: "set_budget", description: "Set total budget (INR) and a category split. Replaces the existing split, keeps spent amounts.", parametersJsonSchema: { type: "object", properties: {
    total: num, split: { type: "array", items: { type: "object", properties: { category: str, planned: num }, required: ["category", "planned"] } } }, required: ["total", "split"] } },
  { name: "log_expense", description: "Record money spent in a budget category. Returns over-budget alerts.", parametersJsonSchema: { type: "object", properties: { category: str, amount: num }, required: ["category", "amount"] } },
  { name: "add_tasks", description: "Add timeline tasks scheduled backwards from the event date. daysBefore=30 means 30 days before the event, 0 is event day.", parametersJsonSchema: { type: "object", properties: {
    tasks: { type: "array", items: { type: "object", properties: { title: str, daysBefore: { type: "integer" }, owner: str }, required: ["title", "daysBefore"] } } }, required: ["tasks"] } },
  { name: "complete_task", description: "Mark a task done by id (e.g. t3).", parametersJsonSchema: { type: "object", properties: { id: str }, required: ["id"] } },
  { name: "update_rsvp", description: "Add guests or update their RSVP status.", parametersJsonSchema: { type: "object", properties: {
    guests: { type: "array", items: { type: "object", properties: { name: str, status: { type: "string", enum: ["invited", "yes", "no", "maybe"] }, plusOnes: { type: "integer" } }, required: ["name", "status"] } } }, required: ["guests"] } },
  { name: "upsert_vendors", description: "Add vendor checklist items or shortlisted vendors. Use generic names like 'Caterer (to find)' when no real vendor is known. Never invent real business names or phone numbers.", parametersJsonSchema: { type: "object", properties: {
    vendors: { type: "array", items: { type: "object", properties: { category: str, name: str, status: { type: "string", enum: ["todo", "shortlisted", "booked"] }, quote: num, notes: str }, required: ["category", "name", "status"] } } }, required: ["vendors"] } },
  { name: "add_ideas", description: "Add personalized theme, decor, food or activity ideas.", parametersJsonSchema: { type: "object", properties: {
    ideas: { type: "array", items: { type: "object", properties: { title: str, detail: str }, required: ["title", "detail"] } } }, required: ["ideas"] } },
];

export const systemPrompt = (today: string) => `You are Community Event Copilot, a planning assistant for Indian weddings, birthdays and community events (college fests, society pujas, meetups).
Today is ${today}. Amounts are in INR unless the user says otherwise.
Always keep the plan in sync by calling tools: set_event for new events, set_budget for budget splits, add_tasks for a timeline (work backwards from the event date), upsert_vendors for a vendor checklist, add_ideas for themes, update_rsvp for guests, log_expense for spends.
For a fresh event request, do all of these in one turn: set_event, set_budget, add_tasks (8 to 15 tasks), upsert_vendors, add_ideas (3 to 5).
If key details are missing, assume sensible defaults and say what you assumed. If a tool returns an error, fix the arguments and retry.
Reply in the user's language: Hindi (Devanagari) if they write in Hindi or Hinglish asks for Hindi, else English. Keep replies short: a few bullets, mention any over-budget alerts clearly.
Never invent real vendor names, phone numbers or prices quoted as facts; give estimates as ranges.`;
