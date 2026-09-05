// checks.ts — SSOT ของ "ข้อตรวจ" ทั้ง 18 ข้อของแผนการตรวจสอบร้าน (feature 00060)
//
// ทำไมอยู่ในโค้ดไม่ใช่ในตาราง: ชุดคีย์นี้เป็นค่าคงที่ที่แอปกำหนด ไม่ใช่ข้อมูลที่ผู้ใช้สร้าง
// (มิเรอร์ Shop.categories / Room.facilities ที่ทำแบบเดียวกันอยู่แล้ว) และที่สำคัญกว่านั้น —
// การประกาศเป็น `Record<InspectionCheckKey, ...>` ทำให้ `tsc` บังคับว่าต้องครบทุกคีย์
// ซึ่งเป็นด่านเดียวที่ใช้ได้จริง: grep จับ object key ไม่ได้ (docs/conventions/enum-value-removal.md)
//
// 🛑 เพิ่มคีย์ใหม่ต้องเพิ่มใน type union ก่อน แล้วให้ tsc ไล่จุดที่ยังไม่รองรับ
//    ห้ามเปลี่ยนเป็น Record<string, ...> เด็ดขาด — นั่นคือการถอดด่านเดียวที่มีออก

/** ขั้นการตรวจสอบ 1-4 — ห้ามเรียกว่า "ระดับ/level/tier" (สงวนให้ Trust Tier ดู CONTEXT.md) */
export type InspectionStep = 1 | 2 | 3 | 4

/**
 * ขอบเขตของผลตรวจ (มติ D-16)
 * - `SHOP` = ข้อที่ตรวจตัวร้าน/เจ้าของ ใช้ร่วมกับที่พักทุกหลังของร้านนั้น
 * - `ROOM` = ข้อที่ตรวจตัวสถานที่ ผูกกับที่พักรายหลัง ห้ามให้ผลของหลังหนึ่งครอบไปถึงหลังอื่น
 *
 * 🛑 ขอบเขตตัดสินจาก "สิ่งที่ข้อนั้นตรวจ" ไม่ใช่จาก "ขั้นที่ข้อนั้นอยู่" — โฉนดของบ้านหลัง A
 *    ไม่ได้พิสูจน์อะไรเกี่ยวกับหลัง B ทั้งที่อยู่ขั้นเดียวกัน
 */
export type InspectionScope = 'SHOP' | 'ROOM'

/**
 * วิธีตรวจ — 🛑 ไม่ใช่แค่ป้ายบอกชนิดงาน แต่เป็น **คีย์จัดกลุ่มรอบตรวจ**
 * (`createDueRounds()` จัดกลุ่มตาม `(shopId, roomId, method)`) ⇒ ติดป้ายผิดให้ข้อหนึ่ง
 * จะลากข้ออื่นในกลุ่มไปตรวจถี่ตามอายุที่สั้นที่สุดของกลุ่ม = งานผู้ตรวจเพิ่มโดยไม่ได้ข้อมูลเพิ่ม
 */
export type InspectionMethod = 'AUTO' | 'DOCUMENT' | 'VIDEO_CALL' | 'ONSITE'

export type InspectionCheckKey =
  // ขั้น 1 — ระบบตรวจเองทุกวัน
  | 'scam_db'
  | 'phone_identity'
  | 'account_age'
  | 'chat_response_speed'
  | 'complaints'
  | 'duplicate_listing'
  // ขั้น 2 — ตรวจเอกสาร
  | 'id_card_selfie'
  | 'bank_account_name'
  | 'lease_right_document'
  | 'hotel_license'
  // ขั้น 3 — ตรวจเห็นของจริง
  | 'video_tour'
  | 'operating_evidence'
  // ขั้น 4 — ตรวจถึงที่
  | 'location_exists'
  | 'photos_match'
  | 'room_count'
  | 'facilities'
  | 'accessibility'
  | 'deep_photo_album'

export type InspectionCheckDef = {
  step: InspectionStep
  scope: InspectionScope
  method: InspectionMethod
  /** อายุผลตรวจฐาน (วัน) — ค่าจริงต้องอ่านผ่าน ttlDays() เพราะขึ้นกับขั้นของแผนด้วย */
  ttlDays: number
  /** หลักฐานของข้อนี้แสดงต่อสาธารณะได้ไหม — false = แสดงได้แค่ผลว่าตรวจแล้วผ่านเมื่อไร */
  publicEvidence: boolean
  /**
   * ร้านส่งเอกสารของข้อนี้เองได้ไหม (API §3.2 ข)
   * 🛑 ข้อที่ `false` = หลักฐานต้องมาจากผู้ตรวจเท่านั้น — ปล่อยให้ร้านแนบเองแปลว่าร้านผลิต
   *    หลักฐานที่ตัวเองถูกตรวจ (เช่นอัลบั้มภาพที่ "ผู้ตรวจของ Deep ถ่ายเอง") ซึ่งทำลาย
   *    มูลค่าทั้งหมดของข้อนั้น
   */
  sellerSuppliable: boolean
  labelTh: string
}

export const INSPECTION_CHECKS: Record<InspectionCheckKey, InspectionCheckDef> = {
  // ── ขั้น 1: ตรวจต่อเนื่องอัตโนมัติ (6 ข้อ ตาม AC-INS-03-1) ────────────────
  scam_db: { step: 1, scope: 'SHOP', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'ไม่พบในฐานข้อมูลมิจฉาชีพ' },
  phone_identity: { step: 1, scope: 'SHOP', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'ยืนยันเบอร์โทรและตัวตนขั้นต้น' },
  account_age: { step: 1, scope: 'SHOP', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'อายุบัญชีร้าน' },
  chat_response_speed: { step: 1, scope: 'SHOP', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'ความเร็วในการตอบแชท' },
  complaints: { step: 1, scope: 'SHOP', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'ข้อร้องเรียน' },
  // 🛑 ข้อเดียวในขั้น 1 ที่ scope เป็น ROOM — cron ต้องวนต่อ Room ไม่ใช่ต่อร้าน
  //    และร้านที่ยังไม่มีแถว Room เลยจะไม่มีแถวผลของข้อนี้ (= "ยังไม่มีข้อมูล" ไปตลอด ซึ่งถูกแล้ว)
  duplicate_listing: { step: 1, scope: 'ROOM', method: 'AUTO', ttlDays: 1, publicEvidence: false, sellerSuppliable: false, labelTh: 'ไม่พบการประกาศที่พักนี้ซ้ำโดยบัญชีอื่น' },

  // ── ขั้น 2: ตรวจเอกสาร ────────────────────────────────────────────────
  id_card_selfie: { step: 2, scope: 'SHOP', method: 'DOCUMENT', ttlDays: 365, publicEvidence: false, sellerSuppliable: true, labelTh: 'ยืนยันตัวตนด้วยบัตรประชาชนคู่เซลฟี่' },
  bank_account_name: { step: 2, scope: 'SHOP', method: 'DOCUMENT', ttlDays: 365, publicEvidence: false, sellerSuppliable: true, labelTh: 'ชื่อบัญชีรับเงินตรงกับเจ้าของร้าน' },
  // เอกสารสิทธิ์/ใบอนุญาตผูกกับ "ทรัพย์สินแต่ละหลัง" ไม่ใช่กับร้าน — จึงเป็น ROOM แม้อยู่ขั้น 2
  lease_right_document: { step: 2, scope: 'ROOM', method: 'DOCUMENT', ttlDays: 365, publicEvidence: false, sellerSuppliable: true, labelTh: 'เอกสารสิทธิ์ในการปล่อยเช่า' },
  hotel_license: { step: 2, scope: 'ROOM', method: 'DOCUMENT', ttlDays: 365, publicEvidence: false, sellerSuppliable: true, labelTh: 'ใบอนุญาตประกอบกิจการโรงแรม' },

  // ── ขั้น 3: ตรวจเห็นของจริง ───────────────────────────────────────────
  video_tour: { step: 3, scope: 'ROOM', method: 'VIDEO_CALL', ttlDays: 180, publicEvidence: true, sellerSuppliable: false, labelTh: 'วิดีโอคอลนำชมที่พักแบบสด' },
  // 🛑 method ต้องเป็น DOCUMENT ห้ามเป็น VIDEO_CALL ทั้งที่อยู่ขั้นเดียวกับ video_tour
  //    เพราะ method เป็นคีย์จัดกลุ่มรอบ ⇒ ถ้าจับกลุ่มกับ video_tour รอบนั้นจะใช้ dueAt ที่สั้นที่สุด
  //    ในกลุ่ม (90 วันของข้อนี้) = บังคับนัดวิดีโอคอลทุก 90 วันทั้งที่ video_tour ต้องการแค่ 180
  //    หลักฐานการเปิดให้บริการจริงเป็นเอกสารย้อนหลังที่ร้านส่งเองได้ ไม่ต้องนัดเวลากับใคร
  operating_evidence: { step: 3, scope: 'ROOM', method: 'DOCUMENT', ttlDays: 90, publicEvidence: false, sellerSuppliable: true, labelTh: 'หลักฐานการเปิดให้บริการจริง' },

  // ── ขั้น 4: ตรวจถึงที่ ────────────────────────────────────────────────
  location_exists: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'ที่พักมีอยู่จริงตามพิกัด' },
  photos_match: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'ภาพประกาศตรงกับสภาพจริง' },
  room_count: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'จำนวนและประเภทห้องตรงตามประกาศ' },
  facilities: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'สิ่งอำนวยความสะดวกที่ประกาศไว้มีอยู่จริง' },
  accessibility: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'ที่พักเข้าถึงได้จริงตามที่ประกาศ' },
  deep_photo_album: { step: 4, scope: 'ROOM', method: 'ONSITE', ttlDays: 365, publicEvidence: true, sellerSuppliable: false, labelTh: 'อัลบั้มภาพที่ผู้ตรวจของ Deep ถ่ายเอง' },
}

/** ชื่อขั้น — บอก "สิ่งที่ตรวจ" ไม่ใช่ตัวเลขอันดับ (มติ D-4) */
export const INSPECTION_STEP_LABEL_TH: Record<InspectionStep, string> = {
  1: 'ตรวจต่อเนื่องอัตโนมัติ',
  2: 'ตรวจเอกสาร',
  3: 'ตรวจเห็นของจริง',
  4: 'ตรวจถึงที่',
}

export const INSPECTION_CHECK_KEYS = Object.keys(INSPECTION_CHECKS) as InspectionCheckKey[]

/** allow-list guard สำหรับ input ที่มาจากภายนอก — fail-closed ไม่เดา */
export function isInspectionCheckKey(value: unknown): value is InspectionCheckKey {
  return typeof value === 'string' && Object.hasOwn(INSPECTION_CHECKS, value)
}

export function checkScope(checkKey: InspectionCheckKey): InspectionScope {
  return INSPECTION_CHECKS[checkKey].scope
}

/** ข้อตรวจทั้งหมดที่ร้านซึ่งอยู่ขั้น `planStep` ต้องถูกตรวจ (ขั้นบนกินขั้นล่างเสมอ — AC-INS-07-1) */
export function checksForStep(planStep: InspectionStep): InspectionCheckKey[] {
  return INSPECTION_CHECK_KEYS.filter((k) => INSPECTION_CHECKS[k].step <= planStep)
}

/**
 * อายุผลตรวจจริง (วัน) — 🛑 ไม่ใช่ค่าคงที่ต่อคีย์ แต่ขึ้นกับขั้นของแผนด้วย
 *
 * AC-INS-06-1 บังคับว่าร้านขั้น 4 ต้องทวนข้อตรวจของขั้น 3 ซ้ำทุก 3 เดือน ขณะที่ร้านขั้น 3
 * ทวน video_tour ทุก 6 เดือน — ค่าเดียวกันต่างกันตามขั้น จึงต้องเป็นฟังก์ชัน ไม่ใช่ค่าคงที่
 */
const STEP4_RECHECK_KEYS = new Set<InspectionCheckKey>(['video_tour', 'operating_evidence'])
const STEP4_RECHECK_TTL_DAYS = 90

export function ttlDays(checkKey: InspectionCheckKey, planStep: InspectionStep): number {
  if (planStep === 4 && STEP4_RECHECK_KEYS.has(checkKey)) return STEP4_RECHECK_TTL_DAYS
  return INSPECTION_CHECKS[checkKey].ttlDays
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * วันหมดอายุของแถวผล
 *
 * 🛑 ฐานคือ `lastConfirmedAt` ไม่ใช่ `checkedAt` — ข้อตรวจอัตโนมัติที่ยืนยันผลเดิมทุกวัน
 *    ต้องต่ออายุได้โดยไม่สร้างแถวใหม่ ถ้านับจาก checkedAt ผลของขั้น 1 จะหมดอายุในวันถัดไป
 *    เสมอทั้งที่ระบบยืนยันซ้ำอยู่ทุกวัน
 *
 * 🛑 ใช้ตัวนี้ทุกที่ที่ต้องคำนวณ expiresAt รวมถึงตอน "recompute เมื่อร้านเปลี่ยนขั้น"
 *    ห้ามเขียนสูตรซ้ำที่อื่น (ทั้งขาขึ้นขั้นและขาลงขั้นใช้ฟังก์ชันเดียวกัน)
 */
export function computeExpiresAt(
  lastConfirmedAt: Date,
  checkKey: InspectionCheckKey,
  planStep: InspectionStep,
): Date {
  return new Date(lastConfirmedAt.getTime() + ttlDays(checkKey, planStep) * MS_PER_DAY)
}

/**
 * ข้อที่ร้านแนบเอกสารเองได้ (5 ข้อ) — SSOT ของด่าน `CHECK_NOT_SELLER_SUPPLIED`
 * 🛑 อ่านจาก `INSPECTION_CHECKS` ไม่ใช่พิมพ์รายชื่อซ้ำ — รายชื่อที่พิมพ์ซ้ำจะค้างอยู่ที่เดิม
 *    ตอนมีคนเพิ่ม/ถอดข้อในอนาคต แล้วไม่มี `tsc` ตัวไหนเห็น
 */
export function isSellerSuppliable(checkKey: InspectionCheckKey): boolean {
  return INSPECTION_CHECKS[checkKey].sellerSuppliable
}
