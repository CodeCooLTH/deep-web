import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  resolveShop: vi.fn(),
  findConv: vi.fn(),
  findMsg: vi.fn(),
  rate: vi.fn(),
  provider: vi.fn(() => "typhoon"),
  update: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { conversation: { findFirst: m.findConv }, chatMessage: { findFirst: m.findMsg } } }));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/lib/api-rate-limit", () => ({ checkApiRateLimit: m.rate }));
vi.mock("@/lib/reply-suggest-provider", () => ({ resolveSuggestProvider: m.provider }));
vi.mock("@/services/chat-memory-ai.service", () => ({ maybeUpdateMemory: m.update }));

import { POST } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const ctx = (id = CONV) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://x/api", { method: "POST" }) as any;
const NO_STORE = "private, no-store, max-age=0, must-revalidate";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
  m.findConv.mockResolvedValue({ id: CONV });
  m.findMsg.mockResolvedValue({ id: "m9" });
  m.rate.mockReturnValue(true);
  m.provider.mockReturnValue("typhoon");
  m.update.mockResolvedValue({ outcome: "OK" });
});

describe("memory/refresh POST", () => {
  it("401 / 400 id ไม่ใช่ uuid / 404 ห้องร้านอื่น", async () => {
    m.session.mockResolvedValueOnce(null);
    expect((await POST(req(), ctx())).status).toBe(401);
    expect((await POST(req(), ctx("bad"))).status).toBe(400);
    m.resolveShop.mockResolvedValueOnce(null);
    expect((await POST(req(), ctx())).status).toBe(404);
    m.findConv.mockResolvedValueOnce(null);
    expect((await POST(req(), ctx())).status).toBe(404);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.findConv).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CONV, shopId: "s1" } }));
  });

  it("ร้านไม่ใช่ typhoon (gemini/none) -> 400 ไม่เรียก service", async () => {
    for (const p of ["gemini", "none"]) {
      m.provider.mockReturnValue(p);
      expect((await POST(req(), ctx())).status).toBe(400);
    }
    expect(m.update).not.toHaveBeenCalled();
  });

  it("เกิน 6/นาที -> 429 + Retry-After · key ผูก user", async () => {
    m.rate.mockReturnValue(false);
    const r = await POST(req(), ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(m.rate).toHaveBeenCalledWith("memory-refresh:u1", 6, 60_000);
    expect(m.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ outcome: "OK" }, { status: "UPDATED" }],
    [{ outcome: "NOT_APPLICABLE", busy: true }, { status: "THINKING" }],
    [{ outcome: "REJECTED_PII" }, { status: "NONE", reason: "REJECTED_PII" }],
    [{ outcome: "SUPERSEDED" }, { status: "NONE", reason: "SUPERSEDED" }],
    [{ outcome: "NOT_APPLICABLE" }, { status: "NONE" }],
  ])("service %j -> %j · force:true · no-store", async (res, expected) => {
    m.update.mockResolvedValueOnce(res);
    const r = await POST(req(), ctx());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(expected);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.update).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, latestMessageId: "m9", force: true });
  });

  it("ห้องไม่มีข้อความ -> NONE ไม่เรียก service · service throw -> 500", async () => {
    m.findMsg.mockResolvedValueOnce(null);
    expect(await (await POST(req(), ctx())).json()).toEqual({ status: "NONE" });
    expect(m.update).not.toHaveBeenCalled();
    m.update.mockRejectedValueOnce(new Error("x"));
    expect((await POST(req(), ctx())).status).toBe(500);
  });
});
