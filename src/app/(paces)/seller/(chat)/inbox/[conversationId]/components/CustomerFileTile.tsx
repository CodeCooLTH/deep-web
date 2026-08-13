'use client'

/**
 * CustomerFileTile — 1 ช่องในกริดคลังไฟล์ (feature 00048) ใช้ร่วมกันทั้งพรีวิวในแผงและโมดัลดูทั้งหมด
 *
 * Base: PhotoAlbum.tsx:19-70 (AlbumCell) — โครงปุ่มครอบ (relative + overflow-hidden + rounded +
 * bg-default-100), รูปแบบ object-cover เต็มช่อง และการจับ error โหลดไม่ขึ้นแยกรายช่อง
 *
 * 🛑 ช่อง "ไฟล์เอกสาร" ต้องต่างจากช่องรูปด้วยสายตา (ไอคอน ไม่ใช่ภาพตัวอย่าง) เพราะ **พฤติกรรม
 * ตอนกดต่างกัน** — รูปเปิด lightbox / เอกสารเปิดการ์ดรายละเอียด. ถ้าหน้าตาเหมือนกันผู้ใช้จะ
 * เดาไม่ได้ว่ากดแล้วจะเกิดอะไร
 *
 * 🛑 ไฟล์ที่โหลดไม่ขึ้น (404 จาก storage) ต้องขึ้นคำว่า "ไฟล์ถูกลบแล้ว" ไม่ใช่ช่องเทาว่าง —
 * ช่องเทาว่างอ่านเป็น "ระบบพัง" ส่วนคำอธิบายอ่านเป็น "ของหายไปแล้ว" ซึ่งเป็นคนละเรื่อง (BR-CFL-16)
 */
import { useState } from 'react'
import { useT } from '@/i18n/LocaleProvider'
import Icon from '@/components/wrappers/Icon'
import { LIBRARY_ICONS, libraryTileAriaLabel } from '@/lib/customer-file-library'
import type { LibraryItem } from '@/services/customer-file-library.service'

/** ไอคอนของช่องไฟล์เอกสาร — bg-{semantic}/15 + -ink ตามเกณฑ์คอนทราสต์ของ Paces
 *  (ของเดิมใน ChatThread ATTACHMENT_ICON ใช้ `text-warning` เปล่าซึ่งตกเกณฑ์อยู่ก่อนแล้ว) */
const FILE_CHIP = 'bg-warning/15 text-warning-ink'

export default function CustomerFileTile({
  item,
  onOpen,
}: {
  item: LibraryItem
  onOpen: (item: LibraryItem) => void
}) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const label = libraryTileAriaLabel(item, t.inbox)
  const src = `/api/files/${item.fileId}`

  // aspect-4/5 เป็น fraction utility ของ Tailwind 4 (ไม่ใช่ arbitrary value) — precedent
  // PhotoAlbum.tsx ที่ใช้ aspect-* กับช่องอัลบั้มอยู่แล้ว
  const shell =
    'relative block w-full aspect-4/5 overflow-hidden rounded-lg bg-default-100 cursor-pointer'

  if (failed) {
    return (
      <button type="button" onClick={() => onOpen(item)} aria-label={`${label} — ${t.inbox.libraryMissingFile}`} className={shell}>
        <span className="text-default-700 flex size-full flex-col items-center justify-center gap-1 px-1 text-center">
          <Icon icon={LIBRARY_ICONS.missing} className="text-xl" aria-hidden="true" />
          <span className="text-2xs leading-tight">{t.inbox.libraryMissingFile}</span>
        </span>
      </button>
    )
  }

  if (item.kind === 'FILE') {
    return (
      <button type="button" onClick={() => onOpen(item)} aria-label={label} className={shell}>
        <span className="flex size-full flex-col items-center justify-center gap-1.5 px-1 text-center">
          <span className={`badge ${FILE_CHIP} rounded-lg p-2`}>
            <Icon icon={LIBRARY_ICONS.file} className="text-lg" aria-hidden="true" />
          </span>
          {/* min-w-0 + max-w-full ครบชุดคู่กับ truncate — ชื่อไฟล์ยาวต้องถูกตัด ไม่ใช่ดันกล่องเกินจอ
              (docs/conventions/flex-header-truncation.md — เกิดบน prod มาแล้ว 2026-08-12) */}
          <span className="text-default-700 text-2xs w-full max-w-full min-w-0 truncate leading-tight">
            {item.fileName?.trim() || 'ไฟล์แนบ'}
          </span>
        </span>
      </button>
    )
  }

  if (item.kind === 'VIDEO') {
    return (
      <button type="button" onClick={() => onOpen(item)} aria-label={label} className={shell}>
        {/* preload="metadata" ให้เฟรมแรกจริงมาฟรีจากเบราว์เซอร์ ไม่ต้องสร้าง thumbnail ฝั่ง server —
            ถ้าใช้ไอคอนเปล่าเหมือนไฟล์เอกสารจะแยกไม่ออกด้วยตา ทั้งที่วิดีโอมี "ภาพ" ให้ดูจริง */}
        <video src={src} preload="metadata" muted playsInline onError={() => setFailed(true)} className="size-full object-cover" />
        <span className="bg-dark/60 absolute end-1 bottom-1 flex size-5.5 items-center justify-center rounded-full text-white">
          <Icon icon={LIBRARY_ICONS.play} className="text-xs" aria-hidden="true" />
        </span>
      </button>
    )
  }

  return (
    <button type="button" onClick={() => onOpen(item)} aria-label={label} className={shell}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" />
    </button>
  )
}
