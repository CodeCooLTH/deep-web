// แชท (mobile) — เต็มจอ overlay (fixed inset-0) คลุม AppTopBar/AppBottomNav เหมือนแชทเนทีฟ.
// RSC fetch ตัวตนร้าน (header โชว์ทันที) แล้ว mount ChatThread (client) ที่ดึง/ส่งข้อความ + realtime เอง.
// reuse ChatThread เดิม (root = flex flex-col flex-1 → เต็มพื้นที่ที่เหลือใต้ header)
import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import { prisma } from '@/lib/prisma'
import CustomAvatar from '@core/components/mui/Avatar'
import ChatThread from '@/app/(marketing)/(buyer-app)/messages/[shopId]/ChatThread'

type Props = { params: Promise<{ shopId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopId } = await params
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { shopName: true } })
  return { title: shop ? `แชทกับ ${shop.shopName}` : 'ไม่พบร้านค้า' }
}

export default async function MobileChatThreadPage({ params }: Props) {
  const { shopId } = await params
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, shopName: true, logo: true, user: { select: { username: true } } }
  })
  if (!shop) notFound()

  return (
    <div
      className='fixed inset-0 z-50 flex flex-col bg-[var(--mui-palette-background-paper)]'
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* header — back + avatar + ชื่อร้าน */}
      <header className='shrink-0 flex items-center gap-2.5 pli-3 plb-2.5 border-b border-[var(--mui-palette-divider)]'>
        <Link
          href='/messages'
          aria-label='กลับไปหน้าข้อความ'
          className='size-9 rounded-full flex items-center justify-center no-underline active:bg-[var(--mui-palette-action-hover)] transition-colors shrink-0'
        >
          <i className='tabler-arrow-left text-[22px] text-[var(--mui-palette-text-primary)]' />
        </Link>
        <Link href={`/u/${shop.user.username}`} className='flex items-center gap-2.5 min-w-0 no-underline flex-1'>
          <CustomAvatar src={shop.logo ? `/api/files/${shop.logo}` : undefined} skin='light' size={38}>
            {shop.shopName.slice(0, 1)}
          </CustomAvatar>
          <p className='text-[15px] font-medium truncate m-0 text-[var(--mui-palette-text-primary)]'>{shop.shopName}</p>
        </Link>
      </header>

      <Suspense fallback={null}>
        <ChatThread shopId={shop.id} shopName={shop.shopName} shopLogo={shop.logo} shopUsername={shop.user.username} />
      </Suspense>
    </div>
  )
}
