// feature 00084 T8a — route ฝั่งร้าน Flash: ด่านสิทธิ์ · OWNER-only · validation · แมป error · ไม่รั่ว key
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { FlashError, FlashServiceError } from "@/lib/flash/errors";

const KEY = "SECRETKEY-1234567890-abcdefXYZ";

const { guardMock, svc, resolveOrderIdByToken } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  resolveOrderIdByToken: vi.fn(),
  svc: {
    getFlashConnection: vi.fn(), connectFlash: vi.fn(), disconnectFlash: vi.fn(), verifyFlash: vi.fn(),
    getFlashSettings: vi.fn(), updateFlashSettings: vi.fn(), syncFlashWebhooks: vi.fn(),
    getFlashPanelOrReason: vi.fn(), estimateFlashPrice: vi.fn(),
  },
}));
vi.mock("@/lib/shop-api-guard", () => ({ requireGeneralShop: (o: unknown) => guardMock(o) }));
vi.mock("@/services/flash.service", () => svc);
vi.mock("@/services/iship.service", async (orig) => ({ ...(await orig<object>()), resolveOrderIdByToken }));

import * as connection from "../connection/route";
import * as verify from "../connection/verify/route";
import * as settings from "../settings/route";
import * as sync from "../webhook/sync/route";
import * as ctx from "../order-context/route";
import * as price from "../price/route";

const ok = (roles: string[]) => ({ shopId: "shop1", userId: "u1", role: "OWNER", roles, effRoles: roles });
const owner = ok(["OWNER"]);
const manager = ok(["MANAGER"]);
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://x.test${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue(owner);
});

type Call = [string, (r: NextRequest) => Promise<Response>, NextRequest, string, boolean];
const calls: Call[] = [
  ["connection GET", connection.GET, req("/c?shopId=s9"), "S1", false],
  ["connection POST", connection.POST, req("/c?shopId=s9", "POST", { mchId: "AB1234", secretKey: KEY }), "S2", true],
  ["connection DELETE", connection.DELETE, req("/c?shopId=s9", "DELETE"), "S2", true],
  ["verify POST", verify.POST, req("/c?shopId=s9", "POST"), "S2", false],
  ["settings GET", settings.GET, req("/c?shopId=s9"), "S1", false],
  ["settings PUT", settings.PUT, req("/c?shopId=s9", "PUT", { createMode: "ASK" }), "S2", true],
  ["sync POST", sync.POST, req("/c?shopId=s9", "POST", {}), "S2", true],
  ["order-context GET", ctx.GET, req("/c?shopId=s9&orderId=o1"), "S1", false],
  ["price POST", price.POST, req("/c?shopId=s9", "POST", {}), "S1", false],
];

describe("ด่าน guard", () => {
  it.each(calls)("%s ส่ง cap + shopId จาก query เสมอ", async (_n, h, r, cap) => {
    guardMock.mockResolvedValue({ error: NextResponse.json({ error: "x" }, { status: 403 }) });
    expect((await h(r)).status).toBe(403);
    expect(guardMock).toHaveBeenCalledWith({ cap, shopId: "s9" });
    expect(Object.values(svc).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it.each(calls.filter((c) => c[4]))("%s: MANAGER ถูกปฏิเสธ 403 FORBIDDEN_ROLE ก่อนแตะ service", async (_n, h, r) => {
    guardMock.mockResolvedValue(manager);
    const res = await json(await h(r));
    expect(res).toEqual({ status: 403, body: { error: "FORBIDDEN_ROLE" } });
    expect(Object.values(svc).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("ร้านไม่ใช่ ONLINE_SALES → guard คืน 403 NOT_ELIGIBLE ผ่านตรง ๆ", async () => {
    guardMock.mockResolvedValue({ error: NextResponse.json({ error: { code: "NOT_ELIGIBLE" } }, { status: 403 }) });
    expect(await json(await connection.GET(req("/c")))).toEqual({ status: 403, body: { error: { code: "NOT_ELIGIBLE" } } });
  });

  it("ไม่ส่ง shopId → undefined (ใช้ร้าน active)", async () => {
    svc.getFlashConnection.mockResolvedValue({ available: true });
    await connection.GET(req("/c"));
    expect(guardMock).toHaveBeenCalledWith({ cap: "S1", shopId: undefined });
  });
});

describe("M1 throttle key ผิดซ้ำ", () => {
  const body = { mchId: "AB1234", secretKey: KEY };
  it("ล้ม 1001 ครบ 5 ครั้ง → POST/verify ถัดไป 429 RATE_LIMITED ไม่ยิง service · ล้มแบบ timeout ไม่นับ", async () => {
    guardMock.mockResolvedValue({ ...owner, userId: "u-rl", shopId: "shop-rl" });
    svc.connectFlash.mockRejectedValue(new FlashError("UPSTREAM_TIMEOUT"));
    for (let i = 0; i < 6; i++) expect((await connection.POST(req("/c", "POST", body))).status).toBe(504);
    svc.connectFlash.mockRejectedValue(new FlashError("MERCHANT_NOT_FOUND", { flashCode: 1001 }));
    for (let i = 0; i < 5; i++) expect((await connection.POST(req("/c", "POST", body))).status).toBe(422);
    svc.connectFlash.mockClear();
    const r = await json(await connection.POST(req("/c", "POST", body)));
    expect(r).toEqual({ status: 429, body: { error: { code: "RATE_LIMITED", message: "ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่" } } });
    expect(svc.connectFlash).not.toHaveBeenCalled();
    expect((await verify.POST(req("/c", "POST"))).status).toBe(429);
    expect(svc.verifyFlash).not.toHaveBeenCalled();
    // คนอื่น/ร้านอื่นไม่โดนด้วย
    guardMock.mockResolvedValue({ ...owner, userId: "u-other", shopId: "shop-rl" });
    svc.verifyFlash.mockResolvedValue({ status: "ACTIVE" });
    expect((await verify.POST(req("/c", "POST"))).status).toBe(200);
  });
  it("verify ที่ได้ view TOKEN_INVALID นับเป็นความล้มเหลว", async () => {
    guardMock.mockResolvedValue({ ...owner, userId: "u-rl2", shopId: "shop-rl2" });
    svc.verifyFlash.mockResolvedValue({ status: "TOKEN_INVALID" });
    for (let i = 0; i < 5; i++) expect((await verify.POST(req("/c", "POST"))).status).toBe(200);
    expect((await verify.POST(req("/c", "POST"))).status).toBe(429);
  });
});

describe("connection", () => {
  it("POST ใหม่ → 201, เปลี่ยน key → 200, ไม่มี key ใน body และส่ง trimmed input", async () => {
    svc.connectFlash.mockResolvedValue({ connection: { connected: true }, webhook: { status: "REGISTERED", kinds: [] }, created: true });
    let r = await json(await connection.POST(req("/c", "POST", { mchId: " AB1234 ", secretKey: KEY })));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ connection: { connected: true }, webhook: { status: "REGISTERED", kinds: [] } });
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    expect(svc.connectFlash).toHaveBeenCalledWith("shop1", "u1", { mchId: "AB1234", secretKey: KEY }, { isOwner: true });
    svc.connectFlash.mockResolvedValue({ connection: {}, webhook: {}, created: false });
    r = await json(await connection.POST(req("/c", "POST", { mchId: "AB1234", secretKey: KEY })));
    expect(r.status).toBe(200);
  });

  it.each([
    ["mchId สั้น", { mchId: "A", secretKey: KEY }],
    ["key มีช่องว่าง", { mchId: "AB1234", secretKey: "abc def ghi jkl mno pqr" }],
    ["key สั้น", { mchId: "AB1234", secretKey: "short" }],
    ["body ว่าง", null],
  ])("POST 400 INVALID_INPUT: %s (ข้อความไม่สะท้อน key)", async (_n, body) => {
    const r = await json(await connection.POST(req("/c", "POST", body ?? undefined)));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_INPUT");
    expect(JSON.stringify(r.body)).not.toContain("abc def");
    expect(svc.connectFlash).not.toHaveBeenCalled();
  });

  it.each([
    [new FlashError("MERCHANT_NOT_FOUND", { flashCode: 1001, upstreamMessage: KEY }), 422, "MERCHANT_NOT_FOUND"],
    [new FlashError("SIGN_INVALID", { flashCode: 1002 }), 422, "SIGN_INVALID"],
    [new FlashError("UPSTREAM_ERROR"), 502, "UPSTREAM_ERROR"],
    [new FlashError("UPSTREAM_TIMEOUT"), 504, "UPSTREAM_TIMEOUT"],
    [new FlashServiceError("MERCHANT_IN_USE", "x"), 409, "MERCHANT_IN_USE"],
    [new FlashServiceError("MERCHANT_CHANGE_NOT_ALLOWED", "x"), 409, "MERCHANT_CHANGE_NOT_ALLOWED"],
    [new FlashServiceError("FEATURE_DISABLED", "x"), 404, "FEATURE_DISABLED"],
  ])("POST แมป error → %#", async (err, status, code) => {
    svc.connectFlash.mockRejectedValue(err);
    const r = await json(await connection.POST(req("/c", "POST", { mchId: "AB1234", secretKey: KEY })));
    expect(r.status).toBe(status);
    expect(r.body.error.code).toBe(code);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
  });

  it("GET: owner ได้ isOwner true / MANAGER false · FEATURE_DISABLED ไม่เกิด (service ไม่โยน) → 200", async () => {
    svc.getFlashConnection.mockResolvedValue({ available: false, connected: false });
    expect((await json(await connection.GET(req("/c")))).status).toBe(200);
    expect(svc.getFlashConnection).toHaveBeenLastCalledWith("shop1", { isOwner: true });
    guardMock.mockResolvedValue(manager);
    await connection.GET(req("/c"));
    expect(svc.getFlashConnection).toHaveBeenLastCalledWith("shop1", { isOwner: false });
  });

  it("DELETE → 200 ok · NOT_CONNECTED → 409 · ปิดฟีเจอร์ยังถอนได้ (route ไม่เช็ค gate)", async () => {
    svc.disconnectFlash.mockResolvedValue(undefined);
    expect(await json(await connection.DELETE(req("/c", "DELETE")))).toEqual({ status: 200, body: { ok: true } });
    svc.disconnectFlash.mockRejectedValue(new FlashServiceError("NOT_CONNECTED", "x"));
    expect((await connection.DELETE(req("/c", "DELETE"))).status).toBe(409);
  });

  it("response มี cache-control no-store", async () => {
    svc.getFlashConnection.mockResolvedValue({});
    expect((await connection.GET(req("/c"))).headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("verify", () => {
  it("200 view · NOT_CONNECTED 409 · timeout 504 · MANAGER ได้ (S2 ไม่ใช่ owner-only)", async () => {
    guardMock.mockResolvedValue(manager);
    svc.verifyFlash.mockResolvedValue({ status: "TOKEN_INVALID" });
    expect(await json(await verify.POST(req("/v", "POST")))).toEqual({ status: 200, body: { status: "TOKEN_INVALID" } });
    svc.verifyFlash.mockRejectedValue(new FlashServiceError("NOT_CONNECTED", "x"));
    expect((await verify.POST(req("/v", "POST"))).status).toBe(409);
    svc.verifyFlash.mockRejectedValue(new FlashError("UPSTREAM_TIMEOUT"));
    expect((await verify.POST(req("/v", "POST"))).status).toBe(504);
  });
});

describe("settings", () => {
  it("GET 200 / NOT_CONNECTED 409", async () => {
    svc.getFlashSettings.mockResolvedValue({ connection: {}, settings: {} });
    expect((await settings.GET(req("/s"))).status).toBe(200);
    svc.getFlashSettings.mockRejectedValue(new FlashServiceError("NOT_CONNECTED", "x"));
    expect((await settings.GET(req("/s"))).status).toBe(409);
  });
  it("PUT 200 / 400 (postcode, enum, ประกันไม่มีมูลค่า)", async () => {
    svc.updateFlashSettings.mockResolvedValue({ connection: {}, settings: {} });
    expect((await settings.PUT(req("/s", "PUT", { createMode: "AUTO", senderPostcode: "10110" }))).status).toBe(200);
    for (const bad of [{ senderPostcode: "12" }, { createMode: "X" }, { defaultWidth: 999 }, { optIsInsured: true }]) {
      expect((await settings.PUT(req("/s", "PUT", bad))).status).toBe(400);
    }
    expect(svc.updateFlashSettings).toHaveBeenCalledTimes(1);
  });
});

describe("webhook/sync", () => {
  it("body ว่าง → overrideKinds [] · ส่ง kinds ต่อ · kind แปลก 400 · NOT_CONNECTED 409", async () => {
    svc.syncFlashWebhooks.mockResolvedValue({ status: "REGISTERED", kinds: [] });
    svc.getFlashConnection.mockResolvedValue({ connected: true });
    const r = await json(await sync.POST(req("/w", "POST")));
    expect(r.body).toEqual({ connection: { connected: true }, webhook: { status: "REGISTERED", kinds: [] } });
    expect(svc.syncFlashWebhooks).toHaveBeenLastCalledWith("shop1", "u1", { overrideKinds: [] });
    await sync.POST(req("/w", "POST", { overrideKinds: ["status"] }));
    expect(svc.syncFlashWebhooks).toHaveBeenLastCalledWith("shop1", "u1", { overrideKinds: ["status"] });
    expect((await sync.POST(req("/w", "POST", { overrideKinds: ["nope"] }))).status).toBe(400);
    svc.syncFlashWebhooks.mockRejectedValue(new FlashServiceError("NOT_CONNECTED", "x"));
    expect((await sync.POST(req("/w", "POST", {}))).status).toBe(409);
  });
});

describe("order-context", () => {
  it("ไม่ส่ง orderId/orderToken → 400", async () => {
    expect((await ctx.GET(req("/o"))).status).toBe(400);
  });
  it("orderToken → resolve ด้วย shop ที่ guard ให้ · {reason} → 404 NOT_ELIGIBLE · READY → 200", async () => {
    resolveOrderIdByToken.mockResolvedValue("o9");
    svc.getFlashPanelOrReason.mockResolvedValue({ reason: "ออเดอร์นี้ไม่ต้องจัดส่ง" });
    const r = await json(await ctx.GET(req("/o?orderToken=tok1")));
    expect(resolveOrderIdByToken).toHaveBeenCalledWith("shop1", "tok1");
    expect(svc.getFlashPanelOrReason).toHaveBeenCalledWith("shop1", "o9");
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe("NOT_ELIGIBLE");
    svc.getFlashPanelOrReason.mockResolvedValue({ flashState: "UNAVAILABLE", orderId: "o1" });
    expect(await json(await ctx.GET(req("/o?orderId=o1")))).toEqual({ status: 200, body: { flashState: "UNAVAILABLE", orderId: "o1" } });
  });
});

describe("price", () => {
  const good = { receiver: { district: "บางรัก", province: "กรุงเทพ", postcode: "10500" }, weight: 1.5 };
  it("200 · FEATURE_DISABLED 404 · INCOMPLETE_DATA 422 พร้อม missing · 502", async () => {
    svc.estimateFlashPrice.mockResolvedValue({ totalBaht: 40, pricingTable: "CONTRACT", estimate: true });
    expect((await json(await price.POST(req("/p", "POST", good)))).body.totalBaht).toBe(40);
    expect(svc.estimateFlashPrice).toHaveBeenCalledWith("shop1", expect.objectContaining({ weight: 1.5 }));
    svc.estimateFlashPrice.mockRejectedValue(new FlashServiceError("FEATURE_DISABLED", "x"));
    expect((await price.POST(req("/p", "POST", good))).status).toBe(404);
    svc.estimateFlashPrice.mockRejectedValue(new FlashServiceError("INCOMPLETE_DATA", "x", ["senderName"]));
    const r = await json(await price.POST(req("/p", "POST", good)));
    expect(r.status).toBe(422);
    expect(r.body.error.missing).toEqual(["senderName"]);
    svc.estimateFlashPrice.mockRejectedValue(new FlashError("UPSTREAM_ERROR"));
    expect((await price.POST(req("/p", "POST", good))).status).toBe(502);
  });
  it("400: postcode ผิด / น้ำหนักเกิน / ไม่มี body", async () => {
    for (const bad of [{ ...good, receiver: { ...good.receiver, postcode: "1" } }, { ...good, weight: 500 }, null]) {
      expect((await price.POST(req("/p", "POST", bad ?? undefined))).status).toBe(400);
    }
  });
});
