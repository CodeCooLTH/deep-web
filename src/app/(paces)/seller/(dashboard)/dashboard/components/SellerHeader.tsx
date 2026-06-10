// SellerHeader — premium gradient header เต็มขอบ (แนว Shopee "ฉัน")
// gradient น้ำเงิน Paces + full-bleed + rounded-b + frosted Trust banner
// latitude หลุด Paces ดิบ — user เคาะ "modern app craft" + ref Shopee
import Icon from '@/components/wrappers/Icon'
import Link from 'next/link'

export interface SellerHeaderProps {
  shopName?: string
  avatarUrl?: string | null
  tierName?: string
  trustScore?: number
  notiCount?: number
}

const SellerHeader = ({
  shopName = 'ร้านของฉัน',
  avatarUrl,
  tierName,
  trustScore = 0,
  notiCount = 0,
}: SellerHeaderProps) => {
  const initial = shopName.trim().charAt(0).toUpperCase() || 'S'
  const score = Math.min(100, Math.max(0, trustScore ?? 0))

  return (
    // full-bleed: -mx-2 -mt-2 ดึงออกนอก main padding (8px) → เต็มขอบ + ถึงบนสุด
    // gradient ผ่าน var(--color-primary) → เฉดเข้ม; rounded-b-[28px] หัวห้อยแบบ app
    <div
      className="-mx-2 -mt-2 px-4 pt-5 pb-6 rounded-b-[28px] text-white shadow-lg shadow-primary/25"
      style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #0a5fd9 100%)' }}
    >
      {/* row บน: avatar + ชื่อร้าน + tier + bell */}
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={shopName}
            className="size-12 rounded-full object-cover flex-shrink-0 ring-2 ring-white/40 shadow-sm"
          />
        ) : (
          <div className="size-12 rounded-full bg-white text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 select-none ring-2 ring-white/40 shadow-sm">
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-[17px] truncate leading-tight">{shopName}</p>
          {tierName && (
            <span className="inline-flex items-center gap-1 bg-white/20 text-white text-xs rounded-full px-2.5 py-0.5 font-medium mt-1">
              <Icon icon="rosette-discount-check-filled" className="text-sm" />
              {tierName}
            </span>
          )}
        </div>

        {/* Bell — Link /notifications, touch 44px (NF-4) */}
        <Link
          href="/notifications"
          aria-label="การแจ้งเตือน"
          className="size-11 inline-flex items-center justify-center flex-shrink-0 relative text-white active:scale-95 transition-transform"
        >
          <Icon icon="bell" className="text-2xl" />
          {notiCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center leading-none tabular-nums ring-2 ring-primary">
              {notiCount > 99 ? '99+' : notiCount}
            </span>
          )}
        </Link>
      </div>

      {/* Trust Score — frosted banner (แนว Shopee VIP banner) */}
      <div className="mt-4 flex items-center gap-2.5 bg-white/15 rounded-2xl px-3.5 py-2.5">
        <Icon icon="shield-check-filled" className="text-lg text-white shrink-0" />
        <span className="text-white/90 text-xs font-medium whitespace-nowrap">Trust Score</span>
        <div className="h-1.5 rounded-full bg-white/25 overflow-hidden flex-1">
          <div className="h-full rounded-full bg-white" style={{ width: `${score}%` }} />
        </div>
        <span className="text-white text-sm font-bold tabular-nums whitespace-nowrap">
          {score}
          <span className="text-white/60 text-xs font-medium">/100</span>
        </span>
      </div>
    </div>
  )
}

export default SellerHeader
