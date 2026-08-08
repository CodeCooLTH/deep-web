import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireActiveShop } from '@/lib/shop-context'
import { setShopSlug } from '@/services/shop.service'
import { ShopSlugSchema, ShopCategorySchema } from '@/lib/validations'

const Body = v.object({ slug: ShopSlugSchema, category: v.optional(ShopCategorySchema) })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // session callback ใส่ id ผ่าน (session as any).user.id — ตาม src/lib/auth.ts session callback
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = v.safeParse(Body, await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

  /**
   * resolve จาก "ร้านที่กำลังใช้งานอยู่" ไม่ใช่ hardcode kind:'PERSONAL' (แก้ 2026-08-07)
   *
   * ของเดิมค้น `findFirst({ userId, kind:'PERSONAL' })` ตรง ๆ — ตอนเขียนถูกแล้วเพราะที่เดียวที่
   * เรียก endpoint นี้คือ onboarding ของร้านส่วนตัว แต่ผลข้างเคียงคือ **ร้าน BUSINESS ตั้ง slug
   * ไม่ได้เลยทั้งระบบ** (ยิงมาก็ได้ 404 "ไม่พบร้าน" เสมอ) ซึ่งกลายเป็นทางตันจริงบน prod เมื่อ
   * หน้า business onboarding ถูกถอดทิ้ง 2026-08-05 — ไม่เหลือทางไหนตั้ง slug ให้ร้าน BUSINESS เลย
   *
   * requireActiveShop ตรวจ membership ให้ในตัว (resolveActiveShopContext) — user ที่ไม่ได้เป็น
   * สมาชิกร้านนั้นจะ resolve ไม่ได้ตั้งแต่ต้นทาง จึงไม่ต้องเช็คสิทธิ์ซ้ำที่นี่
   *
   * ไม่จำกัด role (user เคาะ 2026-08-07: "ทุกคน") — สมาชิกร้านคนไหนก็ตั้งได้
   * [สำคัญ] slug เปลี่ยนไม่ได้หลังตั้ง (ไม่มีทางเข้าเขียนทับที่ไหนในระบบ) การเปิดให้ทุก role ตั้ง
   * จึงแปลว่าทีมงานคนหนึ่งจองชื่อผิดแล้วแก้ไม่ได้ — UI ต้องเตือนเรื่องนี้ก่อนยืนยันเสมอ
   */
  const active = await requireActiveShop(
    session as unknown as { user: { id: string; activeShopId?: string | null } },
  )
  if (!active) return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 })
  const shop = active.shop

  try {
    await setShopSlug(shop.id, parsed.output.slug)
    if (parsed.output.category) {
      await prisma.shop.update({ where: { id: shop.id }, data: { category: parsed.output.category } })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Error && e.message === 'SLUG_UNAVAILABLE') {
      return NextResponse.json({ error: 'URL นี้มีคนใช้แล้ว' }, { status: 409 })
    }
    throw e
  }
}
