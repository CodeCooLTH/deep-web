'use client'

/**
 * AttachmentPreviewSheet — ชีตเต็มจอ "ไฟล์ที่จะส่ง" บนมือถือ (<768px) ในห้องแชทผู้ขาย
 *
 * user สั่ง 2026-08-14 (ส่งภาพ Messenger iOS มาอ้างอิง): "slide up grid view ดูรูปแล้ว select
 * จากนั้นให้มีปุ่ม ส่งลอยขึ้นมาเพื่อกดเลย"
 *
 * Base (เปลือกชีต + ปุ่มปิด + popstate + ESC + safe-area + footer ติดล่างจอ):
 *   src/components/safepay/appointment-board/AppointmentDaySheet.tsx
 *   ซึ่ง chase ต่อไปที่ OrderQrSheet.tsx → theme/paces/Admin/TS/src/app/(admin)/ui/offcanvas/page.tsx
 * Base (กริด 3 คอลัมน์ + ช่องไฟล์ที่พรีวิวไม่ได้): CustomerFileLibraryModal.tsx:161 + CustomerFileTile.tsx
 *
 * 🛑 นี่คือชีต "พรีวิวหลังเลือกไฟล์กลับมาแล้ว" ไม่ใช่ตัวเปิดดูคลังรูปในเครื่อง — เว็บไม่มี API
 * ให้ JS อ่านคลังรูปมาวาดกริดเองได้เลย (ทั้งในเบราว์เซอร์และใน WebView) ขั้นตอนเลือกไฟล์จึงยังเป็น
 * picker ของ OS เสมอ. อย่าพยายามทำครึ่งบนของภาพอ้างอิง (กริดคลังรูป/Recents/HD) — ต้องใช้ native
 *
 * 🛑 ไม่มีช่องพิมพ์ในชีต (user เคาะ) — แต่ข้อความที่พิมพ์ค้างไว้ที่ composer **ติดไปกับการกดส่ง
 * เสมอ** เพราะ onSend เรียก handleSend() ตัวเดิม ⇒ ต้องโชว์บรรทัดอ่านอย่างเดียวบอกไว้ ไม่งั้น
 * ผู้ขายจะส่งข้อความที่ลืมไปแล้วออกไปโดยไม่รู้ตัว (ชีตบังช่องพิมพ์อยู่ มองไม่เห็นด้วยตาเอง)
 */

import { useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { attachmentDisplayName, formatAttachmentSize, type AttachmentKind } from '@/lib/chat-attachment'
import {
  pendingKind,
  type PendingAttachment,
} from '@/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread'

/**
 * ชิปไอคอนของไฟล์ที่ไม่มีอะไรให้พรีวิว
 *
 * 🛑 ห้าม copy `ATTACHMENT_ICON` จาก ChatThread.tsx มาตรง ๆ — ตัวนั้นใช้ `text-warning`/`text-success`
 * เปล่า (ไม่มี `-ink`) ซึ่งตกเกณฑ์คอนทราสต์อยู่ก่อนแล้ว. ตัวที่ถูกคือคู่ `bg-{semantic}/15` +
 * `text-{semantic}-ink` ตาม CustomerFileTile.tsx:24 ซึ่งอยู่โฟลเดอร์เดียวกันและยอมรับเรื่องนี้ไว้เอง
 * ในคอมเมนต์ — โฟลเดอร์นี้มีทั้งเวอร์ชันถูกและผิด ต้องหยิบตัวที่ถูก
 */
const PREVIEW_CHIP: Record<AttachmentKind, { icon: string; cls: string }> = {
  IMAGE: { icon: 'photo', cls: 'bg-info/15 text-info-ink' },
  VIDEO: { icon: 'video', cls: 'bg-primary/15 text-primary-ink' },
  AUDIO: { icon: 'volume', cls: 'bg-success/15 text-success-ink' },
  FILE: { icon: 'file-text', cls: 'bg-warning/15 text-warning-ink' },
}

type Props = {
  items: PendingAttachment[]
  /** ข้อความที่ค้างอยู่ในช่องพิมพ์ (trim แล้ว) — '' = ไม่มี */
  caption: string
  uploadProgress: { done: number; total: number } | null
  uploading: boolean
  sending: boolean
  composerDisabled: boolean
  /** เหตุผลที่ส่งไม่ได้ตอนนี้ — ชีตไม่มี textarea จึงไม่มี placeholder ให้พูดแทน */
  disabledReason: string | null
  /** ชื่อสำหรับ AT ของปุ่มส่ง — ต้องเป็นชุดเดียวกับปุ่มส่งของ composer (โควตา LINE ฯลฯ) */
  sendAriaLabel: string
  /** วงแหวนสีสถานะโควตาบนปุ่มส่ง — non-LINE ส่ง '' มา */
  quotaRingClass: string
  onFileChange: React.ChangeEventHandler<HTMLInputElement>
  onRemove: (fileId: string) => void
  onSend: () => void
  onClose: () => void
}

export default function AttachmentPreviewSheet({
  items,
  caption,
  uploadProgress,
  uploading,
  sending,
  composerDisabled,
  disabledReason,
  sendAriaLabel,
  quotaRingClass,
  onFileChange,
  onRemove,
  onSend,
  onClose,
}: Props) {
  const t = useT()
  useLockBodyScroll(true)

  /**
   * ปุ่ม back ของเครื่อง = ปิดชีต ไม่ใช่ออกจากห้องแชท
   *
   * cleanup ต้องเช็ค `history.state` ก่อนเรียก `back()` — ถ้าชีตปิดเพราะผู้ใช้กดส่งแล้วมีการนำทาง
   * ต่อ (Next เขียน state ของตัวเองทับ) การเรียก back() จะย้อนการนำทางนั้นทิ้ง
   * (ท่าเดียวกับ AppointmentDaySheet.tsx:83-92)
   */
  const onCloseRef = useRef(onClose)
  // เขียนใน effect ไม่ใช่ระหว่าง render (กฎ react-hooks/refs) — ค่าเริ่มต้นถูกต้องอยู่แล้วจาก
  // useRef(onClose) จึงไม่มีช่วงที่ ref ชี้ของเก่าตอน mount
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    window.history.pushState({ __attachSheet: true }, '')
    const onPop = () => onCloseRef.current()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      const state = window.history.state as { __attachSheet?: boolean } | null
      if (state?.__attachSheet) window.history.back()
    }
  }, [])

  // ESC ปิด (เหมือนทุก overlay ในแอป)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const addDisabled = composerDisabled || uploading || sending
  const sendDisabled = composerDisabled || sending || uploading

  return (
    <div
      /* z-80 = ชั้น overlay เต็มจอ (precedent CustomerPanelSheet/OrderQrSheet — Paces ไม่มี token)
         pt = safe-area: ชีตทับหัวแอป หัวชีตจะไปนอนใต้รอยบากถ้าไม่เว้น
         md:hidden = ด่านที่สองคู่กับ isMobileComposer ฝั่งผู้เรียก — ถ้า matchMedia ยังไม่ทัน sync
         (เช่นเปลี่ยนขนาดหน้าต่างเร็ว ๆ) CSS ยังกันไม่ให้ชีตโผล่บนเดสก์ท็อปได้อยู่
         ทั้งสองอย่างเป็น carve-out HR7: Paces ไม่มี token ให้ทั้ง z ชั้น overlay และ safe-area */
      className="bg-card fixed inset-0 z-80 flex flex-col pt-[env(safe-area-inset-top)] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t.inbox.attachSheetTitle}
    >
      {/* ── หัวชีต ─────────────────────────────────────────────────────────── */}
      <div className="border-default-200 flex shrink-0 items-center gap-2.5 border-b px-3 py-2">
        {/* ชีตทับหัวแอปทั้งหมด ⇒ ปุ่มนี้คือทางออกเดียวที่ "มองเห็น" (back ของเครื่องเป็นทางสำรอง
            ที่มองไม่เห็น) — ต้องมีพื้นรอง ไม่ใช่ไอคอนลอย ๆ ที่อ่านเป็นของตกแต่ง */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t.inbox.attachSheetClose}
          className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 min-w-11 shrink-0 rounded-lg"
        >
          <Icon icon="x" className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="text-dark truncate text-base font-semibold">{t.inbox.attachSheetTitle}</p>
          {/* สปินเนอร์เปล่าบอกได้แค่ "กำลังทำอะไรอยู่" ซึ่งไม่พอเมื่อคิวมี 8 ไฟล์และแต่ละไฟล์ใช้เวลา
              ไม่เท่ากัน (ร้านจะไม่รู้ว่าค้างหรือกำลังไป) — ข้อความเดียวกับที่แถวเครื่องมือใช้ */}
          {uploadProgress && uploadProgress.total > 1 ? (
            <p className="text-default-700 text-xs" aria-live="polite">
              {fmt(t.inbox.attachUploading, {
                done: String(uploadProgress.done + 1),
                total: String(uploadProgress.total),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── กริดพรีวิว ─────────────────────────────────────────────────────── */}
      {/* overscroll-contain: ชีตประกอบเองด้วย React state — ขาดตัวนี้แล้วลากนิ้วในชีตจะดึงหน้า
          ข้างหลังตาม (overlay-scroll-lock.md)
          🛑 overflow-x-hidden ไม่ใช่ของประดับ: `overflow-y-auto` ทำให้แกน x กลายเป็น `auto` ตาม
          สเปก CSS โดยอัตโนมัติ ⇒ ชื่อไฟล์ยาวที่ล้นแม้พิกเซลเดียวจะทำให้ทั้งกริดเลื่อนข้างได้
          (flex-header-truncation.md — เกิดบน prod มาแล้ว 2026-08-12) */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3">
        <div className="grid grid-cols-3 gap-1">
          {items.map((att, i) => {
            const kind = pendingKind(att)
            const label = att.name ?? attachmentDisplayName(att.fileId)
            const size = formatAttachmentSize(att.size)
            return (
              <div
                key={att.fileId}
                /* aspect-square = กริด camera roll ที่ผู้ใช้คุ้นจากภาพอ้างอิง (ไม่ใช่ aspect-4/5
                   ของ CustomerFileTile ซึ่งเป็นการ์ดในคลังไฟล์ คนละบริบท) */
                className="bg-default-100 relative aspect-square overflow-hidden rounded-lg"
              >
                {kind === 'IMAGE' && att.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={att.previewUrl} alt={label} className="size-full object-cover" />
                ) : kind === 'VIDEO' && att.previewUrl ? (
                  <>
                    <video src={att.previewUrl} className="size-full object-cover" muted playsInline />
                    <span className="bg-dark/60 absolute bottom-1 start-1 flex size-5.5 items-center justify-center rounded-full text-white">
                      <Icon icon="player-play-filled" className="text-xs" aria-hidden="true" />
                    </span>
                  </>
                ) : (
                  /* เอกสาร/เสียงไม่มีอะไรให้ดู — กรอบเทาเปล่าบอกไม่ได้เลยว่าแนบอะไรไป */
                  <div className="flex size-full flex-col items-center justify-center gap-1.5 px-1.5 text-center">
                    <span className={`badge ${PREVIEW_CHIP[kind].cls} rounded-lg p-2`}>
                      <Icon icon={PREVIEW_CHIP[kind].icon} className="text-lg" aria-hidden="true" />
                    </span>
                    {/* min-w-0 + max-w-full ครบชุดคู่กับ truncate — ชื่อไฟล์ยาวต้องถูกตัด
                        ไม่ใช่ดันกล่องเกินจอ */}
                    <span className="text-default-700 text-2xs w-full max-w-full min-w-0 truncate leading-tight">
                      {label}
                    </span>
                    {size ? <span className="text-default-700 text-2xs">{size}</span> : null}
                  </div>
                )}
                {/* 36px (size-9) ตาม precedent ปุ่มลบบนรูปทั้งแอป (ProductImagesCardV2) — ต่ำกว่า
                    เกณฑ์ 44px โดยรู้ตัว: เป็น action รอง ย้อนกลับได้ในคลิกเดียว และอยู่บนช่องที่
                    ใหญ่พอ (~96px ที่ 320px) ไม่ใช่ปุ่มหลักของจอ
                    bg-dark/60 ไม่ใช่ bg-black/50 — overlay ผสมหมึกตาม Impeccable (ตรงกับ
                    CustomerFileTile/PhotoAlbum ในโฟลเดอร์เดียวกัน) */}
                <button
                  type="button"
                  onClick={() => onRemove(att.fileId)}
                  aria-label={fmt(t.inbox.attachRemove, { name: label || `${i + 1}` })}
                  className="bg-dark/60 hover:bg-dark/80 absolute end-1 top-1 flex size-9 items-center justify-center rounded-full text-white"
                >
                  <Icon icon="x" className="size-4" aria-hidden="true" />
                </button>
              </div>
            )
          })}

          {/* ช่อง "เพิ่มไฟล์" ท้ายกริดเสมอ — ไฟล์ใหม่ merge เข้าคิวเดิม ไม่เปิดชีตซ้อนชีต
              🛑 ไม่มี accept โดยตั้งใจ (ต่างจากปุ่ม "รูปภาพ" ในแถวเครื่องมือ): ในชีตนี้ผู้ขายกำลัง
              ประกอบชุดไฟล์ที่ปนกันได้อยู่แล้ว และ Safari บางเวอร์ชันซ่อนไฟล์บางชนิดเมื่อเจอ accept
              แบบ wildcard (เหตุผลเดียวกับปุ่มแนบไฟล์เดิมใน ChatThread.tsx)
              label มีข้อความ "เพิ่มไฟล์" อยู่ข้างใน จึงตั้งชื่อให้ <input> ที่มันครอบได้เอง
              ไม่ต้องมี aria-label (ต่างจากปุ่มไอคอนเปล่าในแถวเครื่องมือ) */}
          <label
            className={`border-primary/40 bg-primary/5 text-primary flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs font-medium ${
              addDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
            }`}
          >
            <input type="file" multiple className="hidden" onChange={onFileChange} disabled={addDisabled} />
            <Icon icon="plus" className="size-5" aria-hidden="true" />
            {t.inbox.attachSheetAddMore}
          </label>
        </div>
      </div>

      {/* ── แถบส่งติดล่างจอ ────────────────────────────────────────────────── */}
      {/* carve-out HR7: safe-area ไม่มี token — ปุ่มจะไปนอนใต้แถบ home indicator ถ้าไม่เว้น */}
      <div className="border-default-200 shrink-0 border-t p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {caption ? (
          <p className="text-default-700 mb-2 flex items-start gap-1.5 text-xs">
            <Icon icon="message-2" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2 min-w-0">{fmt(t.inbox.attachSheetCaption, { text: caption })}</span>
          </p>
        ) : null}
        {/* ปุ่มจางลงเฉย ๆ ไม่บอกอะไร — ชีตไม่มี placeholder ให้พูดแทนเหมือน composer */}
        {composerDisabled && disabledReason ? (
          <p className="text-default-700 mb-2 text-xs">{disabledReason}</p>
        ) : null}
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label={sendAriaLabel}
          className={`btn bg-primary hover:bg-primary-hover min-h-11 w-full gap-1.5 text-white disabled:opacity-60 ${quotaRingClass}`}
        >
          {fmt(t.inbox.attachSheetSend, { count: String(items.length) })}
          <Icon icon="send-2" className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
