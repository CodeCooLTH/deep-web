import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  resolveShop: vi.fn(),
  findConv: vi.fn(),
  rate: vi.fn(),
  request: vi.fn(),
  latest: vi.fn(),
  feedback: vi.fn(),
  provider: vi.fn(() => "typhoon"),
  memory: vi.fn(),
  afterFn: vi.fn(),
}));

vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  // นอก request scope after() throw → จับ callback แล้วรันเอง (ไม่ทิ้งเหมือน precedent) เพื่อพิสูจน์ว่า error ไม่รั่ว
  after: (cb: () => unknown) => m.afterFn(cb),
}));
vi.mock("@/lib/reply-suggest-provider", () => ({ resolveSuggestProvider: m.provider }));
vi.mock("@/services/chat-memory-ai.service", () => ({ maybeUpdateMemory: m.memory }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { conversation: { findFirst: m.findConv } } }));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/lib/api-rate-limit", () => ({ checkApiRateLimit: m.rate }));
vi.mock("@/services/ai-suggest-auto.service", () => ({
  requestAutoSuggest: m.request,
  getLatestAutoSuggest: m.latest,
  submitAutoSuggestFeedback: m.feedback,
}));

import { POST, GET, PATCH } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const ANCHOR = "22222222-2222-4222-8222-222222222222";
const ctx = (id = CONV) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new Request("http://x/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }) as any;
const NO_STORE = "private, no-store, max-age=0, must-revalidate";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1", name: "แอดมิน" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
  m.findConv.mockResolvedValue({ id: CONV });
  m.rate.mockReturnValue(true);
  m.provider.mockReturnValue("typhoon");
  m.memory.mockResolvedValue({ outcome: "OK" });
});

describe("auth / param / ownership", () => {
  it("401 ไม่มี session และ session ไม่มี id", async () => {
    m.session.mockResolvedValueOnce(null);
    expect((await POST(req({ anchorMessageId: ANCHOR, manual: false }), ctx())).status).toBe(401);
    m.session.mockResolvedValueOnce({ user: { name: "x" } });
    expect((await GET(req(), ctx())).status).toBe(401);
    m.session.mockResolvedValueOnce(null);
    expect((await PATCH(req({}), ctx())).status).toBe(401);
  });

  it("400 id ไม่ใช่ uuid", async () => {
    expect((await POST(req({ anchorMessageId: ANCHOR, manual: false }), ctx("bad"))).status).toBe(400);
    expect((await GET(req(), ctx("bad"))).status).toBe(400);
  });

  it("404 ห้องร้านอื่น (resolve null หรือ findFirst null)", async () => {
    m.resolveShop.mockResolvedValueOnce(null);
    expect((await GET(req(), ctx())).status).toBe(404);
    m.findConv.mockResolvedValueOnce(null);
    const r = await POST(req({ anchorMessageId: ANCHOR, manual: false }), ctx());
    expect(r.status).toBe(404);
    expect(m.request).not.toHaveBeenCalled();
    expect(m.findConv).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CONV, shopId: "s1" } }));
  });
});

describe("POST", () => {
  const body = { anchorMessageId: ANCHOR, manual: false };

  it("400 body ผิด", async () => {
    for (const b of [undefined, {}, { anchorMessageId: "x", manual: false }, { anchorMessageId: ANCHOR }, { ...body, trigger: "MANUAL" }]) {
      expect((await POST(req(b), ctx())).status).toBe(400);
    }
  });

  it.each([
    [{ status: "READY", anchorMessageId: ANCHOR, attempt: 1, suggestion: "ค่ะ", feedback: null }],
    [{ status: "THINKING", anchorMessageId: ANCHOR, attempt: 1 }],
    [{ status: "NONE", anchorMessageId: ANCHOR, attempt: null, reason: "SKIPPED_BOT" }],
  ])("ส่งต่อผล service %j + no-store", async (state) => {
    m.request.mockResolvedValueOnce(state);
    const r = await POST(req(body), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(state);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
  });

  it("INVALID_ANCHOR -> 400", async () => {
    m.request.mockResolvedValueOnce({ status: "INVALID_ANCHOR" });
    expect((await POST(req(body), ctx())).status).toBe(400);
  });

  it("trigger map: manual->MANUAL, auto default, auto ระบุ trigger", async () => {
    m.request.mockResolvedValue({ status: "THINKING", anchorMessageId: ANCHOR, attempt: 1 });
    await POST(req({ ...body, manual: true, trigger: "AUTO_OPEN" }), ctx());
    await POST(req(body), ctx());
    await POST(req({ ...body, trigger: "AUTO_OPEN" }), ctx());
    const t = m.request.mock.calls.map((c) => c[0].trigger);
    expect(t).toEqual(["MANUAL", "AUTO_NEW_MESSAGE", "AUTO_OPEN"]);
    expect(m.request.mock.calls[0][0]).toMatchObject({ shopId: "s1", conversationId: CONV, userId: "u1", userDisplayName: "แอดมิน" });
  });

  it("rate limit เฉพาะ manual -> 429 + Retry-After", async () => {
    m.rate.mockReturnValue(false);
    m.request.mockResolvedValue({ status: "THINKING", anchorMessageId: ANCHOR, attempt: 1 });
    const r = await POST(req({ ...body, manual: true }), ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(m.rate).toHaveBeenCalledWith("ai-suggest:u1", 15, 60_000);
    expect((await POST(req(body), ctx())).status).toBe(200); // auto ไม่ผ่าน limiter
  });

  it("service throw -> 200 NONE ERROR", async () => {
    m.request.mockRejectedValueOnce(new Error("db down"));
    const r = await POST(req(body), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "NONE", anchorMessageId: ANCHOR, attempt: null, reason: "ERROR" });
  });
});

describe("GET", () => {
  it("ส่งต่อ service โดยไม่เรียก requestAutoSuggest", async () => {
    const state = { status: "NONE", anchorMessageId: null, attempt: null, reason: "NO_RUN", provider: "typhoon" };
    m.latest.mockResolvedValueOnce(state);
    const r = await GET(req(), ctx());
    expect(await r.json()).toEqual(state);
    expect(m.latest).toHaveBeenCalledWith("s1", CONV);
    expect(m.request).not.toHaveBeenCalled();
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
  });

  it("throw -> 200 NONE ERROR provider none", async () => {
    m.latest.mockRejectedValueOnce(new Error("x"));
    const r = await GET(req(), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "NONE", anchorMessageId: null, attempt: null, reason: "ERROR", provider: "none" });
  });
});

describe("PATCH", () => {
  const ok = { anchorMessageId: ANCHOR, attempt: 1, feedback: "DOWN", reason: "BAD_TONE", note: "x" };

  it("400 body ผิด: reason นอกรายการ / note 121 ตัว / attempt 0 / feedback ผิด", async () => {
    for (const b of [
      { ...ok, reason: "OTHER" },
      { ...ok, note: "ก".repeat(121) },
      { ...ok, attempt: 0 },
      { ...ok, attempt: 1.5 },
      { ...ok, feedback: "MEH" },
      undefined,
    ]) {
      expect((await PATCH(req(b), ctx())).status).toBe(400);
    }
    expect(m.feedback).not.toHaveBeenCalled();
  });

  it("note 120 ตัวผ่าน + ok -> 200 {ok:true}", async () => {
    m.feedback.mockResolvedValueOnce({ ok: true });
    const r = await PATCH(req({ ...ok, note: "ก".repeat(120) }), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(m.feedback).toHaveBeenCalledWith(expect.objectContaining({ shopId: "s1", conversationId: CONV }));
  });

  it("ok:false -> 404, throw -> 500", async () => {
    m.feedback.mockResolvedValueOnce({ ok: false });
    expect((await PATCH(req(ok), ctx())).status).toBe(404);
    m.feedback.mockRejectedValueOnce(new Error("x"));
    expect((await PATCH(req(ok), ctx())).status).toBe(500);
  });

  it("404 ห้องร้านอื่น", async () => {
    m.findConv.mockResolvedValueOnce(null);
    expect((await PATCH(req(ok), ctx())).status).toBe(404);
    expect(m.feedback).not.toHaveBeenCalled();
  });
});

describe("POST -> after() อัปเดตความจำ", () => {
  const body = { anchorMessageId: ANCHOR, manual: false };
  const READY = { status: "READY", anchorMessageId: ANCHOR, attempt: 1, suggestion: "ค่ะ", feedback: null };

  it("READY + typhoon -> เรียก maybeUpdateMemory ผ่าน after() ด้วย anchor", async () => {
    m.request.mockResolvedValueOnce(READY);
    const r = await POST(req(body), ctx());
    expect(r.status).toBe(200);
    expect(m.afterFn).toHaveBeenCalledTimes(1);
    await m.afterFn.mock.calls[0][0]();
    expect(m.memory).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, latestMessageId: ANCHOR });
  });

  it("callback กลืน error ของงานความจำ (ไม่รั่ว)", async () => {
    m.request.mockResolvedValueOnce(READY);
    m.memory.mockRejectedValueOnce(new Error("boom"));
    await POST(req(body), ctx());
    await expect(Promise.resolve(m.afterFn.mock.calls[0][0]())).resolves.toBeUndefined();
  });

  it.each([
    ["THINKING", { status: "THINKING", anchorMessageId: ANCHOR, attempt: 1 }, "typhoon"],
    ["NONE", { status: "NONE", anchorMessageId: ANCHOR, attempt: 1, reason: "ERROR" }, "typhoon"],
    ["READY แต่ร้านไม่ใช่ typhoon", READY, "gemini"],
  ])("%s -> ไม่ตั้ง after()", async (_n, state, prov) => {
    m.provider.mockReturnValue(prov);
    m.request.mockResolvedValueOnce(state);
    expect((await POST(req(body), ctx())).status).toBe(200);
    expect(m.afterFn).not.toHaveBeenCalled();
  });

  it("after() throw (นอก request scope) -> คำตอบยังเป็น 200 READY", async () => {
    m.request.mockResolvedValueOnce(READY);
    m.afterFn.mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    const r = await POST(req(body), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(READY);
  });
});
