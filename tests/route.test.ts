import { describe, it, expect } from "vitest";
import { POST } from "../src/app/api/chat/route";

const req = (body: unknown, ip = "1.1.1.1") => new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("/api/chat validation", () => {
  it("rejects malformed JSON", async () => { expect((await POST(req("{oops", "2.2.2.2"))).status).toBe(400); });
  it("rejects empty messages", async () => { expect((await POST(req({ messages: [] }, "3.3.3.3"))).status).toBe(400); });
  it("rejects oversized message text", async () => { expect((await POST(req({ messages: [{ role: "user", text: "a".repeat(5000) }] }, "4.4.4.4"))).status).toBe(400); });
  it("rejects when last message is not from the user", async () => { expect((await POST(req({ messages: [{ role: "model", text: "hi" }] }, "5.5.5.5"))).status).toBe(400); });
  it("rate limits a noisy client", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) codes.push((await POST(req({ messages: [] }, "9.9.9.9"))).status);
    expect(codes.at(-1)).toBe(429);
  });
});
