// order-revenue.ts — SSOT ตัวเดียวของคำถาม "ออเดอร์ใบนี้นับเป็นยอดขายแล้วหรือยัง"
//
// เดิมทุกที่ที่คิดยอดขายเขียน `status: 'CONFIRMED'` ตรง ๆ ซึ่งแปลว่า **ร้านจะเห็นยอดขายก็ต่อเมื่อ
// ผู้ซื้อเข้ามากดยืนยันรับของในแอป** — ผู้ซื้อจำนวนมากไม่เคยกด ทั้งที่ของถึงมือไปแล้วและร้านได้เงิน
// ไปแล้ว ยอดขายบนแดชบอร์ดจึงต่ำกว่าความจริงเรื่อย ๆ
//
// user เคาะ 2026-08-05: ให้ถือว่า "ขนส่งรับของไปแล้วจริง = ขายแล้ว" โดย**กระทบเฉพาะยอดขาย/
// กำไร-ขาดทุน** เท่านั้น — Trust Score, สิทธิ์รีวิว, จำนวนดีลสำเร็จบนการ์ดร้าน (สัญญาณความน่าเชื่อถือ
// ที่ผู้ซื้อเห็น) และ Order.status ยังผูกกับ CONFIRMED เหมือนเดิมทุกประการ
//
// [สำคัญ] ทำไมไม่ใช้แค่ `status === 'SHIPPED'`: สถานะนั้นตั้งได้ด้วยการที่ร้านพิมพ์เลขพัสดุเอง
// ซึ่งยังไม่ได้แปลว่าของออกจากร้านจริง — user เลือกเกณฑ์ "ขนส่งรับของแล้วจริง" คือต้องมีพัสดุที่
// ขนส่งยืนยันสถานะกลับมาแล้วเท่านั้น
//
// [สำคัญ] ของตีกลับไม่นับ: `return` / `return_success` แปลว่าของเดินทางกลับมาหาร้าน = ไม่มีการขาย
// เกิดขึ้นจริง แม้ขนส่งจะเคยรับของไปแล้วก็ตาม จึงไม่อยู่ในลิสต์ข้างล่าง (ต่างจาก impliesDispatched
// ใน lib/iship/status.ts ที่รวม 2 ตัวนี้ด้วย เพราะมันตอบคนละคำถาม — "ของออกจากร้านไปแล้วไหม")

/**
 * carrierStatus ที่ถือว่า "ขนส่งรับของไปแล้วจริง และของยังเดินหน้าไปหาผู้ซื้อ"
 * ตรงกับ status_code ของ iShip (ยืนยันกับ GET /api/order_statuses ของบัญชีจริง 2026-08-04)
 */
import { ACTIVE_FORWARD_SHIPMENT } from '@/lib/shipment-direction'
import { usesServiceFinanceRules } from '@/lib/finance-rules'
import { excludedFromRevenueByParcelClose } from '@/lib/parcel-close'

export const REVENUE_CARRIER_STATUSES = [
  "picked_up", // พัสดุเข้าระบบ
  "with_branch", // พัสดุถึงสถานีคัดแยก
  "in_transit", // อยู่ระหว่างขนส่ง
  "progress", // อยู่ระหว่างจัดส่ง
  "delivered", // จัดส่งแล้ว
  "payment_success", // เก็บเงินปลายทางสำเร็จ
] as const;

/**
 * เงื่อนไข Prisma สำหรับ "ใบที่นับเป็นยอดขาย" — เอาไป spread ใน `where` ได้ตรง ๆ
 *
 * ต้องใช้ตัวนี้ทุกที่ที่คิดยอดขาย ห้ามเขียน `status: 'CONFIRMED'` ซ้ำเอง ไม่งั้นวันหนึ่งกราฟยอดขาย
 * กับรายงานกำไร-ขาดทุนบนหน้าจอเดียวกันจะให้ตัวเลขคนละตัวโดยไม่มีอะไรเตือน
 */
// ไม่ใส่ `as const` โดยตั้งใจ — Prisma ต้องการ `OrderWhereInput[]` ที่แก้ไขได้ ถ้าเป็น readonly
// tuple จะ assign ไม่ผ่านแล้ว TS จะเลิก infer ทั้ง query (error ลามไปถึง select ที่ไม่เกี่ยวเลย)
/**
 * 00085: ร้านปิดพัสดุแบบ "ไม่นับเป็นยอดขาย" (ผล A / B-COD / B-คืนเงินแล้ว) — ไม่ใช่ยอดขาย และไม่ใช่ "ของขายออก"
 * ใช้ร่วมกับเกณฑ์สินค้าขายดี/ยอดขายรายสินค้า (not-CANCELLED) ด้วย — ของที่ไม่ถึงมือลูกค้าไม่ใช่ของที่ขายได้
 */
export const parcelCloseNotExcludedWhere = {
  NOT: {
    shipments: { some: { ...ACTIVE_FORWARD_SHIPMENT, problemCloseExcludesRevenue: true } },
  },
}

export const revenueOrderWhere = {
  ...parcelCloseNotExcludedWhere,
  OR: [
    { status: "CONFIRMED" },
    {
      status: "SHIPPED",
      shipments: {
        some: {
          // พัสดุทดสอบต้องไม่เข้าสถิติทุกชนิด (BR-ISHIP-60/61) + ต้องเป็นพัสดุ **ขาไป**
          // เท่านั้น (feature 00056) — พัสดุขากลับของใบคืนไม่ใช่หลักฐานว่าขายได้
          ...ACTIVE_FORWARD_SHIPMENT,
          carrierStatus: { in: [...REVENUE_CARRIER_STATUSES] },
        },
      },
    },
    // 00085 FR-PC-08: ปิดแล้วแบบ "นับเป็นยอดขาย" (B-โอน-ไม่คืนเงิน) — carrierStatus = issue ไม่อยู่ใน
    // REVENUE_CARRIER_STATUSES จึงต้องมีสาขานี้ ไม่งั้นใบ SHIPPED ที่ปิดแล้วจะหลุดยอดขาย
    {
      status: "SHIPPED",
      shipments: { some: { ...ACTIVE_FORWARD_SHIPMENT, problemCloseExcludesRevenue: false } },
    },
  ],
};

/**
 * เวอร์ชันเช็คในหน่วยความจำ — ใช้กับที่ที่ดึงออเดอร์มาแล้วค่อยกรอง (แดชบอร์ด/กราฟยอดขาย)
 * ต้องให้ผลตรงกับ `revenueOrderWhere` เสมอ
 */
export function countsAsRevenue(order: {
  status: string;
  /**
   * 🛑 `direction` เป็น field **บังคับ** (feature 00056) — ไม่ใช่ optional
   * ผู้เรียกที่ลืม `select` มาจะ compile ไม่ผ่าน ซึ่งคือด่านเดียวที่กันพัสดุขากลับของใบคืน
   * ไม่ให้ถูกนับเป็นหลักฐานว่า "ขายได้" (ทำเป็น optional แล้วมันจะ undefined เงียบ ๆ
   * แล้วเงื่อนไขข้างล่างเป็นเท็จตลอด = ยอดขายหายทั้งระบบ หรือถ้าเขียนกลับด้านก็เฟ้อทั้งระบบ)
   */
  shipments?:
    | {
        status: string;
        isDryRun: boolean;
        carrierStatus: string | null;
        direction: string;
        /** 00085: บังคับ (ไม่ optional) — ลืม select แล้ว compile ไม่ผ่าน ไม่ใช่ยอดขายเฟ้อเงียบ ๆ */
        problemCloseExcludesRevenue: boolean | null;
      }[]
    | null;
}): boolean {
  if (excludedFromRevenueByParcelClose({ shipments: order.shipments ?? [] })) return false;
  if (order.status === "CONFIRMED") return true;
  if (order.status !== "SHIPPED") return false;
  return (order.shipments ?? []).some(
    (s) =>
      s.status === "CREATED" &&
      !s.isDryRun &&
      s.direction === "FORWARD" &&
      (s.problemCloseExcludesRevenue === false ||
        (s.carrierStatus != null &&
          (REVENUE_CARRIER_STATUSES as readonly string[]).includes(s.carrierStatus))),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// feature 00073 — ร้านบริการ (SERVICE_QUEUE): ยอดขายนับตอน "ร้านปิดงาน" (Order.serviceClosedAt)
//
// มติ user 2026-10-10/11: เงินภายในร้านบริการทุกจอนับที่ขั้น 3 (ร้านปิดงาน) และใช้ **วันปิดงาน**
// เป็นวันที่ของยอด · หน้าร้านสาธารณะ (งานสำเร็จ/Trust Score/รีวิว) ยังนับที่ลูกค้ายืนยันเหมือนเดิม
// ร้านขายของ/ที่พัก = กติกาข้างบนเป๊ะ (ค่าตั้งต้นถาวร) — ฟังก์ชัน `...For(vertical)` ข้างล่าง
// คืนของเดิมทุกตัวเมื่อไม่ใช่ร้านบริการ
//
// 🛑 ทุกจุดที่คิดเงินของร้านบริการต้องผ่านชุดนี้ — ห้ามเขียน `serviceClosedAt: { not: null }` เอง
// ─────────────────────────────────────────────────────────────────────────────


/** สถานะที่ไม่ใช่ "งานที่ปิดแล้ว" แม้จะมีวันปิดงาน — ยกเลิก/คืนทั้งใบ/ร่าง */
export const SERVICE_NON_REVENUE_STATUSES = ['CANCELLED', 'RETURNED', 'DRAFTED'] as const

type DateWindow = { gte: Date; lt: Date }

/** where ของ "งานบริการที่ปิดแล้ว" — ส่ง window = ตัดช่วงด้วยวันปิดงาน */
export function serviceRevenueOrderWhere(closedIn?: DateWindow) {
  return {
    serviceClosedAt: closedIn ? { gte: closedIn.gte, lt: closedIn.lt } : { not: null },
    status: { notIn: [...SERVICE_NON_REVENUE_STATUSES] },
  }
}

/**
 * 00073 ภาคต่อ (FR-014) — งานบริการที่ **ยังไม่ปิดงาน** (ไม่ใช่ยอดขาย · แสดงเป็นสีเหลือง) ตัดช่วงด้วย **วันเปิดบิล**
 * สถานะที่ตัดทิ้งชุดเดียวกับ serviceRevenueOrderWhere — ปิดแล้ว (รวมไม่มาตามนัด) มี serviceClosedAt เสมอ จึงไม่ซ้อนกัน
 */
export function serviceUnclosedOrderWhere(createdIn?: DateWindow) {
  return {
    serviceClosedAt: null,
    status: { notIn: [...SERVICE_NON_REVENUE_STATUSES] },
    ...(createdIn ? { createdAt: { gte: createdIn.gte, lt: createdIn.lt } } : {}),
  }
}

/** งานบริการใบนี้ "ยังไม่ปิดงาน" ไหม — คู่ในหน่วยความจำของ `serviceUnclosedOrderWhere` (FR-014) */
export function isServiceUnclosed(order: { status: string; serviceClosedAt: Date | string | null }): boolean {
  return order.serviceClosedAt == null && !(SERVICE_NON_REVENUE_STATUSES as readonly string[]).includes(order.status)
}

/**
 * where ของ "ใบที่นับเป็นยอดขายในช่วงนี้" ครบทั้งเงื่อนไขและแกนวันที่ — ตัวเดียวที่รายงานควรใช้
 * - ร้านบริการ: งานที่ปิดแล้ว ตัดช่วงด้วยวันปิดงาน
 * - ร้านอื่น: `revenueOrderWhere` ตัดช่วงด้วย createdAt (ของเดิม)
 */
export function revenueWindowWhere(vertical: string | null | undefined, window: DateWindow) {
  if (usesServiceFinanceRules(vertical)) return serviceRevenueOrderWhere(window)
  return { ...revenueOrderWhere, createdAt: { gte: window.gte, lt: window.lt } }
}

/** งานบริการใบนี้ปิดแล้ว (นับเป็นยอดขาย) หรือยัง — คู่ในหน่วยความจำของ `serviceRevenueOrderWhere` */
export function countsAsServiceRevenue(order: {
  status: string
  serviceClosedAt: Date | string | null
}): boolean {
  return (
    order.serviceClosedAt != null &&
    !(SERVICE_NON_REVENUE_STATUSES as readonly string[]).includes(order.status)
  )
}

/**
 * countsAsRevenue ที่รู้ประเภทกิจการ — `serviceClosedAt` เป็น field **บังคับ** โดยเจตนา
 * (ลืม select แล้ว compile ไม่ผ่าน · ถ้า optional ยอดร้านบริการจะเป็น 0 เงียบ ๆ ทั้งร้าน)
 */
export function countsAsRevenueFor(
  order: Parameters<typeof countsAsRevenue>[0] & { serviceClosedAt: Date | string | null },
  vertical: string | null | undefined,
): boolean {
  return usesServiceFinanceRules(vertical) ? countsAsServiceRevenue(order) : countsAsRevenue(order)
}

/** วันที่ของยอด — ร้านบริการ = วันปิดงาน · ร้านอื่น = createdAt (ของเดิม) */
export function revenueDateFor(
  order: { createdAt: Date | string; serviceClosedAt: Date | string | null },
  vertical: string | null | undefined,
): Date {
  const d = usesServiceFinanceRules(vertical) && order.serviceClosedAt != null
    ? order.serviceClosedAt
    : order.createdAt
  return d instanceof Date ? d : new Date(d)
}

/**
 * งานที่ปิดแบบ "ไม่มาตามนัด" — ยอดขาย = มัดจำที่เก็บไว้ (เงินที่รับแล้วและไม่ถูก void) · ต้นทุน 0
 * (ไม่ได้ให้บริการ จึงไม่มีต้นทุนอะไหล่/ไม่มีของขายออก) · คืนมัดจำ = void ⇒ ยอด 0 (มติ D1 2026-10-11)
 */
export function isServiceNoShow(order: { appointmentStatus: string | null }): boolean {
  return order.appointmentStatus === 'NO_SHOW'
}

/** ยอดขายของงานไม่มาตามนัด = เงินที่รับไว้และยังไม่ถูกยกเลิกรายการ */
export function serviceNoShowRevenue(
  payments: readonly { amount: unknown; voidedAt: Date | string | null }[],
): number {
  let sum = 0
  for (const p of payments) if (p.voidedAt == null) sum += Number(p.amount)
  return sum
}

/** select ขั้นต่ำที่ต้องมีเพื่อคิดยอดงานไม่มาตามนัด — ใช้ร่วมกันทุก query ของร้านบริการ */
export const SERVICE_REVENUE_SELECT = {
  serviceClosedAt: true,
  appointmentStatus: true,
  payments: { select: { amount: true, voidedAt: true } },
} as const

/**
 * งานบริการที่ปิดแล้ว **และได้ให้บริการจริง** (ไม่รวมไม่มาตามนัด) — ใช้กับ "ของที่ขายออก/ต้นทุน"
 * (ไม่มาตามนัดมียอด = มัดจำ แต่ไม่ได้ขายบริการ/อะไหล่ชิ้นไหนออกไป)
 * 🛑 ต้องเขียน OR null ชัด ๆ — `appointmentStatus: { not: 'NO_SHOW' }` เฉย ๆ ตัดงาน walk-in (NULL) ทิ้งเงียบ ๆ
 */
export function serviceDeliveredOrderWhere(closedIn?: DateWindow) {
  return {
    ...serviceRevenueOrderWhere(closedIn),
    OR: [{ appointmentStatus: null }, { appointmentStatus: { not: 'NO_SHOW' } }],
  }
}

/** where ของ "ออเดอร์ที่นับว่าขายของ/บริการออกไปแล้วในช่วงนี้" — ร้านอื่น = revenueOrderWhere + createdAt เดิม */
export function soldItemsWindowWhere(vertical: string | null | undefined, window: DateWindow) {
  if (usesServiceFinanceRules(vertical)) return serviceDeliveredOrderWhere(window)
  return { ...revenueOrderWhere, createdAt: { gte: window.gte, lt: window.lt } }
}

/** งานบริการที่ปิดแล้วและได้ให้บริการจริง (ไม่รวมไม่มาตามนัด) — คู่ในหน่วยความจำของ serviceDeliveredOrderWhere */
export function countsAsServiceDelivered(order: {
  status: string
  serviceClosedAt: Date | string | null
  appointmentStatus: string | null
}): boolean {
  return countsAsServiceRevenue(order) && !isServiceNoShow(order)
}

/**
 * "ใบนี้ขายของ/บริการออกไปแล้ว" สำหรับจอสินค้า/หมวด (จำนวนที่ขายได้ · รายได้ต่อหมวด)
 * ร้านบริการ = งานที่ปิดแล้วและได้ให้บริการ (00073) · ร้านอื่น = `status === 'CONFIRMED'` **ของเดิมของจอพวกนี้เป๊ะ**
 * (จอพวกนี้ไม่เคยใช้ countsAsRevenue — ห้ามเปลี่ยนให้ร้านขายของ)
 */
export function countsAsSoldFor(
  order: {
    status: string
    serviceClosedAt?: Date | string | null
    appointmentStatus?: string | null
    /** 00085: บังคับ — ใบที่ร้านปิดแบบไม่นับต้องไม่เป็นของขายออก (F6) */
    shipments: Parameters<typeof excludedFromRevenueByParcelClose>[0]['shipments']
  },
  vertical: string | null | undefined,
): boolean {
  if (!usesServiceFinanceRules(vertical)) return order.status === 'CONFIRMED' && !excludedFromRevenueByParcelClose(order)
  return countsAsServiceDelivered({
    status: order.status,
    serviceClosedAt: order.serviceClosedAt ?? null,
    appointmentStatus: order.appointmentStatus ?? null,
  })
}
