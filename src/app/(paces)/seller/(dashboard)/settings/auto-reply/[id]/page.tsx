/**
 * แก้ไขกลุ่มคำ — /settings/auto-reply/[id] (feature 00023, S-13 หน้า 2)
 *
 * SSOT: docs/20 - Features/00023 - Chat Auto-Reply/UI-DESIGN-SPEC.md §4
 *
 * Base: src/app/(paces)/seller/(dashboard)/settings/auto-reply/page.tsx (โครง RSC + PageBreadcrumb)
 *   ซึ่ง Base เดิม = theme/paces/Admin/TS/src/app/(admin)/apps/users/account-settings/page.tsx
 *
 * โหลดข้อมูลผ่าน service ตรง (ไม่ self-fetch API ตัวเอง) — ownership scope ด้วย {id, shopId}
 * อยู่ใน getKeywordDetail แล้ว ไม่ใช่ดึงมาแล้วเช็คทีหลัง
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveActiveShopContext } from '@/lib/shop-context'
import { getKeywordDetail, getPhraseOverlaps } from '@/services/auto-reply-rule.service'
import { prisma } from '@/lib/prisma'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import KeywordEditorClient from './KeywordEditorClient'

export const metadata: Metadata = { title: 'แก้ไขกลุ่มคำ' }

const EDITABLE_ROLES = ['OWNER', 'ADMIN']

export default async function KeywordEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const user = (session as { user?: { id: string; activeShopId?: string | null } } | null)?.user
  if (!user) return null

  const activeCtx = await resolveActiveShopContext({
    user: { id: user.id, activeShopId: user.activeShopId ?? null },
  })
  if (!activeCtx) return null

  const keyword = await getKeywordDetail(id, activeCtx.shopId)
  if (!keyword) notFound()

  /**
   * ตัวเลือกเงื่อนไข + กลุ่มอื่นที่ใช้คำซ้ำ — scope shopId ทุกตัว
   *
   * WARNING (A-8): getPhraseOverlaps ไม่ใช่ ownership check — ถ้า keywordId ไม่ใช่ของร้านนี้
   * มันคืน [] เงียบ ๆ (fail-closed) ไม่ throw เหมือน service ตัวอื่น จึงต้องเรียก *หลัง*
   * getKeywordDetail(id, shopId) + notFound() เท่านั้น ห้ามยกขึ้นไปขนานกับ guard
   */
  const [channels, products, overlaps] = await Promise.all([
    prisma.shopChannel.findMany({
      where: { shopId: activeCtx.shopId, status: 'ACTIVE' },
      select: { id: true, name: true, provider: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({
      where: { shopId: activeCtx.shopId, isActive: true },
      // images: เอาไปทำการ์ดสินค้ามีรูป (user request 2026-07-29 "อยากให้เป็น card สินค้า + มีรูป")
      select: { id: true, name: true, price: true, images: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    getPhraseOverlaps(activeCtx.shopId, id),
  ])

  return (
    <>
      <PageBreadcrumb
        title={keyword.name}
        /**
         * 3 ขั้นพอ (user 2026-07-31) — ของเดิมเป็น 5 ขั้นและลงท้ายด้วยชื่อกลุ่มซ้ำ 2 ครั้ง
         * เพราะ PageBreadcrumb ต่อ `title` เข้าท้าย trail ให้เองอยู่แล้ว การใส่ชื่อกลุ่ม
         * ใน trail ด้วยจึงซ้ำ · ยุบ "ตั้งค่า > ตอบแชทอัตโนมัติ" เป็นขั้นเดียวชื่อ
         * "ตั้งค่าการตอบกลับ" ที่ชี้หน้ารายการโดยตรง — ผู้ใช้ไม่ได้มาจากหน้า /settings
         */
        trail={[{ label: 'ตั้งค่าการตอบกลับ', href: '/settings/auto-reply' }]}
      />

      <KeywordEditorClient
        canEdit={EDITABLE_ROLES.includes(activeCtx.role)}
        keyword={{
          id: keyword.id,
          name: keyword.name,
          matchType: keyword.matchType,
          priority: keyword.priority,
          status: keyword.status,
          testThreadCount: keyword.testThreadCount,
          phrases: keyword.phrases.map((p) => ({ id: p.id, phrase: p.phrase })),
          rules: keyword.rules.map((r) => ({
            id: r.id,
            shopChannelId: r.shopChannelId,
            adId: r.adId,
            adLabel: r.adLabel,
            productId: r.productId,
            replyText: r.replyText,
            isActive: r.isActive,
            specificity: r.specificity,
          })),
        }}
        overlaps={overlaps}
        channels={channels}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price.toFixed(0),
          // pattern เดียวกับ (chat)/layout.tsx และ orders/new — images[0] คือ storage fileId
          image: Array.isArray(p.images) && p.images.length > 0 ? `/api/files/${p.images[0]}` : null,
        }))}
      />
    </>
  )
}
