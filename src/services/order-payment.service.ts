/**
 * order-payment.service — บันทึก "เงินที่ได้รับจริง" ของออเดอร์ (feature 00050)
 *
 * ## กฎที่ฝังอยู่ในไฟล์นี้ (มติจากหัวหน้า 2026-08-15)
 *
 * 1. **"มีสลิป ≠ ได้รับเงิน"** — ต้องมีคนกดยืนยันเสมอ ไม่มีทางที่ระบบจะบันทึกเองจากการที่
 *    ลูกค้าแนบรูป (สลิปปลอมมีจริง · แนบผิดบิลมีจริง) ⇒ ทุกแถวมี `receivedByUserId` เสมอ
 * 2. **"จ่ายมาแล้ว แก้ไม่ได้"** — ไม่มีฟังก์ชัน update ในไฟล์นี้โดยเจตนา กรอกผิดให้ `void`
 *    แล้วบันทึกใหม่ (การกลับรายการทางบัญชี) ประวัติเงินที่แก้ทับได้ไม่ใช่ประวัติ
 * 3. **ปิดงานทั้งที่ค้างได้** — กฎอยู่ที่ `ALLOW_COMPLETE_WITH_OUTSTANDING` ใน
 *    `src/lib/order-payment.ts` ที่เดียว ไม่กระจายมาที่นี่
 *
 * Base (โครง guard + error mapping): src/services/appointment.service.ts
 */
import { prisma } from '@/lib/prisma'
import { thaiTodayBounds } from '@/lib/date-range'
import {
  computeOrderMoney,
  type OrderMoney,
  type OrderPaymentKind,
  type OrderPaymentMethod,
} from '@/lib/order-payment'

/** error ที่ผู้เรียกต้องแปลงเป็น HTTP — ชื่อคงที่ ห้ามเปลี่ยนเพราะ route แมปตามนี้ */
export class OrderPaymentError extends Error {
  constructor(
    public readonly code:
      | 'ORDER_NOT_FOUND'
      | 'PAYMENT_NOT_FOUND'
      | 'ALREADY_VOIDED'
      | 'AMOUNT_INVALID',
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'OrderPaymentError'
  }
}

/**
 * 🛑 select ชุดเดียวที่ใช้ทุกที่ในไฟล์นี้ — ดึงเฉพาะที่ `computeOrderMoney` ต้องใช้
 *
 * ไม่ดึง `include: { payments: true }` ทั้งก้อนเพราะแถวเงินโตได้เรื่อย ๆ ตามอายุร้าน
 * และเราต้องการแค่ 3 คอลัมน์ต่อแถวเพื่อบวกเลข
 */
const MONEY_SELECT = {
  id: true,
  shopId: true,
  totalAmount: true,
  depositAmount: true,
  payments: { select: { kind: true, amount: true, voidedAt: true } },
} as const

/**
 * รูปร่างที่ตัวคำนวณต้องใช้ — ประกาศเป็น structural type ไม่ผูกกับชนิดที่ Prisma สร้าง
 *
 * 🛑 ห้าม `as MoneyRow` ทับผลลัพธ์ของ Prisma — cast คือสิ่งที่ปิดตา ไม่ใช่ตัวช่วย
 * (`docs/conventions/session-exists-is-not-identity.md`) ปล่อยให้ TS จับคู่โครงสร้างเอง
 * ⇒ วันที่ select ขาด field ไป จะคอมไพล์ไม่ผ่าน แทนที่จะพังตอนรัน
 */
interface MoneyRow {
  totalAmount: { toString(): string }
  depositAmount: { toString(): string } | null
  payments: readonly { kind: string; amount: { toString(): string }; voidedAt: Date | null }[]
}

/** แปลงแถวจาก Prisma (Decimal) เป็น input ของตัวคำนวณ (number) */
function toMoney(row: MoneyRow): OrderMoney {
  return computeOrderMoney({
    totalAmount: Number(row.totalAmount.toString()),
    depositAgreed: row.depositAmount === null ? null : Number(row.depositAmount.toString()),
    payments: row.payments.map((p) => ({
      kind: p.kind as OrderPaymentKind,
      amount: Number(p.amount.toString()),
      voidedAt: p.voidedAt,
    })),
  })
}

/**
 * อ่านสถานะการเงินของออเดอร์ — scope ด้วย shopId เสมอ
 *
 * 🛑 `shopId` อยู่ใน `where` ไม่ใช่ดึงมาเทียบทีหลัง — ร้านอื่นต้องหาไม่เจอ ไม่ใช่หาเจอแล้วถูกปฏิเสธ
 * (บทเรียนเดียวกับ `findConversationShopForUser` ใน feature 00018)
 */
export async function getOrderMoney(args: {
  shopId: string
  orderToken: string
}): Promise<OrderMoney> {
  const order = await prisma.order.findFirst({
    where: { publicToken: args.orderToken, shopId: args.shopId },
    select: MONEY_SELECT,
  })
  if (!order) throw new OrderPaymentError('ORDER_NOT_FOUND')
  return toMoney(order)
}

/**
 * บันทึกว่ารับเงินก้อนหนึ่งแล้ว
 *
 * คืนสถานะการเงิน **หลังบันทึก** เพื่อให้ผู้เรียกเอาไปแสดงได้เลยโดยไม่ต้อง query ซ้ำ
 * (จอที่กดปุ่มต้องอัปเดตทันที ไม่งั้นผู้ใช้กดซ้ำเพราะไม่เห็นอะไรเปลี่ยน)
 */
export async function recordPayment(args: {
  shopId: string
  orderToken: string
  receivedByUserId: string
  kind: OrderPaymentKind
  amount: number
  method: OrderPaymentMethod
  slipFileId?: string | null
  note?: string | null
}): Promise<{ paymentId: string; money: OrderMoney }> {
  // ยอดต้องเป็นบวก — ชั้นนี้กันไว้ให้ error อ่านรู้เรื่อง ส่วนความถูกต้องจริงอยู่ที่ CHECK ใน DB
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new OrderPaymentError('AMOUNT_INVALID')
  }

  const order = await prisma.order.findFirst({
    where: { publicToken: args.orderToken, shopId: args.shopId },
    select: { id: true, shopId: true },
  })
  if (!order) throw new OrderPaymentError('ORDER_NOT_FOUND')

  const created = await prisma.orderPayment.create({
    data: {
      orderId: order.id,
      // denormalize จากออเดอร์ ไม่ใช่จาก args — args.shopId ผ่าน guard มาแล้วก็จริง
      // แต่ค่าที่บันทึกลงประวัติเงินควรมาจากแถวที่เพิ่งอ่านจริง ไม่ใช่จากสิ่งที่ผู้เรียกส่งมา
      shopId: order.shopId,
      kind: args.kind,
      amount: args.amount,
      method: args.method,
      slipFileId: args.slipFileId ?? null,
      note: args.note?.trim() || null,
      receivedByUserId: args.receivedByUserId,
    },
    select: { id: true },
  })

  const after = await prisma.order.findUnique({ where: { id: order.id }, select: MONEY_SELECT })
  // after ต้องมีค่าเสมอ — เพิ่งอ่านออเดอร์นี้มาไม่กี่บรรทัดก่อน และ create สำเร็จแล้ว
  if (!after) throw new OrderPaymentError('ORDER_NOT_FOUND')
  return { paymentId: created.id, money: toMoney(after) }
}

/**
 * ยกเลิกรายการรับเงิน (กรอกผิด) — ไม่ลบแถวทิ้ง
 *
 * 🛑 `updateMany` + `voidedAt: null` ใน where = optimistic guard กันสองคนกดพร้อมกัน
 * (ร้านอ้างอิงมีทีม 7 คน — KG-SQ-03) ถ้าใช้ `update` เฉย ๆ คนที่สองจะเขียนทับเวลาและชื่อ
 * ของคนแรก ทำให้ประวัติบอกว่าคนผิดเป็นคนยกเลิก
 */
export async function voidPayment(args: {
  shopId: string
  /**
   * ออเดอร์ที่ผู้เรียกอ้างว่ารายการนี้อยู่ — ต้องตรงด้วย ไม่ใช่แค่ร้านตรง
   *
   * 🛑 ถ้าตรวจแค่ `shopId` แล้ว URL จะโกหก: `DELETE /api/orders/{ออเดอร์ B}/payments/{ของออเดอร์ A}`
   * จะสำเร็จเงียบ ๆ แล้วยอดของออเดอร์ที่ผู้ใช้กำลังดูอยู่ไม่ขยับ ส่วนอีกใบเปลี่ยนโดยไม่มีใครรู้
   * (client ถือ token ค้างจากจอก่อนหน้าเป็นเรื่องปกติในกล่องแชทที่สลับเธรดไปมา)
   * ตรวจด้วย relation filter จึงไม่เพิ่ม query
   */
  orderToken: string
  paymentId: string
  voidedByUserId: string
  reason: string
}): Promise<{ money: OrderMoney }> {
  const payment = await prisma.orderPayment.findFirst({
    where: {
      id: args.paymentId,
      shopId: args.shopId,
      order: { publicToken: args.orderToken, shopId: args.shopId },
    },
    select: { id: true, orderId: true, voidedAt: true },
  })
  if (!payment) throw new OrderPaymentError('PAYMENT_NOT_FOUND')
  if (payment.voidedAt !== null) throw new OrderPaymentError('ALREADY_VOIDED')

  const updated = await prisma.orderPayment.updateMany({
    where: { id: args.paymentId, shopId: args.shopId, voidedAt: null },
    data: {
      voidedAt: new Date(),
      voidedByUserId: args.voidedByUserId,
      voidedReason: args.reason.trim() || 'ไม่ระบุเหตุผล',
    },
  })
  // 0 = อีก request ยกเลิกไปก่อนแล้วระหว่างที่เราอ่าน — ผลลัพธ์ปลายทางเหมือนกัน ไม่ใช่ error
  if (updated.count === 0) throw new OrderPaymentError('ALREADY_VOIDED')

  const after = await prisma.order.findUnique({
    where: { id: payment.orderId },
    select: MONEY_SELECT,
  })
  if (!after) throw new OrderPaymentError('ORDER_NOT_FOUND')
  return { money: toMoney(after) }
}

/** ประวัติการรับเงินของออเดอร์ — ใหม่สุดก่อน รวมแถวที่ถูกยกเลิกด้วย (ประวัติต้องเห็นครบ) */
export async function listPayments(args: { shopId: string; orderToken: string }) {
  const order = await prisma.order.findFirst({
    where: { publicToken: args.orderToken, shopId: args.shopId },
    select: { id: true },
  })
  if (!order) throw new OrderPaymentError('ORDER_NOT_FOUND')

  return prisma.orderPayment.findMany({
    where: { orderId: order.id },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      kind: true,
      amount: true,
      method: true,
      slipFileId: true,
      note: true,
      receivedAt: true,
      voidedAt: true,
      voidedReason: true,
    },
  })
}

/**
 * ยอดเงินที่ร้านได้รับจริงในช่วงเวลาหนึ่ง — สำหรับ dashboard (AC-SQ-04)
 *
 * 🛑 นี่คือ "เงินที่เข้าจริง" ไม่ใช่ "ยอดขายตามบิล" — สองอย่างนี้ต่างกันเสมอในร้านบริการ
 * ที่เก็บมัดจำ (บิลเปิดวันนี้ แต่เงินอาจเข้าคนละวัน) หัวหน้าขอตัวแรก
 *
 * ใช้ `groupBy` ให้ฐานข้อมูลบวกให้ — ไม่ดึงแถวมาบวกในแอป เพราะจำนวนแถวโตตามอายุร้าน
 * และ index `(shopId, receivedAt)` ครอบ where นี้พอดี
 */
export async function sumReceivedInRange(args: {
  shopId: string
  from: Date
  to: Date
}): Promise<{ deposit: number; balance: number; total: number }> {
  const rows = await prisma.orderPayment.groupBy({
    by: ['kind'],
    where: {
      shopId: args.shopId,
      voidedAt: null,
      receivedAt: { gte: args.from, lt: args.to },
    },
    _sum: { amount: true },
  })

  const pick = (kind: OrderPaymentKind) =>
    Number(rows.find((r) => r.kind === kind)?._sum.amount?.toString() ?? '0')

  const deposit = pick('DEPOSIT')
  const balance = pick('BALANCE')
  return { deposit, balance, total: deposit + balance }
}

/**
 * เงินที่ร้านได้รับจริง "วันนี้" — การ์ดบนหน้าแรกของร้านบริการ (AC-SQ-04)
 *
 * 🛑 ขอบวันมาจาก `thaiTodayBounds()` ตัวเดียวกับที่ไทล์ "นัดวันนี้" ใช้ — ห้ามตัดวันเองที่นี่
 * หน้าแรกจอเดียวมีสองนิยามของคำว่า "วันนี้" ไม่ได้ (บทเรียน 00033: /sales กับ /orders
 * เคยตัดคนละแบบกับ dashboard แล้วตัวเลขสองหน้าไม่ตรงกันทั้งที่มาจากข้อมูลชุดเดียวกัน)
 *
 * perf: หนึ่ง `groupBy` ที่ index `(shopId, receivedAt)` ครอบ where พอดี — ฐานข้อมูลบวกให้
 * ไม่ดึงแถวมานับในแอป และผู้เรียกยิงขนานกับ query อื่นของหน้าแรกอยู่แล้ว (ไม่เพิ่ม wall time)
 */
export async function getMoneyReceivedToday(
  shopId: string,
): Promise<{ deposit: number; balance: number; total: number }> {
  const { from, to } = thaiTodayBounds();
  return sumReceivedInRange({ shopId, from, to });
}

/**
 * งานของ "วันนี้" ที่ยังเก็บเงินไม่ครบ — ตัวเลขที่ทำให้การ์ดบนหน้าแรกบอกได้ว่าต้องลงมือไหม
 *
 * หัวหน้าถาม (2026-08-15): *"เหลืองเขียวโอเคแล้ว แต่อยากให้รู้ยังไง"* — สีบอกสถานะได้แล้ว
 * แต่ไม่มีอะไรบอกว่า **ยังเหลืออะไรให้ทำ** ⇒ ยอดเงินอย่างเดียวตอบไม่ได้ว่า "เก็บครบหรือยัง"
 * (รับมา ฿5,000 วันนี้ อาจแปลว่าเก็บครบทุกงาน หรือแปลว่ายังเหลืออีก 3 งานก็ได้)
 *
 * 🛑 นับเฉพาะ **งานของวันนี้** ไม่ใช่ทุกงานที่ค้างในระบบ — การ์ดนี้พูดถึงวันนี้ทั้งใบ
 * ถ้าเอายอดค้างสะสมทั้งร้านมาใส่ ตัวเลขจะโตขึ้นเรื่อย ๆ จนไม่มีใครมองอีกเลย
 *
 * perf: `$queryRaw` หนึ่งครั้ง ใช้ correlated subquery แทนการดึงออเดอร์ทั้งวันมาบวกในแอป
 * — index `(shopId, type, serviceStart)` ครอบ where ของออเดอร์ · `(orderId)` ครอบ subquery
 */
export async function countUnpaidJobsToday(shopId: string): Promise<number> {
  const { from, to } = thaiTodayBounds();
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
    FROM "Order" o
    WHERE o."shopId" = ${shopId}
      AND o."status" <> 'CANCELLED'
      AND o."serviceStart" IS NOT NULL
      -- [สำคัญ] ต้องสะท้อน appointmentDayWhere('today') เป๊ะ ไม่ใช่ "ใกล้เคียง"
      --    (ห้ามใส่ backtick ในคอมเมนต์นี้ — มันอยู่ใน template literal จะปิดสตริงกลางคัน)
      --    เลขนี้ถูกเอาไปเทียบกับ getTodayAppointmentCount() บนการ์ดเดียวกัน
      --    (ค้าง N งาน vs มีงานวันนี้กี่งาน) ⇒ เกณฑ์วันต่างกันแม้แต่ขอบเดียว
      --    = "เก็บครบแล้ว" สีเขียวทั้งที่ยังมีงานค้าง ซึ่งละเมิด Verified-Means-Green
      AND (
        (o."serviceEnd" IS NOT NULL AND o."serviceEnd" > ${from} AND o."serviceStart" < ${to})
        OR (o."serviceEnd" IS NULL AND o."serviceStart" >= ${from} AND o."serviceStart" < ${to})
      )
      AND o."totalAmount" > COALESCE((
        SELECT SUM(p."amount") FROM "OrderPayment" p
        WHERE p."orderId" = o."id" AND p."voidedAt" IS NULL
      ), 0)
  `;
  return Number(rows[0]?.n ?? 0);
}
