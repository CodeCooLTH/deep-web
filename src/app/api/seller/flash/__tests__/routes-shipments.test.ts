// feature 00084 T8b — route พัสดุ/เรียกรถ Flash: ด่านสิทธิ์ · validation · แมป error ตาม API.md §5 · label ไม่ส่งไฟล์เสีย · ไม่รั่ว key
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { FlashError, FlashServiceError } from "@/lib/flash/errors";

const { guardMock, svc, resolveOrderIdByToken } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  resolveOrderIdByToken: vi.fn(),
  svc: {
    createFlashShipment: vi.fn(), previewFlashPno: vi.fn(), linkFlashShipment: vi.fn(), retryFlashShipment: vi.fn(),
    resolveReviewShipment: vi.fn(), cancelFlashShipment: vi.fn(), unlinkFlashShipment: vi.fn(), getFlashLabelPdf: vi.fn(),
    getFlashTraces: vi.fn(), requestFlashPickup: vi.fn(), cancelFlashPickup: vi.fn(),
  },
}));
vi.mock("@/lib/shop-api-guard", () => ({ requireGeneralShop: (o: unknown) => guardMock(o) }));
vi.mock("@/services/flash.service", () => svc);
vi.mock("@/services/flash-shipment.service", () => svc);
vi.mock("@/services/flash-ops.service", () => svc);
vi.mock("@/services/iship.service", async (orig) => ({ ...(await orig<object>()), resolveOrderIdByToken }));

import * as create from "../shipments/route";
import * as preview from "../shipments/preview/route";
import * as link from "../shipments/link/route";
import * as retry from "../shipments/[id]/retry/route";
import * as cancel from "../shipments/[id]/cancel/route";
import * as resolve from "../shipments/[id]/resolve/route";
import * as unlink from "../shipments/[id]/unlink/route";
import * as label from "../shipments/[id]/label/route";
import * as traces from "../shipments/[id]/traces/route";
import * as pickups from "../pickups/route";
import * as pickupCancel from "../pickups/[id]/cancel/route";

const KEY = "SECRETKEY-1234567890-abcdefXYZ";
const OID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: "s1" }) };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://x.test${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const VIEW = { id: "s1", provider: "FLASH", status: "CREATED" };

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue({ shopId: "shop1", userId: "u1", role: "OWNER", roles: ["OWNER"], effRoles: ["OWNER"] });
});

type H = (r: NextRequest, c: typeof ctx) => Promise<Response>;
const calls: [string, H, NextRequest][] = [
  ["create", create.POST as H, req("/c?shopId=s9", "POST", { orderId: OID })],
  ["preview", preview.GET as H, req("/c?shopId=s9&pno=TH12345678")],
  ["link", link.POST as H, req("/c?shopId=s9", "POST", { orderId: OID, pno: "TH12345678" })],
  ["retry", retry.POST as H, req("/c?shopId=s9", "POST")],
  ["cancel", cancel.POST as H, req("/c?shopId=s9", "POST")],
  ["resolve", resolve.POST as H, req("/c?shopId=s9", "POST", { action: "LINK_PNO", pno: "TH12345678" })],
  ["unlink", unlink.POST as H, req("/c?shopId=s9", "POST")],
  ["label", label.GET as H, req("/c?shopId=s9")],
  ["traces", traces.GET as H, req("/c?shopId=s9")],
  ["pickups", pickups.POST as H, req("/c?shopId=s9", "POST", { parcelCount: 3 })],
  ["pickup cancel", pickupCancel.POST as H, req("/c?shopId=s9", "POST")],
];

describe("ด่าน guard", () => {
  it.each(calls)("%s ส่ง cap S1 + shopId จาก query และไม่แตะ service เมื่อถูกปฏิเสธ", async (_n, h, r) => {
    guardMock.mockResolvedValue({ error: NextResponse.json({ error: "x" }, { status: 403 }) });
    expect((await h(r, ctx)).status).toBe(403);
    expect(guardMock).toHaveBeenCalledWith({ cap: "S1", shopId: "s9" });
    expect(Object.values(svc).every((f) => f.mock.calls.length === 0)).toBe(true);
  });
});

describe("create", () => {
  it("orderToken → resolve ด้วยร้านจาก guard · 201 แม้ FAILED/NEEDS_REVIEW", async () => {
    resolveOrderIdByToken.mockResolvedValue("o9");
    svc.createFlashShipment.mockResolvedValue({ ...VIEW, status: "NEEDS_REVIEW" });
    const r = await json(await create.POST(req("/c", "POST", { orderToken: "tok12", override: { weight: 2 } })));
    expect(resolveOrderIdByToken).toHaveBeenCalledWith("shop1", "tok12");
    expect(svc.createFlashShipment).toHaveBeenCalledWith("shop1", "u1", "o9", { weight: 2 }, undefined);
    expect(r).toMatchObject({ status: 201, body: { status: "NEEDS_REVIEW" } });
  });
  it("400: ไม่มี orderId/orderToken · uuid ผิด · น้ำหนักเกิน · ไม่มี body", async () => {
    for (const bad of [{}, { orderId: "x" }, { orderId: OID, override: { weight: 500 } }, null]) {
      expect((await create.POST(req("/c", "POST", bad ?? undefined))).status).toBe(400);
    }
    expect(svc.createFlashShipment).not.toHaveBeenCalled();
  });
  it.each([
    [new FlashServiceError("FEATURE_DISABLED", "x"), 404], [new FlashServiceError("NOT_FOUND", "x"), 404],
    [new FlashServiceError("NOT_CONNECTED", "x"), 409], [new FlashServiceError("SHIPMENT_EXISTS", "x"), 409],
    [new FlashServiceError("NEEDS_REVIEW", "x"), 409], [new FlashServiceError("INCOMPLETE_DATA", "x", ["receiverPhone"]), 422],
    [new FlashServiceError("NOT_ELIGIBLE", "x"), 403], [new FlashError("UPSTREAM_TIMEOUT"), 504], [new FlashError("UPSTREAM_ERROR"), 502],
  ])("error %# → %s", async (err, status) => {
    svc.createFlashShipment.mockRejectedValue(err);
    const r = await json(await create.POST(req("/c", "POST", { orderId: OID })));
    expect(r.status).toBe(status);
    if (err instanceof FlashServiceError && err.missing) expect(r.body.error.missing).toEqual(["receiverPhone"]);
  });
});

describe("preview", () => {
  it("200 · pno ผิดรูปแบบ/ว่าง → 400 โดยไม่เรียก service", async () => {
    svc.previewFlashPno.mockResolvedValue({ pno: "TH12345678", state: null });
    expect((await preview.GET(req("/p?pno=TH12345678"))).status).toBe(200);
    expect(svc.previewFlashPno).toHaveBeenCalledWith("shop1", "TH12345678");
    for (const q of ["", "?pno=ab", "?pno=a%20b%20c%20d"]) expect((await preview.GET(req(`/p${q}`))).status).toBe(400);
    expect(svc.previewFlashPno).toHaveBeenCalledTimes(1);
  });
  it("1019 → 422 · 1006 → 404", async () => {
    svc.previewFlashPno.mockRejectedValue(new FlashError("NOT_MERCHANT_PARCEL"));
    expect((await preview.GET(req("/p?pno=TH12345678"))).status).toBe(422);
    svc.previewFlashPno.mockRejectedValue(new FlashError("PARCEL_NOT_FOUND"));
    expect((await preview.GET(req("/p?pno=TH12345678"))).status).toBe(404);
  });
});

describe("link", () => {
  it("201 · PNO_TAKEN 409 · NOT_MERCHANT_PARCEL 422 · ไม่มีออเดอร์/pno ผิด 400", async () => {
    svc.linkFlashShipment.mockResolvedValue({ ...VIEW, source: "LINKED" });
    expect((await link.POST(req("/l", "POST", { orderId: OID, pno: "TH12345678" }))).status).toBe(201);
    expect(svc.linkFlashShipment).toHaveBeenCalledWith("shop1", "u1", OID, "TH12345678");
    svc.linkFlashShipment.mockRejectedValue(new FlashServiceError("PNO_TAKEN", "x"));
    expect((await link.POST(req("/l", "POST", { orderId: OID, pno: "TH12345678" }))).status).toBe(409);
    svc.linkFlashShipment.mockRejectedValue(new FlashError("NOT_MERCHANT_PARCEL"));
    expect((await link.POST(req("/l", "POST", { orderId: OID, pno: "TH12345678" }))).status).toBe(422);
    expect((await link.POST(req("/l", "POST", { pno: "TH12345678" }))).status).toBe(400);
    expect((await link.POST(req("/l", "POST", { orderId: OID, pno: "!" }))).status).toBe(400);
  });
});

describe("retry / cancel / unlink", () => {
  it("retry 200 (FAILED ซ้ำก็ 200) · NEEDS_REVIEW 409 · NOT_FOUND 404", async () => {
    svc.retryFlashShipment.mockResolvedValue({ ...VIEW, status: "FAILED" });
    expect(await json(await retry.POST(req("/r", "POST"), ctx))).toMatchObject({ status: 200, body: { status: "FAILED" } });
    expect(svc.retryFlashShipment).toHaveBeenCalledWith("shop1", "u1", "s1");
    svc.retryFlashShipment.mockRejectedValue(new FlashServiceError("NEEDS_REVIEW", "x"));
    expect((await retry.POST(req("/r", "POST"), ctx)).status).toBe(409);
    svc.retryFlashShipment.mockRejectedValue(new FlashServiceError("NOT_FOUND", "x"));
    expect((await retry.POST(req("/r", "POST"), ctx)).status).toBe(404);
  });
  it("cancel 200 · 1015 → 409 NOT_CANCELLABLE · INVALID_STATE 409", async () => {
    svc.cancelFlashShipment.mockResolvedValue({ ...VIEW, status: "CANCELLED" });
    expect((await cancel.POST(req("/c", "POST"), ctx)).status).toBe(200);
    expect(svc.cancelFlashShipment).toHaveBeenCalledWith("shop1", "u1", "s1");
    svc.cancelFlashShipment.mockRejectedValue(new FlashError("NOT_CANCELLABLE"));
    expect(await json(await cancel.POST(req("/c", "POST"), ctx))).toMatchObject({ status: 409, body: { error: { code: "NOT_CANCELLABLE" } } });
    svc.cancelFlashShipment.mockRejectedValue(new FlashServiceError("INVALID_STATE", "x"));
    expect((await cancel.POST(req("/c", "POST"), ctx)).status).toBe(409);
  });
  it("unlink 200 {ok:true} · INVALID_STATE 409", async () => {
    svc.unlinkFlashShipment.mockResolvedValue(undefined);
    expect(await json(await unlink.POST(req("/u", "POST"), ctx))).toEqual({ status: 200, body: { ok: true } });
    expect(svc.unlinkFlashShipment).toHaveBeenCalledWith("shop1", "s1");
    svc.unlinkFlashShipment.mockRejectedValue(new FlashServiceError("INVALID_STATE", "x"));
    expect((await unlink.POST(req("/u", "POST"), ctx)).status).toBe(409);
  });
});

describe("resolve", () => {
  it("LINK_PNO → 200 · REOPEN → 201 พร้อม override ส่งต่อ", async () => {
    svc.resolveReviewShipment.mockResolvedValue(VIEW);
    expect((await resolve.POST(req("/r", "POST", { action: "LINK_PNO", pno: "TH12345678" }), ctx)).status).toBe(200);
    expect(svc.resolveReviewShipment).toHaveBeenCalledWith("shop1", "u1", "s1", { action: "LINK_PNO", pno: "TH12345678" });
    const body = { action: "REOPEN", confirmNoExistingParcel: true, override: { weight: 3 } };
    expect((await resolve.POST(req("/r", "POST", body), ctx)).status).toBe(201);
    expect(svc.resolveReviewShipment).toHaveBeenLastCalledWith("shop1", "u1", "s1", body);
  });
  it.each([["true"], [1], [false], [undefined], ["yes"]])("REOPEN ปฏิเสธ confirmNoExistingParcel=%s → 400 ไม่เรียก service", async (bad) => {
    expect((await resolve.POST(req("/r", "POST", { action: "REOPEN", confirmNoExistingParcel: bad }), ctx)).status).toBe(400);
    expect(svc.resolveReviewShipment).not.toHaveBeenCalled();
  });
  it("action แปลก / pno ผิด / ไม่มี body → 400 · INVALID_STATE → 409", async () => {
    for (const bad of [{ action: "X" }, { action: "LINK_PNO", pno: "a" }, null]) {
      expect((await resolve.POST(req("/r", "POST", bad ?? undefined), ctx)).status).toBe(400);
    }
    svc.resolveReviewShipment.mockRejectedValue(new FlashServiceError("INVALID_STATE", "x"));
    expect((await resolve.POST(req("/r", "POST", { action: "LINK_PNO", pno: "TH12345678" }), ctx)).status).toBe(409);
  });
});

describe("label", () => {
  it("200 application/pdf inline no-store", async () => {
    svc.getFlashLabelPdf.mockResolvedValue(Buffer.from("%PDF-1.4 x"));
    const r = await label.GET(req("/l"), ctx);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="label-s1.pdf"');
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await r.arrayBuffer()).toString().startsWith("%PDF")).toBe(true);
    expect(svc.getFlashLabelPdf).toHaveBeenCalledWith("shop1", "s1");
  });
  it.each([
    [new FlashServiceError("INVALID_STATE", "x"), 409], [new FlashServiceError("NOT_FOUND", "x"), 404],
    [new FlashError("SIGN_INVALID"), 409], [new FlashError("UPSTREAM_TIMEOUT"), 504], [new FlashError("UPSTREAM_ERROR"), 502],
  ])("error %# → JSON ไม่ใช่ไฟล์ (%s)", async (err, status) => {
    svc.getFlashLabelPdf.mockRejectedValue(err);
    const r = await label.GET(req("/l"), ctx);
    expect(r.status).toBe(status);
    expect(r.headers.get("content-type")).toContain("application/json");
  });
});

describe("traces", () => {
  it("200 · NOT_FOUND 404", async () => {
    svc.getFlashTraces.mockResolvedValue({ events: [], carrier: {} });
    expect((await traces.GET(req("/t"), ctx)).status).toBe(200);
    expect(svc.getFlashTraces).toHaveBeenCalledWith("shop1", "s1");
    svc.getFlashTraces.mockRejectedValue(new FlashServiceError("NOT_FOUND", "x"));
    expect((await traces.GET(req("/t"), ctx)).status).toBe(404);
  });
});

describe("pickups", () => {
  it("201 · 1010 → 409 · ผู้ส่งไม่ครบ 422 · NOT_CONNECTED 409", async () => {
    svc.requestFlashPickup.mockResolvedValue({ id: "p1", status: "REQUESTED" });
    expect(await json(await pickups.POST(req("/p", "POST", { parcelCount: 3, remark: "ประตูหลัง" })))).toMatchObject({ status: 201, body: { id: "p1" } });
    expect(svc.requestFlashPickup).toHaveBeenCalledWith("shop1", "u1", { parcelCount: 3, remark: "ประตูหลัง" });
    svc.requestFlashPickup.mockRejectedValue(new FlashError("PICKUP_PENDING"));
    expect((await pickups.POST(req("/p", "POST", { parcelCount: 3 }))).status).toBe(409);
    svc.requestFlashPickup.mockRejectedValue(new FlashServiceError("INCOMPLETE_DATA", "x", ["senderName"]));
    expect((await pickups.POST(req("/p", "POST", { parcelCount: 3 }))).status).toBe(422);
    svc.requestFlashPickup.mockRejectedValue(new FlashServiceError("NOT_CONNECTED", "x"));
    expect((await pickups.POST(req("/p", "POST", { parcelCount: 3 }))).status).toBe(409);
  });
  it("400: parcelCount 0 / 101 / ทศนิยม / สตริง / ไม่มี body", async () => {
    for (const bad of [{ parcelCount: 0 }, { parcelCount: 101 }, { parcelCount: 1.5 }, { parcelCount: "3" }, null]) {
      expect((await pickups.POST(req("/p", "POST", bad ?? undefined))).status).toBe(400);
    }
    expect(svc.requestFlashPickup).not.toHaveBeenCalled();
  });
  it("cancel 200 · PICKUP_NOT_CANCELLABLE 409 · NOT_FOUND 404", async () => {
    svc.cancelFlashPickup.mockResolvedValue({ id: "p1", status: "CANCELLED" });
    expect((await pickupCancel.POST(req("/p", "POST"), ctx)).status).toBe(200);
    expect(svc.cancelFlashPickup).toHaveBeenCalledWith("shop1", "s1");
    svc.cancelFlashPickup.mockRejectedValue(new FlashError("PICKUP_NOT_CANCELLABLE"));
    expect((await pickupCancel.POST(req("/p", "POST"), ctx)).status).toBe(409);
    svc.cancelFlashPickup.mockRejectedValue(new FlashServiceError("NOT_FOUND", "x"));
    expect((await pickupCancel.POST(req("/p", "POST"), ctx)).status).toBe(404);
  });
});

describe("ไม่รั่ว secret", () => {
  it("error ดิบที่มี key/upstreamMessage ไม่โผล่ใน body", async () => {
    svc.createFlashShipment.mockRejectedValue(new FlashError("UPSTREAM_ERROR", { upstreamMessage: `sign=${KEY}` }));
    const text = JSON.stringify((await json(await create.POST(req("/c", "POST", { orderId: OID })))).body);
    expect(text).not.toContain(KEY);
    svc.createFlashShipment.mockRejectedValue(new Error(`boom ${KEY}`));
    const r = await json(await create.POST(req("/c", "POST", { orderId: OID })));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
  });
});
