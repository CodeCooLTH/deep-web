// feature 00084 T10a — ตัวตัดสิน "UI แสดงอะไร" ของส่วนการจัดส่งในหน้าคำสั่งซื้อ (Design-Spec §4)
// pure ล้วน (ไม่แตะ DB/เครือข่าย/React) เพื่อให้เทสจับ boolean ได้ตรง ๆ
// (convention ui-boolean-needs-a-testable-home)

import { isCodManualConfirmNotice } from './provider'
import { sortTracesNewestFirst } from '@/lib/iship/traces'

// ─── ป้าย COD ถาวร (§4.5) ────────────────────────────────────────────────────

/** ข้อความตรงตัวตาม BRD — ห้ามแก้ถ้อยคำ */
export const FLASH_COD_NOTICE = 'Flash ไม่แจ้งการโอนเงิน COD — ตรวจยอดกับ Flash แล้วกดยืนยันรับเงินเอง'

/** null = ไม่ต้องแสดง · แสดงทุกสถานะของใบ Flash ที่เป็น COD (รวมส่งถึงแล้ว) */
export function codNoticeText(provider: string | null | undefined, codAmount: number | null | undefined) {
  return isCodManualConfirmNotice(provider, codAmount) ? FLASH_COD_NOTICE : null
}

// ─── ชั้นเลือกผู้ให้บริการใน ShipmentEntryModal (§4.2) ───────────────────────

export type EntryMethod = 'MANUAL' | 'ISHIP' | 'ISHIP_LINK' | 'FLASH' | 'FLASH_LINK'
export type EntryProvider = 'MANUAL' | 'ISHIP' | 'FLASH'
/** manual-only = ไม่เชื่อมเจ้าไหนเลย · iship/flash = เจ้าเดียว (segmented 3 ช่องชุดเดียว) · both = สองชั้น */
export type EntryMode = 'manual-only' | 'iship' | 'flash' | 'both'

export function entryMode(ishipConnected: boolean, flashOffered: boolean): EntryMode {
  if (ishipConnected && flashOffered) return 'both'
  if (flashOffered) return 'flash'
  if (ishipConnected) return 'iship'
  return 'manual-only'
}

/** Flash ถูกเสนอให้เลือกเปิดพัสดุเมื่อเชื่อมอยู่ (รวม key ถูกปฏิเสธ — แผงจะบอกให้วางคีย์ใหม่ ไม่ซ่อนเงียบ) */
export function flashOffered(flashState: string | null | undefined): boolean {
  return flashState === 'READY' || flashState === 'TOKEN_INVALID'
}

export interface EntrySegment {
  value: EntryMethod
  label: string
  icon: string
}

/** segmented 3 ช่องของร้านเจ้าเดียว — iShip คงข้อความเดิมทุกตัวอักษร */
export function singleTierSegments(mode: 'iship' | 'flash'): EntrySegment[] {
  return mode === 'iship'
    ? [
        { value: 'MANUAL', label: 'ส่งเอง', icon: 'edit' },
        { value: 'ISHIP', label: 'สร้างพัสดุ iShip', icon: 'package-export' },
        { value: 'ISHIP_LINK', label: 'เลือกจาก iShip', icon: 'link' },
      ]
    : [
        { value: 'MANUAL', label: 'ส่งเอง', icon: 'edit' },
        { value: 'FLASH', label: 'สร้างพัสดุ Flash', icon: 'package-export' },
        { value: 'FLASH_LINK', label: 'ผูกเลขพัสดุ Flash', icon: 'link' },
      ]
}

export interface ProviderChoice {
  value: EntryProvider
  label: string
  /** คำรองใต้ป้าย — ทำให้ Flash สองเส้นทางแยกออกจากกัน */
  sub: string
  icon: string
}

/** ชั้น 1 ของร้านสองเจ้า — ป้ายช่อง Flash ต้องเป็น "Flash (บัญชีของร้านเอง)" เต็ม */
export const PROVIDER_CHOICES: ProviderChoice[] = [
  { value: 'MANUAL', label: 'ส่งเอง', sub: 'กรอกเลขพัสดุเอง', icon: 'edit' },
  { value: 'ISHIP', label: 'iShip', sub: 'รวมขนส่ง รวม Flash ผ่าน iShip', icon: 'package-export' },
  { value: 'FLASH', label: 'Flash (บัญชีของร้านเอง)', sub: 'ใช้ราคาสัญญา บิลกับ Flash โดยตรง', icon: 'truck-delivery' },
]

export const providerOf = (m: EntryMethod | null): EntryProvider | null =>
  m === null ? null : m === 'MANUAL' ? 'MANUAL' : m.startsWith('FLASH') ? 'FLASH' : 'ISHIP'

export const isLinkMethod = (m: EntryMethod | null): boolean => m === 'ISHIP_LINK' || m === 'FLASH_LINK'

export function methodFor(provider: EntryProvider, link: boolean): EntryMethod {
  if (provider === 'MANUAL') return 'MANUAL'
  return provider === 'ISHIP' ? (link ? 'ISHIP_LINK' : 'ISHIP') : link ? 'FLASH_LINK' : 'FLASH'
}

type ShipmentLike = { provider?: string | null; status: string; isDryRun?: boolean | null }

/**
 * live = มีพัสดุใช้งานอยู่ (CREATED จริง) → ข้ามตัวเลือก เข้าหน้าสถานะ
 * review = Flash NEEDS_REVIEW → ต้องจัดการก่อน ห้ามเปิดทางเลือกอื่นแซง (กันเสียเงินซ้ำ)
 * failed = ใบล้มเหลว → ยังเลือกวิธีอื่นได้
 */
export type ShipmentLock =
  | { kind: 'none' }
  | { kind: 'live'; provider: 'ISHIP' | 'FLASH' }
  | { kind: 'review' }
  | { kind: 'failed'; provider: 'ISHIP' | 'FLASH' }

export function shipmentLock(s: ShipmentLike | null | undefined): ShipmentLock {
  if (!s) return { kind: 'none' }
  const provider = s.provider === 'FLASH' ? 'FLASH' : 'ISHIP'
  if (s.status === 'NEEDS_REVIEW') return { kind: 'review' }
  if (s.status === 'CREATED' && !s.isDryRun) return { kind: 'live', provider }
  if (s.status === 'FAILED') return { kind: 'failed', provider }
  return { kind: 'none' }
}

/**
 * วิธีเริ่มต้นตอนเปิดโมดัล — ร้านสองเจ้าที่ยังไม่มีพัสดุ = null (DD-5: ไม่เลือกผู้ให้บริการแทนร้าน)
 * iShip ใบล้มเหลวคง MANUAL ตามพฤติกรรมเดิม (zero change); Flash ใบล้มเหลวเข้า FLASH เพื่อให้เห็นปุ่มลองใหม่
 */
export function initialMethod(mode: EntryMode, lock: ShipmentLock): EntryMethod | null {
  if (lock.kind === 'live') return lock.provider
  if (lock.kind === 'review') return 'FLASH'
  if (lock.kind === 'failed' && lock.provider === 'FLASH') return 'FLASH'
  return mode === 'both' ? null : 'MANUAL'
}

/** แถบเลือกวิธีแสดงไหม — iShip เจ้าเดียว: เหมือนเดิม (ซ่อนเมื่อมีพัสดุ live) */
export function showEntrySegmented(mode: EntryMode, lock: ShipmentLock): boolean {
  return mode !== 'manual-only' && lock.kind !== 'live' && lock.kind !== 'review'
}

// ─── ใบล้มเหลวของ Flash (§4.6) ───────────────────────────────────────────────

export type FlashFailedKind = 'retry' | 'fix-sender' | 'fix-receiver' | 'cod' | 'key' | 'fix-data'
export type FlashSolidAction = 'retry' | 'edit-sender' | 'edit-receiver' | 'edit-parcel' | 'rekey' | 'none'

export interface FlashFailedView {
  kind: FlashFailedKind
  message: string
  /** ปุ่มทึบมีได้ใบเดียวต่อจอ */
  solid: FlashSolidAction
  /** มีปุ่ม "ลองใหม่" แบบ ghost (ถ้า solid = retry จะเป็นปุ่มทึบแทน) */
  ghostRetry: boolean
  /** เสนอ "ส่งเองแทน" — มีเฉพาะผู้เรียกที่มีทางพาไปส่งเอง (แชท) */
  offerSelfShip: boolean
  /** บรรทัดอธิบายใต้ปุ่ม */
  note: string | null
  /** ข้อความเพิ่มสำหรับผู้ที่ไม่ใช่เจ้าของ (กรณี key) */
  nonOwnerHint: string | null
}

const NOTE_RETRY = 'กดซ้ำได้ ระบบใช้เลขอ้างอิงเดิมเสมอ ไม่เปิดพัสดุซ้อน'
const NOTE_FIX = 'กดลองใหม่ตอนนี้จะได้ผลเดิม จนกว่าจะแก้ตามที่แจ้ง'

/** จัดหมวดตาม lastErrorCode (ชื่อรหัสของเรา ไม่ใช่รหัสดิบ 10xx) — ไม่รู้จัก = retry ตามพฤติกรรมของ iShip */
export function flashFailedView(
  code: string | null | undefined,
  isOwner: boolean,
  lastErrorMessage?: string | null,
): FlashFailedView {
  switch (code) {
    case 'SENDER_ADDRESS_INVALID':
    case 'SENDER_OUT_OF_AREA':
      return {
        kind: 'fix-sender',
        message: 'Flash ไม่รับที่อยู่ผู้ส่ง ตรวจตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ในตั้งค่า',
        solid: 'edit-sender',
        ghostRetry: true,
        offerSelfShip: false,
        note: NOTE_FIX,
        nonOwnerHint: null,
      }
    case 'RECEIVER_ADDRESS_INVALID':
    case 'POSTCODE_INVALID':
      return {
        kind: 'fix-receiver',
        message: 'Flash ไม่รับที่อยู่ผู้รับ ตรวจตำบล อำเภอ จังหวัด และรหัสไปรษณีย์',
        solid: 'edit-receiver',
        ghostRetry: true,
        offerSelfShip: false,
        note: NOTE_FIX,
        nonOwnerHint: null,
      }
    case 'COD_NOT_ENABLED':
      // BR-FLASH-27: ห้ามมีปุ่ม "เปิดแบบไม่เก็บเงิน" — ไม่มีปุ่มทึบ
      return {
        kind: 'cod',
        message: 'บัญชี Flash ของร้านยังไม่ได้เปิดบริการเก็บเงินปลายทาง ติดต่อ Flash',
        solid: 'none',
        ghostRetry: true,
        offerSelfShip: true,
        note: NOTE_FIX,
        nonOwnerHint: null,
      }
    case 'MERCHANT_NOT_FOUND':
    case 'SIGN_INVALID':
      return {
        kind: 'key',
        message: 'Flash ปฏิเสธรหัสร้านค้าหรือ Secret Key',
        solid: isOwner ? 'rekey' : 'none',
        ghostRetry: false,
        offerSelfShip: false,
        note: null,
        nonOwnerHint: isOwner ? null : 'แจ้งเจ้าของร้านให้วางคีย์ใหม่',
      }
    case 'INVALID_REQUEST':
      return {
        kind: 'fix-data',
        message: lastErrorMessage || 'ข้อมูลพัสดุไม่ถูกต้อง ตรวจข้อมูลแล้วลองใหม่',
        solid: 'edit-parcel',
        ghostRetry: true,
        offerSelfShip: false,
        note: NOTE_FIX,
        nonOwnerHint: null,
      }
    default:
      return {
        kind: 'retry',
        message: 'สร้างพัสดุไม่สำเร็จ ติดต่อ Flash ไม่ได้ตอนนี้',
        solid: 'retry',
        ghostRetry: false,
        offerSelfShip: true,
        note: NOTE_RETRY,
        nonOwnerHint: null,
      }
  }
}

// ─── ผูกเลขพัสดุ / NEEDS_REVIEW (§4.7) ───────────────────────────────────────

export const PNO_RE = /^[A-Za-z0-9]{6,32}$/

export function pnoFormatError(pno: string): string | null {
  return PNO_RE.test(pno.trim()) ? null : 'เลขพัสดุเป็นตัวอักษรหรือตัวเลข 6–32 ตัว ไม่มีช่องว่าง'
}

export type PnoStep = 'enter' | 'checking' | 'ready'

/** ปุ่มยืนยันผูกต้องไม่ปรากฏจนกว่าตรวจเลข "ตัวที่พิมพ์อยู่ตอนนี้" ผ่าน — แก้เลขหลังตรวจ = กลับไปขั้นแรก */
export function pnoStep(s: { pno: string; previewedPno: string | null; checking: boolean }): PnoStep {
  if (s.checking) return 'checking'
  const p = s.pno.trim()
  return s.previewedPno !== null && p !== '' && p === s.previewedPno ? 'ready' : 'enter'
}

const LINK_ERRORS: Record<string, string> = {
  NOT_MERCHANT_PARCEL: 'เลขนี้ไม่ใช่ของบัญชี Flash ของร้านนี้ ตรวจว่าคัดลอกถูกใบ',
  PARCEL_NOT_FOUND: 'Flash ไม่พบเลขพัสดุนี้ ตรวจตัวอักษรอีกครั้ง',
  PNO_TAKEN: 'เลขนี้ผูกกับคำสั่งซื้ออื่นใน Deep แล้ว ตรวจเลขอีกครั้ง',
  INVALID_INPUT: 'เลขพัสดุเป็นตัวอักษรหรือตัวเลข 6–32 ตัว ไม่มีช่องว่าง',
  UPSTREAM_TIMEOUT: 'ติดต่อ Flash ไม่ได้ตอนนี้ ลองตรวจเลขอีกครั้ง',
  UPSTREAM_ERROR: 'ติดต่อ Flash ไม่ได้ตอนนี้ ลองตรวจเลขอีกครั้ง',
}

export function linkErrorText(status: number, code: string | null | undefined, serverMessage?: string | null): string {
  if (code && LINK_ERRORS[code]) return LINK_ERRORS[code]
  if (status >= 500) return LINK_ERRORS.UPSTREAM_TIMEOUT
  return serverMessage || 'ผูกเลขพัสดุไม่สำเร็จ กรุณาลองใหม่'
}

// ─── ยกเลิกพัสดุ (§4.5) ──────────────────────────────────────────────────────

/** taken = Flash รับของแล้ว (1015 → 409 NOT_CANCELLABLE) ต้องเป็น Swal รับทราบ ไม่ใช่ toast */
export function cancelOutcome(ok: boolean, status: number, code: string | null | undefined): 'cancelled' | 'taken' | 'error' {
  if (ok) return 'cancelled'
  return status === 409 && code === 'NOT_CANCELLABLE' ? 'taken' : 'error'
}

// ─── ฟอร์มสร้าง (§4.3) ───────────────────────────────────────────────────────

export const FLASH_MAX_ITEMS = 10
export const FLASH_MAX_QTY = 999

/** >10 รายการ = บอกว่าจะรวมเป็น "สินค้าอื่น ๆ" · จำนวนต่อรายการ >999 = บล็อกปุ่มสร้าง */
export function flashItemNotices(items: { name: string; qty: number }[]) {
  return {
    overflow: items.length > FLASH_MAX_ITEMS,
    blockedBy: items.find((it) => it.qty > FLASH_MAX_QTY)?.name ?? null,
  }
}

export type FlashPriceState = 'incomplete' | 'loading' | 'quote' | 'error'

export function flashPriceState(s: { ready: boolean; loading: boolean; hasQuote: boolean; hasError: boolean }): FlashPriceState {
  if (!s.ready) return 'incomplete'
  if (s.loading && !s.hasQuote) return 'loading'
  if (s.hasQuote) return 'quote'
  return s.hasError ? 'error' : 'loading'
}

export function flashPriceBadge(table: string | null | undefined): { label: string; tone: 'info' | 'secondary' } {
  return table === 'CONTRACT' ? { label: 'ราคาสัญญา', tone: 'info' } : { label: 'ราคามาตรฐาน', tone: 'secondary' }
}

export function flashPriceSubline(table: string | null | undefined): string {
  return table === 'CONTRACT'
    ? 'ค่าจริงขึ้นกับการชั่งและออกบิลของ Flash'
    : 'ใช้ราคามาตรฐาน Flash ยังไม่ตอบราคาสัญญาของบัญชีนี้ · ค่าจริงขึ้นกับการชั่งและออกบิลของ Flash'
}

// ─── สาเหตุที่ค้าง (§17 ข้อ 5) ───────────────────────────────────────────────

/** ไม่มีฟิลด์ markerReason — ใช้ statusDesc ของเหตุการณ์ล่าสุด เมื่อพัสดุอยู่สถานะ issue เท่านั้น */
export function markerReasonLine(
  carrierStatus: string | null | undefined,
  traces: { occurredAt: string; statusDesc: string | null }[] | null | undefined,
): string | null {
  if (carrierStatus !== 'issue' || !traces?.length) return null
  const desc = sortTracesNewestFirst(traces)[0]?.statusDesc?.trim()
  return desc ? `Flash บันทึกว่า: ${desc}` : null
}
