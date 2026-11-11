// app-badge — เลขบนไอคอนแอปผู้ขาย (deep-seller-app) ให้แอปดึงไปตั้งเอง (2026-11-11)
//
// แจ้งเตือนแชทใหม่แนบเลขไปเองอยู่แล้ว (seller-push.service) แต่เลขจะ "ลด" ได้ก็ต่อเมื่อแอปถามใหม่
// ตอนเปิดแอป/อ่านแชท — ตัวนี้คืนเลขชุดเดียวกันจากฟังก์ชันเดียวกัน (app-badge.service) ไม่งั้นเลขที่มา
// กับแจ้งเตือนกับเลขที่แอปตั้งเองจะสลับไปมา
//
// auth ด้วย cookie ของเว็บ seller (แอปยิงด้วยคุกกี้ชุดเดียวกับแชท Native) · GET อ่านอย่างเดียว
// ล้ม = 503 (ไม่ใช่ count 0) ⇒ แอปคงเลขเดิมไว้ ไม่ล้างเลขทิ้งทั้งที่ยังมีค้าง
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sessionUserId } from '@/lib/session-user'
import { appBadgeCount } from '@/services/app-badge.service'

export const dynamic = 'force-dynamic'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' }

export async function GET() {
  const userId = sessionUserId(await getServerSession(authOptions))
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
  try {
    return NextResponse.json({ count: await appBadgeCount(userId) }, { headers: NO_STORE_HEADERS })
  } catch (e) {
    console.error('[app-badge] GET failed', e instanceof Error ? e.name : 'unknown')
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE_HEADERS })
  }
}
