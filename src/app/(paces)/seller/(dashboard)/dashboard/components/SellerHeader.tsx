// SellerHeader — การ์ดทักทาย (Paces light card) บนสุดของ Command Center
// แก้จาก solid-blue (Shopee) → Paces-light: การ์ดขาว + primary เป็น accent เท่านั้น
// (Paces เป็น theme สว่าง restrained — ไม่ใช้ solid color header; เทียบ desktop "ยินดีต้อนรับ" card)
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

// RSC — ไม่มี hook; Link next/link ใช้ใน server component ได้
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
    <div className="card">
      <div className="card-body">
        {/* row บน: avatar + greeting + bell */}
        <div className="flex items-center gap-3">
          {/* avatar 44px (NF-4) — fallback tint primary/10 ตาม Paces (ไม่ใช่ solid) */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={shopName}
              className="size-11 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="size-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 select-none">
              {initial}
            </div>
          )}

          {/* greeting + ชื่อร้าน + tier chip */}
          <div className="flex-1 min-w-0">
            <span className="text-default-400 text-xs font-medium">ยินดีต้อนรับ</span>
            <p className="font-bold text-default-900 truncate leading-tight">{shopName}</p>
            {tierName && (
              <span className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs rounded px-2 py-0.5 font-medium mt-1">
                <Icon icon="rosette-discount-check-filled" className="text-sm" />
                {tierName}
              </span>
            )}
          </div>

          {/* Bell — Link /notifications, touch 44px (NF-4) */}
          <Link
            href="/notifications"
            aria-label="การแจ้งเตือน"
            className="size-11 inline-flex items-center justify-center flex-shrink-0 relative text-default-500"
          >
            <Icon icon="bell" className="text-2xl" />
            {notiCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center leading-none tabular-nums">
                {notiCount > 99 ? '99+' : notiCount}
              </span>
            )}
          </Link>
        </div>

        {/* trust row — primary เป็น accent (ไม่ใช่ solid fill ทั้ง header) */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-default-100">
          <span className="text-default-500 text-xs font-medium whitespace-nowrap">Trust Score</span>
          <div className="h-1.5 rounded-full bg-default-200 overflow-hidden flex-1">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
          </div>
          <span className="text-primary text-xs font-bold tabular-nums whitespace-nowrap">{score}/100</span>
        </div>
      </div>
    </div>
  )
}

export default SellerHeader
