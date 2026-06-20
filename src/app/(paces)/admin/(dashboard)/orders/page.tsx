/**
 * Admin /orders list — server component.
 *
 * Base: src/app/(paces)/seller/(dashboard)/orders/page.tsx (structural base —
 * same-theme Paces DataTable pattern, itself derived from
 * theme/paces/Admin/TS/src/app/(admin)/apps/...). Columns re-scoped from
 * seller (one shop's orders) to admin (all orders across all shops) — adds
 * shop column, adds order type chip, drops image/qty columns, keeps status
 * chip + date + view action. Admin DataTable wiring (Preline card, search
 * toolbar, Paces icons) matches
 * src/app/(paces)/admin/(dashboard)/users/components/UsersTable.tsx (A3).
 *
 * Data: direct Prisma (server→server). AuthGuard for isAdmin is enforced
 * by the parent (dashboard) layout (A1). ?status= is SSR-shareable; the
 * client component also lets admins flip status chips without reloading.
 */

import PageBreadcrumb from '@/components/PageBreadcrumb'
import { formatDateTime } from '@/lib/format-date'
import { prisma } from '@/lib/prisma'
import type { Metadata } from 'next'
import OrdersTable from './components/OrdersTable'
import type {
  AdminOrderRow,
  AdminOrderStatus,
  AdminOrderType,
  AdminOrderItemRow,
} from './components/data'

export const metadata: Metadata = { title: 'ออเดอร์ทั้งหมด' }

const VALID_STATUSES: AdminOrderStatus[] = [
  'PENDING',
  'SHIPPED',
  'CONFIRMED',
  'CANCELLED',
]

const thDate = (d: Date): string => formatDateTime(d)

// Mask a raw contact string (typically phone) to `••••1234`. Empty/short
// values render as null → client shows "-".
const maskContact = (c: string | null | undefined): string | null => {
  if (!c) return null
  if (c.length <= 4) return c
  return '•'.repeat(Math.max(0, c.length - 4)) + c.slice(-4)
}

// Resolve buyer-subdomain absolute URLs; admin runs on admin.<host> so
// relative paths 404 on admin subdomain (ไม่มี /u หรือ /o ฝั่ง admin).
// Preference: NEXT_PUBLIC_BUYER_URL → dev default deepth.local:4000 →
// prod default deepthailand.app
const buyerBase = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_BUYER_URL
  // .trim() กัน env ที่มี trailing newline/space (กัน URL พังกลางทาง); ตัด trailing slash ซ้ำ
  if (envUrl) return envUrl.trim().replace(/\/+$/, '')
  return process.env.NODE_ENV !== 'production'
    ? 'http://deepth.local:4000'
    : 'https://deepthailand.app'
}

const shopProfileUrl = (username: string): string => {
  return `${buyerBase()}/u/${username}`
}

const orderViewUrl = (publicToken: string): string => {
  return `${buyerBase()}/o/${publicToken}`
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const statusParam = sp.status
  const statusFilter =
    statusParam && VALID_STATUSES.includes(statusParam as AdminOrderStatus)
      ? (statusParam as AdminOrderStatus)
      : undefined

  const orders = await prisma.order.findMany({
    where: statusFilter ? { status: statusFilter } : {},
    include: {
      shop: {
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
      buyer: { select: { username: true, displayName: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const rows: AdminOrderRow[] = orders.map((o) => {
    const itemsRaw = Array.isArray(o.items) ? o.items : []
    const items: AdminOrderItemRow[] = itemsRaw.map((it) => ({
      name: it.name ?? '—',
      qty: it.qty ?? 1,
      price: Number(it.price ?? 0),
    }))

    const firstItemName = items[0]?.name ?? '—'
    const extraItemCount = Math.max(0, items.length - 1)

    const sellerUsername = o.shop?.user?.username ?? ''
    const shopName = o.shop?.shopName ?? '—'

    return {
      id: o.id,
      publicToken: o.publicToken,
      tokenShort: (o.publicToken ?? o.id).slice(0, 8),

      shopName,
      sellerUsername,
      shopUrl: sellerUsername ? shopProfileUrl(sellerUsername) : '#',

      buyerDisplayName: o.buyer?.displayName ?? null,
      buyerUsername: o.buyer?.username ?? null,
      buyerContactMasked: o.buyerUserId ? null : maskContact(o.buyerContact),

      firstItemName,
      extraItemCount,
      items,

      total: Number(o.totalAmount ?? 0),
      type: (o.type as AdminOrderType) ?? 'PHYSICAL',
      status: (o.status as AdminOrderStatus) ?? 'PENDING',
      createdAt: o.createdAt.toISOString(),
      createdAtTh: thDate(o.createdAt),

      viewUrl: orderViewUrl(o.publicToken ?? o.id),
    }
  })

  const activeStatus: 'all' | AdminOrderStatus = statusFilter ?? 'all'

  return (
    <>
      <PageBreadcrumb
        title="ออเดอร์ทั้งหมด"
        trail={[{ label: 'ผู้ดูแล' }, { label: 'คำสั่งซื้อ' }]}
      />
      <OrdersTable orders={rows} activeStatus={activeStatus} />
    </>
  )
}
