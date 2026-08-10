/**
 * GET /api/account/check-username?username= — เช็คว่าชื่อผู้ใช้ว่างไหม (feature 00026 B)
 *
 * ใช้บอกสถานะสด ๆ ระหว่างพิมพ์ในหน้า /account — การเซฟจริงยังผ่าน PATCH /api/users/me ซึ่ง
 * เช็คซ้ำอีกรอบ + จับ P2002 เอง (endpoint นี้เป็นแค่ UX ไม่ใช่ guard — ห้ามพึ่งเป็นด่านความถูกต้อง)
 *
 * ต้อง login: ผลลัพธ์บอกได้ว่า username ไหนมีคนใช้อยู่ ซึ่งเป็นการ enumerate บัญชี — ไม่เปิดสาธารณะ
 * (ต่างจาก check-slug ที่ slug ร้านเป็นข้อมูลสาธารณะอยู่แล้ว เปิดหน้าร้านก็เห็น)
 *
 * Base: src/app/api/shops/check-slug/route.ts (response shape { available, reason } เดียวกัน)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isPublicNameTaken } from '@/lib/public-name'

// รูปแบบเดียวกับ UpdateProfileSchema และ /api/account/shop-info (SSOT ของรูปแบบ username)
const USERNAME_RE = /^[a-z0-9_]{3,30}$/

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // new URL(req.url) แทน req.nextUrl — ให้ test ใน Vitest node env ทำงานได้ (ตาม check-slug)
  const username = (new URL(req.url).searchParams.get('username') ?? '').trim().toLowerCase()
  if (!USERNAME_RE.test(username)) return NextResponse.json({ available: false, reason: 'invalid' })

  // ของตัวเองถือว่าว่าง (กดเซฟค่าเดิมได้ ไม่ต้องขึ้นว่าชื่อซ้ำ)
  // เช็คข้ามตาราง: slug ร้านของคนอื่นก็ถือว่าชื่อนี้ถูกใช้แล้ว (lib/public-name.ts)
  // ไม่งั้น username กับ slug จะชนกันได้ และพอรวม URL เป็น /profile/{name} ตัวหนึ่งจะหายไป
  if (await isPublicNameTaken(username, { userId }))
    return NextResponse.json({ available: false, reason: 'taken' })

  return NextResponse.json({ available: true })
}
