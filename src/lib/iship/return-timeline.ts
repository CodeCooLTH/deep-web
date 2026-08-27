/**
 * return-timeline — แถวที่ 2 ของไทม์ไลน์พัสดุ ("ขากลับ") · SSOT ตัวเดียวของ 6 จอ
 *
 * pure module — ห้าม import prisma/server-only (ใช้ทั้งฝั่ง server enrich และ client render)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 ทำไมแถบต้องมี 2 แถว
 *
 * เดิมแถบมี 4 จุดตายตัว แล้ว "ขาตีกลับ" ถูกยัดลงไปโดย override แค่ *คำ* กับ *ไอคอน*
 * ของจุดที่ 4 (`lastLabel`/`lastIcon` ใน `describeProgress`) ⇒ พัสดุที่ตีกลับมากองที่ร้าน
 * อ่านว่า **"เดินหน้าครบ 4 ขั้น จบสวย"** และครึ่งหลังของเรื่อง (ตีกลับเมื่อไร ถึงร้านหรือยัง)
 * ไม่มีที่ยืนบนจอเลย — user เจอเองบน prod 2026-08-25 (TH6504915C3K3F)
 *
 * รูปที่เลือก: **งูเลื้อย** แถว 1 เดินซ้าย→ขวา · แถว 2 เดินขวา→ซ้าย จบที่ซ้ายสุด
 * **ตรงกับจุดออกเดินทางพอดี** = ของกลับมาที่เดิม อ่านออกโดยไม่ต้องอ่านคำ
 * ⇒ ตัวเรนเดอร์ต้องกลับทิศเอง (`flex-row-reverse`) โมดูลนี้คืนจุดเรียงตาม **ลำดับเวลา** เสมอ
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 มี 2 กลไกที่ป้อนแถวนี้ และมันเกิดกับออเดอร์ใบเดียวกันไม่ได้
 *
 *   BOUNCE — ขนส่งตีกลับ ผู้ซื้อ **ไม่เคยได้รับของ** (`carrierStatus` = return/return_success)
 *   RETURN — ลูกค้า **ได้รับแล้วส่งคืน** (feature 00056 · ตาราง `OrderReturn`)
 *
 * `canCreateReturn()` ใน `lib/order-return.ts` บล็อกด้วย `PARCEL_WAS_RETURNED` ทันทีที่พัสดุ
 * ขาไปตีกลับ ⇒ **รางเดียวพอ ไม่ต้องมี 2 ราง** และไม่ต้องกลัวสองอันชนกัน
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🛑 จำนวนจุดผันตามข้อมูลที่ *มีจริง* ไม่ใช่ตายตัว
 *
 * ทั้งสองกลไกให้ความละเอียดไม่เท่ากัน และ 00056 เองยังแตกอีก 3 ระดับตาม `trackingSource`:
 *
 *   BOUNCE            → 2 จุด  (ขนส่งมีแค่ return → return_success ไม่มีข้อมูล "รับเข้าระบบ" ของขากลับ)
 *   RETURN · ISHIP    → 4 จุด  (มีพัสดุขากลับจริง สถานะขนส่งครบชุด)
 *   RETURN · MANUAL   → 3 จุด  (ขนส่งเจ้าอื่น รู้แค่ REQUESTED/SHIPPING/RECEIVED)
 *   RETURN · NONE     → 2 จุด  (ลูกค้าส่งมาเองไม่แจ้งเลข)
 *
 * ถ้าวาด 4 จุดตายตัวทุกเคส 3 ใน 4 เคสจะมีจุดที่ **ไม่มีวันสว่าง** ซึ่งในภาษาของแถบนี้
 * แปลว่า "ยังไปไม่ถึง" ⇒ โกหกกับพัสดุที่ถึงร้านไปแล้ว
 * (docs/conventions/partial-data-must-be-labeled-or-filled.md)
 */

import { FORWARD_OUTCOME, returnLegStampOf } from './status'

/**
 * มุมมองของคนอ่าน — คำที่มีคำว่า "ร้าน" อยู่ในนั้นแปลคนละอย่างจากสองฝั่ง
 *
 * 🛑 เก็บเป็น **ตารางเดียวคีย์ตามมุมมอง** ไม่ใช่ไฟล์ที่สอง เพื่อให้ `tsc` บังคับว่าเพิ่มจุดใหม่
 * ต้องมีครบทั้งสองมุมเสมอ — `ParcelTimeline.tsx` ฝั่งผู้ซื้อเขียนคอมเมนต์เตือนไว้เองว่า
 * "ห้ามเขียนรายชื่อขั้นของตัวเองที่นี่ ไม่งั้นผู้ซื้อกับผู้ขายจะเห็นพัสดุใบเดียวกันอยู่คนละขั้น"
 */
export type TimelineAudience = 'seller' | 'buyer'

export type ReturnLegKind = 'BOUNCE' | 'RETURN'

/** ที่มาของเลขพัสดุขากลับ — ตรงกับ `OrderReturn.trackingSource` */
export const RETURN_TRACKING_SOURCE = {
  ISHIP: 'ISHIP',
  MANUAL: 'MANUAL',
  NONE: 'NONE',
} as const

/** จุดหนึ่งจุดบนแถว 2 — เรียงตาม "ลำดับเวลา" เสมอ (ตัวเรนเดอร์กลับทิศเอง) */
export interface ReturnLegDot {
  label: string
  /** ชื่อ tabler ล้วน ไม่มี prefix — ผู้เรียกเติมเองตามที่แต่ละจอทำอยู่ */
  icon: string
}

export interface ReturnLeg {
  kind: ReturnLegKind
  dots: ReturnLegDot[]
  /**
   * จุดที่ไปถึงแล้ว (0-based) — `dots.length - 1` = ถึงร้านแล้ว
   *
   * 🛑 ตัดสินจาก **สถานะ** ไม่ใช่จากคอลัมน์เวลา: ใบที่ `carrierStatus='return_success'`
   * แต่ไม่มี `returnedAt` (6 จาก 12 ใบบน prod — สถานะมาจากรอบ poll ที่ไม่ผ่าน ShipmentEvent)
   * คือใบที่ *ถึงแล้วแต่ไม่รู้ว่าเมื่อไร* จุดต้องสว่าง แค่ไม่มีวันเวลากำกับ
   */
  stage: number
  /** เวลาที่รู้จริง — `null` = ขนส่งไม่ได้แจ้ง (ห้ามเดามาเติม) */
  startedAt: Date | null
  arrivedAt: Date | null
  /**
   * โทนของจุดที่ 4 บนแถว 1 ที่แถวนี้งอกออกมา
   *   BOUNCE → `warning` (ส่งไม่สำเร็จ)
   *   RETURN → `success` (ส่งสำเร็จ — ของถึงมือลูกค้าจริง ระบบยืนยันไปแล้ว)
   *
   * 🛑 RETURN ต้องเป็นเขียว **ห้ามย้อนเป็นส้ม** — การเปลี่ยนจุดนั้นย้อนหลังคือการลบหลักฐาน
   * ว่าการส่งสำเร็จ ซึ่งกระทบ 00055 (สถิติผู้ซื้อ) ที่แยก "ไม่เคยได้รับ" กับ "ได้รับแล้วคืน"
   * เป็นคนละเรื่องโดยเจตนา
   */
  originTone: 'warning' | 'success'
  /**
   * `true` = แถวนี้เล่าเรื่องครบในตัวเอง **ไม่ต้องวาดแถวขาไป**
   *
   * เคสตีกลับ: ขาไปจบด้วยความล้มเหลว และจุดแรกของแถวนี้ (`ส่งไม่สำเร็จ`) พูดแทนมันหมดแล้ว
   * ⇒ วาดขาไปอีกแถวคือการเล่าเรื่องเดิมซ้ำด้วยที่ 4 จุด (user สั่ง 2026-08-27:
   * *"ถ้ามีการตีกลับ ไม่จำเป็นต้องแสดงขาไป เหลือ timeline ขากลับก็พอ"*)
   *
   * เคสคืนของ: ขาไป **สำเร็จจริง** และเป็นข้อเท็จจริงที่ต้องคงไว้ (00055 แยก "ไม่เคยได้รับ"
   * ออกจาก "ได้รับแล้วคืน") ⇒ ยังวาด 2 แถวเหมือนเดิม
   */
  standalone: boolean
}

// ─── คลังคำ ──────────────────────────────────────────────────────────────────

/** จุดปลายทางของทั้งสองกลไก — คำเดียวกันโดยตั้งใจ ปลายทางเดียวกันจริง */
const ARRIVED: Record<ReturnLegKind, Record<TimelineAudience, string>> = {
  /**
   * 🛑 ฝั่งผู้ซื้อ **ห้ามใช้คำว่า "คืน"** ในสายตีกลับ — ผู้ซื้อที่ไม่เคยได้รับของจะอ่านว่า
   * ตัวเองเป็นคนส่งคืน ซึ่งเป็นเส้นแบ่งที่ `lib/order-return.ts` บังคับไว้ทั้งไฟล์ว่าห้ามเบลอ
   * (คนละความรับผิด คนละค่าส่ง คนละการตีความสถิติผู้ซื้อใน 00055)
   */
  BOUNCE: { seller: 'กลับถึงร้าน', buyer: 'ของกลับถึงร้าน' },
  RETURN: { seller: 'กลับถึงร้าน', buyer: 'ร้านได้รับแล้ว' },
}

const DEPARTED: Record<ReturnLegKind, Record<TimelineAudience, string>> = {
  // "กำลังตีกลับ" ไม่ใช่ "ส่งไม่สำเร็จ" — คำหลังถูกใช้ที่จุดที่ 4 ของแถว 1 ไปแล้ว
  // คำเดียวกันสองจุดติดกันอ่านเหมือนระบบค้าง
  BOUNCE: { seller: 'กำลังตีกลับ', buyer: 'กำลังส่งกลับร้าน' },
  /**
   * 🛑 "แจ้งคืน" ไม่ใช่ "ส่งคืน" — จุดนี้สว่างตั้งแต่ `OrderReturn.status === 'REQUESTED'`
   * ซึ่งแปลว่าลูกค้าเพิ่ง **แจ้ง** ว่าจะคืน **ยังไม่ได้ส่งอะไรเลย** (ดู `returnStageOf`)
   * คำว่า "ส่งคืน" ตรงนั้นจึงผิดข้อเท็จจริง ไม่ใช่แค่กำกวม
   */
  RETURN: { seller: 'ลูกค้าแจ้งคืน', buyer: 'คุณแจ้งคืน' },
}

/**
 * 🛑 ต้องเป็น "กำลังจัดส่ง" คำเดียวกับแถว 1 — มันคือเหตุการณ์เดียวกันเป๊ะ (ของอยู่บนรถ)
 * แค่คนละทิศ · ใช้คนละคำบนกราฟิกชิ้นเดียวกันห่างกัน 2 บรรทัด = ผู้ใช้ต้องเดาว่ามันต่างกันตรงไหน
 */
/** ขั้นสุดท้ายก่อนถึงร้าน — "ขนส่งเอาของออกมาส่งคืนแล้ว" ไม่ใช่ "ยังวิ่งอยู่ระหว่างศูนย์" */
const DISPATCHED: Record<TimelineAudience, string> = {
  seller: 'กำลังนำส่งคืนร้าน',
  buyer: 'กำลังนำส่งคืนร้าน',
}

const IN_TRANSIT: Record<TimelineAudience, string> = { seller: 'กำลังจัดส่ง', buyer: 'กำลังจัดส่ง' }
const ACCEPTED: Record<TimelineAudience, string> = { seller: 'รับเข้าระบบ', buyer: 'รับเข้าระบบ' }

/**
 * ไอคอน — ชุด A (user เคาะจากม็อกอัพ 2026-08-25) ตรวจกับ `@iconify/json/tabler` แล้วมีจริงทุกตัว
 *
 * `truck-return` = รถที่มีลูกศรย้อน ⇒ สื่อ "กำลังวิ่งกลับ" ด้วยรูปเดียว ไม่ต้องพึ่งตำแหน่ง
 * `building-store` = ร้านค้า ⇒ **แยกจาก `circle-check` ของ "ส่งสำเร็จ" ด้วยรูปร่าง**
 *   ซึ่งจำเป็นเพราะสองจุดนี้ใช้สีเขียวเท่ากันเป๊ะโดยมติ user (WCAG 1.4.1 ห้ามใช้สีตัวเดียว)
 *   (`home-check` ถูกตัดออกเพราะมีเครื่องหมายถูกในตัว = เสี่ยงอ่านสลับกับ "ส่งสำเร็จ"
 *    ซึ่งเป็นบั๊กเดิมเป๊ะที่เรากำลังแก้)
 * `package-export` = กล่องมีลูกศรออก คู่กับ `package-import` ที่แถว 1 ใช้อยู่แล้ว
 */
const ICON = {
  bounceDepart: 'truck-return',
  returnDepart: 'package-export',
  accepted: 'package-import',
  inTransit: 'truck-return',
  arrived: 'building-store',
} as const

// ─── ตัวสร้าง ────────────────────────────────────────────────────────────────

export interface ReturnLegInput {
  audience: TimelineAudience
  /** สถานะขนส่งของพัสดุ **ขาไป** */
  carrierStatus?: string | null
  /** เวลาที่ประทับไว้บนแถวพัสดุขาไป — `null` ได้เสมอ แปลว่า "ไม่รู้" ไม่ใช่ "ไม่เกิด" */
  returnStartedAt?: Date | string | null
  returnedAt?: Date | string | null
  /**
   * เวลาที่ขนส่งเริ่มนำพัสดุมาส่งคืนที่ร้าน — **มีค่า = แถบได้จุดที่ 4**
   *
   * 🛑 `null` แปลว่า *ขนส่งเจ้านี้ไม่บอก* ไม่ใช่ *ยังไม่ถึงขั้นนั้น* (Flash ไม่ส่งเลยสักใบ)
   * ⇒ ต้อง **ไม่วาดจุดนี้** เมื่อไม่มีค่า ไม่ใช่วาดเป็นจุดเทาที่ไม่มีวันสว่าง
   */
  returnDispatchedAt?: Date | string | null
  /**
   * ใบคืนของ (00056) ที่ยังไม่ถูกยกเลิก — `null` = ไม่มี
   *
   * 🛑 หน้ารายการออเดอร์ **ยังไม่ส่งค่านี้มา** (ไม่ได้ join `OrderReturn` เข้า query ที่ร้อน
   * ที่สุดของระบบ เพราะบน prod ยังมี 0 แถว) ⇒ ตารางเห็นเฉพาะเคส BOUNCE
   * ช่องนี้มีไว้ให้เติมทีหลังโดยไม่ต้องแตะ UI เลย — ดูหนี้ที่บันทึกใน spec §6
   */
  orderReturn?: {
    status: string
    trackingSource: string
    carrierStatus?: string | null
    /** `createdAt` = ลูกค้าแจ้งคืน · `receivedAt` = ร้านกดรับของแล้ว (null = ยังไม่ถึง) */
    createdAt?: Date | string | null
    receivedAt?: Date | string | null
  } | null
}

const toDate = (v?: Date | string | null): Date | null => {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * describeReturnLeg — คืนแถวที่ 2 หรือ `null` ถ้าออเดอร์นี้ไม่มีขากลับ
 *
 * 🛑 คืน `null` = **ไม่วาดแถว 2 เลย** ไม่ใช่วาดรางเทา — ออเดอร์ปกติ (ซึ่งคือเกือบทั้งหมด)
 * ต้องเห็นแถบหน้าตาเดิมทุกประการ ไม่ต้องแบกภาพของเรื่องที่ไม่เคยเกิด
 *
 * 🛑 `issue`/`cannot_pickup` **ไม่ทำให้เกิดแถว 2** — `issue` ส่วนใหญ่จบด้วยส่งสำเร็จ
 * การขึ้นแถวขากลับตรงนั้นคือแถบที่ทำนายอนาคตผิด
 */
export function describeReturnLeg(input: ReturnLegInput): ReturnLeg | null {
  const a = input.audience

  // ── กลไกที่ 2: ลูกค้าคืนของ (00056) ────────────────────────────────────────
  // ตรวจก่อน BOUNCE เพราะถ้ามีใบคืนอยู่ แปลว่าของเคยถึงมือลูกค้าแล้วแน่นอน
  // (`canCreateReturn` บังคับไว้) ⇒ ไม่มีทางเป็นเคสตีกลับพร้อมกัน
  const ret = input.orderReturn
  if (ret && ret.status !== 'CANCELLED') {
    const dots: ReturnLegDot[] = [{ label: DEPARTED.RETURN[a], icon: ICON.returnDepart }]
    if (ret.trackingSource === RETURN_TRACKING_SOURCE.ISHIP) {
      dots.push({ label: ACCEPTED[a], icon: ICON.accepted })
    }
    if (ret.trackingSource !== RETURN_TRACKING_SOURCE.NONE) {
      dots.push({ label: IN_TRANSIT[a], icon: ICON.inTransit })
    }
    dots.push({ label: ARRIVED.RETURN[a], icon: ICON.arrived })

    return {
      kind: 'RETURN',
      dots,
      stage: returnStageOf(ret, dots.length),
      // เวลาของเคสคืนของมาจากใบคืน ไม่ใช่จากคอลัมน์บนพัสดุ (นั่นเป็นของเคสตีกลับ)
      startedAt: toDate(ret.createdAt),
      arrivedAt: toDate(ret.receivedAt),
      originTone: 'success',
      standalone: false,
    }
  }

  // ── กลไกที่ 1: ขนส่งตีกลับ ────────────────────────────────────────────────
  const stampCol = returnLegStampOf(input.carrierStatus)
  if (!stampCol) return null

  /**
   * จุดที่ 4 โผล่เฉพาะเมื่อขนส่งบอกจริง — **ไม่ใช่ 4 จุดตายตัว**
   *
   * iShip ส่งรหัสสถานะของขากลับมาแค่ 2 ตัว ขั้นนี้จึงมาจากข้อความอิสระที่มีแค่ SPX ส่ง
   * (prod: SPX 6 ใบมีครบ · Flash 7 ใบไม่มีเลย) ⇒ ถ้าวาดตายตัว ครึ่งหนึ่งของใบจะมีจุด
   * ที่ไม่มีวันสว่าง = โกหกว่า "ยังไปไม่ถึง" ทั้งที่ความจริงคือ "ขนส่งเจ้านี้ไม่บอก"
   */
  const dispatchedAt = toDate(input.returnDispatchedAt)
  const bounceDots: ReturnLegDot[] = [
    { label: FORWARD_OUTCOME.failed.label, icon: FORWARD_OUTCOME.failed.icon },
    { label: DEPARTED.BOUNCE[a], icon: ICON.bounceDepart },
    ...(dispatchedAt ? [{ label: DISPATCHED[a], icon: ICON.inTransit }] : []),
    { label: ARRIVED.BOUNCE[a], icon: ICON.arrived },
  ]

  /**
   * 🛑 **3 จุด ไม่ใช่ 4** — iShip ส่ง *รหัสสถานะ* ของขากลับมาแค่ 2 ตัว (`return` /
   * `return_success`) ยืนยันจาก event ทั้งหมดหลังพัสดุเริ่มตีกลับบน prod (45+6 ครั้ง
   * จาก 13 ใบ ไม่มีรหัสอื่นเลย) ⇒ จุดที่ 3 คือ "ส่งไม่สำเร็จ" ซึ่งเป็น *เหตุ* ที่ขากลับมีอยู่
   *
   * ขั้นย่อยที่ละเอียดกว่านี้ (`ถึงศูนย์คัดแยก` / `อยู่ระหว่างการขนส่ง`) **มีจริงแต่ซ่อนใน
   * `statusDesc` ซึ่งเป็นข้อความอิสระ และมีแค่ SPX ที่ส่งมา — Flash ไม่ส่งเลยสักตัว**
   * (prod: SPX 6 ใบมีครบ · Flash 6 ใบเป็น 0 ทุกช่อง) ⇒ ทำ 4 จุดตายตัว = ครึ่งหนึ่งของใบ
   * จะมี 2 จุดที่ไม่มีวันสว่าง ซึ่งผิดหลักเดียวกับที่ทำให้จำนวนจุดผันตามข้อมูลตั้งแต่แรก
   */
  return {
    kind: 'BOUNCE',
    dots: bounceDots,
    // จุดแรก ("ส่งไม่สำเร็จ") ถึงแล้วเสมอ — มันคือเหตุที่ทำให้แถวนี้มีอยู่
    stage:
      stampCol === 'returnedAt'
        ? bounceDots.length - 1
        : // ยังกลับไม่ถึง — อยู่จุด "กำลังนำส่งคืนร้าน" ถ้าขนส่งบอกแล้ว ไม่งั้นอยู่ "กำลังตีกลับ"
          dispatchedAt
          ? 2
          : 1,
    startedAt: toDate(input.returnStartedAt),
    arrivedAt: toDate(input.returnedAt),
    originTone: 'warning',
    standalone: true,
  }
}

/**
 * จุดที่ไปถึงของใบคืนของ — แปลง `OrderReturn.status` (+ สถานะขนส่งถ้ามี) เป็น index
 *
 * `RECEIVED` = ร้านกดรับของแล้ว = ปลายทางเสมอ ไม่ว่ามีกี่จุด
 * `SHIPPING` = ลูกค้าส่งออกแล้ว → จุดกลาง (ก่อนปลายทาง 1 จุด)
 * `REQUESTED` = เพิ่งเปิดใบ ยังไม่ได้ส่ง → จุดแรก
 */
function returnStageOf(
  ret: { status: string; carrierStatus?: string | null },
  dotCount: number,
): number {
  if (ret.status === 'RECEIVED') return dotCount - 1
  if (ret.status === 'SHIPPING') return Math.max(0, dotCount - 2)
  return 0
}

/**
 * ป้ายจุดที่ 4 ของ **แถว 1** เมื่อมีแถว 2 งอกออกมา
 *
 * 🛑 มีเฉพาะ 2 หน้า ไม่ใช่ 3 — "พัสดุมีปัญหา" (`issue`/`cannot_pickup`) **ไม่ได้อยู่ที่จุดนี้**
 * มันยังปักที่ตำแหน่งจริงของมันตาม `STAGE_OF` แล้วบอกด้วยจุดสีแดง + กล่องเตือนเหมือนเดิม
 *
 * เหตุผล: `cannot_pickup` มี `STAGE_OF = 0` (ขนส่งยังไม่เคยมารับของด้วยซ้ำ) การเอาไปแสดง
 * ที่จุดสุดท้ายจะอ้างว่าพัสดุเดินทางครบเส้นทางแล้ว ซึ่งไม่จริงเลย · ส่วน `issue` เป็น
 * non-terminal (อาจจบด้วยส่งสำเร็จ) การวางที่จุดผลลัพธ์อ่านว่า "จบแล้ว ผลคือมีปัญหา"
 */
/**
 * ป้าย/ไอคอนจุดผลลัพธ์ของแถว 1 — ย้ายไปเป็นของจริงที่ `./status` แล้ว (2026-08-25)
 *
 * 🛑 ตอนแรกประกาศไว้ที่นี่แต่ **ไม่มี production code เรียกเลย มีแต่เทส** ขณะที่คำจริง 2 คำ
 * ถูกพิมพ์ซ้ำอีก 2 ที่ (`SHIPMENT_STAGES[3].label` และสตริงดิบใน `describeProgress`)
 * ⇒ คำเดียวกันประกาศ 3 ที่ ไม่มีอะไรบังคับให้ตรงกัน วันที่ใครแก้ที่หนึ่ง อีกสองที่เงียบ (HR16)
 * (impeccable clarify จับได้ 2026-08-25)
 */
export { FORWARD_OUTCOME }

/**
 * railAriaLabel — ประโยคเดียวที่อธิบายทั้งแถบให้ screen reader
 *
 * 🛑 แถบ 2 แถวต้องเล่าให้ครบทั้ง "ขาไปจบยังไง" และ "ขากลับถึงไหน" ในประโยคเดียว —
 * คนที่ใช้ screen reader ไม่ได้เห็นว่ามันมีสองแถว เขาได้ยินแค่สิ่งที่เราเขียนตรงนี้
 *
 * ไม่ใช้เครื่องหมายพิเศษคั่น (`·` / `—`) เพราะ screen reader อ่านข้ามบ้างอ่านออกเสียงบ้าง
 * แล้วแต่ตัว/แล้วแต่ภาษา — เว้นวรรคธรรมดาให้ผลเหมือนกันทุกตัว
 */
export function railAriaLabel(forwardLabel: string, leg: ReturnLeg | null): string {
  if (!leg) return `สถานะพัสดุ ${forwardLabel}`
  const at = leg.dots[Math.min(leg.stage, leg.dots.length - 1)].label
  // standalone = ไม่มีแถวขาไปบนจอ ⇒ ห้ามพูดถึงมันในเสียงด้วย ไม่งั้นคนฟังจะหาไม่เจอ
  if (leg.standalone) return `สถานะพัสดุ ${at}`
  return `สถานะพัสดุ ขาไป ${forwardLabel} ขากลับ ${at}`
}

