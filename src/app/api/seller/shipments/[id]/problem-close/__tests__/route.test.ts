// feature 00085 — route ปิด/เลิกปิดพัสดุ: ด่าน guard · validation · แมป error ครบทุก code (API.md §4) · no-store
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ROUTE_CAPABILITIES } from "@/lib/route-capabilities";

const { guardMock, svc } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  svc: { previewParcelClose: vi.fn(), closeParcelProblem: vi.fn(), reopenParcelProblem: vi.fn() },
}));
vi.mock("@/lib/shop-api-guard", () => ({ requireGeneralShop: (o: unknown) => guardMock(o) }));
vi.mock("@/services/parcel-close.service", async (orig) => ({ ...(await orig<object>()), ...svc }));

import { PARCEL_CLOSE_ERROR_CODES, ParcelCloseError } from "@/services/parcel-close.service";
import * as route from "../route";

const ctx = { params: Promise.resolve({ id: "s1" }) };
const req = (method: string, body?: unknown, qs = "?shopId=shop9") =>
  new NextRequest(`http://x.test/api/seller/shipments/s1/problem-close${qs}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
  });
const OK_BODY = { reason: "LOST", expectedOutcome: "DELIVERY_FAILED" };
const calls: [string, () => Promise<Response>][] = [
  ["GET", () => route.GET(req("GET"), ctx)],
  ["POST", () => route.POST(req("POST", OK_BODY), ctx)],
  ["DELETE", () => route.DELETE(req("DELETE"), ctx)],
];

beforeEach(() => {
  vi.clearAllMocks();
  guardMock.mockResolvedValue({ shopId: "shop9", userId: "u1", role: "OWNER", roles: ["OWNER"], effRoles: ["OWNER"] });
  svc.previewParcelClose.mockResolvedValue({ eligible: true });
  svc.closeParcelProblem.mockResolvedValue({ closed: true });
  svc.reopenParcelProblem.mockResolvedValue({ reopened: true });
});

describe("guard (R-1..R-4)", () => {
  it.each([401, 403])("guard ปฏิเสธ %i ทุกเมธอด: ผ่านต่อ ไม่แตะ service · ขอ cap S1 + shopId จาก query ไม่ถอยไปร้าน active", async (st) => {
    guardMock.mockResolvedValue({ error: NextResponse.json({ error: { code: "X" } }, { status: st }) });
    for (const [, call] of calls) expect((await call()).status).toBe(st);
    expect(guardMock).toHaveBeenCalledTimes(3);
    for (const c of guardMock.mock.calls) expect(c[0]).toEqual({ cap: "S1", shopId: "shop9" });
    expect(Object.values(svc).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it("R-5 service ใช้ guard.shopId (ไม่ใช่ร้านอื่น) และ NOT_FOUND → 404", async () => {
    svc.previewParcelClose.mockRejectedValue(new ParcelCloseError("NOT_FOUND", "ไม่พบ"));
    expect((await route.GET(req("GET"), ctx)).status).toBe(404);
    expect(svc.previewParcelClose).toHaveBeenCalledWith("shop9", "s1");
    await route.POST(req("POST", OK_BODY), ctx);
    expect(svc.closeParcelProblem).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop9", userId: "u1", shipmentId: "s1" }));
  });
});

describe("R-6 mapParcelCloseError ครอบทุก code", () => {
  const EXPECT: Record<string, number> = { REFUND_ANSWER_REQUIRED: 400, NOT_FOUND: 404 };
  it.each([...PARCEL_CLOSE_ERROR_CODES])("%s", async (code) => {
    const preview = code === "OUTCOME_CHANGED" ? { outcome: "LOST_ON_RETURN" } : undefined;
    svc.reopenParcelProblem.mockRejectedValue(new ParcelCloseError(code, "ข้อความ", preview as never));
    const res = await route.DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(EXPECT[code] ?? 409);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    if (preview) expect(body.preview).toEqual(preview);
  });

  it("error อื่น → 500 ไม่รั่ว stack", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    svc.reopenParcelProblem.mockRejectedValue(new Error("boom secret"));
    const res = await route.DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });
});

describe("R-7 validation", () => {
  it.each([
    ["OTHER ไม่มีโน้ต", { reason: "OTHER", expectedOutcome: "DELIVERY_FAILED" }],
    ["โน้ต 4 ตัว", { reason: "OTHER", note: "abcd", expectedOutcome: "DELIVERY_FAILED" }],
    ["โน้ต 201 ตัว", { reason: "OTHER", note: "x".repeat(201), expectedOutcome: "DELIVERY_FAILED" }],
    ["reason นอก picklist", { reason: "FOO", expectedOutcome: "DELIVERY_FAILED" }],
    ["ไม่มี expectedOutcome", { reason: "LOST" }],
  ])("%s → 400 VALIDATION ไม่แตะ service", async (_n, body) => {
    const res = await route.POST(req("POST", body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(svc.closeParcelProblem).not.toHaveBeenCalled();
  });

  it("body ว่าง/ไม่ใช่ JSON → 400", async () => {
    expect((await route.POST(req("POST"), ctx)).status).toBe(400);
  });
});

it("R-8 route-capabilities ประกาศ 3 เมธอดเป็น S1 DECLARED", () => {
  expect(ROUTE_CAPABILITIES["src/app/api/seller/shipments/[id]/problem-close/route.ts"]).toEqual({
    GET: "S1", POST: "S1", DELETE: "S1", status: "DECLARED",
  });
});

describe("R-9 no-store", () => {
  it("สำเร็จและ error ทุกเมธอดมี cache-control private, no-store", async () => {
    for (const [, call] of calls) expect((await call()).headers.get("cache-control")).toBe("private, no-store");
    svc.reopenParcelProblem.mockRejectedValue(new ParcelCloseError("NOT_CLOSED", "x"));
    expect((await route.DELETE(req("DELETE"), ctx)).headers.get("cache-control")).toBe("private, no-store");
    expect((await route.POST(req("POST", { reason: "FOO" }), ctx)).headers.get("cache-control")).toBe("private, no-store");
  });

  it("POST ส่ง body ที่ parse แล้วเข้า service (note เฉพาะ OTHER ตัดที่ service)", async () => {
    await route.POST(req("POST", { reason: "OTHER", note: " ไฟไหม้ ", expectedOutcome: "LOST_ON_RETURN", refunded: true }), ctx);
    expect(svc.closeParcelProblem).toHaveBeenCalledWith({
      shopId: "shop9", userId: "u1", shipmentId: "s1", reason: "OTHER", note: "ไฟไหม้", expectedOutcome: "LOST_ON_RETURN", refunded: true,
    });
  });
});
