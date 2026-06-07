/**
 * MiniBanner — RSC component สำหรับ Promo Banner ใน Command Center (S-10)
 *
 * ทำไม: แยก banner ออกเป็น component ย่อยเพื่อให้ CommandCenter สะอาด
 * และรองรับ Phase 2 ที่ banner จะ fetch มาจาก DB (ปัจจุบัน PROMO_BANNER=null → return null)
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/StatisticCard.tsx
 */

import Link from 'next/link'

import Icon from '@/components/wrappers/Icon'

import type { PromoBanner } from '../_constants/command-center'

type Props = { banner: PromoBanner | null }

/**
 * ถ้าไม่มี banner → return null ทันที (ไม่เว้น whitespace)
 * ถ้ามี banner → แสดง card แนะนำ พร้อม left-accent border
 */
const MiniBanner = ({ banner }: Props) => {
  if (!banner) return null

  return (
    <section className="mb-4">
      <div className="bg-white rounded-[20px] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_6px_16px_-8px_rgba(16,24,40,0.10)] p-3.5 flex items-center gap-3 border-l-4 border-primary">
        {/* ไอคอน banner — ใช้สีธีม primary */}
        <span className="inline-flex w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0 items-center justify-center">
          <Icon icon={banner.icon} className="text-[24px]" />
        </span>

        {/* เนื้อหา banner */}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-primary uppercase tracking-wide">Deep แนะนำ</p>
          <p className="text-[13.5px] font-semibold text-default-900 leading-snug">{banner.body}</p>
        </div>

        {/* chevron — ห่อด้วย Link ถ้ามี href, ไม่งั้นแสดง icon เปล่า */}
        {banner.href ? (
          <Link href={banner.href} aria-label={banner.label}>
            <Icon icon="chevron-right" className="text-xl text-gray-400 shrink-0" />
          </Link>
        ) : (
          <Icon icon="chevron-right" className="text-xl text-gray-400 shrink-0" />
        )}
      </div>
    </section>
  )
}

export default MiniBanner
