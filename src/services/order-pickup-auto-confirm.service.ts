// order-pickup-auto-confirm.service.ts — ปิดคำสั่งซื้อนัดรับที่พ้น grace period อัตโนมัติ
// feature 00062 (FR-PKP-04, U10) — mirror ท่าเดียวกับ order-auto-confirm.service.ts (feature 00039)
//
// ทำไมต้องมี: ร้านกด "มอบสินค้าแล้ว" (setHandedOver) แล้วออเดอร์ยังเป็น PENDING ต่อไป
// (handedOverAt แค่เริ่มนับเวลา ไม่ใช่สถานะ — ดูคอมเมนต์ schema.prisma) ผู้ซื้อที่ลืมกดยืนยันเอง
// จะค้าง PENDING ตลอดกาลทั้งที่รับของไปแล้ว — job นี้ปิดให้หลัง PICKUP_AUTOCONFIRM_HOURS
// ถ้าไม่มีข้อพิพาทค้าง (BR-OSM-03 เกณฑ์เดียวกับ 00039)
//
// ต่างจาก order-auto-confirm.service.ts (00039) ตรงที่ query ตรงจาก Order เลย ไม่ผ่าน
// OrderShipment — ออเดอร์นัดรับไม่มีพัสดุ (SDS §3.4, order-pickup.ts หัวไฟล์)

import { prisma } from "@/lib/prisma";
import { PICKUP_AUTOCONFIRM_HOURS } from "@/lib/order-pickup";
import { recordOrderEvent } from "./order-event.service";

const HOUR_MS = 60 * 60 * 1000;

/** จำนวนใบสูงสุดต่อรอบ — กัน serverless timeout เหมือน order-auto-confirm.service.ts
 *  cron รันทุก 6 ชม. และเงื่อนไขคัดใบเป็น "เกิน" ไม่ใช่ "พอดี" ใบที่ตกรอบจะถูกจับในรอบถัดไปเอง */
const MAX_PER_RUN = 500;

export type AutoConfirmPickupResult = {
  scanned: number;
  confirmed: number;
  skippedDispute: number;
  skippedAlreadyClosed: number;
  failed: number;
};

/**
 * autoConfirmPickup — สแกนและปิดใบนัดรับที่ถึงกำหนด
 *
 * idempotent: รันซ้ำต้องไม่สร้าง event ซ้ำ (การันตีด้วย conditional update ที่ status ไม่ใช่
 * ด้วยการจำว่าเคยรันแล้ว — ท่าเดียวกับ order-auto-confirm.service.ts)
 */
export async function autoConfirmPickup(now = new Date()): Promise<AutoConfirmPickupResult> {
  const cutoff = new Date(now.getTime() - PICKUP_AUTOCONFIRM_HOURS * HOUR_MS);

  // query ตรงจาก Order ไม่ผ่าน OrderShipment — ออเดอร์นัดรับไม่มีพัสดุเลย
  // ใช้ index Order_fulfillmentMode_status_handedOverAt_idx (schema.prisma)
  //
  // 🛑 status='PENDING' เพียงพอโดยไม่ต้องกัน SHIPPED เพิ่ม เพราะ shipOrder() (order.service.ts)
  // throw ทันทีเมื่อ fulfillmentMode !== 'SHIPPED' — ออเดอร์นัดรับไปถึง SHIPPED ไม่ได้เลย
  // (ยืนยันจากโค้ดจริงแล้ว ไม่ใช่การเดา)
  const candidates = await prisma.order.findMany({
    where: {
      fulfillmentMode: "PICKUP",
      status: "PENDING",
      handedOverAt: { not: null, lte: cutoff },
    },
    select: {
      id: true,
      handedOverAt: true,
      disputeOpenedAt: true,
      disputeResolvedAt: true,
    },
    take: MAX_PER_RUN,
    orderBy: { handedOverAt: "asc" },
  });

  const result: AutoConfirmPickupResult = {
    scanned: candidates.length,
    confirmed: 0,
    skippedDispute: 0,
    skippedAlreadyClosed: 0,
    failed: 0,
  };

  for (const order of candidates) {
    // ธงข้อพิพาทค้าง = ห้ามปิด (BR-PKP-03/BR-OSM-03) — รอคนตัดสิน ไม่ใช่ให้ระบบตัดสินแทน
    const hasOpenDispute = order.disputeOpenedAt !== null && order.disputeResolvedAt === null;
    if (hasOpenDispute) {
      result.skippedDispute += 1;
      continue;
    }

    try {
      // conditional update — ปิดได้เฉพาะใบที่ยังเป็น PENDING จริง
      // count = 0 คือกรณี "ปกติ" (ผู้ซื้อกดยืนยันไปเสี้ยววินาทีก่อน) ไม่ใช่ error —
      // และนี่คือสิ่งที่ทำให้ทั้งฟังก์ชัน idempotent
      const advanced = await prisma.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "CONFIRMED" },
      });

      if (advanced.count === 0) {
        result.skippedAlreadyClosed += 1;
        continue;
      }

      // ใช้ SYSTEM_CONFIRMED ที่มีอยู่แล้ว ไม่สร้างชนิด event ใหม่ (ห้ามตาม task)
      // ชนิดตอบว่า "เกิดอะไรขึ้น" (ระบบยืนยันให้) ส่วน "เพราะอะไร" อยู่ใน meta.reason
      //
      // occurredAt = เวลาที่งานนี้ทำงานจริง ไม่ใช่ handedOverAt — ประวัติคือหลักฐานว่าเหตุการณ์
      // เกิดเมื่อไร ไม่ใช่ที่เก็บวันที่ที่ผู้ใช้/ระบบภายนอกอ้าง (บทเรียน 00033)
      await recordOrderEvent(prisma, {
        orderId: order.id,
        type: "SYSTEM_CONFIRMED",
        actorUserId: null,
        occurredAt: now,
        meta: {
          reason: "AUTO_CONFIRM_PICKUP",
        },
      });

      result.confirmed += 1;
    } catch (err) {
      // ล้มทีละใบ ไม่ล้มทั้ง batch — ใบที่เหลือยังต้องได้ปิด
      // 🛑 ต้อง log เสมอ ห้าม fail-silent (บทเรียน iShip check-price)
      result.failed += 1;
      console.error("[auto-confirm-pickup] ปิดคำสั่งซื้อไม่สำเร็จ", { orderId: order.id, err });
    }
  }

  return result;
}
