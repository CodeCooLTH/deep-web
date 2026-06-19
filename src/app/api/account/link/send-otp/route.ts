/**
 * POST /api/account/link/send-otp — ส่ง OTP ไปยัง user.phone เพื่อยืนยันการ Disconnect
 *
 * reuse otp.ts functions ทั้งหมด (storeOtp, sendOtpViaSms, consumeOtpRequestQuota)
 * rate-limit เดิมทำงาน → ไม่เพิ่ม attack surface ใหม่ (AC-08b)
 *
 * ไม่มี OTP endpoint ใหม่ที่ข้าม rate-limit — reuse path เดิมทุกส่วน
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { storeOtp, sendOtpViaSms, consumeOtpRequestQuota, isTestAccount } from '@/lib/otp'

export async function POST(req: NextRequest) {
  // auth required (AC-08b)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ดึง phone จาก DB (ไม่เชื่อ session — session อาจ stale)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true },
  })
  if (!user?.phone) {
    // ไม่มีเบอร์โทร → ไม่มีทางส่ง OTP ยืนยัน disconnect
    return NextResponse.json({ error: 'บัญชีนี้ยังไม่มีเบอร์โทร กรุณาผูกเบอร์ก่อน' }, { status: 400 })
  }

  const phone = user.phone

  // rate-limit เดิม (3 ครั้ง / 10 นาที ต่อ contact) — reuse consumeOtpRequestQuota
  if (!consumeOtpRequestQuota(phone)) {
    return NextResponse.json({ error: 'ส่ง OTP บ่อยเกินไป กรุณารอสักครู่' }, { status: 429 })
  }

  const otp = await storeOtp(phone)

  // TEST_ACCOUNTS → ไม่ส่ง SMS จริง (isTestAccount check เหมือน route อื่น)
  if (!isTestAccount(phone)) {
    try {
      await sendOtpViaSms(phone, otp)
    } catch (err) {
      console.error('[link/send-otp] SMS send failed:', err)
      return NextResponse.json({ error: 'ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
