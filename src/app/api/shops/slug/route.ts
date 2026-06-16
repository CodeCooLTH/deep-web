import { NextRequest, NextResponse } from 'next/server'
import * as v from 'valibot'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
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

  const shop = await prisma.shop.findUnique({ where: { userId }, select: { id: true } })
  if (!shop) return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 })

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
