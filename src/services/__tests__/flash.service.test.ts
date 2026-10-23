/**
 * 00084 T5 — flash.service (DB จริง local + mock client)
 * 🛑 HR13/14: รันเฉพาะ DATABASE_URL = localhost:5434 · ลบเฉพาะ id ที่เทสสร้างเอง
 * mutation ที่ต้องแดง: ถอดการจำแนกจาก infos (ให้ทุกชนิดเป็น EMPTY) ใน syncFlashWebhooks ⇒ เทส "EXTERNAL ไม่ถูกทับ" แดง
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { c, env } = vi.hoisted(() => {
  process.env.FLASH_DIRECT_ENABLED = "1";
  process.env.FLASH_WEBHOOK_BASE_URL = "https://deep.test";
  process.env.FLASH_DRY_RUN = "";
  process.env.CHANNEL_TOKEN_KEY ??= "0".repeat(64);
  return {
    env: process.env,
    c: {
      warehouses: vi.fn(),
      webhookInfos: vi.fn(),
      setWebhook: vi.fn(),
      estimateRate: vi.fn(),
      notify: vi.fn(),
      cancelNotify: vi.fn(),
    },
  };
});
vi.mock("@/lib/flash/client", () => c);

import { prisma } from "@/lib/prisma";
import { FlashError, FlashServiceError } from "@/lib/flash/errors";
import { hashWebhookSecret } from "@/lib/flash/credential";
import { decodeCredential } from "@/lib/flash/credential";
import {
  connectFlash, verifyFlash, disconnectFlash, getFlashSettings, updateFlashSettings, syncFlashWebhooks,
  estimateFlashPrice, estimatePrice, requestFlashPickup, cancelFlashPickup, getFlashPanelOrReason, getFlashConnection,
} from "../flash.service";

const url = env.DATABASE_URL ?? "";
const isLocal = /@(localhost|127\.0\.0\.1):5434\//.test(url);
const run = randomUUID().slice(0, 8);
const S = { user: "", shop: "", shop2: "" };
const orders: string[] = [];
const MCH = `M${run}`;
const KEY = "k".repeat(30) + "ABCD";
const ours = (w: string, k: string) => `https://deep.test/api/webhooks/flash/${w}?k=${k}`;
const KINDS = ["status", "weight", "price", "courier", "routes"] as const;
const infosOf = (m: Partial<Record<(typeof KINDS)[number], string>>) =>
  KINDS.filter((k) => m[k]).map((k) => ({ webhookApiCode: KINDS.indexOf(k), url: m[k] }));
const row = (shopId = S.shop, provider = "FLASH") =>
  prisma.shopShippingAccount.findUnique({ where: { shopId_provider: { shopId, provider } } });
const secretOf = async () => decodeCredential((await row())!.accessTokenEnc).webhookSecret;
const fe = (code: ConstructorParameters<typeof FlashError>[0], flashCode?: string) => new FlashError(code, { flashCode });

const SENDER = {
  senderName: "ร้านเทส", senderPhone: "0812345678", senderAddress: "1 ถ.เทส", senderSubdistrict: "คลองตัน",
  senderDistrict: "วัฒนา", senderProvince: "กรุงเทพมหานคร", senderPostcode: "10110",
};

async function resetFlash() {
  await prisma.shipmentPickup.deleteMany({ where: { shopId: S.shop } });
  await prisma.shopShippingAccount.deleteMany({ where: { shopId: { in: [S.shop, S.shop2] } } }); // ทั้งสองผู้ให้บริการ — เฉพาะร้านที่เทสสร้าง
}
async function connectOk(infos: unknown = []) {
  c.warehouses.mockResolvedValue([]);
  c.webhookInfos.mockResolvedValue(infos);
  c.setWebhook.mockResolvedValue({});
  return connectFlash(S.shop, S.user, { mchId: MCH, secretKey: KEY }, { isOwner: true });
}

describe.skipIf(!isLocal)("flash.service", () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { displayName: `fs-${run}`, username: `fs_${run}` }, select: { id: true } });
    const mk = (n: string) =>
      prisma.shop.create({ data: { userId: u.id, shopName: `fs${n}-${run}`, kind: "BUSINESS", vertical: "ONLINE_SALES" } as never, select: { id: true } });
    const [a, b] = [await mk("1"), await mk("2")];
    Object.assign(S, { user: u.id, shop: a.id, shop2: b.id });
  });
  afterAll(async () => {
    await prisma.shipmentPickup.deleteMany({ where: { shopId: { in: [S.shop, S.shop2] } } });
    await prisma.orderShipment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.shopShippingAccount.deleteMany({ where: { shopId: { in: [S.shop, S.shop2] } } });
    await prisma.shop.deleteMany({ where: { id: { in: [S.shop, S.shop2] } } });
    await prisma.user.deleteMany({ where: { id: S.user } });
  });
  beforeEach(async () => {
    Object.values(c).forEach((f) => f.mockReset());
    env.FLASH_DIRECT_ENABLED = "1";
    await resetFlash();
  });

  describe("gate", () => {
    it("ปิดฟีเจอร์ → connect/estimate/pickup = FEATURE_DISABLED และไม่ยิง Flash", async () => {
      env.FLASH_DIRECT_ENABLED = "0";
      await expect(connectFlash(S.shop, S.user, { mchId: MCH, secretKey: KEY })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
      await expect(estimateFlashPrice(S.shop, { receiver: { district: "a", province: "b", postcode: "10110" }, weight: 1 })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
      await expect(requestFlashPickup(S.shop, S.user, { parcelCount: 1 })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
      expect(c.warehouses).not.toHaveBeenCalled();
      expect((await getFlashConnection(S.shop)).available).toBe(false);
    });
  });

  describe("connect", () => {
    it.each([
      ["MERCHANT_NOT_FOUND", "1001"],
      ["SIGN_INVALID", "1002"],
      ["UPSTREAM_TIMEOUT", undefined],
    ] as const)("key ผิด %s → ไม่บันทึกอะไร", async (code, fc) => {
      c.warehouses.mockRejectedValue(fe(code, fc));
      await expect(connectFlash(S.shop, S.user, { mchId: MCH, secretKey: KEY })).rejects.toMatchObject({ code });
      expect(await row()).toBeNull();
      expect(c.webhookInfos).not.toHaveBeenCalled();
    });

    it("ผ่าน → envelope เข้ารหัส ไม่มี plaintext ใน view/DB · createMode OFF · ตั้ง webhook ครบ 5", async () => {
      const r = await connectOk();
      const db = (await row())!;
      expect(db.status).toBe("ACTIVE");
      expect(db.createMode).toBe("OFF");
      expect(db.accessTokenEnc).not.toContain(KEY);
      expect(db.tokenLast4).toBe("ABCD");
      expect(db.webhookSecretHash).toBe(hashWebhookSecret(await secretOf()));
      expect(JSON.stringify(r)).not.toContain(KEY);
      expect(JSON.stringify(r)).not.toContain(await secretOf());
      expect(r.created).toBe(true);
      expect(r.connection.merchantId).toBe(MCH);
      expect(r.connection.merchantIdMasked).not.toBe(MCH);
      expect(r.webhook.status).toBe("REGISTERED");
      expect(c.setWebhook).toHaveBeenCalledTimes(5);
      expect(c.setWebhook.mock.calls[0][1]).toMatchObject({ serviceCategory: 1 });
    });

    it("lastPickup = คำขอ FLASH ล่าสุดที่ไม่ CANCELLED/CLOSED · ไม่มี = null", async () => {
      await connectOk();
      expect((await getFlashConnection(S.shop)).lastPickup).toBeNull();
      const mk = (status: string, extra: object = {}) =>
        prisma.shipmentPickup.create({ data: { shopId: S.shop, provider: "FLASH", courierCode: "FLASH", status, createdByUserId: S.user, ...extra } });
      await mk("CLOSED");
      expect((await getFlashConnection(S.shop)).lastPickup).toBeNull();
      const live = await mk("ACCEPTED", { staffName: "สมชาย", ticketPickupId: "T1", currentTicketPickupId: "T2", isDryRun: true });
      await mk("CANCELLED");
      await prisma.shipmentPickup.create({ data: { shopId: S.shop, provider: "ISHIP", courierCode: "X", createdByUserId: S.user } });
      const lp = (await getFlashConnection(S.shop)).lastPickup;
      expect(lp).toMatchObject({ id: live.id, status: "ACCEPTED", staffName: "สมชาย", ticketPickupId: "T1", currentTicketPickupId: "T2", isDryRun: true });
      expect(lp!.createdAt).toBe(live.createdAt.toISOString());
    });

    it("ไม่ใช่ OWNER → ไม่เห็น mchId เต็ม", async () => {
      await connectOk();
      expect((await getFlashConnection(S.shop)).merchantId).toBeNull();
    });

    it("mchId ใช้โดยร้านอื่น → MERCHANT_IN_USE · แต่ key ผิดต้องได้ error ของ key ก่อน (ไม่เป็นตัวสอบถาม)", async () => {
      await connectOk();
      c.warehouses.mockRejectedValue(fe("SIGN_INVALID", "1002"));
      await expect(connectFlash(S.shop2, S.user, { mchId: MCH, secretKey: KEY })).rejects.toMatchObject({ code: "SIGN_INVALID" });
      c.warehouses.mockResolvedValue([]);
      await expect(connectFlash(S.shop2, S.user, { mchId: MCH, secretKey: KEY })).rejects.toMatchObject({ code: "MERCHANT_IN_USE" });
      expect(await row(S.shop2)).toBeNull();
    });

    it("P2002 จาก partial unique (race) = MERCHANT_IN_USE ผลเดียวกัน", async () => {
      await connectOk();
      c.warehouses.mockResolvedValue([]);
      // ทำให้ด่านตรวจซ้ำ "มองไม่เห็น" ร้านแรก (จำลอง race) — ให้ DB partial unique เป็นด่านตัดสิน
      const delegate = prisma.shopShippingAccount as unknown as { findFirst: unknown };
      const orig = delegate.findFirst;
      delegate.findFirst = async () => null;
      try {
        await expect(connectFlash(S.shop2, S.user, { mchId: MCH, secretKey: KEY })).rejects.toMatchObject({ code: "MERCHANT_IN_USE" });
      } finally {
        delegate.findFirst = orig;
      }
      expect(await row(S.shop2)).toBeNull();
    });

    it("เปลี่ยน mchId ขณะเชื่อมอยู่ → ปฏิเสธ · เปลี่ยน key ใต้ mchId เดิม → ใช้ w เดิม + audit change_key", async () => {
      await connectOk(infosOf({}));
      const w = await secretOf();
      await expect(connectFlash(S.shop, S.user, { mchId: `${MCH}x`, secretKey: KEY })).rejects.toMatchObject({ code: "MERCHANT_CHANGE_NOT_ALLOWED" });
      const r = await connectFlash(S.shop, S.user, { mchId: MCH, secretKey: "z".repeat(30) + "WXYZ" });
      expect(r.created).toBe(false);
      expect(await secretOf()).toBe(w);
      expect((await row())!.tokenLast4).toBe("WXYZ");
      expect(((await row())!.auditLog as { action: string }[]).map((e) => e.action)).toContain("change_key");
    });

    it("ลงทะเบียน webhook ล้ม → connect ยังสำเร็จ + FAILED แล้วลองใหม่ได้ REGISTERED", async () => {
      c.warehouses.mockResolvedValue([]);
      c.webhookInfos.mockRejectedValue(fe("UPSTREAM_ERROR"));
      const r = await connectFlash(S.shop, S.user, { mchId: MCH, secretKey: KEY });
      expect(r.connection.status).toBe("ACTIVE");
      expect(r.webhook.status).toBe("FAILED");
      expect((await row())!.webhookStatus).toBe("FAILED");
      c.webhookInfos.mockResolvedValue([]);
      c.setWebhook.mockResolvedValue({});
      expect((await syncFlashWebhooks(S.shop, S.user)).status).toBe("REGISTERED");
      expect((await row())!.webhookStatus).toBe("REGISTERED");
    });
  });

  describe("verify", () => {
    it("1001/1002 → TOKEN_INVALID (view) · timeout ไม่เปลี่ยนสถานะ · ผ่าน → ACTIVE", async () => {
      await connectOk();
      c.warehouses.mockRejectedValue(fe("UPSTREAM_TIMEOUT"));
      await expect(verifyFlash(S.shop)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
      expect((await row())!.status).toBe("ACTIVE");
      c.warehouses.mockRejectedValue(fe("SIGN_INVALID", "1002"));
      expect((await verifyFlash(S.shop)).status).toBe("TOKEN_INVALID");
      expect((await row())!.lastVerifyError).toBeTruthy();
      c.warehouses.mockResolvedValue([]);
      const v = await verifyFlash(S.shop);
      expect(v.status).toBe("ACTIVE");
      expect(v.lastVerifyError).toBeNull();
    });
    it("ยังไม่เชื่อม → NOT_CONNECTED", async () => {
      await expect(verifyFlash(S.shop)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    });
  });

  describe("syncFlashWebhooks", () => {
    it("อ่าน infos ก่อนเขียนเสมอ · ว่าง→ตั้ง · OURS→คง", async () => {
      await connectOk(infosOf({}));
      const w = await secretOf();
      Object.values(c).forEach((f) => f.mockReset());
      const order: string[] = [];
      c.webhookInfos.mockImplementation(async () => (order.push("infos"), infosOf({ status: ours(w, "status"), routes: ours(w, "routes") })));
      c.setWebhook.mockImplementation(async () => (order.push("set"), {}));
      const r = await syncFlashWebhooks(S.shop, S.user);
      expect(order[0]).toBe("infos");
      expect(c.setWebhook).toHaveBeenCalledTimes(3);
      expect(r.kinds.find((k) => k.kind === "status")).toMatchObject({ state: "OURS", action: "KEPT" });
      expect(r.kinds.find((k) => k.kind === "price")).toMatchObject({ state: "EMPTY", action: "SET" });
      expect(r.status).toBe("REGISTERED");
      expect(c.setWebhook.mock.calls[0][1].url).toBe(ours(w, c.setWebhook.mock.calls[0][1].url.split("k=")[1]));
    });

    it("EXTERNAL → ไม่ทับ + คืนเฉพาะ host (ไม่มี path/query/secret) · status EXTERNAL", async () => {
      await connectOk();
      Object.values(c).forEach((f) => f.mockReset());
      c.webhookInfos.mockResolvedValue(infosOf({ routes: "https://other.example/hook/abc?token=SECRET123" }));
      c.setWebhook.mockResolvedValue({});
      const r = await syncFlashWebhooks(S.shop, S.user);
      expect(c.setWebhook.mock.calls.map((x) => x[1].webhookApiCode)).not.toContain(4);
      expect(r.kinds.find((k) => k.kind === "routes")).toMatchObject({ state: "EXTERNAL", action: "SKIPPED", host: "other.example" });
      expect(JSON.stringify(r)).not.toMatch(/SECRET123|\/hook|token/);
      expect(r.status).toBe("EXTERNAL");
      expect((await row())!.webhookStatus).toBe("EXTERNAL");
    });

    it("OTHER_DEEP (URL Deep ที่ไม่ใช่ secret ปัจจุบัน) → ตั้งใหม่เองโดยไม่ต้อง override", async () => {
      await connectOk();
      Object.values(c).forEach((f) => f.mockReset());
      const w = await secretOf();
      c.webhookInfos.mockResolvedValue(infosOf({ status: ours(w, "status"), weight: ours(w, "weight"), price: ours(w, "price"), courier: ours(w, "courier"), routes: ours("OLDSECRET", "routes") }));
      c.setWebhook.mockResolvedValue({});
      const r = await syncFlashWebhooks(S.shop, S.user);
      expect(r.kinds.find((k) => k.kind === "routes")).toMatchObject({ state: "OTHER_DEEP", action: "SET" });
      expect(c.setWebhook.mock.calls.map((x) => x[1].webhookApiCode)).toEqual([4]);
      expect(r.status).toBe("REGISTERED");
    });

    it("override → ทับเฉพาะชนิดที่เลือก · UNKNOWN ไม่ทับแม้อยู่ใน override", async () => {
      await connectOk();
      Object.values(c).forEach((f) => f.mockReset());
      const w = await secretOf();
      c.webhookInfos.mockResolvedValue([
        ...infosOf({ status: ours(w, "status"), weight: ours(w, "weight"), courier: ours(w, "courier") }),
        { webhookApiCode: 4, url: "https://other.example/r" },
        { webhookApiCode: 2, endpoint: "no-url-key" }, // อ่านรูปไม่ออก → UNKNOWN
      ]);
      c.setWebhook.mockResolvedValue({});
      const r = await syncFlashWebhooks(S.shop, S.user, { overrideKinds: ["routes", "price"] });
      expect(c.setWebhook.mock.calls.map((x) => x[1].webhookApiCode)).toEqual([4]);
      expect(r.kinds.find((k) => k.kind === "price")).toMatchObject({ state: "UNKNOWN", action: "SKIPPED" });
      expect(r.kinds.find((k) => k.kind === "routes")).toMatchObject({ action: "SET" });
      expect(r.status).toBe("EXTERNAL");
      const log = (await row())!.auditLog as { action: string; kinds?: string[] }[];
      expect(log.at(-1)).toMatchObject({ action: "webhook_override", kinds: ["routes"] });
    });
  });

  describe("disconnect", () => {
    it("ล้าง key คง merchantId · ปิดเฉพาะ OURS · ล้มปิด webhook ก็ยังถอนได้ · ไม่แตะแถว ISHIP", async () => {
      await prisma.shopShippingAccount.create({
        data: { shopId: S.shop, provider: "ISHIP", accessTokenEnc: "iship-enc", tokenLast4: "1234", status: "ACTIVE", connectedByUserId: S.user },
      });
      const iBefore = await row(S.shop, "ISHIP");
      await connectOk();
      const w = await secretOf();
      Object.values(c).forEach((f) => f.mockReset());
      c.webhookInfos.mockResolvedValue(infosOf({ status: ours(w, "status"), price: "https://other.example/p" }));
      c.setWebhook.mockRejectedValueOnce(fe("UPSTREAM_ERROR"));
      await disconnectFlash(S.shop, S.user);
      expect(c.setWebhook).toHaveBeenCalledTimes(1);
      expect(c.setWebhook.mock.calls[0][1]).toEqual({ serviceCategory: 0, webhookApiCode: 0 });
      const d = (await row())!;
      expect(d).toMatchObject({ status: "DISCONNECTED", accessTokenEnc: "", tokenLast4: null, merchantId: MCH, webhookSecretHash: null, webhookStatus: "NOT_SET" });
      expect(await row(S.shop, "ISHIP")).toEqual(iBefore);
      expect((d.auditLog as { action: string }[]).map((e) => e.action)).toEqual(expect.arrayContaining(["connect", "disconnect"]));
      expect(JSON.stringify(d.auditLog)).not.toContain(KEY);
      await expect(disconnectFlash(S.shop, S.user)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    });

    it("เชื่อมใหม่หลังถอนสร้าง w ใหม่", async () => {
      await connectOk();
      const w1 = await secretOf();
      await disconnectFlash(S.shop, S.user);
      await connectOk();
      expect(await secretOf()).not.toBe(w1);
    });
  });

  describe("settings", () => {
    it("whitelist · ไม่มี key ใน view · ยังไม่เชื่อม → NOT_CONNECTED", async () => {
      await expect(getFlashSettings(S.shop)).rejects.toMatchObject({ code: "NOT_CONNECTED" });
      await connectOk();
      const r = await updateFlashSettings(S.shop, {
        ...SENDER, defaultWeight: 1.5, defaultCategoryId: 2, labelSize: "SMALL", createMode: "ASK",
        // field นอก whitelist ต้องไม่ผ่าน
        ...({ accessTokenEnc: "HACK", merchantId: "HACK", status: "DISCONNECTED", defaultCodEnabled: true } as object),
      });
      const db = (await row())!;
      expect(db).toMatchObject({ merchantId: MCH, status: "ACTIVE", defaultCodEnabled: false });
      expect(db.accessTokenEnc).not.toBe("HACK");
      expect(r.settings).toMatchObject({ defaultWeight: 1.5, labelSize: "SMALL", createMode: "ASK" });
      expect(r.connection).toMatchObject({ senderComplete: true, settingsComplete: true, labelSize: "SMALL" });
      expect(JSON.stringify(r)).not.toMatch(/accessTokenEnc|webhookSecret/);
    });
  });

  describe("estimateFlashPrice / estimatePrice", () => {
    const input = { receiver: { district: "วัฒนา", province: "กรุงเทพมหานคร", postcode: "10110" }, weight: 1 };
    it("estimatePrice: สตางค์ string→บาท · 0/abc/ติดลบ = null", () => {
      expect(estimatePrice({ estimatePrice: "4500" })).toBe(45);
      for (const v of ["0", "abc", "-5", null, 4.5]) expect(estimatePrice({ estimatePrice: v })).toBeNull();
      expect(estimatePrice(null)).toBeNull();
    });
    it("ตารางสัญญา(1)ก่อน สำเร็จ → CONTRACT · ล้ม → ตก 0 ติดป้าย STANDARD · ทั้งคู่ไม่มีราคา → error ไม่คืน 0", async () => {
      await connectOk();
      await updateFlashSettings(S.shop, SENDER);
      c.estimateRate.mockResolvedValueOnce({ estimatePrice: "4500" });
      expect(await estimateFlashPrice(S.shop, input)).toEqual({ totalBaht: 45, pricingTable: "CONTRACT", estimate: true });
      expect(c.estimateRate.mock.calls[0][1].pricingTable).toBe(1);
      c.estimateRate.mockReset();
      c.estimateRate.mockRejectedValueOnce(fe("UPSTREAM_ERROR")).mockResolvedValueOnce({ estimatePrice: "6000" });
      expect(await estimateFlashPrice(S.shop, input)).toMatchObject({ totalBaht: 60, pricingTable: "STANDARD" });
      expect(c.estimateRate.mock.calls.map((x) => x[1].pricingTable)).toEqual([1, 0]);
      c.estimateRate.mockReset();
      c.estimateRate.mockResolvedValue({ estimatePrice: "0" });
      await expect(estimateFlashPrice(S.shop, input)).rejects.toBeInstanceOf(FlashError);
    });
    it("1002 ระหว่างประเมิน → TOKEN_INVALID ไม่ลองตารางถัดไป · ผู้ส่งไม่ครบ → INCOMPLETE_DATA", async () => {
      await connectOk();
      await expect(estimateFlashPrice(S.shop, input)).rejects.toMatchObject({ code: "INCOMPLETE_DATA" });
      await updateFlashSettings(S.shop, SENDER);
      c.estimateRate.mockRejectedValue(fe("SIGN_INVALID", "1002"));
      await expect(estimateFlashPrice(S.shop, input)).rejects.toMatchObject({ code: "SIGN_INVALID" });
      expect(c.estimateRate).toHaveBeenCalledTimes(1);
      expect((await row())!.status).toBe("TOKEN_INVALID");
    });
  });

  describe("pickup", () => {
    it("ผู้ส่งไม่ครบ → ปฏิเสธก่อนยิง", async () => {
      await connectOk();
      await expect(requestFlashPickup(S.shop, S.user, { parcelCount: 2 })).rejects.toMatchObject({ code: "INCOMPLETE_DATA" });
      expect(c.notify).not.toHaveBeenCalled();
    });
    it("สำเร็จ → บันทึก ticket/current/คนขับ/ผู้ทำ · 1010 → PICKUP_PENDING ยิงครั้งเดียว + แถว FAILED", async () => {
      await connectOk();
      await updateFlashSettings(S.shop, SENDER);
      c.notify.mockResolvedValueOnce({ ticketPickupId: 777, staffInfoName: "สมชาย", staffInfoPhone: "0900000000", timeoutAtText: "พรุ่งนี้" });
      const p = await requestFlashPickup(S.shop, S.user, { parcelCount: 3, remark: "หลังบ้าน" });
      const db = await prisma.shipmentPickup.findUniqueOrThrow({ where: { id: p.id } });
      expect(db).toMatchObject({ provider: "FLASH", courierCode: "FLASH", ticketPickupId: "777", currentTicketPickupId: "777", createdByUserId: S.user, status: "REQUESTED", staffName: "สมชาย" });
      c.notify.mockReset();
      c.notify.mockRejectedValue(fe("PICKUP_PENDING", "1010"));
      await expect(requestFlashPickup(S.shop, S.user, { parcelCount: 1 })).rejects.toMatchObject({ code: "PICKUP_PENDING" });
      expect(c.notify).toHaveBeenCalledTimes(1);
      expect(await prisma.shipmentPickup.count({ where: { shopId: S.shop, status: "FAILED", provider: "FLASH" } })).toBe(1);
    });
    it("ยกเลิกใช้ currentTicketPickupId · 1011 → อ่านรหัสล่าสุดแล้วลองครั้งเดียว · ล้มซ้ำ → PICKUP_NOT_CANCELLABLE", async () => {
      await connectOk();
      const mk = (cur: string | null) =>
        prisma.shipmentPickup.create({ data: { shopId: S.shop, provider: "FLASH", courierCode: "FLASH", ticketPickupId: "100", currentTicketPickupId: cur, createdByUserId: S.user } });
      const a = await mk("200");
      c.cancelNotify.mockResolvedValueOnce({});
      expect((await cancelFlashPickup(S.shop, a.id)).status).toBe("CANCELLED");
      expect(c.cancelNotify.mock.calls[0][1]).toBe("200");

      c.cancelNotify.mockReset();
      const b = await mk("200");
      c.cancelNotify.mockImplementationOnce(async () => {
        await prisma.shipmentPickup.update({ where: { id: b.id }, data: { currentTicketPickupId: "300" } }); // webhook โอนงานระหว่างนั้น
        throw fe("PICKUP_NOT_CANCELLABLE", "1011");
      }).mockResolvedValueOnce({});
      await cancelFlashPickup(S.shop, b.id);
      expect(c.cancelNotify.mock.calls.map((x) => x[1])).toEqual(["200", "300"]);

      c.cancelNotify.mockReset();
      const d = await mk(null);
      c.cancelNotify.mockRejectedValue(fe("PICKUP_NOT_CANCELLABLE", "1011"));
      await expect(cancelFlashPickup(S.shop, d.id)).rejects.toMatchObject({ code: "PICKUP_NOT_CANCELLABLE" });
      expect(c.cancelNotify).toHaveBeenCalledTimes(2);
      expect(c.cancelNotify.mock.calls[0][1]).toBe("100");
      expect((await prisma.shipmentPickup.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("REQUESTED");
    });
    it("แถวของ ISHIP / ร้านอื่น → NOT_FOUND", async () => {
      const other = await prisma.shipmentPickup.create({ data: { shopId: S.shop, provider: "ISHIP", courierCode: "X", createdByUserId: S.user } });
      await connectOk();
      await expect(cancelFlashPickup(S.shop, other.id)).rejects.toBeInstanceOf(FlashServiceError);
      await expect(cancelFlashPickup(S.shop2, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getFlashPanelOrReason", () => {
    const mkOrder = async (mode = "SHIPPED") => {
      const o = await prisma.order.create({
        data: {
          shopId: S.shop, type: "PHYSICAL", totalAmount: 100, fulfillmentMode: mode, buyerName: "ผู้รับ", buyerContact: "0811111111",
          shippingAddress: { line1: "9 ถ.ทดสอบ", subdistrict: "ก", district: "ข", province: "กรุงเทพมหานคร", postcode: "10110" },
          items: { create: { name: "เสื้อ", qty: 1, price: 100 } },
        },
        select: { id: true },
      });
      orders.push(o.id);
      return o.id;
    };
    it("ไม่พบ/ไม่ต้องจัดส่ง → reason", async () => {
      expect(await getFlashPanelOrReason(S.shop, randomUUID())).toHaveProperty("reason");
      expect(await getFlashPanelOrReason(S.shop, await mkOrder("PICKUP"))).toHaveProperty("reason");
    });
    it("สถานะ NOT_CONNECTED → TOKEN_INVALID → READY และ gate ปิด = UNAVAILABLE", async () => {
      const id = await mkOrder();
      expect(await getFlashPanelOrReason(S.shop, id)).toMatchObject({ flashState: "NOT_CONNECTED", shipment: null });
      await connectOk();
      c.warehouses.mockRejectedValue(fe("SIGN_INVALID", "1002"));
      await verifyFlash(S.shop);
      expect(await getFlashPanelOrReason(S.shop, id)).toMatchObject({ flashState: "TOKEN_INVALID" });
      c.warehouses.mockResolvedValue([]);
      await verifyFlash(S.shop);
      const ready = await getFlashPanelOrReason(S.shop, id);
      expect(ready).toMatchObject({ flashState: "READY", provider: "FLASH", canShip: false, blockedBy: { kind: "SENDER" } });
      await updateFlashSettings(S.shop, { ...SENDER, defaultWeight: 1, defaultCategoryId: 2 });
      expect(await getFlashPanelOrReason(S.shop, id)).toMatchObject({ canShip: true, blockedBy: null, defaults: { courierCode: null, weight: 1 } });
      env.FLASH_DIRECT_ENABLED = "0";
      expect(await getFlashPanelOrReason(S.shop, id)).toMatchObject({ flashState: "UNAVAILABLE" });
    });
    it("ใบ iShip ที่ยังอยู่ → activeElsewhere + canShip=false", async () => {
      const id = await mkOrder();
      await connectOk();
      await updateFlashSettings(S.shop, SENDER);
      await prisma.orderShipment.create({
        data: { order: { connect: { id } }, shop: { connect: { id: S.shop } }, provider: "ISHIP", status: "CREATED", source: "CREATED", trackingNo: `T${run}`, courierName: "ขนส่งทดสอบ", idempotencyKey: `k-${run}` } as never,
      });
      expect(await getFlashPanelOrReason(S.shop, id)).toMatchObject({
        canShip: false,
        activeElsewhere: { provider: "ISHIP", trackingNo: `T${run}`, courierName: "ขนส่งทดสอบ" },
        shipment: { provider: "ISHIP" },
      });
    });
  });

  it("ไม่แตะแถว ISHIP ตลอดทุกการกระทำของ Flash (เทียบทุกคอลัมน์)", async () => {
    await prisma.shopShippingAccount.create({
      data: { shopId: S.shop, provider: "ISHIP", accessTokenEnc: "iship-enc", tokenLast4: "9999", status: "ACTIVE", connectedByUserId: S.user, senderName: "iship" },
    });
    const before = await row(S.shop, "ISHIP");
    await connectOk();
    await updateFlashSettings(S.shop, SENDER);
    c.warehouses.mockRejectedValue(fe("SIGN_INVALID", "1002"));
    await verifyFlash(S.shop);
    await disconnectFlash(S.shop, S.user);
    expect(await row(S.shop, "ISHIP")).toEqual(before);
  });
});
