'use client'

/**
 * AdImage — รูปโฆษณา: รูปจากร้านเอง (photoFileId ผ่านรูปย่อ) ก่อน → ไม่มีจึงใช้ thumbnail จาก Meta (ไม่เก็บไฟล์) → ไม่มีเลย = ไอคอน (00094 FR-009 AC-1)
 *
 * Base: src/components/safepay/AdThumb.tsx (tile ไอคอน + `/api/files/{id}?variant=thumb` ตาม docs/conventions/image-thumbnails.md)
 *   ซึ่ง Base เป็น theme/paces/Admin/TS/src/app/(admin)/dashboard/ecommerce/components/TopSellingProducts.tsx (รูป 36px หน้าแถว)
 * thumbnailUrl เป็น URL ภายนอก (fbcdn) — no-referrer กันถูกปฏิเสธเพราะ Referer
 */
import AdThumb from '@/components/safepay/AdThumb'
import type { AdRow } from '@/lib/ad-summary/types'

export default function AdImage({ ad, className = 'size-10 rounded', iconClass = 'text-lg' }: { ad: Pick<AdRow, 'photoFileId' | 'thumbnailUrl'>; className?: string; iconClass?: string }) {
  if (!ad.photoFileId && ad.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ad.thumbnailUrl} alt="" referrerPolicy="no-referrer" className={`${className} shrink-0 object-cover`} />
  }
  return <AdThumb photoFileId={ad.photoFileId} className={className} iconClass={iconClass} />
}
