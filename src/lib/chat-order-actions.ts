/**
 * chat-order-actions — ปุ่มเรื่องเงินที่ควรโผล่ในแชท ณ สถานะหนึ่ง ๆ (feature 00050)
 *
 * ## ทำไมต้องเป็นฟังก์ชันบริสุทธิ์แยกไฟล์
 *
 * หัวหน้าสั่งตรง ๆ (2026-08-15): *"มี action ให้ admin กดง่ายๆ ที่หน้า chat"*
 * ⇒ ปุ่มพวกนี้จะโผล่ **หลายที่**: แถบสถานะบนมือถือ (`OrderProgressBar`) · แผงขวาบนเดสก์ท็อป
 * (`CustomerPanel`) · เมนูกดค้างบนรูปสลิป · และวันหน้าน่าจะมีที่อื่นอีก
 *
 * ถ้าแต่ละที่เขียนเงื่อนไข `order.status === … && money.outstanding > 0` ของตัวเอง
 * วันหนึ่งปุ่มจะโผล่ที่หนึ่งแต่ไม่โผล่อีกที่ โดยไม่มี `tsc`/build ตัวไหนฟ้อง เพราะทุกเงื่อนไข
 * "ถูก" ในตัวเอง (`docs/conventions/ui-boolean-needs-a-testable-home.md` — เกณฑ์ไม่ใช่
 * "ซับซ้อนพอไหม" แต่คือ "ถ้าเขียนกลับด้านแล้วจะมีอะไรจับได้ไหม")
 *
 * 🛑 ไฟล์นี้ตัดสินแค่ **"ควรเห็นปุ่มอะไร"** ไม่ตัดสิน "กดแล้วเกิดอะไร" — การบันทึกเงินอยู่ที่
 * `order-payment.service.ts` ซึ่งตรวจสิทธิ์ของมันเอง ปุ่มที่ซ่อนอยู่ไม่ใช่ด่านความปลอดภัย
 */
import type { OrderMoney, OrderPaymentKind } from '@/lib/order-payment'

export type ChatOrderActionKey =
  /** เริ่มงานเดี๋ยวนี้ — ลูกค้าเดินเข้ามาเลย ไม่ได้จองล่วงหน้า (BR-SQ-20/21) */
  | 'START_WALK_IN'
  /** แจ้งยอดมัดจำให้ลูกค้า (ส่งการ์ดไปในแชท) — D-3 แบบ A */
  | 'REQUEST_DEPOSIT'
  /** บันทึกว่ารับเงินแล้ว (มัดจำหรือส่วนที่เหลือ ตามที่ระบบเสนอ) */
  | 'RECORD_PAYMENT'
  /** ลูกค้ามาถึงแล้ว เริ่มให้บริการ / ปิดงาน */
  | 'MARK_SERVED'

export interface ChatOrderAction {
  key: ChatOrderActionKey
  label: string
  icon: string
  /** ปุ่มหลักของสถานะนี้ — มีได้ตัวเดียว (ที่เหลืออยู่ในเมนู ⋯) */
  primary: boolean
}

export interface ChatOrderContext {
  /** สถานะออเดอร์ — 'CANCELLED' = จบแล้ว ไม่มีอะไรให้ทำ */
  orderStatus: string
  /** สถานะนัด — 'COMPLETED'/'NO_SHOW' = ให้บริการจบแล้ว */
  appointmentStatus: string | null
  /**
   * ใบนี้มีนัดผูกอยู่ไหม (`Order.serviceStart != null`) — **false = walk-in**
   *
   * 🛑 จำเป็นเพราะ "เข้ารับบริการ" ปลายทางคือ `POST /api/orders/[token]/appointment/outcome`
   * ซึ่ง **404 เมื่อใบนั้นไม่มีนัด** ⇒ ถ้าไม่กั้น ปุ่มจะโผล่กับออเดอร์ walk-in ทุกใบแล้วกด
   * กี่ครั้งก็ไม่ผ่าน (BR-RSV-04 บอกไว้เองว่า walk-in เดินเส้นทางปกติทุกอย่าง *ยกเว้น* ไม่มีนัด)
   * — คลาสเดียวกับปุ่ม "ลองใหม่" ของ iShip ที่เชิญให้กดสิ่งที่ไม่มีวันสำเร็จ
   */
  hasAppointment: boolean
  money: OrderMoney
}

/** ออเดอร์ที่จบแล้ว ไม่ควรมีปุ่มอะไรให้กดอีก นอกจากดูประวัติ */
function isClosed(ctx: ChatOrderContext): boolean {
  return ctx.orderStatus === 'CANCELLED'
}

/**
 * ปุ่มที่ควรเห็น เรียงตามลำดับที่ควรกด
 *
 * ตรรกะตามเส้นทางจริงของร้านบริการ:
 *   ยังไม่เก็บอะไรเลย + ตกลงมัดจำไว้ → **แจ้งมัดจำ** (ปุ่มหลัก)
 *   ยังค้างเงินอยู่                    → **รับเงิน** (ปุ่มหลัก)
 *   ยังไม่ได้ปิดงาน                    → **เข้ารับบริการ**
 *
 * 🛑 "รับเงิน" ต้องอยู่ **ตลอดเวลาที่ยังค้าง** ไม่ใช่เฉพาะตอนถึงวันนัด — ลูกค้าโอนมาก่อน
 * วันนัดเป็นเรื่องปกติที่สุดของร้านจอง และนั่นคือเหตุผลทั้งหมดที่มีคำว่า "มัดจำ"
 *
 * 🛑 "เข้ารับบริการ" ไม่ถูกบล็อกด้วยยอดค้าง — หัวหน้าตอบเอง *"ได้ อนุโลมช่วงนี้ก่อน"*
 * (ตัวเตือนอยู่ที่ `completionWarning()` ผู้เรียกต้องแสดง ไม่ใช่ซ่อนปุ่ม)
 */
export function chatOrderActions(ctx: ChatOrderContext): ChatOrderAction[] {
  if (isClosed(ctx)) return []

  const actions: ChatOrderAction[] = []
  const served = ctx.appointmentStatus === 'COMPLETED' || ctx.appointmentStatus === 'NO_SHOW'
  const { money } = ctx

  /**
   * เริ่มงานเลย (walk-in) — เฉพาะใบที่ **ยังไม่มีนัด** และยังไม่ได้ปิดงาน
   *
   * 🛑 BR-SQ-21: walk-in ไม่ใช่ "นัดที่ไม่มีเวลา" — ตราบใดที่ `serviceStart` เป็น null
   * งานใบนั้น **หายจากตารางงานทั้งวัน** (query กรองด้วย `serviceStart < to AND serviceEnd > from`
   * ซึ่ง null ไม่เข้าทั้งคู่) ⇒ ร้านมีงานทำอยู่จริงแต่ตารางบอกว่าว่าง
   *
   * เป็นปุ่มหลักเสมอเมื่อโผล่ — ใบที่ยังไม่มีเวลาเริ่ม คือใบที่ยังไม่มีที่ยืนในระบบเลย
   * เรื่องนั้นมาก่อนการทวงเงิน
   */
  if (!ctx.hasAppointment && !served) {
    actions.push({ key: 'START_WALK_IN', label: 'เริ่มงานเลย', icon: 'player-play', primary: true })
  }

  /**
   * แจ้งมัดจำ — เฉพาะตอนตกลงไว้แล้วแต่ยังไม่ได้รับสักบาท (แจ้งซ้ำหลังรับแล้วไม่มีความหมาย)
   *
   * ต้องมีนัดด้วย เพราะสิ่งที่ส่งออกไปจริงคือ **การ์ดสรุปนัด** ซึ่งมีบรรทัด "มัดจำที่ตกลงไว้"
   * อยู่ในนั้น (`appointment-summary.ts`) — ใบ walk-in ไม่มีนัดให้สรุป จึงไม่มีอะไรจะส่ง
   */
  if (ctx.hasAppointment && money.hasDeposit && money.depositReceived === 0 && !served) {
    actions.push({ key: 'REQUEST_DEPOSIT', label: 'แจ้งมัดจำ', icon: 'receipt', primary: true })
  }

  if (money.outstanding > 0) {
    actions.push({
      key: 'RECORD_PAYMENT',
      label: 'รับเงินแล้ว',
      icon: 'cash-banknote',
      // เป็นปุ่มหลักเมื่อไม่มีปุ่มแจ้งมัดจำแย่งตำแหน่งอยู่
      primary: actions.length === 0,
    })
  }

  // ปิดผลนัด — ต้องมีนัดจริงถึงจะปิดได้ (ดูเหตุผลที่ `hasAppointment`)
  if (ctx.hasAppointment && !served) {
    actions.push({
      key: 'MARK_SERVED',
      label: 'เข้ารับบริการ',
      icon: 'circle-check',
      primary: actions.length === 0,
    })
  }

  return actions
}

export interface SlipCandidate {
  token: string
  /** เลขคำสั่งซื้อที่ผู้ใช้เห็น */
  label: string
  orderStatus: string
  money: OrderMoney
}

/**
 * ลูกค้าส่งสลิปมาในแชท — สลิปใบนี้ควรลงบิลไหน
 *
 * 🛑 คืน `null` เมื่อ **ยังเหลือมากกว่าหนึ่งใบที่ค้างเงิน** โดยตั้งใจ — ไม่ใช่เพราะทำไม่ได้
 * แต่เพราะการเดาผิดใบแปลว่า **เงินไปลงบิลของงานอื่น** แล้วสองใบผิดพร้อมกัน (ใบที่ควรได้ยังค้าง
 * ใบที่ไม่ควรได้ดูเหมือนจ่ายแล้ว) ซึ่งเป็นความเสียหายที่หนักกว่าการไม่มีทางลัดให้กดมาก
 * ผู้ใช้ยังกด "รับเงินแล้ว" จากการ์ดของใบที่ต้องการได้เสมอ — ทางนั้นไม่กำกวมเพราะผูกกับใบอยู่แล้ว
 *
 * คืน `null` เมื่อไม่มีใบไหนค้างเลยด้วย — ปุ่มที่กดแล้วไม่มีอะไรให้ทำ แย่กว่าปุ่มที่ไม่มี
 */
export function resolveSlipTarget(candidates: readonly SlipCandidate[]): SlipCandidate | null {
  const owing = candidates.filter((c) => c.orderStatus !== 'CANCELLED' && c.money.outstanding > 0)
  return owing.length === 1 ? owing[0] : null
}

/**
 * เหตุผลที่ยกเลิกรายการรับเงิน — รายการปิด ไม่ให้พิมพ์เอง
 *
 * เหตุผลของการยกเลิกเงินคือสิ่งที่คนอ่านย้อนหลังหลายเดือนให้หลังต้องเข้าใจได้ทันที
 * ข้อความอิสระจะกลายเป็น "แก้" / "ผิด" / "-" ซึ่งไม่ตอบอะไรเลย
 */
export const VOID_PAYMENT_REASONS = [
  { value: 'กรอกยอดผิด', label: 'กรอกยอดผิด' },
  { value: 'บันทึกซ้ำ', label: 'บันทึกซ้ำ' },
  { value: 'เงินไม่เข้าจริง', label: 'เงินไม่เข้าจริง' },
  { value: 'ลูกค้าขอคืนเงิน', label: 'ลูกค้าขอคืนเงิน' },
  { value: 'บันทึกผิดใบ', label: 'บันทึกผิดใบ' },
] as const

export interface PaymentAmountCheck {
  /** true = ห้ามบันทึก (ปิดปุ่ม) · false = บันทึกได้แต่ต้องให้ผู้ใช้เห็นข้อความก่อน */
  blocking: boolean
  message: string | null
}

/** เพดานเดียวกับ `RecordPaymentSchema` ที่ route — ปิดปุ่มก่อนยิงดีกว่าให้ได้ 400 กลับมา */
export const MAX_PAYMENT_AMOUNT = 99_999_999

/**
 * ยอดที่กรอกมีอะไรต้องบอกไหม
 *
 * 🛑 **เตือน ≠ ห้าม** — ลูกค้าโอนเกิน · ให้ทิป · จ่ายเกินยอดมัดจำที่ตกลงไว้ เป็นเรื่องที่เกิดจริง
 * ทุกวันในร้านบริการ ถ้าปิดปุ่มทุกครั้งที่ตัวเลขไม่ลงตัว ร้านจะบันทึกความจริงไม่ได้แล้วหันไป
 * จดใส่กระดาษ ซึ่งแย่กว่าไม่มีระบบ (คลาสเดียวกับ BR-RSV-18 ที่ "เต็มแล้ว" เป็นคำเตือนไม่ใช่ตัวบล็อก)
 *
 * บล็อกเฉพาะค่าที่ **ไม่มีความหมาย** เท่านั้น: ไม่ใช่ตัวเลข · ไม่เป็นบวก · เกินเพดานที่ DB รับ
 */
export function checkPaymentAmount(input: {
  amount: number
  kind: OrderPaymentKind
  money: OrderMoney
}): PaymentAmountCheck {
  const { amount, kind, money } = input

  if (!Number.isFinite(amount) || amount <= 0) {
    return { blocking: true, message: 'ยอดเงินต้องมากกว่า 0' }
  }
  if (amount > MAX_PAYMENT_AMOUNT) {
    return { blocking: true, message: 'ยอดเงินเกินที่ระบบรับได้' }
  }

  // เรียงจาก "เจาะจงที่สุด" ลงมา — แสดงข้อความเดียว ไม่กองรวมกันจนไม่มีใครอ่าน
  if (kind === 'DEPOSIT' && money.depositAgreed === 0) {
    return { blocking: false, message: 'บิลนี้ไม่ได้ตั้งยอดมัดจำไว้ — บันทึกเป็นมัดจำได้ แต่จะไม่มียอดให้เทียบ' }
  }
  const depositRemaining = money.depositAgreed - money.depositReceived
  if (kind === 'DEPOSIT' && depositRemaining > 0 && amount > depositRemaining) {
    return { blocking: false, message: `มากกว่ายอดมัดจำที่ยังขาดอยู่ (${baht(depositRemaining)})` }
  }
  if (amount > money.outstanding) {
    return { blocking: false, message: `มากกว่ายอดค้าง (${baht(money.outstanding)}) — บันทึกได้ถ้าลูกค้าจ่ายเกินจริง` }
  }
  return { blocking: false, message: null }
}

const baht = (n: number) => `฿${fmt(n)}`

/**
 * ข้อความสรุปสถานะเงินสำหรับแสดงบนแถบในแชท
 *
 * 🛑 ห้ามพูดว่า "จ่ายแล้ว" ถ้ายังไม่มีใครกดยืนยัน — ก่อนหน้านี้ระบบไม่มีข้อมูลนี้เลย
 * จึงต้องเลี่ยงไปใช้คำว่า "มัดจำที่ตกลงไว้" (ดู `appointment-summary.ts`) ตอนนี้เรารู้แล้ว
 * จึงพูดตรงได้ — แต่ต้องตรงกับความจริงเท่านั้น ไม่ใช่ตรงกับสิ่งที่อยากให้เป็น
 */
export function chatMoneySummary(money: OrderMoney): string {
  if (money.fullyPaid) return 'ชำระครบแล้ว'
  if (money.totalReceived === 0) {
    return money.hasDeposit ? `รอมัดจำ ฿${fmt(money.depositAgreed)}` : `รอชำระ ฿${fmt(money.outstanding)}`
  }
  return `รับแล้ว ฿${fmt(money.totalReceived)} · ค้าง ฿${fmt(money.outstanding)}`
}

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
