import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), resolveShop: vi.fn(), remove: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/chat-scope", () => ({ resolveConversationShopId: m.resolveShop }));
vi.mock("@/services/chat-interested-product.service", () => ({ removeInterestedProduct: m.remove }));

import { DELETE } from "./route";

const CONV = "11111111-1111-4111-8111-111111111111";
const ROW = "44444444-4444-4444-8444-444444444444";
const ctx = (id = CONV, rowId = ROW) => ({ params: Promise.resolve({ id, rowId }) });
const req = () => new Request("http://x/api", { method: "DELETE" }) as any;
const NO_STORE = "private, no-store, max-age=0, must-revalidate";

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  m.session.mockResolvedValue({ user: { id: "u1" } });
  m.resolveShop.mockResolvedValue({ shopId: "s1" });
});

describe("DELETE", () => {
  it("401 / 400 id / 400 rowId / 404 ห้องร้านอื่น", async () => {
    m.session.mockResolvedValueOnce(null);
    const r1 = await DELETE(req(), ctx());
    expect(r1.status).toBe(401);
    expect(r1.headers.get("Cache-Control")).toBe(NO_STORE);
    expect((await DELETE(req(), ctx("bad"))).status).toBe(400);
    const r3 = await DELETE(req(), ctx(CONV, "bad"));
    expect(r3.status).toBe(400);
    expect(r3.headers.get("Cache-Control")).toBe(NO_STORE);
    m.resolveShop.mockResolvedValue(null);
    expect((await DELETE(req(), ctx())).status).toBe(404);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("ok → 204 · ไม่พบ → 404", async () => {
    m.remove.mockResolvedValueOnce({ ok: true });
    const r = await DELETE(req(), ctx());
    expect(r.status).toBe(204);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(m.remove).toHaveBeenCalledWith({ shopId: "s1", conversationId: CONV, rowId: ROW });
    m.remove.mockResolvedValueOnce({ ok: false });
    const r2 = await DELETE(req(), ctx());
    expect(r2.status).toBe(404);
    expect(r2.headers.get("Cache-Control")).toBe(NO_STORE);
  });
  it("throw → 500 log เฉพาะชื่อชนิด", async () => {
    m.remove.mockRejectedValueOnce(Object.assign(new Error("ลับ"), { name: "PrismaClientKnownRequestError" }));
    const r = await DELETE(req(), ctx());
    expect(r.status).toBe(500);
    expect(r.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("ลับ");
  });
});
