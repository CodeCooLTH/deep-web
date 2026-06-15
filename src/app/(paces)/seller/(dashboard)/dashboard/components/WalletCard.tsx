// WalletCard — เครดิตคงเหลือ (premium money treatment: balance เป็น hero number)
// Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
// CC-v8.1: ยกตัวเลขเงินเป็น hero (text-2xl bold) ตาม modern fintech app (Revolut/Wise)
import Link from 'next/link'
import Icon from '@/components/wrappers/Icon'

type WalletCardProps = {
  balance: number
}

const WalletCard = ({ balance }: WalletCardProps) => {
  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* icon chip — success tint นุ่ม rounded ใหญ่ (premium); bg-{semantic}/15 ตาม Paces convention */}
            <span className="size-12 rounded-2xl bg-success/15 text-success flex items-center justify-center flex-shrink-0">
              <Icon icon="wallet" className="text-2xl" />
            </span>
            <div className="min-w-0">
              <p className="text-default-500 text-xs font-medium">เครดิตคงเหลือ</p>
              {/* hero number — text-2xl bold tabular-nums (เน้น value ตาม peak-end rule) */}
              <p className="text-default-900 text-2xl font-bold tabular-nums leading-tight">
                ฿{balance.toLocaleString('th-TH')}
              </p>
            </div>
          </div>
          {/* ปุ่มเติมเงิน — convention ทั้งโปรเจกต์ seller: .btn bg-primary hover:bg-primary-hover
              (Paces ไม่มี .btn-primary filled variant ใน build นี้ — ดู grep หน้า seller อื่น)
              rounded-xl premium pill + h-11 (touch 44px) + press feedback */}
          <Link
            href="/wallet"
            className="btn bg-primary text-white hover:bg-primary-hover text-sm font-semibold h-11 px-5 rounded-xl inline-flex items-center justify-center whitespace-nowrap flex-shrink-0 active:scale-95 transition-transform"
          >
            เติมเงิน
          </Link>
        </div>
      </div>
    </div>
  )
}

export default WalletCard
