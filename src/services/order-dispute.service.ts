// order-dispute.service.ts — ธง "ผู้ซื้อทักท้วงว่ายังไม่ได้ของ" (feature 00039)
//
// ขอบเขตแคบโดยตั้งใจ: นี่ไม่ใช่ระบบข้อพิพาท (PRD กันไว้ใน Out of Scope) สิ่งที่ต้องการจริง
// คือ **ธงที่หยุดการปิดงานอัตโนมัติ** เพื่อไม่ให้ระบบตัดสินแทนคนเมื่อยังมีข้อสงสัยค้างอยู่
//
// ธงนี้ไม่เปลี่ยน Order.status และไม่ห้ามผู้ซื้อกดยืนยันรับของเอง — ผู้ซื้อยังปิดงานเองได้เสมอ
// (ธงกันแค่ "ระบบปิดให้" ไม่ได้กัน "คนปิดเอง")

import { prisma } from "@/lib/prisma";
import { recordOrderEvent } from "./order-event.service";

export class OrderAlreadyClosedError extends Error {
  constructor() {
    super("ORDER_ALREADY_CLOSED");
    this.name = "OrderAlreadyClosedError";
  }
}

export class NoOpenDisputeError extends Error {
  constructor() {
    super("NO_OPEN_DISPUTE");
    this.name = "NoOpenDisputeError";
  }
}

export const DISPUTE_NOTE_MAX = 500;

/**
 * openDispute — ผู้ซื้อแจ้งว่ายังไม่ได้รับของ / ของไม่ตรง
 *
 * idempotent: เรียกซ้ำตอนมีเรื่องเปิดค้างอยู่แล้ว คืนเวลาเดิม ไม่สร้าง event ซ้ำ
 * (ผู้ซื้อกดปุ่มรัวเพราะไม่แน่ใจว่าติดไหม เป็นพฤติกรรมปกติ ไม่ควรได้ประวัติ 5 บรรทัด)
 */
export async function openDispute(
  publicToken: string,
  opts?: { note?: string | null; actorUserId?: string | null },
): Promise<{ disputeOpenedAt: Date }> {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: { id: true, status: true, disputeOpenedAt: true, disputeResolvedAt: true },
  });
  if (!order) throw new Error("Order not found");

  // ธงนี้มีไว้กัน "การปิด" ไม่ใช่ย้อน "การปิดที่เกิดไปแล้ว"
  if (order.status === "CONFIRMED" || order.status === "CANCELLED") {
    throw new OrderAlreadyClosedError();
  }

  const alreadyOpen = order.disputeOpenedAt !== null && order.disputeResolvedAt === null;
  if (alreadyOpen) return { disputeOpenedAt: order.disputeOpenedAt as Date };

  const now = new Date();
  const note = opts?.note?.trim().slice(0, DISPUTE_NOTE_MAX) || null;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      // ล้าง disputeResolvedAt ด้วย — เคสเปิดเรื่องใหม่หลังเคยปิดไปแล้วรอบหนึ่ง
      // ถ้าไม่ล้าง เงื่อนไข "มีข้อพิพาทค้าง" จะเป็น false ทันทีทั้งที่เพิ่งเปิดเรื่องใหม่
      data: { disputeOpenedAt: now, disputeResolvedAt: null },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "ORDER_DISPUTE_OPENED",
        actorUserId: opts?.actorUserId ?? null,
        occurredAt: now,
        // note เก็บใน meta — ไม่แสดงบนหน้าจอสาธารณะ (BRD §6.4)
        meta: note ? { note } : undefined,
      },
    });
  });

  return { disputeOpenedAt: now };
}

/**
 * resolveDispute — ปิดเรื่อง ให้การปิดงานอัตโนมัติกลับมาทำงานตามกติกา 7 วันเดิม
 *
 * 🛑 ปิดเรื่องไม่เท่ากับ "ออเดอร์สำเร็จ" — แค่ปลดธง ถ้าครบกำหนดแล้วรอบถัดไปของ cron
 * จะปิดให้เอง ถ้ายังไม่ครบก็รอต่อ ไม่มีการลัดขั้นตอน
 */
export async function resolveDispute(
  publicToken: string,
  opts?: { outcome?: string | null; actorUserId?: string | null },
): Promise<{ disputeResolvedAt: Date }> {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: { id: true, disputeOpenedAt: true, disputeResolvedAt: true },
  });
  if (!order) throw new Error("Order not found");

  const hasOpen = order.disputeOpenedAt !== null && order.disputeResolvedAt === null;
  if (!hasOpen) throw new NoOpenDisputeError();

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { disputeResolvedAt: now } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "ORDER_DISPUTE_RESOLVED",
        actorUserId: opts?.actorUserId ?? null,
        occurredAt: now,
        meta: opts?.outcome ? { outcome: opts.outcome } : undefined,
      },
    });
  });

  return { disputeResolvedAt: now };
}

/** ใบนี้มีข้อพิพาทค้างอยู่ไหม — นิยามเดียวทั้งระบบ ห้ามเขียนเงื่อนไขนี้ซ้ำที่อื่น
 *
 *  (เขียนเป็นฟังก์ชันแทนที่จะให้แต่ละที่เช็ค `a !== null && b === null` เอง เพราะเงื่อนไข
 *   สองตัวแปรแบบนี้เขียนกลับด้านได้ง่ายมาก และถ้ากลับด้านจะกลายเป็น "ปิดงานทั้งที่มีข้อพิพาท"
 *   ซึ่งเป็นความเสียหายที่ผู้ซื้อเจอโดยตรง) */
export function hasOpenDispute(o: {
  disputeOpenedAt: Date | null;
  disputeResolvedAt: Date | null;
}): boolean {
  return o.disputeOpenedAt !== null && o.disputeResolvedAt === null;
}
