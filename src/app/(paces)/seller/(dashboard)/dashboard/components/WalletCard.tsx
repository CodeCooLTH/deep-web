// Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
// RSC — ไม่มี "use client", ไม่มี modal; แค่ link ไป /wallet
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type WalletCardProps = {
  balance: number
}

const WalletCard = ({ balance }: WalletCardProps) => {
  return (
    <div className="card">
      <div className="card-body flex items-center gap-3">
        {/* icon chip — success tint ตาม mockup command-center-v8 frame 1 (.wallet .wic) */}
        <span className="size-11 rounded-lg bg-success/15 text-success flex items-center justify-center flex-shrink-0">
          <Icon icon="wallet" className="size-5.5" />
        </span>

        {/* ข้อมูล balance */}
        <div className="min-w-0">
          <p className="text-default-500 text-xs">เครดิตคงเหลือ</p>
          {/* tabular-nums — ตัวเลขไม่กระโดดเวลา balance เปลี่ยน */}
          <p className="text-default-900 text-lg font-bold tabular-nums">
            ฿{balance.toLocaleString('th-TH')}
          </p>
        </div>

        {/* ปุ่มเติมเงิน — btn-sm + h-11 เพราะ Paces btn-sm สูงแค่ ~26px ต่ำกว่า touch target 44px (NF-4) */}
        <Link
          href="/wallet"
          className="btn btn-primary btn-sm h-11 ms-auto whitespace-nowrap"
        >
          เติมเงิน
        </Link>
      </div>
    </div>
  )
}

export default WalletCard
