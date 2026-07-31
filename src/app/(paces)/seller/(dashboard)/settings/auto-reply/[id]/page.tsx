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
import { getKeywordDetail } from '@/services/auto-reply-rule.service'
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

  // ตัวเลือกเงื่อนไข — scope shopId ทุกตัว
  const [channels, products] = await Promise.all([
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
  ])

  return (
    <>
      <PageBreadcrumb
        title={keyword.name}
        trail={[
          { label: 'ตั้งค่า', href: '/settings' },
          { label: 'ตอบแชทอัตโนมัติ', href: '/settings/auto-reply' },
          { label: keyword.name },
        ]}
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
