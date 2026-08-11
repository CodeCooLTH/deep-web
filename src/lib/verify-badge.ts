/**
 * verify-badge — ป้าย "ยืนยันถึงระดับไหน" ของร้าน (SSOT ของทั้งคำและโทนสี)
 *
 * 🛑 ทำไมต้องเป็นไฟล์กลาง: ป้ายนี้โผล่บนหน้าจอที่ผู้ซื้อคนเดียวกันเห็น **ห่างกันไม่กี่วินาที**
 * — หน้าออเดอร์สาธารณะ `/o/{token}` แล้วกดเข้าสู่ระบบไปเจอ `OrderLinkShell` ต่อทันที
 * ถ้าคำหรือสีไม่ตรงกัน ผู้ใช้จะสังเกตได้ทันทีและมันบั่นทอนสิ่งเดียวที่ป้ายนี้มีไว้ทำ (HR16)
 *
 * 🛑 L1 ไม่ใช่สีเขียว — Verified-Means-Green สงวนเขียวไว้กับสิ่งที่ปลอมยาก
 * L1 = ยืนยันเบอร์ด้วย OTP ซึ่งซื้อซิมเติมเงินที่ร้านสะดวกซื้อก็ทำได้ ให้เขียวเท่ากับ
 * ร้านที่ส่งเอกสารให้แอดมินตรวจ (L2) หรือจดทะเบียนธุรกิจ (L3) คือการทำให้สัญญาณเฟ้อ
 * — ระดับ 0 ไม่มีป้ายเลย ไม่ใช่ป้ายที่เขียนว่า "ยังไม่ยืนยัน" (ไม่ประจานร้านใหม่)
 */

export type VerifyBadgeTone = 'neutral' | 'green' | 'gold'

export type VerifyBadge = {
  label: string
  tone: VerifyBadgeTone
  /** ชื่อ icon ของ @iconify/react (tabler) */
  icon: string
}

/**
 * สีพื้น/สีตัวอักษรต่อโทน — อยู่ที่นี่เพราะสองจอที่ใช้ป้ายนี้เขียนคนละระบบสไตล์
 * (จอหนึ่งเป็น MUI sx อีกจอเป็น Tailwind class) ถ้าปล่อยให้แต่ละที่แปลโทนเป็นสีเอง
 * มันจะเลื่อนออกจากกันทันทีที่มีคนแก้ข้างเดียว
 *
 * 🛑 ตัวอักษรใช้เฉด "ink" เสมอ ห้ามใช้สี main บนพื้นจาง — วัดได้ 1.8–3.5:1 ซึ่งตก AA
 * ทุกคู่ ค่าที่ใช้คือเฉดเดิมแค่เข้มขึ้น ไม่เปลี่ยนฮิว (contrast-fix-keeps-hue.md)
 */
export const VERIFY_BADGE_PALETTE: Record<VerifyBadgeTone, { bg: string; fg: string }> = {
  green: { bg: 'rgba(40,199,111,0.15)', fg: '#18804A' },
  gold: { bg: 'rgba(255,159,67,0.15)', fg: '#874C00' },
  neutral: { bg: 'rgba(47,43,61,0.08)', fg: 'rgba(47,43,61,0.75)' },
}

export function resolveVerifyBadge(maxVerifyLevel: number): VerifyBadge | null {
  if (maxVerifyLevel >= 3) {
    return { label: 'จดทะเบียนธุรกิจแล้ว', tone: 'gold', icon: 'tabler-building-store' }
  }
  if (maxVerifyLevel === 2) {
    return { label: 'ยืนยันเอกสารแล้ว', tone: 'green', icon: 'tabler-file-certificate' }
  }
  if (maxVerifyLevel === 1) {
    return { label: 'ยืนยันเบอร์แล้ว', tone: 'neutral', icon: 'tabler-phone-check' }
  }

  return null
}
