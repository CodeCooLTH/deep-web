/**
 * helper อ่านซอร์สหน้าคำสั่งซื้อผู้ซื้อ (`o/[token]/`) สำหรับเทสสแกนซอร์ส — feature 00068 TD-006
 *
 * ทำไมต้องมี: เทสเคย hardcode path ของ `OrderDetailMobile.tsx` ⇒ พอแตกไฟล์เป็นการ์ดย่อย
 * ด่านจะเขียวแต่ว่าง. ตอนนี้รายชื่อไฟล์อยู่ที่เดียว และ `buyer-order-sources.test.ts`
 * บังคับว่าไฟล์ .tsx ใหม่ในโฟลเดอร์ต้องถูกจัดเข้า allow-list หรือ excluded (พร้อมเหตุผล)
 *
 * 🛑 ชื่อไฟล์นี้ห้ามลงท้าย .test.ts — import จากไฟล์เทสจะรันเทสนั้นซ้ำ
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const BUYER_ORDER_DIR = join(process.cwd(), 'src/app/(marketing)/o/[token]')

/** ไฟล์ที่ประกอบหน้าคำสั่งซื้อฝั่งผู้ซื้อที่ล็อกอินแล้ว (shell + การ์ดย่อยที่ shell import) */
export const BUYER_ORDER_FILES: readonly string[] = [
  'OrderDetailMobile.tsx',
  'AppointmentCard.tsx',
  'ConfirmStamp.tsx',
  'CoverActions.tsx',
  'CoverPill.tsx',
  'PaymentSummaryCard.tsx',
  'PayoutAccountCard.tsx',
  'PickupInfoCard.tsx',
  'ReviewForm.tsx',
  'ReviewSheet.tsx',
  'SectionTitle.tsx',
  'ShopCover.tsx',
  'ShopEvidence.tsx',
  'TrustPill.tsx',
]

/** .tsx ในโฟลเดอร์เดียวกันที่ตั้งใจไม่รวม — ต้องมีเหตุผลทุกไฟล์ */
export const BUYER_ORDER_EXCLUDED: Readonly<Record<string, string>> = {
  'AuthPingLink.tsx': 'ใช้เฉพาะ GuestOrderView (ยังไม่ล็อกอิน)',
  'BookingGuestView.tsx': 'จอ guest ของการจอง ไม่ใช่หน้าคำสั่งซื้อของผู้ที่ล็อกอิน',
  'BrandHomeLink.tsx': 'ลิงก์โลโก้ใน BookingGuestView/ShopCover — ไม่มีตรรกะของหน้าคำสั่งซื้อ',
  'ClaimOtpPrompt.tsx': 'จอกั้น (OTP) ก่อนเข้าหน้า — มีเทส order-access-screens-parity ดูแลอยู่',
  'GuestOrderView.tsx': 'จอฝั่ง guest — เทสที่เกี่ยวอ่านไฟล์นี้ตรง ๆ เพื่อเทียบ parity',
  'OrderAccessBlock.tsx': 'จอกั้นสิทธิ์ — order-access-screens-parity ดูแลอยู่',
  'page.tsx': 'server entry (data + เลือกจอ) ไม่ใช่ UI ของหน้า — เทสที่เกี่ยวอ่านตรงด้วย path',
  'ParcelTimeline.tsx': 'ตอนนี้ใช้เฉพาะ guest — rail-single-source ชี้ path ตรง · ย้ายเข้า allow-list เมื่อ shell เรียก (B1-U3)',
  'PhoneVerifyPrompt.tsx': 'จอกั้น (ยืนยันเบอร์) ไม่ใช่เนื้อหน้า',
  'PublicOrderClient.tsx': 'wrapper ที่ mount shell เท่านั้น ไม่มี UI ของหน้า',
  'SmsAutoEnter.tsx': 'ตัวเข้าลิงก์ SMS อัตโนมัติ (ไม่มี UI) — sms-link-one-time อ่านตรง',
}

/** stripComments เดิมจาก follow-up-components-copy.test.ts — ย้ายมาไว้ที่นี่ พฤติกรรมเดิมทุกอย่าง */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
}

/** อ่านไฟล์เดียว (ต้องอยู่ใน allow-list) — ใช้กับเทสที่ดูตำแหน่งสัมพัทธ์ (indexOf ก่อน/หลัง) */
export function readBuyerOrderFile(name: string, opts: { stripComments?: boolean } = {}): string {
  if (!BUYER_ORDER_FILES.includes(name)) {
    throw new Error(`${name} ไม่อยู่ใน BUYER_ORDER_FILES — เพิ่มใน buyer-order-sources.ts หรืออ่านด้วย path ตรงถ้าตั้งใจ`)
  }
  const raw = readFileSync(join(BUYER_ORDER_DIR, name), 'utf8')
  return opts.stripComments ? stripComments(raw) : raw
}

/** ต่อซอร์สทุกไฟล์ใน allow-list — ใช้กับเทสสแกน "ทั้งหน้า" (ห้ามใช้กับเทสที่ดูตำแหน่งสัมพัทธ์) */
export function readBuyerOrderSource(opts: { stripComments?: boolean } = {}): string {
  return BUYER_ORDER_FILES.map((f) => readBuyerOrderFile(f, opts)).join('\n')
}
