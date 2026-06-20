import { NextRequest, NextResponse } from 'next/server'
import { normalizeSlug, isValidSlugFormat, isReservedSlug } from '@/lib/shop-slug'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  // ใช้ new URL(req.url) แทน req.nextUrl เพื่อให้ test ใน Vitest node env ทำงานได้
  // (NextRequest.nextUrl ไม่มีใน plain Request ที่ test ส่งมา)
  const slug = normalizeSlug(new URL(req.url).searchParams.get('slug') ?? '')
  if (!isValidSlugFormat(slug)) return NextResponse.json({ available: false, reason: 'invalid' })
  if (isReservedSlug(slug)) return NextResponse.json({ available: false, reason: 'reserved' })
  const existing = await prisma.shop.findUnique({ where: { slug }, select: { id: true } })
  if (existing) return NextResponse.json({ available: false, reason: 'taken' })
  return NextResponse.json({ available: true })
}
