import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), resolveShop: vi.fn(), add: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/services/chat-interested-product.service", () => ({ addInterestedProduct: m.add }));

import { POST } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const PROD = "33333333-3333-4333-8333-333333333333";
const ctx = (id = CONV) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) =>
  new Request("http://x/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }) as any;
const NO_STORE = "private, no-store, max-age=0, must-revalidate";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
});

describe("POST", () => {
  it("401 / 400 id / 404 ห้องร้านอื่น", async () => {
    m.session.mockResolvedValueOnce(null);
    expect((await POST(req({ productId: PROD }), ctx())).status).toBe(401);
    const r = await POST(req({ productId: PROD }), ctx("bad"));
    expect(r.status).toBe(400);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    m.resolveShop.mockResolvedValue(null);
    const r3 = await POST(req({ productId: PROD }), ctx());
    expect(r3.status).toBe(404);
    expect(r3.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.add).not.toHaveBeenCalled();
  });
  it("201 ส่งต่อ selections", async () => {
    m.add.mockResolvedValueOnce({ ok: true, item: { id: "i1" } });
    const sel = [{ key: "สี", value: "ครีม" }];
    const r = await POST(req({ productId: PROD, selections: sel }), ctx());
    expect(r.status).toBe(201);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.add).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, userId: "u1", productId: PROD, selections: sel });
  });
  it.each([
    ["NOT_FOUND", 404],
    ["PRODUCT_NOT_FOUND", 404],
    ["DUPLICATE", 409],
    ["LIMIT_REACHED", 422],
    ["INVALID_OPTION", 422],
  ])("%s → %i", async (code, status) => {
    m.add.mockResolvedValueOnce({ ok: false, code });
    const r = await POST(req({ productId: PROD }), ctx());
    expect(r.status).toBe(status);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
  });
  it("body ผิด/เกิน 400", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ key: `k${i}`, value: "v" }));
    for (const b of [
      undefined,
      {},
      { productId: "x" },
      { productId: PROD, selections: many },
      { productId: PROD, selections: [{ key: "k".repeat(51), value: "v" }] },
      { productId: PROD, selections: [{ key: "k", value: "v".repeat(81) }] },
    ]) {
      const r = await POST(req(b), ctx());
      expect(r.status).toBe(400);
      expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    }
    expect(m.add).not.toHaveBeenCalled();
  });
  it("throw → 500 log เฉพาะชื่อชนิด", async () => {
    m.add.mockRejectedValueOnce(Object.assign(new Error("ลับ"), { name: "PrismaClientKnownRequestError" }));
    const r = await POST(req({ productId: PROD }), ctx());
    expect(r.status).toBe(500);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("ลับ");
  });
});
