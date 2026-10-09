import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), resolveShop: vi.fn(), panel: vi.fn(), save: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/services/chat-memory.service", () => ({ getMemoryPanel: m.panel, saveMemoryByAdmin: m.save }));

import { GET, PUT } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const ctx = (id = CONV) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new Request("http://x/api", { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }) as any;
const NO_STORE = "private, no-store, max-age=0, must-revalidate";
const ok = { text: "ชอบสีดำ", expectedVersion: 1 };

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
});

describe("auth / param / ownership", () => {
  it("401 / 400 / 404 ห้องร้านอื่น + header ครบ ไม่เรียก service", async () => {
    m.session.mockResolvedValueOnce(null);
    const r1 = await GET(req(), ctx());
    expect(r1.status).toBe(401);
    expect(r1.headers.get("Cache-Control")).toBe(NO_STORE);
    const r2 = await PUT(req(ok), ctx("bad"));
    expect(r2.status).toBe(400);
    expect(r2.headers.get("Cache-Control")).toBe(NO_STORE);
    m.resolveShop.mockResolvedValue(null);
    const r3 = await GET(req(), ctx());
    expect(r3.status).toBe(404);
    expect(r3.headers.get("Cache-Control")).toBe(NO_STORE);
    expect((await PUT(req(ok), ctx())).status).toBe(404);
    expect(m.panel).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("200 / null 404 / throw 500", async () => {
    m.panel.mockResolvedValueOnce({ memory: null });
    const r = await GET(req(), ctx());
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.panel).toHaveBeenCalledWith("s1", CONV);
    m.panel.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(404);
    m.panel.mockRejectedValueOnce(Object.assign(new Error("secret ชอบสีดำ"), { name: "PrismaClientKnownRequestError" }));
    const r5 = await GET(req(), ctx());
    expect(r5.status).toBe(500);
    expect(r5.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("ชอบสีดำ");
  });
});

describe("PUT", () => {
  it("200 ส่งต่อ userId/text/expectedVersion", async () => {
    m.save.mockResolvedValueOnce({ ok: true, memory: { text: "ชอบสีดำ", version: 2 } });
    const r = await PUT(req(ok), ctx());
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.save).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, userId: "u1", ...ok });
    m.save.mockResolvedValueOnce({ ok: true, memory: {} });
    expect((await PUT(req({ text: "x", expectedVersion: null }), ctx())).status).toBe(200);
  });
  it("service code → 404 / 400 / 409 + current", async () => {
    m.save.mockResolvedValueOnce({ ok: false, code: "NOT_FOUND" });
    expect((await PUT(req(ok), ctx())).status).toBe(404);
    m.save.mockResolvedValueOnce({ ok: false, code: "INVALID_TEXT" });
    expect((await PUT(req(ok), ctx())).status).toBe(400);
    const cur = { text: "a", version: 3, source: "AI", updatedAt: "2026-10-09T00:00:00.000Z" };
    m.save.mockResolvedValueOnce({ ok: false, code: "VERSION_CONFLICT", current: cur });
    const r = await PUT(req(ok), ctx());
    expect(r.status).toBe(409);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(await r.json()).toEqual({ error: "VERSION_CONFLICT", current: cur });
  });
  it("body ผิด/เกิน 400 ไม่เรียก service", async () => {
    for (const b of [
      undefined,
      { text: "x".repeat(1601), expectedVersion: 1 },
      { text: 1, expectedVersion: 1 },
      { text: "x", expectedVersion: 0 },
      { text: "x", expectedVersion: 1.5 },
      { text: "x" },
    ]) {
      const r = await PUT(req(b), ctx());
      expect(r.status).toBe(400);
      expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    }
    expect(m.save).not.toHaveBeenCalled();
  });
  it("throw → 500 log เฉพาะชื่อชนิด", async () => {
    m.save.mockRejectedValueOnce(Object.assign(new Error("เนื้อความลับ"), { name: "PrismaClientKnownRequestError" }));
    const r = await PUT(req(ok), ctx());
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" });
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("เนื้อความลับ");
  });
});
