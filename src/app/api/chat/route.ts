import { GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import { applyTool, planSchema, emptyPlan, type Plan } from "@/lib/plan";
import { functionDeclarations, systemPrompt } from "@/lib/tools";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Ordered fallback list: if one model is rate limited or slow, try the next.
const MODELS = (process.env.GEMINI_MODELS || "gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-3.5-flash").split(",").map((m) => m.trim()).filter(Boolean);
const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1).max(4000) })).min(1).max(40),
  plan: planSchema.optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(ip)) return Response.json({ error: "Too many requests, wait a minute." }, { status: 429 });
  const len = Number(req.headers.get("content-length") || 0);
  if (len > 300_000) return Response.json({ error: "Request too large" }, { status: 413 });

  let body: z.infer<typeof bodySchema>;
  try { body = bodySchema.parse(await req.json()); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (body.messages.at(-1)?.role !== "user") return Response.json({ error: "Last message must be from user" }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: "Server missing GEMINI_API_KEY" }, { status: 500 });

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let plan: Plan = (body.plan as Plan) ?? emptyPlan();
  const contents: Content[] = body.messages.slice(-20).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  // give the model the current state so it can edit, not recreate
  contents[contents.length - 1].parts!.push({ text: `\n\n[Current plan JSON]\n${JSON.stringify(plan).slice(0, 20000)}` });
  const toolLog: { name: string; ok: boolean }[] = [];

  try {
    for (let step = 0; step < 6; step++) {
      const res = await generate(ai, contents);
      const calls = res.functionCalls ?? [];
      const modelContent = res.candidates?.[0]?.content;
      if (!calls.length) return Response.json({ reply: res.text ?? "", plan, tools: toolLog });
      if (modelContent) contents.push(modelContent);
      const parts = calls.map((c) => {
        const out = applyTool(plan, c.name ?? "", c.args);
        plan = out.plan;
        toolLog.push({ name: c.name ?? "", ok: !("error" in out.result) });
        return { functionResponse: { id: c.id, name: c.name, response: out.result } };
      });
      contents.push({ role: "user", parts });
    }
    return Response.json({ reply: "I updated the plan. Ask me to refine any part.", plan, tools: toolLog });
  } catch (e) {
    console.error("gemini error", (e as Error).message);
    return Response.json({ error: "The AI service failed, try again.", plan, tools: toolLog }, { status: 502 });
  }
}

let preferred = 0;
async function generate(ai: GoogleGenAI, contents: Content[]) {
  let lastErr: unknown;
  for (let i = 0; i < MODELS.length; i++) {
    const idx = (preferred + i) % MODELS.length;
    try {
      const res = await ai.models.generateContent({
        model: MODELS[idx], contents,
        config: { systemInstruction: systemPrompt(new Date().toISOString().slice(0, 10)), tools: [{ functionDeclarations }], temperature: 0.6, httpOptions: { timeout: 25_000 } },
      });
      preferred = idx;
      return res;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
