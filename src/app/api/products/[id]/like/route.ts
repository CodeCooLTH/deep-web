import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { toggleProductLike } from '@/services/product-like.service'

/**
 * POST /api/products/[id]/like — กดถูกใจ / ยกเลิก (toggle)
 * CR: docs/20 - Features/00035 - Shop Page Builder/EXTENSIONS-2026-08-11-product-likes.md
 *
 * 🛑 **ไม่ต้องล็อกอิน** (D-1) — ผู้ซื้อส่วนใหญ่มาจากลิงก์ที่ร้านส่งให้และยังไม่มีบัญชี
 * ถ้าบังคับล็อกอิน ปุ่มนี้จะกดไม่ได้สำหรับคนกลุ่มใหญ่ที่สุดที่เห็นมัน
 *
 * ตัวตนมาจากคุกกี้ `deep_did` ที่ตั้งเองที่นี่ถ้ายังไม่มี — httpOnly กัน JS ฝั่ง client แก้ค่า
 * เพื่อกดซ้ำง่าย ๆ (กันได้แค่ชั้นเดียว ล้างคุกกี้ก็กดใหม่ได้ ซึ่งยอมรับได้เพราะยอดนี้ไม่นับ
 * เข้า Trust Score — D-4)
 */
export const dynamic = 'force-dynamic'

const DEVICE_COOKIE = 'deep_did'
const ONE_YEAR_SEC = 60 * 60 * 24 * 365

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const jar = await cookies()

  let deviceKey = jar.get(DEVICE_COOKIE)?.value
  const isNew = !deviceKey
  if (!deviceKey) deviceKey = crypto.randomUUID()

  const result = await toggleProductLike(id, deviceKey)
  if (!result) {
    // สินค้าไม่มีอยู่ หรือปิดขายแล้ว (BR-LIKE-05)
    return NextResponse.json({ error: 'ไม่พบสินค้านี้' }, { status: 404 })
  }

  const res = NextResponse.json(result)
  if (isNew) {
    res.cookies.set(DEVICE_COOKIE, deviceKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONE_YEAR_SEC,
    })
  }
  return res
}
