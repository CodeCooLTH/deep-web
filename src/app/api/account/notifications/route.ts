// notifications — ตั้งค่าแจ้งเตือน push รายร้านของผู้ใช้คนปัจจุบัน (user สั่ง 2026-08-08)
//
// 🛑 ทำไมวางใต้ /api/account/* : proxy.ts ยกเว้น CSRF Origin-check ให้ `/api/app/*` ทั้งก้อน
// (แอปผู้ซื้อยิงแบบ native ไม่มี Origin header และ auth ด้วย Bearer จึงไม่มี CSRF surface)
// แต่ endpoint นี้ auth ด้วย **cookie** ซึ่งเบราว์เซอร์แนบให้อัตโนมัติ = มี CSRF surface เต็ม ๆ
// ถ้าเอาไปวางใต้ /api/app/ จะกลายเป็นรูให้เว็บอื่นยิงปิดแจ้งเตือนของเหยื่อทิ้งได้เงียบ ๆ
// (เหตุผลเดียวกับที่ /api/seller/push-token ไม่ยอมย้ายไป /api/app/)
//
// ผูกกับ session.user.id ล้วน — **ห้ามอ่าน activeShopId** เพราะนี่คือของ "ตัวคน" ไม่ใช่ของร้าน
// ที่กำลังเปิดอยู่ (กติกาเดียวกับหน้า /account ทั้งหน้า ดู feature 00026)
import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { listShopNotificationPrefs, setShopChatNotification } from '@/services/notification-pref.service'

const PatchBody = v.object({
  shopId: v.pipe(v.string(), v.minLength(1)),
  chatEnabled: v.boolean(),
})

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

/** GET — ร้านทั้งหมดที่เข้าถึงได้ พร้อมสถานะแจ้งเตือน (ใช้ตอนหน้า /account โหลด) */
export async function GET() {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  return NextResponse.json({ shops: await listShopNotificationPrefs(userId) })
}

/**
 * PATCH — เปิด/ปิดแจ้งเตือนข้อความของร้านหนึ่ง
 *
 * 403 เมื่อ shopId ไม่ใช่ร้านที่ผู้ใช้เข้าถึงได้ — service ตรวจสิทธิ์เองใน WHERE ไม่ใช่เชื่อ client
 * (ถ้าไม่ตรวจ ใครก็ยิง shopId ของคนอื่นมาสร้างแถวทิ้งไว้ในตารางเราได้)
 */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(PatchBody, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  const ok = await setShopChatNotification(userId, parsed.output.shopId, parsed.output.chatEnabled)
  if (!ok) return NextResponse.json({ error: 'ไม่มีสิทธิ์ในร้านนี้' }, { status: 403 })

  return NextResponse.json({ ok: true })
}
