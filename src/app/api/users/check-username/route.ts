import { NextRequest, NextResponse } from 'next/server'
import { isPublicNameTaken } from '@/lib/public-name'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/
const RESERVED = new Set(['admin', 'root', 'api', 'seller', 'safepay', 'www'])

export async function GET(request: NextRequest) {
  const u = request.nextUrl.searchParams.get('u') ?? ''

  if (!USERNAME_RE.test(u)) {
    return NextResponse.json({ available: false, reason: 'invalid' })
  }
  if (RESERVED.has(u.toLowerCase())) {
    return NextResponse.json({ available: false, reason: 'reserved' })
  }

  // เช็คข้ามตาราง (User.username + Shop.slug) — ดู lib/public-name.ts ว่าทำไม
  if (await isPublicNameTaken(u.toLowerCase())) {
    return NextResponse.json({ available: false, reason: 'taken' })
  }

  return NextResponse.json({ available: true })
}
