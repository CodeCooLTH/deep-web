import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireShopCapability } from '@/lib/shop-capability'
import { setShopSlug } from '@/services/shop.service'
import { ShopSlugSchema, ShopCategorySchema } from '@/lib/validations'

const Body = v.object({ slug: ShopSlugSchema, category: v.optional(ShopCategorySchema) })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // 00071 T1: ตั้ง URL ร้าน = เจ้าของ/ผู้ดูแล (เดิม "ทุกคน" 2026-08-07 — slug เปลี่ยนไม่ได้ จึงไม่ควรเปิดให้ทุกบทบาทจอง)
  const gate = await requireShopCapability(session, 'T1')
  if (!gate.ok) return gate.response

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
   * สิทธิ์: T1 (เจ้าของ/ผู้ดูแล) — ปรับจาก "ทุกคน" (2026-08-07) ตามตารางสิทธิ์ 00071
   * [สำคัญ] slug เปลี่ยนไม่ได้หลังตั้ง (ไม่มีทางเข้าเขียนทับที่ไหนในระบบ) การเปิดให้ทุก role ตั้ง
   * จึงแปลว่าทีมงานคนหนึ่งจองชื่อผิดแล้วแก้ไม่ได้ — UI ต้องเตือนเรื่องนี้ก่อนยืนยันเสมอ
   */
  const shop = gate.active.shop

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
    // ร้านนี้ตั้ง URL ไปแล้ว — ข้อความต้องต่างจาก "มีคนใช้แล้ว" เพราะเป็นคนละเรื่องกัน
    // (อันนั้นแก้ได้ด้วยการเปลี่ยนชื่อ อันนี้แก้ไม่ได้เลย) ดูด่านใน setShopSlug
    if (e instanceof Error && e.message === 'SLUG_ALREADY_SET') {
      return NextResponse.json({ error: 'ร้านนี้ตั้ง URL ไปแล้ว เปลี่ยนภายหลังไม่ได้' }, { status: 409 })
    }
    throw e
  }
}
