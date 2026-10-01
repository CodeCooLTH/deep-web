import 'server-only'
import { NextResponse } from 'next/server'
import { shouldHidePayments } from '@/lib/app-shell-server'

/**
 * ด่านฝั่งเซิร์ฟเวอร์ของ "การจ่ายเงินให้ Deep จากในแอป" (Android support 2026-10-01)
 *
 * ที่มา: การซ่อนปุ่ม/เมนู (`shouldHidePayments`) เป็นแค่ UX — API ที่ตัดเงินทุกตัว (เติมเงิน ·
 * สมัคร/อัปเกรด/ต่ออายุแพ็กเกจ · Deep Stock · แผนตรวจ · ซื้อสล็อตปักหมุด) **ไม่เคยเช็กเลย**
 * ว่าคำขอมาจากในแอป ⇒ ใครยิง API ตรงจาก WebView ก็ซื้อของดิจิทัลด้วยเครดิตที่เติมนอกสโตร์ได้
 * ซึ่งคือสิ่งที่ App Store 3.1.1 และ Google Play Payments policy ห้าม
 *
 * 🛑 ห้ามใส่ด่านนี้ที่ `/api/iap/apple/verify` — นั่นคือทางซื้อที่ถูกกฎของ iOS
 * 🛑 ข้อความต้องไม่บอกทางไปจ่ายที่อื่น (anti-steering) — บอกแค่ว่าทำในแอปไม่ได้
 *
 * @returns response 403 ถ้าต้องปฏิเสธ · `null` = ผ่าน (เว็บปกติ)
 */
export async function rejectInAppPurchase(): Promise<NextResponse | null> {
  if (!(await shouldHidePayments())) return null
  return NextResponse.json(
    { error: 'IN_APP_PURCHASE_NOT_ALLOWED', message: 'รายการนี้ทำในแอปไม่ได้' },
    { status: 403 },
  )
}
