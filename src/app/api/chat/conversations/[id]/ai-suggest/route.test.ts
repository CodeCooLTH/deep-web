import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { GeminiApiError } from "@/lib/gemini";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  resolveShop: vi.fn(),
  rate: vi.fn(),
  findConv: vi.fn(),
  findShop: vi.fn(),
  findMsgs: vi.fn(),
  findLatest: vi.fn(),
  findUsers: vi.fn(),
  provider: vi.fn(),
  draft: vi.fn(),
  request: vi.fn(),
  crm: vi.fn(),
  paid: vi.fn(),
  claim: vi.fn(),
  refundFree: vi.fn(),
  remaining: vi.fn(),
  logEvent: vi.fn(),
  refundEvent: vi.fn(),
  deduct: vi.fn(),
  credit: vi.fn(),
  balance: vi.fn(),
  setting: vi.fn(),
  getFile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findFirst: m.findConv },
    shop: { findUnique: m.findShop },
    chatMessage: { findMany: m.findMsgs, findFirst: m.findLatest },
    user: { findMany: m.findUsers },
  },
}));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/lib/api-rate-limit", () => ({ checkApiRateLimit: m.rate }));
vi.mock("@/lib/reply-suggest-provider", () => ({
  resolveSuggestProvider: m.provider,
  draftReplySuggestions: m.draft,
}));
vi.mock("@/services/ai-suggest-auto.service", () => ({ requestAutoSuggest: m.request }));
vi.mock("@/services/chat-crm.service", () => ({ getConversationCrm: m.crm }));
vi.mock("@/services/ai-setting.service", () => ({
  getAiSetting: vi.fn().mockResolvedValue({}),
  getEffectiveAiSetting: m.setting,
}));
vi.mock("@/services/ai-context.service", () => ({
  resolveProductCards: vi.fn().mockResolvedValue(new Map()),
  buildProductBlock: vi.fn().mockResolvedValue(""),
  buildCustomerBlock: vi.fn().mockResolvedValue(""),
  composeContextBlock: () => "",
}));
vi.mock("@/services/ai-suggest-quota.service", () => ({
  isOwnerPaidPlan: m.paid,
  claimFreeUsageOrFail: m.claim,
  refundFreeUsage: m.refundFree,
  getFreeRemainingAfterClaim: m.remaining,
  logUsageEvent: m.logEvent,
  refundUsageEvent: m.refundEvent,
}));
vi.mock("@/services/wallet.service", () => ({
  deductCredit: m.deduct,
  creditWallet: m.credit,
  getBalance: m.balance,
}));
vi.mock("@/lib/storage", () => ({ getFile: m.getFile }));
const mem = vi.hoisted(() => ({ loadPromptMemory: vi.fn() }));
vi.mock("@/services/chat-memory.service", () => mem);

import { POST } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: CONV }) };
const req = (body: unknown = {}) => new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1", name: "สมศักดิ์ แอดมิน" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
  m.rate.mockReturnValue(true);
  m.findConv.mockResolvedValue({ id: CONV, buyerUserId: null, externalContactId: null });
  m.findShop.mockResolvedValue({ shopName: "ร้านทดสอบ", vertical: "ONLINE_SALES" });
  m.provider.mockReturnValue("gemini");
  m.setting.mockReturnValue({ includeProductContext: false, includeCustomerContext: false, includeMediaContext: false, instruction: "" });
  m.paid.mockResolvedValue(false);
  m.claim.mockResolvedValue(true);
  m.remaining.mockResolvedValue(9);
  m.crm.mockResolvedValue({
    alias: "คุณสมชาย ใจดี",
    realName: null,
    note: "ลูกค้าเบอร์ 081-234-5678 โอนแล้ว",
    phones: ["0891112222"],
    address: "99/9 ถ.สุขุมวิท",
  });
  m.findUsers.mockResolvedValue([]);
  m.findMsgs.mockResolvedValue([
    { senderRole: "BUYER", type: "TEXT", body: "ส่งที่ 12 ถ.ลาดพร้าว กรุงเทพ 10310 โทร 0812345678 อีเมล a@b.com", productRefId: null, imageUrl: null, senderUserId: null },
    { senderRole: "SHOP", type: "TEXT", body: "ได้ค่ะ คุณสมชาย", productRefId: null, imageUrl: null, senderUserId: null },
    { senderRole: "BUYER", type: "TEXT", body: "ขอบคุณครับ", productRefId: null, imageUrl: null, senderUserId: null },
  ].reverse());
  mem.loadPromptMemory.mockResolvedValue({ memory: null, products: [] });
  m.draft.mockResolvedValue({ suggestions: ["รับทราบค่ะ"], usage: null, model: "g", latencyMs: 1 });
});

describe("สาขา Gemini (S-13)", () => {
  it("payload ที่ไป Gemini ไม่มี PII ดิบ และ restore คืนค่าจริง", async () => {
    // โมเดลสะท้อนป้ายกลับมา — ต้อง restore เป็นเบอร์จริง
    m.draft.mockImplementationOnce(async (_p: string, turns: { text: string }[]) => {
      const tok = turns[0]!.text.match(/\[[^\]]*#\d+\]/)?.[0] ?? "";
      return { suggestions: [`ยืนยัน ${tok}`], usage: null, model: "g", latencyMs: 1 };
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const [provider, turns, c] = m.draft.mock.calls[0]!;
    expect(provider).toBe("gemini");
    const sent = JSON.stringify({ turns, c });
    for (const raw of ["0812345678", "a@b.com", "10310", "0891112222", "99/9", "081-234-5678", "สมชาย", "สมศักดิ์"]) {
      expect(sent).not.toContain(raw);
    }
    expect(c.customerNote).not.toContain("081");
    expect(c.customerName).toBeNull();
    const body = await res.json();
    expect(body.suggestions[0]).not.toMatch(/#\d+\]/);
    expect(body.usedCredit).toBe(false);
    expect(body.freeRemaining).toBe(9);
    expect(m.logEvent).toHaveBeenCalledTimes(1);
  });

  it("ป้ายไม่รู้จัก = ตัดข้อนั้นทิ้ง; เหลือ 0 ข้อ = 502 + คืนโควตา", async () => {
    m.draft.mockResolvedValueOnce({ suggestions: ["โอนมาที่ [เลขบัญชี#99]"], usage: null, model: "g", latencyMs: 1 });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(502);
    expect(m.refundFree).toHaveBeenCalledTimes(1);
    expect(m.logEvent).not.toHaveBeenCalled();
  });

  it("ครั้งที่ 11 (claim ล้ม ไม่ confirm) → 402 QUOTA_EXCEEDED ไม่เรียก Gemini", async () => {
    m.claim.mockResolvedValue(false);
    m.balance.mockResolvedValue(5);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("QUOTA_EXCEEDED");
    expect(m.draft).not.toHaveBeenCalled();
  });

  it("SanitizeError → 500 + refund โดยไม่เรียก Gemini", async () => {
    // บังคับให้ sanitize พัง: instruction ไม่ใช่ string ผ่าน crm ไม่ได้ → ใช้ vertical? ใช้ shopName เป็น object
    m.findShop.mockResolvedValue({ shopName: { bad: 1 }, vertical: "ONLINE_SALES" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect(m.draft).not.toHaveBeenCalled();
    expect(m.refundFree).toHaveBeenCalledTimes(1);
  });
});

describe("สาขา Gemini — ความจำ + สินค้าที่แปะ (00019-ext-mem U10)", () => {
  const on = { includeProductContext: true, includeCustomerContext: true, includeMediaContext: false, instruction: "" };
  const MEM = { text: "ใส่ไซส์ L ชอบสีครีม", updatedDay: "2026-10-08" };
  const PROD = { name: "D21", optionLabel: "สี ครีม · ขนาด L", state: "ACTIVE", price: "450.00", stockQty: 3 };

  it("ต่อท้าย contextBlock ใต้หัวข้อของตัวเอง + ส่งสวิตช์ให้ตัวอ่าน", async () => {
    m.setting.mockReturnValue(on);
    mem.loadPromptMemory.mockResolvedValue({ memory: MEM, products: [PROD] });
    expect((await POST(req(), ctx)).status).toBe(200);
    expect(mem.loadPromptMemory).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, includeMemory: true, includeProducts: true });
    const block: string = m.draft.mock.calls[0]![2].contextBlock;
    expect(block).toMatch(/=== ความจำเกี่ยวกับลูกค้า[\s\S]*ใส่ไซส์ L ชอบสีครีม[\s\S]*=== จบความจำ ===/);
    expect(block).toContain("- D21 · สี ครีม · ขนาด L — 450.00 บาท (คงเหลือ 3 ชิ้น)");
  });

  it("ห้องว่าง → ไม่มีหัวข้อ · สวิตช์ปิดถูกส่งต่อเป็น includeX=false", async () => {
    m.setting.mockReturnValue({ ...on, includeCustomerContext: false });
    await POST(req(), ctx);
    expect(mem.loadPromptMemory).toHaveBeenCalledWith(expect.objectContaining({ includeMemory: false, includeProducts: true }));
    expect(m.draft.mock.calls[0]![2].contextBlock).not.toContain("===");
  });

  it("loadPromptMemory throw → ยังตอบ 200", async () => {
    mem.loadPromptMemory.mockRejectedValue(new Error("boom"));
    expect((await POST(req(), ctx)).status).toBe(200);
  });
});

describe("สาขา Gemini — media retry / credit / paid plan", () => {
  const withImage = () => {
    m.setting.mockReturnValue({ includeProductContext: false, includeCustomerContext: false, includeMediaContext: true, instruction: "" });
    m.getFile.mockResolvedValue({ ext: "jpg", buffer: Buffer.from("x") });
    m.findMsgs.mockResolvedValue([
      { senderRole: "BUYER", type: "IMAGE", body: "", productRefId: null, imageUrl: "f1", senderUserId: null },
      { senderRole: "BUYER", type: "TEXT", body: "ราคาเท่าไหร่", productRefId: null, imageUrl: null, senderUserId: null },
    ]);
  };

  it("ส่งไฟล์แนบล้ม แต่ retry ข้อความล้วนสำเร็จ → mediaSkipped:true ไม่ refund", async () => {
    withImage();
    m.draft.mockRejectedValueOnce(new GeminiApiError("bad media"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).mediaSkipped).toBe(true);
    expect(m.draft).toHaveBeenCalledTimes(2);
    expect(m.refundFree).not.toHaveBeenCalled();
    expect(m.logEvent).toHaveBeenCalledTimes(1);
  });

  it("retry ก็ล้ม → 502 + refund ครั้งเดียว", async () => {
    withImage();
    m.draft.mockRejectedValue(new GeminiApiError("down"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(502);
    expect(m.draft).toHaveBeenCalledTimes(2);
    expect(m.refundFree).toHaveBeenCalledTimes(1);
    expect(m.logEvent).not.toHaveBeenCalled();
  });

  it("เกินโควตา + confirmUseCredit → deductCredit ฿1 และ usedCredit:true", async () => {
    m.claim.mockResolvedValue(false);
    const res = await POST(req({ confirmUseCredit: true }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).usedCredit).toBe(true);
    expect(m.deduct).toHaveBeenCalledTimes(1);
    expect(m.deduct.mock.calls[0]![1]).toBe(1);
  });

  it("credit path แล้ว Gemini ล้ม → creditWallet คืน ฿1 ครั้งเดียว ไม่แตะโควตาฟรี", async () => {
    m.claim.mockResolvedValue(false);
    m.draft.mockRejectedValue(new GeminiApiError("down"));
    const res = await POST(req({ confirmUseCredit: true }), ctx);
    expect(res.status).toBe(502);
    expect(m.credit).toHaveBeenCalledTimes(1);
    expect(m.credit.mock.calls[0]![1]).toBe(1);
    expect(m.refundFree).not.toHaveBeenCalled();
    expect(m.refundEvent).toHaveBeenCalledTimes(1);
  });

  it("เครดิตไม่พอ → 402 INSUFFICIENT_CREDIT ไม่เรียก Gemini", async () => {
    m.claim.mockResolvedValue(false);
    m.balance.mockResolvedValue(0);
    m.deduct.mockRejectedValue(new Error("INSUFFICIENT_CREDIT"));
    const res = await POST(req({ confirmUseCredit: true }), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("INSUFFICIENT_CREDIT");
    expect(m.draft).not.toHaveBeenCalled();
    expect(m.credit).not.toHaveBeenCalled();
  });

  it("แพ็กเกจจ่ายเงิน → ข้ามโควตา ไม่เรียก claim และล้มก็ไม่ refund", async () => {
    m.paid.mockResolvedValue(true);
    expect((await POST(req(), ctx)).status).toBe(200);
    expect(m.claim).not.toHaveBeenCalled();
    m.draft.mockRejectedValue(new GeminiApiError("down"));
    expect((await POST(req(), ctx)).status).toBe(502);
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.refundFree).not.toHaveBeenCalled();
    expect(m.credit).not.toHaveBeenCalled();
  });
});

describe("สาขา Typhoon (S-12)", () => {
  beforeEach(() => {
    m.provider.mockReturnValue("typhoon");
    m.findLatest.mockResolvedValue({ id: "m9", senderRole: "BUYER" });
  });

  it("READY → 200 ไม่แตะโควตา/เครดิต/usage event", async () => {
    m.request.mockResolvedValue({ status: "READY", anchorMessageId: "m9", attempt: 1, suggestion: "ได้ค่ะ", feedback: null });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: ["ได้ค่ะ"], usedCredit: false, freeRemaining: null, cost: null });
    expect(m.request).toHaveBeenCalledWith(expect.objectContaining({ anchorMessageId: "m9", manual: true, trigger: "MANUAL", shopId: "s1" }));
    for (const f of [m.paid, m.claim, m.deduct, m.logEvent, m.draft]) expect(f).not.toHaveBeenCalled();
  });

  it("ข้อความล่าสุดเป็น SHOP → 400", async () => {
    m.findLatest.mockResolvedValue({ id: "m9", senderRole: "SHOP" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(400);
    expect(m.request).not.toHaveBeenCalled();
  });

  it("provider none → service NOT_CONFIGURED → 503", async () => {
    m.provider.mockReturnValue("none");
    m.request.mockResolvedValue({ status: "NONE", anchorMessageId: "m9", attempt: 1, reason: "NOT_CONFIGURED" });
    expect((await POST(req(), ctx)).status).toBe(503);
    expect(m.claim).not.toHaveBeenCalled();
  });

  it.each([
    ["RATE_LIMITED", 429],
    ["TIMEOUT", 502],
    ["ERROR", 502],
    ["UNRESOLVED_TOKEN", 502],
  ])("NONE %s → %i", async (reason, status) => {
    m.request.mockResolvedValue({ status: "NONE", anchorMessageId: "m9", attempt: 1, reason });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(status);
    if (status === 429) expect(res.headers.get("Retry-After")).toBe("5");
    expect(JSON.stringify(await res.json())).not.toContain("detail");
  });

  it("STALE_ANCHOR → 409 มีข้อความใหม่", async () => {
    m.request.mockResolvedValue({ status: "NONE", anchorMessageId: "m9", attempt: 1, reason: "STALE_ANCHOR" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("มีข้อความใหม่เข้ามา ลองอีกครั้ง");
  });

  it("THINKING → 409 · INVALID_ANCHOR → 400", async () => {
    m.request.mockResolvedValueOnce({ status: "THINKING", anchorMessageId: "m9", attempt: 1 });
    expect((await POST(req(), ctx)).status).toBe(409);
    m.request.mockResolvedValueOnce({ status: "INVALID_ANCHOR" });
    expect((await POST(req(), ctx)).status).toBe(400);
  });
});
