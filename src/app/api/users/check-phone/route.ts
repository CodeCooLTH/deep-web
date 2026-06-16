// GET ?phone=08xxxxxxxx → { available } — ใช้ตอน signup seller เพื่อกันส่ง OTP ไปเบอร์ที่มีบัญชีแล้ว
// rate-limit ผ่าน guardApi (proxy.ts ครอบ /api/* ยกเว้น /api/auth/*) — กัน phone enumeration brute (MVP tradeoff)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone') ?? ''
  if (!/^0[0-9]{9}$/.test(phone)) {
    return NextResponse.json({ available: false, reason: 'invalid' }, { status: 400 })
  }
  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } })
  // ไม่ echo phone กลับ (PII) — client มีค่าอยู่แล้ว
  return NextResponse.json({ available: existing === null })
}
