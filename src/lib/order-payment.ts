/**
 * order-payment — SSOT ของ "งานนี้จ่ายมาแล้วเท่าไร ค้างเท่าไร" (feature 00050)
 *
 * ## ทำไมต้องมีไฟล์นี้
 *
 * ก่อนหน้านี้ระบบมีแต่ `Order.depositAmount` ซึ่งคือ **ข้อตกลง** ไม่ใช่ **ข้อเท็จจริง** —
 * โค้ดเขียนสารภาพไว้เองที่ `APPOINTMENT_SUMMARY_LABEL.deposit` (`src/lib/appointment-summary.ts`)
 * ว่าไม่รู้ว่าจ่ายหรือยัง จึงต้องเลี่ยงไปใช้คำว่า "มัดจำที่ตกลงไว้" บนการ์ดที่ส่งให้ลูกค้า
 * (อ้างด้วย **ชื่อ symbol ไม่ใช่เลขบรรทัด** — เลขบรรทัดขยับแล้วคำอ้างจะชี้ผิดที่เงียบ ๆ
 * ซึ่งเกิดกับคอมเมนต์นี้เองตอนไปแก้ข้อความตรงนั้นในรอบเดียวกัน)
 *
 * เมื่อมี `OrderPayment` แล้ว ความรู้เรื่องนี้ต้องมี **นิยามเดียว** (Hard Rule 16) —
 * ยอดค้างจะถูกอ่านที่หน้าออเดอร์ · การ์ดในแชท · dashboard · หน้า `/o/[token]`
 * ถ้าแต่ละที่บวกลบเอง วันหนึ่งจอสองจอจะบอกเลขคนละตัวโดยไม่มี gate ไหนฟ้อง
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็น **ฟังก์ชันบริสุทธิ์** — ไม่แตะ prisma ไม่แตะ React
 * (`docs/conventions/ui-boolean-needs-a-testable-home.md`)
 */

/** ชนิดของเงินที่รับ — ตรงกับ `OrderPayment.kind` */
export type OrderPaymentKind = 'DEPOSIT' | 'BALANCE'

/** วิธีรับเงิน — ตรงกับ `OrderPayment.method` */
export type OrderPaymentMethod = 'TRANSFER' | 'CASH' | 'OTHER'

export const ORDER_PAYMENT_KIND_LABEL: Record<OrderPaymentKind, string> = {
  DEPOSIT: 'มัดจำ',
  BALANCE: 'ยอดที่เหลือ',
}

export const ORDER_PAYMENT_METHOD_LABEL: Record<OrderPaymentMethod, string> = {
  TRANSFER: 'โอนเงิน',
  CASH: 'เงินสด',
  OTHER: 'อื่น ๆ',
}

/** แถวเงินรับเท่าที่การคำนวณต้องใช้ — รับ `number` เพื่อให้เทสได้โดยไม่ต้องพึ่ง Prisma.Decimal */
export interface PaymentRow {
  kind: OrderPaymentKind
  amount: number
  /** ยกเลิกแล้วไม่นับ — การกลับรายการทำด้วยการยกเลิก ไม่ใช่ยอดติดลบ */
  voidedAt: Date | null
}

export interface OrderMoneyInput {
  /** ยอดรวมของบิล ณ ปัจจุบัน (เปลี่ยนได้เมื่อร้านเพิ่ม/แก้รายการ — BR-SQ-31) */
  totalAmount: number
  /** ยอดมัดจำที่ "ตกลงไว้" — null/0 = ไม่เก็บมัดจำ (BR-SQ-07) */
  depositAgreed: number | null
  payments: readonly PaymentRow[]
}

export interface OrderMoney {
  totalAmount: number
  /** ตกลงไว้ */
  depositAgreed: number
  /** รับมาแล้วในฐานะมัดจำ */
  depositReceived: number
  /** รับมาแล้วในฐานะยอดที่เหลือ */
  balanceReceived: number
  /** รับมาแล้วทั้งหมด */
  totalReceived: number
  /** ยังค้าง — ไม่ต่ำกว่า 0 */
  outstanding: number
  /** ยังไม่ได้รับเงินสักบาท */
  unpaid: boolean
  /** รับครบตามยอดรวมแล้ว */
  fullyPaid: boolean
  /** ตกลงว่าจะเก็บมัดจำ และรับครบยอดมัดจำนั้นแล้ว */
  depositSettled: boolean
  /** มีมัดจำให้พูดถึงไหม — false = ซ่อนส่วนมัดจำทุก surface (BR-SQ-07) */
  hasDeposit: boolean
}

const sum = (rows: readonly PaymentRow[], kind: OrderPaymentKind): number =>
  rows.reduce((n, r) => (r.voidedAt === null && r.kind === kind ? n + r.amount : n), 0)

/** ปัดทศนิยม 2 ตำแหน่ง — กันเศษลอยจากการบวกเลขทศนิยมทำให้ "ค้าง 0.0000001 บาท" */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * รวมสถานะการเงินของออเดอร์หนึ่งใบ
 *
 * 🛑 **ยอดค้างคำนวณจาก "เงินที่รับจริง" เท่านั้น ห้ามเอา `depositAgreed` มาหัก** (BR-SQ-03)
 * มัดจำที่ตกลงแต่ยังไม่ได้รับ ไม่ได้ทำให้ลูกค้าค้างน้อยลงแม้แต่บาทเดียว
 *
 * 🛑 **ยอดรวมเปลี่ยนทีหลัง ไม่คิดมัดจำใหม่ย้อนหลัง** (BR-SQ-32 · หัวหน้ายืนยัน 2026-08-15:
 * "จ่ายมาแล้ว แก้ไม่ได้") — ถ้าลูกค้าเพิ่มของหลังจ่ายมัดจำแบบ % ไปแล้ว เงินที่รับมาคือ
 * ข้อเท็จจริงที่เกิดขึ้นจริง ส่วนต่างไปโผล่ที่ `outstanding` ไม่ใช่ไปแก้ยอดที่รับไปแล้ว
 * ฟังก์ชันนี้จึง **ไม่รับ depositMode/depositValue เข้ามาเลย** — ไม่มีทางคำนวณย้อนหลังได้
 * แม้จะอยากทำ
 *
 * รับเกินยอดรวมได้ (ลูกค้าโอนเกิน/ทิป) → `outstanding` เป็น 0 ไม่ใช่ติดลบ
 */
export function computeOrderMoney(input: OrderMoneyInput): OrderMoney {
  const depositAgreed = round2(Math.max(0, input.depositAgreed ?? 0))
  const depositReceived = round2(sum(input.payments, 'DEPOSIT'))
  const balanceReceived = round2(sum(input.payments, 'BALANCE'))
  const totalReceived = round2(depositReceived + balanceReceived)
  const totalAmount = round2(Math.max(0, input.totalAmount))

  return {
    totalAmount,
    depositAgreed,
    depositReceived,
    balanceReceived,
    totalReceived,
    outstanding: round2(Math.max(0, totalAmount - totalReceived)),
    unpaid: totalReceived === 0,
    fullyPaid: totalReceived >= totalAmount && totalAmount > 0,
    depositSettled: depositAgreed > 0 && depositReceived >= depositAgreed,
    hasDeposit: depositAgreed > 0 || depositReceived > 0,
  }
}

/**
 * "ใบนี้มีเรื่องเงินให้พูดถึงไหม" — เกณฑ์ที่ตัดสินว่าจอจะแสดงบล็อกเงิน และจะใช้ป้ายสถานะที่
 * derive จากเงิน (จอง / รอชำระ / ชำระเงินแล้ว) หรือใช้ป้ายเดิมของ `Order.status`
 *
 * 🛑 **ต้องเป็นนิยามเดียวทั้งระบบ (HR16)** — เกณฑ์นี้เคยเขียนซ้ำเป็นนิพจน์ดิบ 2 ที่
 * (`/orders/[token]` กับ `/o/[token]`) แล้วรอบที่เพิ่มหน้ารายการ `/orders` เข้ามาเป็นที่ที่สาม
 * ก็เกือบเขียนเป็นที่สามอีก. ถ้าที่ใดที่หนึ่งเพี้ยน ผลคือ **ใบเดียวกันขึ้นป้ายคนละคำในสองจอ**
 * ซึ่งเป็นอาการที่หัวหน้ารายงานมาตั้งแต่ต้น ไม่มี `tsc`/build ตัวไหนฟ้องเพราะทั้งสองนิพจน์
 * ถูกต้องตามชนิดทุกตัวอักษร
 *
 * 🛑 เกณฑ์นี้ **ไม่ใช่** ด่าน vertical และไม่ใช้แทนกัน — ผู้เรียกต้องกั้น
 * `vertical === 'SERVICE_QUEUE'` มาก่อนเสมอ (AC-SQ-07) ตัวนี้ตอบแค่ว่า
 * "ในบรรดาร้านบริการ ใบนี้มีอะไรให้พูดถึงหรือยัง" — ใบที่เปิดทิ้งไว้เฉย ๆ ยังไม่ตกลงมัดจำ
 * และยังไม่รับเงิน ไม่มีเรื่องเงินให้เล่า การขึ้นบล็อกเงินว่างเปล่าคือ noise
 */
export function hasMoneyStory(m: Pick<OrderMoney, 'totalReceived' | 'hasDeposit'>): boolean {
  return m.totalReceived > 0 || m.hasDeposit
}

/**
 * แถวเงินที่ผ่าน RSC/JSON boundary มาแล้ว — `Decimal` เป็น string · `Date` เป็น ISO
 *
 * 🛑 มีตัวแปลง **ตัวเดียว** (`computeOrderMoneyFromSerialized`) โดยตั้งใจ: ถ้าปล่อยให้แต่ละจอ
 * `Number(x)` / `new Date(y)` เอง วันหนึ่งจะมีจอที่ลืมตัด `voidedAt` แล้วนับเงินที่ยกเลิกไปแล้ว
 * เป็นเงินที่รับจริง — ไม่มี `tsc`/build ตัวไหนฟ้อง เพราะทุกบรรทัดถูกตามชนิด (Hard Rule 16)
 */
export interface SerializedPaymentRow {
  kind: string
  amount: string
  /** ISO string · null = ยังไม่ถูกยกเลิก */
  voidedAt: string | null
}

/** ใช้กับข้อมูลที่ server ส่งลงมาให้ UI — ผลลัพธ์ต้องเท่ากับเรียก `computeOrderMoney` ตรง ๆ ทุกกรณี */
export function computeOrderMoneyFromSerialized(input: {
  totalAmount: string
  depositAmount: string | null
  payments: readonly SerializedPaymentRow[] | undefined
}): OrderMoney {
  return computeOrderMoney({
    totalAmount: Number(input.totalAmount),
    depositAgreed: input.depositAmount === null ? null : Number(input.depositAmount),
    payments: (input.payments ?? []).map((p) => ({
      // ค่าที่ไม่รู้จักต้องไม่ถูกนับเป็นเงิน — `sum()` เทียบ kind ตรง ๆ จึงตกไปเองอย่างปลอดภัย
      kind: p.kind as OrderPaymentKind,
      amount: Number(p.amount),
      voidedAt: p.voidedAt === null ? null : new Date(p.voidedAt),
    })),
  })
}

/**
 * ปิดงานทั้งที่ยังค้างเงินได้ไหม
 *
 * 🛑 **กฎนี้ต้องอยู่ที่เดียว** — หัวหน้าตอบว่า *"ได้ อนุโลมช่วงนี้ก่อน"* (2026-08-15)
 * คำว่า "ช่วงนี้" แปลว่าวันหนึ่งจะเปลี่ยน ⇒ ถ้ากระจายเงื่อนไขไปตามปุ่มต่าง ๆ วันนั้นจะแก้ไม่ครบ
 * และจะได้ระบบที่ปุ่มหนึ่งบล็อกอีกปุ่มไม่บล็อก
 *
 * ตอนนี้: อนุญาตเสมอ แต่ผู้เรียก **ต้องเตือน** เมื่อ `outstanding > 0` (BR-SQ-23)
 * ห้ามเงียบ — ปิดงานโดยลืมเก็บเงินคือความเสียหายที่ผู้ใช้ต้องรู้ตัว ณ วินาทีนั้น
 */
export const ALLOW_COMPLETE_WITH_OUTSTANDING = true

export function completionWarning(money: OrderMoney): string | null {
  if (money.outstanding <= 0) return null
  return `ยังค้างชำระ ฿${money.outstanding.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
}

/**
 * ยอดที่ควรเสนอเป็นค่าตั้งต้นตอนกด "รับเงิน" ในแชท
 *
 * ยังไม่ได้รับมัดจำและตกลงไว้ → เสนอยอดมัดจำ · นอกนั้น → เสนอยอดค้างทั้งหมด
 * เป็นแค่ **ค่าตั้งต้นช่วยกรอก** ร้านพิมพ์ทับได้เสมอ (ลูกค้าจ่ายไม่ตรงยอดเป็นเรื่องปกติ)
 */
export function suggestedPayment(money: OrderMoney): { kind: OrderPaymentKind; amount: number } {
  /**
   * 🛑 ตัดสินจาก **"ยังเหลือมัดจำที่ต้องเก็บไหม"** ตัวเดียว ห้ามใช้ `hasDeposit`/`depositSettled`
   *
   * `hasDeposit` เป็นจริงเมื่อ "เคยรับเงินก้อน DEPOSIT" ด้วย ⇒ ร้านที่รับเงินก้อนแรกเป็น DEPOSIT
   * ทั้งที่ไม่เคยตั้งยอดมัดจำไว้ (`depositAgreed = 0` — เกิดกับลูกค้า walk-in เป็นปกติ) จะเข้ากิ่งมัดจำ
   * แล้วได้ `remaining = 0` ตกไปที่ทางหนี `|| outstanding` ⇒ **เสนอยอดที่เหลือทั้งก้อนในนาม "มัดจำ"**
   * ซึ่งไปโผล่ผิดช่องที่ dashboard (AC-SQ-04 แยกยอดมัดจำ/ยอดที่เหลือ) โดยไม่มีอะไรฟ้อง
   * เพราะทั้งสองค่าเป็นเลขที่ "ถูก" ในตัวเอง
   */
  const depositRemaining = round2(Math.max(0, money.depositAgreed - money.depositReceived))
  if (depositRemaining > 0 && money.outstanding > 0) {
    // ตกลงไว้แต่ยอดค้างรวมน้อยกว่ามัดจำ (เพราะบิลถูกลดทีหลัง) → อย่าเสนอเกินยอดค้าง
    return { kind: 'DEPOSIT', amount: Math.min(depositRemaining, money.outstanding) }
  }
  return { kind: 'BALANCE', amount: money.outstanding }
}
