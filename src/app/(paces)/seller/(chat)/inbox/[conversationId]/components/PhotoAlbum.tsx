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
  onMeasure,
}: {
  msg: AlbumMsg
  onOpen: (id: string) => void
  overlay?: number // จำนวนรูปที่เหลือ (แสดง "+N") — ช่องสุดท้ายของ 5+ รูป
  className: string
  /** รายงานสัดส่วนรูปจริง (w/h) ให้ album เลือกทรงช่อง — ใส่เฉพาะรูปนำ */
  onMeasure?: (ratio: number) => void
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
          onLoad={
            onMeasure
              ? (e) => {
                  const el = e.currentTarget
                  if (el.naturalWidth > 0 && el.naturalHeight > 0) onMeasure(el.naturalWidth / el.naturalHeight)
                }
              : undefined
          }
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

/**
 * ทรงช่องของอัลบั้ม — 3 แบบตายตัว เลือกจาก "รูปนำ" ของชุด (user 2026-08-04: ช่องจัตุรัสครอปรูปแนวตั้ง/
 * สกรีนช็อตทิ้งจนดูไม่รู้ว่าเป็นอะไร)
 *
 * ทำไมไม่ใช้สัดส่วนจริงของแต่ละรูป (masonry แบบ Meta): ช่องคนละทรงในกริดเดียวทำให้ขอบขวา/ล่างไม่เสมอกัน
 * ต้องคำนวณ layout เองทั้งหมด และ**ต้องรอรูปโหลดครบทุกใบก่อนวางกริด** — บับเบิลจะกระตุกทุกครั้งที่รูปมา
 * ไม่พร้อมกัน. ชุดจริงเกือบทั้งหมดเป็นรูปแนวเดียวกันหมด (ถ่ายจากกล้องชุดเดียว / สกรีนช็อตชุดเดียว)
 * การให้ทั้งกริดใช้ทรงเดียวตามรูปนำจึงได้ผลใกล้เคียง แต่ขอบยังเรียบและวางได้ทันทีที่รูปแรกโหลด
 *
 * ทำไมไม่เก็บ w/h ตอนรับรูป: `ChatMessage` ไม่มีคอลัมน์ขนาดภาพ (มีแค่ attachmentName/Size) — เพิ่มคอลัมน์
 * = migration บนฐานที่แชร์กับ prod และยังต้องมี backfill ให้รูปเก่าอยู่ดี วัดตอน onLoad ถูกกว่าและครอบของเก่า
 */
type TileShape = 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE'

const TILE_ASPECT: Record<TileShape, string> = {
  // fraction utility ของ Tailwind 4 (aspect-3/4) ไม่ใช่ arbitrary value ในวงเล็บ — HR7 ผ่าน
  PORTRAIT: 'aspect-3/4',
  SQUARE: 'aspect-square',
  LANDSCAPE: 'aspect-4/3',
}

/** เกณฑ์กว้าง ๆ — รูปที่เกือบจัตุรัส (0.85–1.2) ให้เป็นจัตุรัสไปเลย ไม่ต้องเปลี่ยนทรงเพราะเอียงไปนิดเดียว */
function shapeFromRatio(ratio: number): TileShape {
  if (ratio <= 0.85) return 'PORTRAIT'
  if (ratio >= 1.2) return 'LANDSCAPE'
  return 'SQUARE'
}

export default function PhotoAlbum({ ms, onOpen }: { ms: AlbumMsg[]; onOpen: (id: string) => void }) {
  // เริ่มที่ SQUARE เพื่อให้จองพื้นที่ได้ทันทีก่อนรูปโหลด แล้วปรับครั้งเดียวเมื่อรูปนำโหลดเสร็จ
  const [shape, setShape] = useState<TileShape>('SQUARE')
  const tile = TILE_ASPECT[shape]

  const imgs = ms.filter((m) => m.imageUrl)
  const count = imgs.length
  if (count < 2) return null // safety — buildAlbumRows สร้าง album เฉพาะ ≥2 อยู่แล้ว

  const measureLead = (ratio: number) => setShape(shapeFromRatio(ratio))

  // 2 รูป — คู่ชิดกัน ทรงตามรูปนำ
  if (count === 2) {
    return (
      <div className="grid w-60 grid-cols-2 gap-1">
        {imgs.map((m, i) => (
          <AlbumCell
            key={m.id}
            msg={m}
            onOpen={onOpen}
            className={tile}
            onMeasure={i === 0 ? measureLead : undefined}
          />
        ))}
      </div>
    )
  }

  // 3 รูป — ซ้ายสูง (row-span-2) + ขวา 2 เรียง (implicit rows: ขวา aspect-square กำหนดความสูงแถว,
  // ซ้าย row-span-2 h-full ยืดเท่าสองแถวรวม gap — ไม่ใช้ grid-rows-2 เพราะ 1fr ยุบเมื่อ container ไม่มีความสูง)
  if (count === 3) {
    // ชุดแนวตั้งไม่ใช้ collage ซ้ายสูง — ช่องซ้ายจะสูงเท่าสองแถวรวมกัน (ประมาณ 1:2.7) ครอปหนักกว่าเดิม
    // 3 คอลัมน์เท่ากันแทน (Messenger ก็เรียงแบบนี้กับชุดแนวตั้ง)
    if (shape === 'PORTRAIT') {
      return (
        <div className="grid w-60 grid-cols-3 gap-1">
          {imgs.map((m, i) => (
            <AlbumCell
              key={m.id}
              msg={m}
              onOpen={onOpen}
              className={tile}
              onMeasure={i === 0 ? measureLead : undefined}
            />
          ))}
        </div>
      )
    }
    return (
      <div className="grid w-60 grid-cols-2 gap-1">
        <AlbumCell msg={imgs[0]} onOpen={onOpen} className="row-span-2 h-full" onMeasure={measureLead} />
        <AlbumCell msg={imgs[1]} onOpen={onOpen} className={tile} />
        <AlbumCell msg={imgs[2]} onOpen={onOpen} className={tile} />
      </div>
    )
  }

  // 4+ รูป — grid 2×2 (4 ช่อง aspect-square auto-flow 2 แถว), ช่องที่ 4 overlay "+N" ถ้ามากกว่า 4 + ชิป "N รูป"
  /**
   * โชว์ได้ถึง 6 ช่อง (2×3) ก่อนจะเริ่มตัด — user เทียบกับ Messenger 2026-08-04: ส่ง 6 รูปแล้ว Meta
   * แสดงครบทั้ง 6 ส่วนของเราตัดที่ 4 แล้วขึ้น "+2" ทุกกรณี ทำให้ดูไม่เหมือนและเห็นรูปน้อยกว่าจริง
   * 7 ใบขึ้นไปจึงตัดแล้วขึ้น +N (10 ใบเรียงเรียบ ๆ จะยาวเกินบับเบิล — Messenger ก็ย่อเหมือนกัน)
   */
  const MAX_TILES = 6
  const shown = imgs.slice(0, MAX_TILES)
  const extra = count - MAX_TILES
  return (
    <div className="w-60">
      <div className="grid grid-cols-2 gap-1">
        {shown.map((m, i) => (
          <AlbumCell
            key={m.id}
            msg={m}
            onOpen={onOpen}
            className={tile}
            onMeasure={i === 0 ? measureLead : undefined}
            // +N อยู่ช่องสุดท้ายที่โชว์จริง (ช่องที่ 6) ไม่ใช่ช่องที่ 4 ตายตัว
            overlay={i === shown.length - 1 && extra > 0 ? extra : undefined}
          />
        ))}
      </div>
      {/* ชิปจำนวนขึ้นเฉพาะตอนที่ "ตัดรูป" จริง (เกิน 6 ใบ) — 2-6 ใบเห็นครบอยู่แล้ว ไม่ต้องบอกจำนวนซ้ำ
          (user เทียบกับ Messenger 2026-08-04) */}
      {extra > 0 && (
      <div className="mt-1.5">
        <span className="badge bg-default-100 text-default-700 text-2xs inline-flex items-center gap-1">
          <Icon icon="stack-2" />
          {count} รูป
        </span>
      </div>
      )}
    </div>
  )
}
