'use client'

/**
 * PhotoAlbum — จัดกลุ่มรูปที่ส่งติดกันเป็นชุด (feat 00018, user request 2026-07-23 อ้าง FB Messenger):
 * 2-3 รูป = collage แน่น, 4+ รูป = grid 2×2 + overlay "+N" ที่ช่องสุดท้าย + ชิป "N รูป".
 * คลิกรูปไหน → onOpen(messageId) เปิด Lightbox เดิมของเธรดที่ index ของรูปนั้น (เลื่อนดูต่อได้ทั้งเธรด).
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/widgets/social/components/SocialFeed.tsx:132-138
 * (grid grid-cols-2 collage) + overlay bg-dark/60 (ui/placeholders/page.tsx:115) — token ล้วน ไม่ arbitrary (HR7).
 * ไม่ทำ card-stack เอียง/เงา ตาม FB เป๊ะ (Paces ไม่มี primitive + ขัด Flat-At-Rest ของ Impeccable) —
 * ใช้ grid collage แน่นแทน (HR6: ref เอา behavior ได้ แต่ skin ตาม theme ปัจจุบัน)
 */
import { useState } from 'react'
import Icon from '@/components/wrappers/Icon'

type AlbumMsg = { id: string; imageUrl: string | null }

/** cell รูปเดี่ยว — จับ error โหลดไม่ขึ้นต่อช่อง (ไม่ให้ทั้งกริดพัง) */
function AlbumCell({
  msg,
  onOpen,
  overlay,
  className,
}: {
  msg: AlbumMsg
  onOpen: (id: string) => void
  overlay?: number // จำนวนรูปที่เหลือ (แสดง "+N") — ช่องสุดท้ายของ 5+ รูป
  className: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => onOpen(msg.id)}
      aria-label={overlay ? `ดูรูปที่เหลืออีก ${overlay} รูป` : 'ดูรูปเต็มจอ'}
      className={`relative block cursor-zoom-in overflow-hidden rounded bg-default-100 ${className}`}
    >
      {failed ? (
        <span className="text-default-700 flex size-full items-center justify-center">
          <Icon icon="photo-off" className="text-xl" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/${msg.imageUrl}`}
          alt="รูปภาพที่ส่ง"
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
      {overlay && overlay > 0 ? (
        <span className="bg-dark/60 absolute inset-0 flex items-center justify-center text-lg font-semibold text-white">
          +{overlay}
        </span>
      ) : null}
    </button>
  )
}

export default function PhotoAlbum({ ms, onOpen }: { ms: AlbumMsg[]; onOpen: (id: string) => void }) {
  const imgs = ms.filter((m) => m.imageUrl)
  const count = imgs.length
  if (count < 2) return null // safety — buildAlbumRows สร้าง album เฉพาะ ≥2 อยู่แล้ว

  // 2 รูป — คู่จัตุรัสชิดกัน
  if (count === 2) {
    return (
      <div className="grid w-60 grid-cols-2 gap-1">
        {imgs.map((m) => (
          <AlbumCell key={m.id} msg={m} onOpen={onOpen} className="aspect-square" />
        ))}
      </div>
    )
  }

  // 3 รูป — ซ้ายสูง (row-span-2) + ขวา 2 เรียง (implicit rows: ขวา aspect-square กำหนดความสูงแถว,
  // ซ้าย row-span-2 h-full ยืดเท่าสองแถวรวม gap — ไม่ใช้ grid-rows-2 เพราะ 1fr ยุบเมื่อ container ไม่มีความสูง)
  if (count === 3) {
    return (
      <div className="grid w-60 grid-cols-2 gap-1">
        <AlbumCell msg={imgs[0]} onOpen={onOpen} className="row-span-2 h-full" />
        <AlbumCell msg={imgs[1]} onOpen={onOpen} className="aspect-square" />
        <AlbumCell msg={imgs[2]} onOpen={onOpen} className="aspect-square" />
      </div>
    )
  }

  // 4+ รูป — grid 2×2 (4 ช่อง aspect-square auto-flow 2 แถว), ช่องที่ 4 overlay "+N" ถ้ามากกว่า 4 + ชิป "N รูป"
  const shown = imgs.slice(0, 4)
  const extra = count - 4
  return (
    <div className="w-60">
      <div className="grid grid-cols-2 gap-1">
        {shown.map((m, i) => (
          <AlbumCell
            key={m.id}
            msg={m}
            onOpen={onOpen}
            className="aspect-square"
            overlay={i === 3 && extra > 0 ? extra : undefined}
          />
        ))}
      </div>
      <div className="mt-1.5">
        <span className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1">
          <Icon icon="stack-2" />
          {count} รูป
        </span>
      </div>
    </div>
  )
}
