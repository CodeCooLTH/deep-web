// SellerHeader — header น้ำเงิน bg-primary block บนสุดของ Command Center
// ออกแบบตาม mockup docs/mockups/home/command-center-v8.html FRAME 1 (.app-head)
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

// ใช้ RSC ได้เพราะไม่มี hook — Link next/link ใช้ได้ใน server component โดยตรง
const SellerHeader = ({
  shopName = 'ร้านของฉัน',
  avatarUrl,
  tierName,
  trustScore = 0,
  notiCount = 0,
}: SellerHeaderProps) => {
  // initial fallback: ตัวแรกของชื่อร้าน uppercase
  const initial = shopName.trim().charAt(0).toUpperCase() || 'S'

  // clamp trustScore ให้อยู่ใน 0-100 เสมอ (ป้องกัน progress ล้น)
  const score = Math.min(100, Math.max(0, trustScore ?? 0))

  return (
    <div className="bg-primary text-white px-4 pt-3.5 pb-4 flex-shrink-0">
      {/* row บน: avatar + info + bell */}
      <div className="flex items-center gap-3">
        {/* Avatar — 44px (NF-4 touch), ขาวบนน้ำเงิน */}
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={shopName}
            className="size-11 rounded-full object-cover flex-shrink-0 bg-white"
          />
        ) : (
          <div className="size-11 rounded-full bg-white text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 select-none">
            {initial}
          </div>
        )}

        {/* ชื่อร้าน + tier chip */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate leading-tight">{shopName}</p>
          {tierName && (
            <div className="flex items-center gap-1 mt-0.5">
              {/* tier chip: bg-white/20 ตาม Hard Rule 7 */}
              <span className="inline-flex items-center gap-1 bg-white/20 text-white text-xs rounded px-2 py-0.5 font-medium">
                <Icon icon="rosette-discount-check-filled" className="text-sm" />
                {tierName}
              </span>
            </div>
          )}
        </div>

        {/* Bell — Link ไปยัง /notifications, touch 44px (NF-4) */}
        <Link
          href="/notifications"
          aria-label="การแจ้งเตือน"
          className="size-11 inline-flex items-center justify-center flex-shrink-0 relative"
        >
          <Icon icon="bell" className="text-white text-2xl" />
          {/* badge แจ้งเตือน — แสดงเฉพาะเมื่อ notiCount > 0 */}
          {notiCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center leading-none tabular-nums">
              {notiCount > 99 ? '99+' : notiCount}
            </span>
          )}
        </Link>
      </div>

      {/* trust row */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-white/90 text-xs font-medium whitespace-nowrap">Trust</span>
        {/* progress bar: bg-white/25 track, bg-white fill — inline style width อนุญาต */}
        <div className="h-1.5 rounded-full bg-white/25 overflow-hidden flex-1">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-white text-xs font-bold tabular-nums">{score}</span>
      </div>
    </div>
  )
}

export default SellerHeader
