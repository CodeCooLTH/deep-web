// feature 00084 T9 — ตัวตัดสิน "UI แสดงอะไร" ของการ์ดตั้งค่า Flash (Design-Spec §3)
// แยกจาก component เพื่อให้เทสจับ boolean ได้ตรง ๆ (convention ui-boolean-needs-a-testable-home)
// pure ล้วน: ห้าม import prisma/service ตัวจริง (type-only เท่านั้น)

import type { FlashConnectionView, FlashSettings, FlashWebhookReport } from '@/services/flash.service'
import { MOBILE_PHONE_RE, MOBILE_RULE_TEXT } from '@/lib/phone'

type Conn = Pick<FlashConnectionView, 'connected' | 'status' | 'senderComplete' | 'webhook'>
export type WebhookKindRow = FlashWebhookReport['kinds'][number]

// ─── ป้ายสถานะ + ปุ่มของแถว (§3.4) ───────────────────────────────────────────

export type RowBadge = { tone: 'secondary' | 'success' | 'warning'; icon: string; label: string }

export function flashStatusBadge(c: Pick<Conn, 'connected' | 'status'>): RowBadge {
  if (!c.connected) return { tone: 'secondary', icon: 'plug-off', label: 'ยังไม่ได้เชื่อมต่อ' }
  if (c.status === 'TOKEN_INVALID') {
    return { tone: 'warning', icon: 'alert-triangle', label: 'ต้องตรวจรหัสร้านค้า/Key' }
  }
  return { tone: 'success', icon: 'circle-check', label: 'เชื่อมต่อแล้ว' }
}

/** ใช้งานได้จริง = เชื่อมอยู่และ Flash ไม่ได้ปฏิเสธ key */
export const isFlashActive = (c: Pick<Conn, 'connected' | 'status'>) =>
  c.connected && c.status !== 'TOKEN_INVALID'

export type RowAction = 'connect' | 'pickup' | 'settings' | 'rekey'
export interface RowButton {
  action: RowAction
  label: string
  /** tint = พื้นสี · outline = ขอบ · warning = tint เหลือง — ไม่มีปุ่มทึบในแถว (§3.3) */
  style: 'tint' | 'outline' | 'warning'
}

export function flashRowButtons(c: Pick<Conn, 'connected' | 'status'>, isOwner: boolean): RowButton[] {
  if (!c.connected) return isOwner ? [{ action: 'connect', label: 'เชื่อมต่อ', style: 'tint' }] : []
  if (c.status === 'TOKEN_INVALID') {
    return [
      ...(isOwner ? [{ action: 'rekey', label: 'วางคีย์ใหม่', style: 'warning' } as const] : []),
      { action: 'settings', label: isOwner ? 'ตั้งค่า' : 'ดูค่าที่ตั้งไว้', style: 'outline' },
    ]
  }
  return [
    { action: 'pickup', label: 'เรียกรถ', style: 'outline' },
    { action: 'settings', label: isOwner ? 'ตั้งค่า' : 'ดูค่าที่ตั้งไว้', style: isOwner ? 'tint' : 'outline' },
  ]
}

export interface RowWarning {
  key: 'sender' | 'webhook'
  text: string
  /** ปุ่ม/ลิงก์ที่พาไปแก้ — null = ผู้ใช้นี้แก้เองไม่ได้ (ไม่ใช่เจ้าของ) */
  actionLabel: string | null
}

/** บรรทัดเตือนใต้แถว — แสดงเมื่อมีเรื่องค้างเท่านั้น และเฉพาะตอน ACTIVE (TOKEN_INVALID มีข้อความของตัวเอง) */
export function flashRowWarnings(c: Conn, isOwner: boolean): RowWarning[] {
  if (!isFlashActive(c)) return []
  const out: RowWarning[] = []
  if (!c.senderComplete) {
    out.push({
      key: 'sender',
      text: isOwner
        ? 'ยังไม่ได้ตั้งที่อยู่ผู้ส่ง ตั้งก่อนจึงจะเปิดพัสดุได้'
        : 'ยังไม่ได้ตั้งที่อยู่ผู้ส่ง แจ้งเจ้าของร้านให้ตั้งก่อนจึงจะเปิดพัสดุได้',
      actionLabel: isOwner ? 'ตั้งที่อยู่ผู้ส่ง' : null,
    })
  }
  if (c.webhook.status === 'EXTERNAL') {
    out.push({
      key: 'webhook',
      text: 'Flash ส่งสถานะไปที่ระบบอื่นอยู่ ใช้เช็คอัตโนมัติทุก 15 นาที',
      actionLabel: 'ดูรายละเอียด',
    })
  } else if (c.webhook.status !== 'REGISTERED') {
    out.push({
      key: 'webhook',
      text: 'ยังไม่ได้ตั้งรับแจ้งสถานะ ระบบจะเช็คเองทุก 15 นาที',
      actionLabel: 'ดูรายละเอียด',
    })
  }
  return out
}

// ─── บล็อกรับแจ้งสถานะ (§3.6) ───────────────────────────────────────────────

export const KIND_LABEL: Record<WebhookKindRow['kind'], string> = {
  status: 'สถานะพัสดุ',
  routes: 'เส้นทาง',
  weight: 'น้ำหนัก',
  price: 'ราคา',
  courier: 'ข้อมูลคนขับ',
}

export type KindBadge = { tone: 'info' | 'warning' | 'secondary'; text: string }

export function flashKindBadge(k: WebhookKindRow): KindBadge {
  if (k.action === 'FAILED') return { tone: 'warning', text: 'ตั้งไม่สำเร็จ' }
  if (k.state === 'UNKNOWN') return { tone: 'secondary', text: 'อ่านค่าที่ตั้งไว้ไม่ได้ · ไม่ได้เปลี่ยน' }
  if (k.state === 'EXTERNAL' && k.action === 'SKIPPED') {
    return { tone: 'warning', text: `ส่งไปที่ ${k.host ?? 'ระบบอื่น'} อยู่แล้ว · ไม่ได้เปลี่ยน` }
  }
  return { tone: 'info', text: 'ส่งมาที่ Deep' }
}

/** ชนิดที่เจ้าของเลือกทับได้ — EXTERNAL ที่ถูกข้ามเท่านั้น (UNKNOWN ทับไม่ได้) */
export const overridableKinds = (kinds: WebhookKindRow[]) =>
  kinds.filter((k) => k.state === 'EXTERNAL' && k.action === 'SKIPPED')

export type WebhookBlockState =
  | { kind: 'deep' } //                 ทุกชนิดเป็นของ Deep — บรรทัดเดียว ไม่มีอะไรให้ตัดสินใจ
  | { kind: 'unset' } //                NOT_SET/FAILED — warning + (เจ้าของ) ลองตั้งใหม่
  | { kind: 'loading' } //              EXTERNAL แต่ยังไม่มีรายชนิด (เจ้าของ) — โครงเทา
  | { kind: 'summary-external' } //     EXTERNAL แต่ผู้ดูไม่ใช่เจ้าของ — เห็นสถานะ ไม่เห็นรายชนิด (route เป็น OWNER-only)
  | { kind: 'external'; rows: WebhookKindRow[]; overridable: WebhookKindRow[] }

export function webhookBlockState(
  status: FlashConnectionView['webhook']['status'],
  kinds: WebhookKindRow[] | null,
  isOwner: boolean,
): WebhookBlockState {
  if (status === 'REGISTERED') return { kind: 'deep' }
  if (status !== 'EXTERNAL') return { kind: 'unset' }
  if (!isOwner) return { kind: 'summary-external' }
  if (!kinds) return { kind: 'loading' }
  const overridable = overridableKinds(kinds)
  return { kind: 'external', rows: kinds, overridable }
}

/** เชื่อมสำเร็จแล้วต้องค้างโมดัลไว้ที่ส่วนรับแจ้งสถานะไหม (§3.5) */
export const connectNeedsWebhookStep = (r: Pick<FlashWebhookReport, 'status'>) =>
  r.status === 'EXTERNAL' || r.status === 'FAILED'

// ─── ฟอร์มวางคีย์ (§3.5) ────────────────────────────────────────────────────

export type ConnectForm = { mchId: string; secretKey: string }

/** สะท้อน FlashConnectSchema ฝั่ง backend — คืนข้อความไทยตัวแรกที่ผิด (null = ผ่าน) */
export function validateConnectForm(f: ConnectForm): string | null {
  const mch = f.mchId.trim()
  const key = f.secretKey.trim()
  if (!mch || !key) return 'วางรหัสร้านค้า (mchId) และ Secret Key ให้ครบทั้งสองช่อง'
  if (!/^[A-Za-z0-9_-]{2,32}$/.test(mch)) {
    return 'รหัสร้านค้าเป็นตัวอักษรหรือตัวเลข 2–32 ตัว ตรวจว่าพิมพ์ตรงกับที่ Flash ให้มา'
  }
  if (/\s/.test(key)) return 'Secret Key ต้องไม่มีช่องว่าง คัดลอกใหม่'
  if (key.length < 16) return 'Secret Key สั้นเกินไป คัดลอกมาให้ครบทั้งชุด'
  return null
}

/** ข้อความผิดพลาดตอนเชื่อม — คีย์ด้วย error.code ของ API (§4.2) ไม่ใช่ข้อความดิบจาก server */
export function connectErrorText(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'MERCHANT_NOT_FOUND':
      return 'Flash ไม่พบรหัสร้านค้านี้ ตรวจว่า mchId ตรงกับที่ Flash ให้มา แล้วลองใหม่'
    case 'SIGN_INVALID':
      return 'Secret Key ไม่ตรงกับรหัสร้านค้านี้ คัดลอก Secret Key จาก Flash มาวางใหม่ทั้งชุด (ระวังช่องว่างหน้า-หลัง)'
    case 'MERCHANT_IN_USE':
      return 'รหัสร้านค้านี้ถูกใช้เชื่อมต่ออยู่แล้ว ตรวจว่าพิมพ์ถูกต้อง หรือติดต่อทีมงาน Deep'
    case 'UPSTREAM_ERROR':
    case 'UPSTREAM_TIMEOUT':
      return 'ติดต่อ Flash ไม่ได้ตอนนี้ จึงยังไม่ได้บันทึก ลองอีกครั้งในอีกสักครู่'
    default:
      return fallback || 'เชื่อมต่อไม่สำเร็จ ลองอีกครั้งในอีกสักครู่'
  }
}

// ─── ตั้งค่า 3 แท็บ (§3.8) ──────────────────────────────────────────────────

export type SettingsTab = 'sender' | 'parcel' | 'mode'
export type SettingsErrors = Partial<Record<keyof FlashSettings, string>>

export const SETTINGS_FIELD_TAB: Partial<Record<keyof FlashSettings, SettingsTab>> = {
  senderPhone: 'sender',
  senderPostcode: 'sender',
  defaultWeight: 'parcel',
  defaultWidth: 'parcel',
  defaultLength: 'parcel',
  defaultHeight: 'parcel',
  optProductValue: 'parcel',
}

/**
 * กฎเดียวกับ validateSettings ของ iShip ยกเว้นไม่มีกฎ box/courier — ทุกช่องไม่บังคับ
 * (ความครบบังคับตอนเปิดพัสดุ) แต่ถ้ากรอกแล้วต้องถูกรูปแบบ
 */
export function validateFlashSettings(s: FlashSettings): SettingsErrors {
  const e: SettingsErrors = {}
  const num = (v: number | null) => (v === null || Number.isNaN(v) ? null : v)
  if (s.senderPhone && !MOBILE_PHONE_RE.test(s.senderPhone.trim())) {
    e.senderPhone = `เบอร์ผู้ส่งไม่ถูกต้อง — ${MOBILE_RULE_TEXT}`
  }
  if (s.senderPostcode && !/^[0-9]{5}$/.test(s.senderPostcode.trim())) {
    e.senderPostcode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก'
  }
  const w = num(s.defaultWeight)
  if (w !== null && (w < 0.01 || w > 100)) e.defaultWeight = 'น้ำหนักต้องอยู่ระหว่าง 0.01–100 กก.'
  for (const k of ['defaultWidth', 'defaultLength', 'defaultHeight'] as const) {
    const v = num(s[k])
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 300)) e[k] = 'ต้องเป็นจำนวนเต็ม 1–300 ซม.'
  }
  if (s.optIsInsured && !num(s.optProductValue)) {
    e.optProductValue = 'เปิดประกันสินค้าแล้วต้องระบุมูลค่าสินค้าที่ต้องการเอาประกัน'
  }
  return e
}

const SENDER_KEYS = [
  'senderName', 'senderPhone', 'senderAddress', 'senderSubdistrict',
  'senderDistrict', 'senderProvince', 'senderPostcode',
] as const
export type SenderFields = Pick<FlashSettings, (typeof SENDER_KEYS)[number]>

export const hasAnySender = (s: SenderFields) => SENDER_KEYS.some((k) => !!s[k])
export const hasSenderLocality = (s: SenderFields) =>
  !!(s.senderSubdistrict || s.senderDistrict || s.senderProvince || s.senderPostcode)

/** ปุ่ม "ใช้ที่อยู่ที่ตั้งไว้กับ iShip" — วาดเฉพาะเมื่อมีที่อยู่ iShip ครบให้ก๊อป (เป็นเจ้าของ + มีแหล่ง) */
export const canCopyIshipSender = (isOwner: boolean, iship: SenderFields | null) =>
  isOwner && iship !== null && SENDER_KEYS.every((k) => !!iship[k])

/** ก๊อปทับต้องถามก่อนเมื่อช่องผู้ส่งมีค่าอยู่แล้ว */
export const copyNeedsConfirm = (current: SenderFields) => hasAnySender(current)

export const pickSender = (s: SenderFields): SenderFields => ({
  senderName: s.senderName, senderPhone: s.senderPhone, senderAddress: s.senderAddress,
  senderSubdistrict: s.senderSubdistrict, senderDistrict: s.senderDistrict,
  senderProvince: s.senderProvince, senderPostcode: s.senderPostcode,
})

// ─── เรียกรถ (§3.9) ─────────────────────────────────────────────────────────

export type PickupResult = {
  id: string
  status: string
  ticketPickupId: string | null
  staffName: string | null
  staffPhone: string | null
  timeoutAtText: string | null
  ticketMessage: string | null
  isDryRun: boolean
}

/** ผลคำขอรถที่ควรโชว์ตอนเปิดโมดัล — คำขอที่ล้ม (FAILED) ไม่ใช่ "คำขอที่ส่งแล้ว" */
export const pickupResultToShow = <T extends { status: string }>(p: T | null): T | null =>
  p && p.status !== 'FAILED' && p.status !== 'CANCELLED' && p.status !== 'CLOSED' ? p : null

export type PickupModalState = 'incomplete' | 'form' | 'result'

export function pickupModalState(senderComplete: boolean, result: PickupResult | null): PickupModalState {
  if (result) return 'result'
  return senderComplete ? 'form' : 'incomplete'
}

export function pickupErrorText(code: string | undefined, fallback?: string): string {
  switch (code) {
    case 'PICKUP_PENDING':
      return 'มีคำขอรถค้างอยู่ที่ที่อยู่นี้แล้ว รอให้ Flash มารับ หรือติดต่อ Flash เพื่อยกเลิกคำขอเดิม แล้วเรียกใหม่'
    case 'PICKUP_NOT_CANCELLABLE':
      return 'ยกเลิกคำขอรถนี้ไม่ได้แล้ว ติดต่อ Flash โดยตรง'
    case 'UPSTREAM_ERROR':
    case 'UPSTREAM_TIMEOUT':
      return 'ติดต่อ Flash ไม่ได้ตอนนี้ ยังไม่ได้ส่งคำขอ ลองอีกครั้งในอีกสักครู่'
    default:
      return fallback || 'ส่งคำขอไม่สำเร็จ ลองอีกครั้งในอีกสักครู่'
  }
}

export const isValidParcelCount = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100
