import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveActorLabel,
  type OrderEventMeta,
  type OrderEventType,
  type OrderEventView,
} from "@/lib/order-event";

/**
 * order-event.service — เขียน/อ่านประวัติกิจกรรมคำสั่งซื้อ (feature 00031)
 *
 * [สำคัญ] `recordOrderEvent` รับ `tx` ได้ เพราะทุกการเขียนต้องอยู่ในทรานแซกชันเดียวกับการ
 * เปลี่ยนแปลงหลักเสมอ — "ทำสำเร็จแต่ log หาย" คือเคสที่แย่ที่สุดของ audit trail (ดูเหมือนไม่มีใคร
 * ทำ ทั้งที่มีคนทำจริง) ผู้เรียกที่มี $transaction อยู่แล้วต้องส่ง tx เข้ามา ห้ามยิงแยก
 */
// [สำคัญ] ใช้ `typeof prisma` ไม่ใช่ `PrismaClient` เปล่า — client ของโปรเจกต์ถูกสร้างด้วย
// `omit: { chatMessage: { rawMessage: true } }` ทำให้ generic ไม่ตรงกับ PrismaClient มาตรฐาน
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * snapshot ชื่อผู้กระทำ ณ เวลานั้น — ห้าม live-join ตอนอ่าน เพราะพนักงานเปลี่ยนชื่อทีหลังแล้ว
 * ประวัติเก่าจะเปลี่ยนตาม (ประวัติต้องนิ่ง) และถ้าบัญชีถูกลบ ชื่อจะหายไปทั้งที่การกระทำเกิดขึ้นจริง
 * pattern เดียวกับ OrderShipment.senderSnapshot/receiverSnapshot ที่มีอยู่แล้วในระบบ
 */
async function snapshotActorName(db: Db, actorUserId: string | null): Promise<string | undefined> {
  if (!actorUserId) return undefined;
  const u = await db.user.findUnique({
    where: { id: actorUserId },
    select: { displayName: true, username: true },
  });
  if (!u) return undefined;
  return u.displayName || u.username || undefined;
}

export async function recordOrderEvent(
  db: Db,
  input: {
    orderId: string;
    type: OrderEventType;
    actorUserId?: string | null;
    meta?: Omit<OrderEventMeta, "actorNameSnapshot">;
    /** เวลาที่เหตุการณ์เกิดจริง — ไม่ส่ง = ตอนนี้ (ใช้ค่าอื่นเฉพาะตอน backfill) */
    occurredAt?: Date;
  },
): Promise<void> {
  const actorUserId = input.actorUserId ?? null;
  const actorNameSnapshot = await snapshotActorName(db, actorUserId);

  await db.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      actorUserId,
      // undefined ถูกตัดออกตอน serialize เป็น JSON อยู่แล้ว — meta จึงไม่มี key ที่ค่าว่าง
      meta: { ...(input.meta ?? {}), ...(actorNameSnapshot ? { actorNameSnapshot } : {}) } as Prisma.InputJsonValue,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

/**
 * recordOrderEventSafe — เวอร์ชันที่ยอมให้ล้มเงียบ สำหรับจุดที่ **ไม่มีทรานแซกชันครอบอยู่**
 * และการล้มของ log ไม่ควรทำให้ action หลักที่สำเร็จไปแล้วพัง (เช่น หลังส่ง SMS ที่หักเงินไปแล้ว)
 *
 * ใช้เท่าที่จำเป็นจริง — จุดที่มี $transaction อยู่แล้วต้องใช้ recordOrderEvent ตรง ๆ เสมอ
 */
export async function recordOrderEventSafe(
  input: Parameters<typeof recordOrderEvent>[1],
): Promise<void> {
  try {
    await recordOrderEvent(prisma, input);
  } catch (err) {
    // log ไว้ให้สืบได้ว่าเคยพลาด แต่ไม่โยนต่อ — action หลักสำเร็จไปแล้ว
    console.error("[order-event] บันทึกประวัติไม่สำเร็จ", input.type, input.orderId, err);
  }
}

/**
 * getOrderEvents — ไทม์ไลน์ของออเดอร์เดียว ใหม่→เก่า
 *
 * [สำคัญ] ผู้เรียกต้อง scope ownership มาก่อนแล้ว (หน้า order detail โหลดออเดอร์ด้วย shopId
 * ใน WHERE อยู่แล้ว) — ฟังก์ชันนี้ไม่ตรวจสิทธิ์เอง
 *
 * เรียงด้วย occurredAt แล้วตามด้วย seq เพื่อให้ลำดับซ้ำได้เสมอเมื่อเวลาชนกันเป๊ะ
 * (เหตุการณ์ในทรานแซกชันเดียวกันมีเวลาเท่ากันได้จริง)
 *
 * select แคบ ๆ ตั้งใจ — หน้านี้อยู่ใต้ client layout ทุก field ที่ดึงมาจะถูก serialize เข้า
 * flight payload ที่ผู้ใช้เปิดดูได้ (feedback_rsc_pii_neutralize_at_source)
 */
export async function getOrderEvents(orderId: string, take = 50): Promise<OrderEventView[]> {
  const rows = await prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: [{ occurredAt: "desc" }, { seq: "desc" }],
    take,
    select: {
      id: true,
      type: true,
      meta: true,
      occurredAt: true,
      actor: { select: { displayName: true, username: true, avatar: true } },
    },
  });

  return rows.map((r) => {
    const meta = (r.meta ?? {}) as OrderEventMeta;
    return {
      id: r.id,
      type: r.type as OrderEventType,
      meta,
      occurredAtISO: r.occurredAt.toISOString(),
      actorLabel: resolveActorLabel(r.actor, meta),
      // avatar เป็น URL สาธารณะ (Facebook CDN/ไฟล์ในระบบ) ไม่ใช่ PII
      actorAvatar: r.actor?.avatar ?? null,
    };
  });
}
