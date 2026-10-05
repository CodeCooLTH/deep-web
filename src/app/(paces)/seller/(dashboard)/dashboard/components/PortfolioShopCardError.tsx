/**
 * PortfolioShopCardError — การ์ดร้านที่คำนวณตัวเลขล้ม (ไม่ใช่ปุ่มสลับร้าน)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (btn btn-sm border) +
 *   โครง .card > .card-body จาก ProductStats.tsx ของธีม
 */
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import AccountAvatar from '@/components/AccountAvatar'
import Icon from '@/components/wrappers/Icon'

type Props = { shopName: string; logoUrl: string | null }

const PortfolioShopCardError = ({ shopName, logoUrl }: Props) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="card h-full">
      <div className="card-body flex flex-col gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AccountAvatar src={logoUrl} kind="business" className="size-9" />
          <span className="min-w-0 flex-1 truncate text-base font-semibold" title={shopName}>
            {shopName}
          </span>
        </div>
        <p className="text-danger-ink flex items-center gap-1.5 text-sm">
          <Icon icon="alert-triangle" className="text-base" aria-hidden="true" />
          โหลดตัวเลขร้านนี้ไม่สำเร็จ
        </p>
        <button
          type="button"
          className="btn btn-sm border border-default-300 self-start"
          aria-disabled={pending || undefined}
          onClick={() => !pending && startTransition(() => router.refresh())}
        >
          ลองใหม่
        </button>
      </div>
    </div>
  )
}

export default PortfolioShopCardError
