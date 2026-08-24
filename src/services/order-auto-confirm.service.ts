// order-auto-confirm.service.ts — ปิดคำสั่งซื้อที่ขนส่งยืนยันว่าส่งถึงแล้วและพ้นระยะทักท้วง
// feature 00039 (FR-OSM-01 / TFR-005)
//
// ทำไมต้องมี: ก่อนหน้านี้คำสั่งซื้อจะเป็น CONFIRMED ได้ 2 ทางเท่านั้น —
//   (1) ผู้ซื้อกดยืนยันเอง  (2) เงิน COD ถูกเคลียร์ผ่าน iShip
// ใบที่ "โอนเงินล่วงหน้า + ขนส่งส่งถึงแล้ว + ผู้ซื้อลืมกด" จึงค้าง PENDING/SHIPPED ตลอดกาล
// ทั้งที่ของถึงมือลูกค้าไปแล้ว → ตัวเลขบนหน้าร้านต่ำกว่าปริมาณที่ขายได้จริง
// พูดอีกแบบคือมันวัด "ความขี้ลืมของผู้ซื้อ" แทนที่จะวัดผลงานของร้าน
//
// 🛑 หมายเหตุเรื่อง BR-ISHIP-41 ("ห้ามให้สถานะพัสดุไปเปลี่ยนสถานะคำสั่งซื้อเอง")
// ไฟล์นี้ทำสิ่งที่กฎนั้นห้ามไว้ตรงตัว จึงต้องอธิบายให้ชัด: กฎนั้นเขียนขึ้นเพื่อกัน
// "พัสดุขยับแล้วออเดอร์ขยับตามทันทีแบบอัตโนมัติ" ซึ่งทำให้สถานะสองชุดปนกันจนแก้ไม่ได้
// ข้อยกเว้นที่มีอยู่ก่อนแล้วคือ COD settlement (BR-ISHIP-45) และนี่คือข้อยกเว้นที่สอง
// ซึ่งต่างจากกรณีที่กฎห้ามใน 3 ข้อ:
//   1. ไม่ใช่ "ทันที" — ต้องผ่านระยะให้ผู้ซื้อทักท้วง 7 วันก่อน
//   2. มีทางให้ผู้ซื้อหยุดได้ (ธงข้อพิพาท) ไม่ใช่การตัดสินฝ่ายเดียว
//   3. บันทึกในประวัติว่าระบบเป็นผู้ยืนยัน ไม่ปลอมเป็นการกระทำของผู้ซื้อ

import { prisma } from "@/lib/prisma";
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { AUTO_CONFIRM_GRACE_MS } from "@/lib/order-stats";
import { recordOrderEvent } from "./order-event.service";

/** จำนวนใบสูงสุดต่อรอบ — กัน serverless timeout ใบที่เหลือรอรอบหน้า
 *
 *  cron รันทุกวัน และเงื่อนไขคัดใบเป็น "ค้างเกิน 7 วัน" ไม่ใช่ "ครบ 7 วันพอดี"
 *  ใบที่ตกรอบจึงไม่หายไปไหน แค่ปิดช้าลงหนึ่งวัน */
const MAX_PER_RUN = 500;

export type AutoConfirmResult = {
  scanned: number;
  confirmed: number;
  skippedDispute: number;
  skippedAlreadyClosed: number;
  failed: number;
};

/**
 * autoConfirmDelivered — สแกนและปิดใบที่ถึงกำหนด
 *
 * idempotent: รันซ้ำวันเดียวกันต้องไม่สร้าง event ซ้ำและไม่เปลี่ยนอะไรเพิ่ม
 * (การันตีด้วย conditional update ที่ status ไม่ใช่ด้วยการจำว่าเคยรันแล้ว)
 */
export async function autoConfirmDelivered(now = new Date()): Promise<AutoConfirmResult> {
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_GRACE_MS);

  // คัดจากฝั่งพัสดุเพราะ deliveredAt อยู่ที่นั่น และมี partial index รองรับ
  // เงื่อนไขพัสดุ: CREATED + ไม่ใช่ dry-run = นิยาม "พัสดุที่มีอยู่จริง" ตัวเดียวกับที่ระบบใช้
  // (ห้ามใช้ status <> 'CANCELLED' ซึ่งนับใบ FAILED ด้วย — บั๊กที่เคยทำให้ชิปขึ้นว่า
  //  "สร้างพัสดุแล้ว" ทั้งที่ไม่มีเลขพัสดุ)
  const candidates = await prisma.orderShipment.findMany({
    where: {
      deliveredAt: { not: null, lte: cutoff },
      // 🛑 ต้องเป็นพัสดุ **ขาไป** เท่านั้น (feature 00056) — พัสดุขากลับที่ส่งถึงร้านแล้ว
      // ต้องไม่ทำให้ระบบปิดออเดอร์อัตโนมัติว่า "ผู้ซื้อได้รับของแล้ว" ซึ่งตรงข้ามกับความจริง
      ...ACTIVE_FORWARD_SHIPMENT,
      order: {
        status: { in: ["PENDING", "SHIPPED"] },
      },
    },
    select: {
      id: true,
      deliveredAt: true,
      orderId: true,
      order: {
        select: {
          id: true,
          status: true,
          disputeOpenedAt: true,
          disputeResolvedAt: true,
        },
      },
    },
    take: MAX_PER_RUN,
    orderBy: { deliveredAt: "asc" },
  });

  const result: AutoConfirmResult = {
    scanned: candidates.length,
    confirmed: 0,
    skippedDispute: 0,
    skippedAlreadyClosed: 0,
    failed: 0,
  };

  for (const c of candidates) {
    const order = c.order;
    if (!order) continue;

    // ธงข้อพิพาทค้าง = ห้ามปิด (BR-OSM-03) — รอคนตัดสิน ไม่ใช่ให้ระบบตัดสินแทน
    const hasOpenDispute = order.disputeOpenedAt !== null && order.disputeResolvedAt === null;
    if (hasOpenDispute) {
      result.skippedDispute += 1;
      continue;
    }

    try {
      // conditional update — ปิดได้เฉพาะใบที่ยังอยู่ในสถานะที่ปิดได้
      // count = 0 คือกรณี "ปกติ" (ผู้ซื้อกดยืนยันไปเสี้ยววินาทีก่อน / ร้านยกเลิกไปแล้ว)
      // ไม่ใช่ error — และนี่คือสิ่งที่ทำให้ทั้งฟังก์ชัน idempotent
      const advanced = await prisma.order.updateMany({
        where: { id: order.id, status: { in: ["PENDING", "SHIPPED"] } },
        data: { status: "CONFIRMED" },
      });

      if (advanced.count === 0) {
        result.skippedAlreadyClosed += 1;
        continue;
      }

      // ใช้ SYSTEM_CONFIRMED ที่มีอยู่แล้ว ไม่สร้างชนิด event ใหม่
      // ชนิดตอบว่า "เกิดอะไรขึ้น" (ระบบยืนยันให้) ส่วน "เพราะอะไร" อยู่ใน meta
      //
      // occurredAt = เวลาที่งานนี้ทำงานจริง ไม่ใช่ deliveredAt — ประวัติคือหลักฐานว่า
      // เหตุการณ์เกิดเมื่อไร ไม่ใช่ที่เก็บวันที่ที่ผู้ใช้/ระบบภายนอกอ้าง (บทเรียน 00033)
      await recordOrderEvent(prisma, {
        orderId: order.id,
        type: "SYSTEM_CONFIRMED",
        actorUserId: null,
        occurredAt: now,
        meta: {
          reason: "AUTO_CONFIRM_DELIVERED",
          deliveredAt: c.deliveredAt?.toISOString() ?? null,
        },
      });

      result.confirmed += 1;
    } catch (err) {
      // ล้มทีละใบ ไม่ล้มทั้ง batch — ใบที่เหลือยังต้องได้ปิด
      // 🛑 ต้อง log เสมอ ห้าม fail-silent: ฟีเจอร์ที่ล้มเงียบเคยพังบน prod อยู่หลายเดือน
      // โดยไม่มีใครเห็น (บทเรียน iShip check-price)
      result.failed += 1;
      console.error("[auto-confirm] ปิดคำสั่งซื้อไม่สำเร็จ", { orderId: order.id, err });
    }
  }

  return result;
}
