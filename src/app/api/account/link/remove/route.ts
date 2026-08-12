/**
 * POST /api/account/link/remove — Disconnect provider จาก account (FR-LO-16)
 *
 * flow: Disconnect กด → Sweet Alert confirm → input OTP → POST /link/remove
 *
 * guards:
 *   AC-08: OTP verify ผ่าน user.phone (verifyOtp เดิม)
 *   AC-09: last-method guard — ต้องเหลือ login method ≥1 หลังลบ
 *          method นับ = จำนวน AuthAccount + (passwordHash != null ? 1 : 0)
 *   AC-10: ownership scope — ลบเฉพาะ AuthAccount ที่ userId == session.userId
 *
 * ไม่ลบ method อื่น ไม่ merge ไม่สลับ userId
 */
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyOtp } from '@/lib/otp'

// provider enum map เหมือน oauthMap ใน auth.ts (ใช้ string literal ตรง ๆ ไม่ import เพื่อไม่ผูกกับ internal)
const PROVIDER_ENUM_MAP: Record<string, string> = {
  line: 'LINE',
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  apple: 'APPLE',
}

const Body = v.object({
  provider: v.pipe(
    v.string(),
    v.custom(
      (val) => Object.keys(PROVIDER_ENUM_MAP).includes(val as string),
      'provider ไม่ถูกต้อง',
    ),
  ),
  otp: v.pipe(v.string(), v.length(6)),
})

export async function POST(req: NextRequest) {
  // auth required (AC-10)
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  const { provider, otp } = parsed.output

  // ดึง user เพื่อ verify OTP + นับ login method
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phone: true,
      passwordHash: true,
      authAccounts: { select: { id: true, provider: true } },
    },
  })
  if (!user) {
    return NextResponse.json({ error: 'ไม่พบบัญชี' }, { status: 404 })
  }
  if (!user.phone) {
    // ไม่มีเบอร์ → ไม่มีทาง verify OTP disconnect
    return NextResponse.json({ error: 'บัญชีนี้ยังไม่มีเบอร์โทร ไม่สามารถยืนยันการยกเลิกการเชื่อมต่อได้' }, { status: 400 })
  }

  // AC-08: verify OTP ด้วย phone (single-use, rate-limited ผ่าน verifyOtp เดิม)
  const otpValid = await verifyOtp(user.phone, otp)
  if (!otpValid) {
    return NextResponse.json({ error: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' }, { status: 400 })
  }

  const providerEnum = PROVIDER_ENUM_MAP[provider]

  // AC-09: last-method guard — นับ method ที่เหลือหลังลบ provider นี้
  // method = AuthAccount แต่ละตัว + password (ถ้ามี passwordHash)
  const accountsAfterRemoval = user.authAccounts.filter((a) => a.provider !== providerEnum)
  const methodsAfterRemoval = accountsAfterRemoval.length + (user.passwordHash ? 1 : 0)
  if (methodsAfterRemoval < 1) {
    return NextResponse.json(
      { error: 'ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อย 1 ทาง ไม่สามารถยกเลิกการเชื่อมต่อได้' },
      { status: 400 },
    )
  }

  // AC-10: ownership scope — ลบเฉพาะ AuthAccount ของ userId ปัจจุบัน + provider ที่ระบุ
  // deleteMany แทน delete เพราะไม่มี id แน่ชัดจาก client (ปลอดภัยกว่า + atomic)
  const deleted = await prisma.authAccount.deleteMany({
    where: {
      userId,
      provider: providerEnum,
    },
  })

  if (deleted.count === 0) {
    // ไม่มี AuthAccount ที่ตรงกัน → ไม่ได้ผูกไว้
    return NextResponse.json({ error: 'ไม่พบการเชื่อมต่อกับ provider นี้' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
