// SellerHeader — identity ร้าน (Paces mood: card ขาวแบน ไม่ใช่ gradient app-header)
// re-skin v8.2: เดิม gradient น้ำเงินเต็มหัว + frosted banner = mood Vuexy/Shopee (user ปฏิเสธ)
//   → เปลี่ยนเป็น .card ขาว ตาม Paces UserCard + accent stripe บาง (subtle identity)
//   + trust score ย้ายไป footer bg-light/50 (Paces UserCard pattern)
// Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/UserCard.tsx
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
    // Paces card ขาวแบน — overflow-hidden เพื่อให้ accent stripe โค้งตามมุม card
    <div className="card overflow-hidden">
      {/* accent stripe บาง bg-primary (token) — คง identity ร้านไว้นิด แทน gradient เต็มหัวแบบ Vuexy */}
      <div className="h-1 bg-primary" />

      {/* row บน: avatar + ชื่อร้าน + tier + bell */}
      <div className="card-body flex items-center gap-3">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={shopName}
            className="size-12 rounded-full object-cover flex-shrink-0 ring-2 ring-default-200"
          />
        ) : (
          <div className="size-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 select-none">
            {initial}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-bold text-default-900 text-lg truncate leading-tight">{shopName}</p>
          {tierName && (
            <span className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs rounded-full px-2.5 py-0.5 font-medium mt-1">
              <Icon icon="rosette-discount-check-filled" className="text-sm" />
              {tierName}
            </span>
          )}
        </div>

        {/* Bell — Link /notifications, touch 44px (NF-4) */}
        <Link
          href="/notifications"
          aria-label="การแจ้งเตือน"
          className="size-11 inline-flex items-center justify-center flex-shrink-0 relative text-default-700 active:scale-95 transition-transform"
        >
          <Icon icon="bell" className="text-2xl" />
          {notiCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center leading-none tabular-nums ring-2 ring-card">
              {notiCount > 99 ? '99+' : notiCount}
            </span>
          )}
        </Link>
      </div>

      {/* Trust Score — footer section bg-light/50 ตาม Paces UserCard (secondary info) */}
      <div className="card-body py-2.5 flex items-center gap-2.5 bg-light/50">
        <Icon icon="shield-check-filled" className="text-lg text-primary shrink-0" />
        <span className="text-default-500 text-xs font-medium whitespace-nowrap">Trust Score</span>
        <div className="h-1.5 rounded-full bg-default-200 overflow-hidden flex-1">
          <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
        </div>
        <span className="text-default-900 text-sm font-bold tabular-nums whitespace-nowrap">
          {score}
          <span className="text-default-400 text-xs font-medium">/100</span>
        </span>
      </div>
    </div>
  )
}

export default SellerHeader
