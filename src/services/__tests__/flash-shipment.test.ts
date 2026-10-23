/**
 * 00084 T6a — flash-shipment.service (DB จริง local + mock client)
 * 🛑 HR13/14: รันเฉพาะ DATABASE_URL = localhost:5434 · สร้าง/ลบเฉพาะแถวที่เทสสร้างเอง (ตาม id)
 * mutation ที่ต้องแดง: เปลี่ยน `confirmNoExistingParcel !== true` เป็น truthy ⇒ เทส REOPEN literal true แดง ·
 *   ถอดเงื่อนไข NEEDS_REVIEW ใน retryFlashShipment ⇒ เทส "retry ปฏิเสธ" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

const h = vi.hoisted(() => {
  process.env.FLASH_DIRECT_ENABLED = "1";
  process.env.FLASH_DRY_RUN = "";
  process.env.CHANNEL_TOKEN_KEY ??= "0".repeat(64);
  return {
    c: { createOrder: vi.fn(), routes: vi.fn(), estimateRate: vi.fn() },
    reserve: vi.fn(async () => null),
    sync: vi.fn(),
  };
});
vi.mock("@/lib/flash/client", async (orig) => ({ ...(await orig<typeof import("@/lib/flash/client")>()), ...h.c }));
vi.mock("@/services/auto-notify.service", async (orig) => ({
  ...(await orig<typeof import("@/services/auto-notify.service")>()),
  reserveTrackingNotice: h.reserve,
  dispatchAutoNotifyAfterCommit: vi.fn(),
}));
vi.mock("@/services/order.service", async (orig) => {
  const a = await orig<typeof import("@/services/order.service")>();
  h.sync.mockImplementation(a.syncOrderPaymentToParcel);
  return { ...a, syncOrderPaymentToParcel: h.sync };
});

import { prisma } from "@/lib/prisma";
import { FlashError } from "@/lib/flash/errors";
import { encodeCredential } from "@/lib/flash/credential";
import { classifyFlashRetryUX } from "@/lib/flash/errors";
import {
  createFlashShipment, retryFlashShipment, resolveReviewShipment, previewFlashPno, linkFlashShipment,
} from "../flash-shipment.service";

const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(process.env.DATABASE_URL ?? "");
const run = randomUUID().slice(0, 8);
const S = { user: "", shop: "" };
const orders: string[] = [];
const fe = (code: ConstructorParameters<typeof FlashError>[0], flashCode?: string) => new FlashError(code, { flashCode });
const ADDR = { line1: "9 ถ.ทดสอบ", subdistrict: "คลองตัน", district: "วัฒนา", province: "กรุงเทพมหานคร", postcode: "10110" };
let seq = 0;
const nextPno = () => `TH${run.toUpperCase()}${String(++seq).padStart(4, "0")}`;

async function mkOrder(extra: Record<string, unknown> = {}) {
  const o = await prisma.order.create({
    data: {
      shopId: S.shop, type: "PHYSICAL", totalAmount: 100, fulfillmentMode: "SHIPPED", buyerName: "ผู้รับ", buyerContact: "0811111111",
      shippingAddress: ADDR, items: { create: { name: "เสื้อ", qty: 2, price: 50 } }, ...extra,
    } as never,
    select: { id: true },
  });
  orders.push(o.id);
  return o.id;
}
const shipments = (orderId: string) => prisma.orderShipment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
const events = (orderId: string, type: string) => prisma.orderEvent.findMany({ where: { orderId, type } });

describe.skipIf(!isLocal)("flash-shipment.service", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `fsh-${run}`, username: `fsh_${run}` }, select: { id: true } });
    const shop = await prisma.shop.create({
      data: { userId: u.id, shopName: `fsh-${run}`, kind: "BUSINESS", vertical: "ONLINE_SALES" } as never, select: { id: true },
    });
    Object.assign(S, { user: u.id, shop: shop.id });
    await prisma.shopShippingAccount.create({
      data: {
        shopId: S.shop, provider: "FLASH", status: "ACTIVE", merchantId: `M${run}`, tokenLast4: "ABCD", createMode: "ASK", connectedByUserId: S.user,
        accessTokenEnc: encodeCredential({ secretKey: "k".repeat(34), webhookSecret: "w".repeat(20) }),
        senderName: "ร้านเทส", senderPhone: "0812345678", senderAddress: "1 ถ.เทส", senderSubdistrict: "คลองตัน",
        senderDistrict: "วัฒนา", senderProvince: "กรุงเทพมหานคร", senderPostcode: "10110",
        defaultWeight: 1.5, defaultCategoryId: 1,
      },
    });
  });
  afterAll(async () => {
    const ships = (await prisma.orderShipment.findMany({ where: { orderId: { in: orders } }, select: { id: true } })).map((s) => s.id);
    await prisma.shipmentEvent.deleteMany({ where: { shipmentId: { in: ships } } });
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.orderShipment.deleteMany({ where: { id: { in: ships } } });
    await prisma.shipmentTracking.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.shopShippingAccount.deleteMany({ where: { shopId: S.shop } });
    await prisma.shop.deleteMany({ where: { id: S.shop } });
    await prisma.user.deleteMany({ where: { id: S.user } });
  });
  beforeEach(() => {
    Object.values(h.c).forEach((f) => f.mockReset());
    h.reserve.mockClear();
    h.sync.mockClear();
    process.env.FLASH_DIRECT_ENABLED = "1";
    process.env.FLASH_DRY_RUN = "";
    h.c.createOrder.mockImplementation(async () => ({ pno: nextPno(), sortCode: "SC1", sortingLineCode: "L2", dstStoreName: "สาขา" }));
    h.c.estimateRate.mockResolvedValue({ estimatePrice: "6500" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("gate: ปิดฟีเจอร์ → FEATURE_DISABLED ไม่ยิง", async () => {
    process.env.FLASH_DIRECT_ENABLED = "0";
    await expect(createFlashShipment(S.shop, S.user, randomUUID())).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(h.c.createOrder).not.toHaveBeenCalled();
  });

  it("สำเร็จ: pno/snapshot/ผู้กด/OrderEvent/ราคาประมาณ · ไม่แตะแถว Order ทั้งแถว (รวม status)", async () => {
    const id = await mkOrder();
    const before = await prisma.order.findUniqueOrThrow({ where: { id } });
    const v = await createFlashShipment(S.shop, S.user, id);
    expect(v).toMatchObject({ status: "CREATED", provider: "FLASH", courierName: "Flash Express", isDryRun: false });
    const [row] = await shipments(id);
    expect(row.trackingNo).toBe(v.trackingNo);
    expect(row.idempotencyKey).toBe(`F${id.replace(/-/g, "")}A1`);
    expect(row.createdByUserId).toBe(S.user);
    expect(row.attemptCount).toBe(1);
    expect(row.senderSnapshot).toMatchObject({ name: "ร้านเทส", district: "วัฒนา" });
    expect(row.receiverSnapshot).toMatchObject({ name: "ผู้รับ", postcode: "10110" });
    expect(row.optionsSnapshot).toMatchObject({ flash: { sortCode: "SC1", sortingLineCode: "L2", dstStoreName: "สาขา", pricingTable: "CONTRACT" } });
    expect(Number(row.estimatedPrice)).toBe(65);
    const [ev] = await events(id, "SHIPMENT_CREATED");
    expect(ev.actorUserId).toBe(S.user);
    expect(h.reserve).toHaveBeenCalledTimes(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });

  it("params: ตำบล→DistrictName อำเภอ→CityName · ยอด COD = ยอดออเดอร์ทุกสตางค์", async () => {
    const id = await mkOrder({ totalAmount: 1234.56, paymentMethod: "COD" });
    await createFlashShipment(S.shop, S.user, id);
    const p = h.c.createOrder.mock.calls[0][1];
    expect(p).toMatchObject({ codEnabled: 1, codAmount: 123456, dstDistrictName: "คลองตัน", dstCityName: "วัฒนา", weight: 1500 });
    expect(JSON.parse(p.subItemTypes)).toEqual([{ itemName: "เสื้อ", itemQuantity: 2 }]);
    expect(Number((await shipments(id))[0].codAmount)).toBe(1234.56);
    const id2 = await mkOrder({ totalAmount: 1234.56, paymentMethod: "TRANSFER" });
    await createFlashShipment(S.shop, S.user, id2);
    expect(h.c.createOrder.mock.calls[1][1]).toMatchObject({ codEnabled: 0 });
    expect(h.c.createOrder.mock.calls[1][1].codAmount).toBeUndefined();
  });

  it("Flash ล่ม → ออเดอร์ยังอยู่ FAILED (ไม่ throw) · ลองใหม่ใช้ outTradeNo เดิม สำเร็จ", async () => {
    const id = await mkOrder();
    h.c.createOrder.mockRejectedValueOnce(fe("UPSTREAM_TIMEOUT"));
    const v = await createFlashShipment(S.shop, S.user, id);
    expect(v).toMatchObject({ status: "FAILED", lastErrorCode: "UPSTREAM_TIMEOUT" });
    expect(h.reserve).not.toHaveBeenCalled();
    const v2 = await createFlashShipment(S.shop, S.user, id); // กดสร้างซ้ำ = ลองใหม่ของใบเดิม
    expect(v2.status).toBe("CREATED");
    expect(v2.id).toBe(v.id);
    expect(h.c.createOrder.mock.calls[1][1].outTradeNo).toBe(h.c.createOrder.mock.calls[0][1].outTradeNo);
    expect((await shipments(id))).toHaveLength(1);
    expect((await shipments(id))[0].attemptCount).toBe(2);
  });

  it("1008 → FAILED COD_NOT_ENABLED · ไม่ลองซ้ำเอง ไม่เปิดแบบไม่ COD · UX = fix-data", async () => {
    const id = await mkOrder({ paymentMethod: "COD" });
    h.c.createOrder.mockRejectedValueOnce(fe("COD_NOT_ENABLED", "1008"));
    const v = await createFlashShipment(S.shop, S.user, id);
    expect(v).toMatchObject({ status: "FAILED", lastErrorCode: "COD_NOT_ENABLED" });
    expect(v.lastErrorMessage).toContain("เก็บเงินปลายทาง");
    expect(h.c.createOrder).toHaveBeenCalledTimes(1);
    expect(Number((await shipments(id))[0].codAmount)).toBe(100);
    expect(classifyFlashRetryUX("COD_NOT_ENABLED")).toBe("fix-data");
  });

  it("1003 ไม่มี pno → NEEDS_REVIEW ไม่เปิดใบใหม่ · retry/สร้างซ้ำถูกปฏิเสธ", async () => {
    const id = await mkOrder();
    h.c.createOrder.mockRejectedValueOnce(fe("DUPLICATE_ORDER", "1003"));
    const v = await createFlashShipment(S.shop, S.user, id);
    expect(v).toMatchObject({ status: "NEEDS_REVIEW", trackingNo: null, lastErrorCode: "DUPLICATE_ORDER" });
    await expect(retryFlashShipment(S.shop, S.user, v.id)).rejects.toMatchObject({ code: "NEEDS_REVIEW" });
    await expect(createFlashShipment(S.shop, S.user, id)).rejects.toMatchObject({ code: "NEEDS_REVIEW" });
    expect(h.c.createOrder).toHaveBeenCalledTimes(1);
    expect(await shipments(id)).toHaveLength(1);
  });

  describe("resolve", () => {
    const toReview = async () => {
      const id = await mkOrder();
      h.c.createOrder.mockRejectedValueOnce(fe("DUPLICATE_ORDER", "1003"));
      const v = await createFlashShipment(S.shop, S.user, id);
      return { id, sid: v.id };
    };

    it("LINK_PNO: routes ผ่าน → แถวเดิมเป็น CREATED + pno", async () => {
      const { id, sid } = await toReview();
      const pno = nextPno();
      h.c.routes.mockResolvedValue({ pno, state: 1, routes: [] });
      const v = await resolveReviewShipment(S.shop, S.user, sid, { action: "LINK_PNO", pno });
      expect(v).toMatchObject({ id: sid, status: "CREATED", trackingNo: pno, lastErrorCode: null });
      expect(await shipments(id)).toHaveLength(1);
    });

    it("LINK_PNO: 1019 → error และแถวคงเดิม · pno ซ้ำกับแถวอื่น → PNO_TAKEN", async () => {
      const { id, sid } = await toReview();
      h.c.routes.mockRejectedValueOnce(fe("NOT_MERCHANT_PARCEL", "1019"));
      await expect(resolveReviewShipment(S.shop, S.user, sid, { action: "LINK_PNO", pno: nextPno() })).rejects.toMatchObject({ code: "NOT_MERCHANT_PARCEL" });
      const other = (await shipments(await mkOrderWithShipment()))[0].trackingNo!;
      h.c.routes.mockResolvedValue({ pno: other, state: 1, routes: [] });
      await expect(resolveReviewShipment(S.shop, S.user, sid, { action: "LINK_PNO", pno: other })).rejects.toMatchObject({ code: "PNO_TAKEN" });
      expect((await shipments(id))[0].status).toBe("NEEDS_REVIEW");
    });

    it("REOPEN ต้อง literal true (truthy ไม่พอ) · ไม่ใช่ NEEDS_REVIEW → INVALID_STATE", async () => {
      const { id, sid } = await toReview();
      for (const bad of ["true", 1, undefined, false]) {
        await expect(
          resolveReviewShipment(S.shop, S.user, sid, { action: "REOPEN", confirmNoExistingParcel: bad } as never),
        ).rejects.toMatchObject({ code: "INVALID_INPUT" });
      }
      expect((await shipments(id))[0].status).toBe("NEEDS_REVIEW");
      const okId = await mkOrderWithShipment();
      const okSid = (await shipments(okId))[0].id;
      await expect(resolveReviewShipment(S.shop, S.user, okSid, { action: "REOPEN", confirmNoExistingParcel: true })).rejects.toMatchObject({ code: "INVALID_STATE" });
    });

    it("REOPEN: ใบเดิม CANCELLED + ผู้ยืนยัน + OrderEvent reason · ใบใหม่ outTradeNo รอบใหม่", async () => {
      const { id, sid } = await toReview();
      const v = await resolveReviewShipment(S.shop, S.user, sid, { action: "REOPEN", confirmNoExistingParcel: true });
      expect(v.status).toBe("CREATED");
      expect(v.id).not.toBe(sid);
      const [oldRow, newRow] = await shipments(id);
      expect(oldRow).toMatchObject({ id: sid, status: "CANCELLED", cancelledByUserId: S.user, lastErrorCode: "REVIEW_REOPENED" });
      expect(oldRow.cancelledAt).toBeTruthy();
      expect(newRow.idempotencyKey).toBe(`F${id.replace(/-/g, "")}A2`);
      expect(oldRow.idempotencyKey).toBe(`F${id.replace(/-/g, "")}A1`);
      const [ev] = await events(id, "SHIPMENT_CANCELLED");
      expect(ev.actorUserId).toBe(S.user);
      expect(ev.meta).toMatchObject({ shipmentId: sid, reason: "FLASH_REVIEW_REOPEN" });
    });
  });

  async function mkOrderWithShipment() {
    const id = await mkOrder();
    await createFlashShipment(S.shop, S.user, id);
    return id;
  }

  describe("ใบเดิมของผู้ให้บริการอื่น", () => {
    it("iShip active row → SHIPMENT_EXISTS ไม่ยิง · DB กันที่ index (P2002) · P2002 ถูกแปลเมื่อชนกัน", async () => {
      const id = await mkOrder();
      await prisma.orderShipment.create({
        data: { orderId: id, shopId: S.shop, provider: "ISHIP", status: "CREATED", idempotencyKey: `${id}:1`, trackingNo: nextPno() },
      });
      await expect(createFlashShipment(S.shop, S.user, id)).rejects.toMatchObject({ code: "SHIPMENT_EXISTS" });
      expect(h.c.createOrder).not.toHaveBeenCalled();
      // ระดับ DB: แถว FLASH PENDING ใบที่สองของออเดอร์เดียวกันต้องชน
      await expect(
        prisma.orderShipment.create({ data: { orderId: id, shopId: S.shop, provider: "FLASH", status: "PENDING", idempotencyKey: `F${id}A9` } }),
      ).rejects.toMatchObject({ code: "P2002" });
      // ข้ามด่านอ่านเพื่อจำลอง race → P2002 ตอน insert ต้องกลายเป็น SHIPMENT_EXISTS
      const orig = prisma.orderShipment.findFirst.bind(prisma.orderShipment);
      const spy = vi.spyOn(prisma.orderShipment, "findFirst").mockImplementation(((a: { where?: { status?: unknown } }) =>
        (a?.where?.status as { not?: string } | undefined)?.not === "CANCELLED" ? Promise.resolve(null) : orig(a as never)) as never);
      try {
        await expect(createFlashShipment(S.shop, S.user, id)).rejects.toMatchObject({ code: "SHIPMENT_EXISTS" });
      } finally {
        spy.mockImplementation(orig as never); // ไม่ใช้ mockRestore: delegate ของ Prisma เป็น getter ลบแล้วหาย
      }
      expect(h.c.createOrder).not.toHaveBeenCalled();
    });

    it("บันทึกเลขส่งเองไว้และไม่มี live → SHIPMENT_EXISTS", async () => {
      const id = await mkOrder();
      await prisma.shipmentTracking.create({ data: { orderId: id, provider: "KERRY", trackingNo: "X123456" } });
      await expect(createFlashShipment(S.shop, S.user, id)).rejects.toMatchObject({ code: "SHIPMENT_EXISTS" });
      expect(h.c.createOrder).not.toHaveBeenCalled();
    });

    it("retry ของ id ที่ไม่ใช่ FLASH → NOT_FOUND", async () => {
      await expect(retryFlashShipment(S.shop, S.user, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  it("dry-run: ไม่ยิง HTTP จริง · pno FLDRY · isDryRun · ไม่จองแจ้งเลข", async () => {
    process.env.FLASH_DRY_RUN = "1";
    const actual = await vi.importActual<typeof import("@/lib/flash/client")>("@/lib/flash/client");
    h.c.createOrder.mockImplementation(actual.createOrder);
    const fetchSpy = vi.fn(() => { throw new Error("must not call"); });
    vi.stubGlobal("fetch", fetchSpy);
    const id = await mkOrder();
    const v = await createFlashShipment(S.shop, S.user, id);
    expect(v).toMatchObject({ status: "CREATED", isDryRun: true });
    expect(v.trackingNo).toMatch(/^FLDRY/);
    expect(h.reserve).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe("ผูก pno", () => {
    it("สำเร็จ: LINKED/CREATED · estimatedPrice null · ไม่เรียก syncOrderPaymentToParcel · Order.status ไม่เปลี่ยน", async () => {
      const id = await mkOrder({ paymentMethod: "TRANSFER" });
      const before = await prisma.order.findUniqueOrThrow({ where: { id } });
      const pno = nextPno();
      h.c.routes.mockResolvedValue({ pno, state: 1, routes: [] });
      const v = await linkFlashShipment(S.shop, S.user, id, pno);
      expect(v).toMatchObject({ status: "CREATED", source: "LINKED", provider: "FLASH", trackingNo: pno });
      const [row] = await shipments(id);
      expect(row.estimatedPrice).toBeNull();
      expect(Number(row.codAmount)).toBe(0);
      expect(row.idempotencyKey).toBe(`link:${pno}:1`);
      expect(h.sync).not.toHaveBeenCalled();
      expect(h.c.createOrder).not.toHaveBeenCalled();
      expect((await events(id, "SHIPMENT_LINKED")).length).toBe(1);
      expect(await prisma.order.findUniqueOrThrow({ where: { id } })).toEqual(before);
    });

    it("1019 → error ไม่สร้างแถว · เลขซ้ำ → PNO_TAKEN · มีใบ active → SHIPMENT_EXISTS", async () => {
      const id = await mkOrder();
      h.c.routes.mockRejectedValueOnce(fe("NOT_MERCHANT_PARCEL", "1019"));
      await expect(linkFlashShipment(S.shop, S.user, id, nextPno())).rejects.toMatchObject({ code: "NOT_MERCHANT_PARCEL" });
      expect(await shipments(id)).toHaveLength(0);
      const taken = (await shipments(await mkOrderWithShipment()))[0].trackingNo!;
      await expect(linkFlashShipment(S.shop, S.user, id, taken)).rejects.toMatchObject({ code: "PNO_TAKEN" });
      const busy = await mkOrderWithShipment();
      await expect(linkFlashShipment(S.shop, S.user, busy, nextPno())).rejects.toMatchObject({ code: "SHIPMENT_EXISTS" });
    });
  });

  it("previewFlashPno: ล่าสุด ≤3 · ไม่มี route = order_success · 1019 โยนต่อ", async () => {
    const t = (s: number) => 1_700_000_000 + s;
    h.c.routes.mockResolvedValueOnce({
      pno: "TH0001", state: "2", routes: [1, 2, 3, 4].map((i) => ({ routedAt: t(i * 100), routeAction: "A", message: `m${i}`, state: "2" })),
    });
    const p = await previewFlashPno(S.shop, "TH000123");
    expect(p).toMatchObject({ state: 2, carrierStatus: "in_transit" });
    expect(p.routes.map((r) => r.message)).toEqual(["m4", "m3", "m2"]);
    h.c.routes.mockResolvedValueOnce({ pno: "TH0001", routes: [] });
    expect(await previewFlashPno(S.shop, "TH000123")).toMatchObject({ state: null, carrierStatus: "order_success", routes: [] });
    h.c.routes.mockRejectedValueOnce(fe("NOT_MERCHANT_PARCEL", "1019"));
    await expect(previewFlashPno(S.shop, "TH000123")).rejects.toMatchObject({ code: "NOT_MERCHANT_PARCEL" });
    await expect(previewFlashPno(S.shop, "bad pno")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
