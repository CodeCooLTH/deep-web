'use client'

/**
 * CustomerFileViewer — ตัวเปิดดูไฟล์ในคลัง (feature 00048) ใช้ร่วมทั้งพรีวิวในแผงและโมดัลดูทั้งหมด
 *
 * 2 ทางตามชนิดไฟล์ (มติ Q36) — **ไม่ใช่เพราะขี้เกียจ แต่เพราะชุดสไลด์ของ Lightbox ในโปรเจกต์นี้
 * ไม่มี slide ชนิดวิดีโอเลย** (imageSlides ใน ChatThread สร้างจาก type='IMAGE' + cards เท่านั้น):
 *   - IMAGE  → Lightbox ตัวเดียวกับเธรด แต่ slides = **เฉพาะรูปในคลัง** ไม่ปนรูปทั้งเธรด
 *   - VIDEO/FILE/ไฟล์หาย → การ์ดรายละเอียดสไตล์ Paces (พื้นสว่าง) ที่เล่นวิดีโอ/เปิดไฟล์ได้
 *
 * 🛑 แถบรายละเอียดใน Lightbox เป็นตัวหนังสือขาวบนพื้นเข้ม ต่อเนื่องจากปุ่ม Zoom/Download เดิม
 * (Photo-Scrim Exception ของ Impeccable) — การ์ด Paces สีขาวลอยกลางจอมืดคือ "การ์ดซ้อนบนพื้น
 * ที่ไม่ใช่การ์ด" ซึ่งผิดหลักมากกว่า (ผู้ใช้เคาะ 2026-08-13)
 */
import { useEffect, useMemo, useState } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import LightboxDownload from 'yet-another-react-lightbox/plugins/download'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesEditTextFields } from '@/lib/paces-swal'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { formatDateTH } from '@/lib/format-date'
import {
  LIBRARY_ICONS,
  LIBRARY_NAME_MAX,
  LIBRARY_NOTE_MAX,
  librarySenderLabel,
} from '@/lib/customer-file-library'
import { formatAttachmentSize } from '@/lib/chat-attachment'
import type { LibraryItem } from '@/services/customer-file-library.service'

/**
 * ขอให้เธรดกระโดดไปข้อความต้นทาง — ผ่าน CustomEvent เพราะแผงลูกค้ากับเธรดเป็น **พี่น้องกัน**
 * บนเดสก์ท็อป (คนละ subtree) การส่ง prop ลงมาต้องลากผ่าน page.tsx แล้วยังไม่ครอบโหมด sheet
 * บนมือถือที่แผงอยู่ *ข้างใน* เธรดอีก — event ทำงานเหมือนกันทั้งสองทรง
 */
export const JUMP_TO_MESSAGE_EVENT = 'deep:jump-to-message'
export function requestJumpToMessage(messageId: string) {
  window.dispatchEvent(new CustomEvent(JUMP_TO_MESSAGE_EVENT, { detail: { messageId } }))
}

type Props = {
  conversationId: string
  items: LibraryItem[]
  active: LibraryItem | null
  onClose: () => void
  onRemoved: (fileId: string) => void
  onPatched: (item: LibraryItem) => void
}

async function callPatch(conversationId: string, fileId: string, name: string, note: string) {
  const res = await fetch(`/api/chat/conversations/${conversationId}/library`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, fileName: name, note }),
  })
  if (!res.ok) throw new Error('patch failed')
  return (await res.json()) as { item: LibraryItem }
}

async function callRemove(conversationId: string, fileId: string) {
  const res = await fetch(
    `/api/chat/conversations/${conversationId}/library?fileId=${encodeURIComponent(fileId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error('remove failed')
}

/** แถวข้อมูล "ส่งโดย / เก็บโดย" — ใช้ทั้งใน Lightbox (โทนเข้ม) และการ์ด (โทนสว่าง) */
function MetaLines({ item, tone }: { item: LibraryItem; tone: 'dark' | 'light' }) {
  const t = useT()
  const l1 = tone === 'dark' ? 'text-white/95' : 'text-default-900'
  const l2 = tone === 'dark' ? 'text-white/70' : 'text-default-700'
  return (
    <>
      <p className={`text-xs ${l1}`}>
        {fmt(t.inbox.librarySentBy, { who: librarySenderLabel(item, t.inbox), when: formatDateTH(item.sentAt) })}
      </p>
      <p className={`mt-0.5 text-xs ${l2}`}>
        {fmt(t.inbox.librarySavedBy, {
          who: item.savedByName?.trim() || t.inbox.librarySavedByFallback,
          when: formatDateTH(item.savedAt),
        })}
      </p>
      {item.note ? <p className={`mt-1.5 text-xs ${l2}`}>{item.note}</p> : null}
    </>
  )
}

export default function CustomerFileViewer({
  conversationId,
  items,
  active,
  onClose,
  onRemoved,
  onPatched,
}: Props) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const isImage = active?.kind === 'IMAGE'
  // การ์ด (วิดีโอ/เอกสาร) เป็น overlay ที่เราประกอบเอง → ต้องล็อก scroll เอง
  // (Lightbox ล็อกให้เองอยู่แล้ว จึงเปิดเฉพาะกรณีการ์ด)
  useLockBodyScroll(Boolean(active) && !isImage)

  const imageItems = useMemo(() => items.filter((i) => i.kind === 'IMAGE'), [items])
  const slides = useMemo(
    () =>
      imageItems.map((i) => ({
        src: `/api/files/${i.fileId}`,
        download: { url: `/api/files/${i.fileId}`, filename: i.fileName?.trim() || 'image' },
        libraryItem: i,
      })),
    [imageItems],
  )
  const index = active ? imageItems.findIndex((i) => i.fileId === active.fileId) : -1

  async function handleEdit(item: LibraryItem) {
    const input = await pacesEditTextFields({
      title: t.inbox.libraryEditTitle,
      nameLabel: t.inbox.libraryEditNameLabel,
      noteLabel: t.inbox.libraryEditNoteLabel,
      notePlaceholder: t.inbox.libraryEditNotePlaceholder,
      nameValue: item.fileName ?? '',
      noteValue: item.note ?? '',
      nameMaxLength: LIBRARY_NAME_MAX,
      noteMaxLength: LIBRARY_NOTE_MAX,
      confirmButtonText: t.inbox.libraryEditSubmit,
      cancelButtonText: t.inbox.libraryCancel,
    })
    if (!input) return
    setBusy(true)
    try {
      const { item: updated } = await callPatch(conversationId, item.fileId, input.name, input.note)
      onPatched(updated)
      pacesToast.success(t.inbox.libraryEditSaved)
    } catch {
      pacesToast.error(t.inbox.librarySaveFailed)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(item: LibraryItem) {
    setBusy(true)
    try {
      await callRemove(conversationId, item.fileId)
      onRemoved(item.fileId)
      onClose()
      pacesToast.success(t.inbox.libraryRemovedToast)
    } catch {
      pacesToast.error(t.inbox.libraryRemoveFailed)
    } finally {
      setBusy(false)
    }
  }

  function handleSeeInChat(item: LibraryItem) {
    if (!item.sourceMessageId) return
    onClose()
    requestJumpToMessage(item.sourceMessageId)
  }

  if (!active) return null

  // ── รูป → Lightbox เดิมของโปรเจกต์ ────────────────────────────────────────
  if (isImage && index >= 0) {
    return (
      <Lightbox
        slides={slides}
        open
        index={index}
        close={onClose}
        controller={{ closeOnBackdropClick: true }}
        plugins={[Zoom, LightboxDownload]}
        labels={{ Previous: 'รูปก่อนหน้า', Next: 'รูปถัดไป', Close: 'ปิด', 'Zoom in': 'ขยาย', 'Zoom out': 'ย่อ', Download: 'ดาวน์โหลด' }}
        render={{
          slideFooter: ({ slide }) => {
            const it = (slide as { libraryItem?: LibraryItem }).libraryItem
            if (!it) return null
            return (
              <div className={'absolute inset-x-0 bottom-0 bg-black/55 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]' /* HR7 carve-out: safe-area ไม่มี token ใน Paces scale และแถบนี้ยึดขอบล่าง viewport โดยตรง */}>
                <MetaLines item={it} tone="dark" />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <LbButton icon="pencil" label={t.inbox.libraryEdit} disabled={busy} onClick={() => handleEdit(it)} />
                  {/* ปุ่ม "ดูในแชท" หายไปทั้งปุ่มเมื่อไม่รู้ต้นทาง — ปุ่มที่กดแล้วเงียบคือบั๊กที่ไม่มีอะไรฟ้อง */}
                  {it.sourceMessageId ? (
                    <LbButton icon="message" label={t.inbox.librarySeeInChat} onClick={() => handleSeeInChat(it)} />
                  ) : null}
                  <LbButton icon={LIBRARY_ICONS.remove} label={t.inbox.libraryUnsave} disabled={busy} onClick={() => handleRemove(it)} />
                </div>
              </div>
            )
          },
        }}
      />
    )
  }

  // ── วิดีโอ / เอกสาร / ไฟล์หาย → การ์ดรายละเอียด ────────────────────────────
  return <CustomerFileDetailCard item={active} busy={busy} onClose={onClose} onEdit={handleEdit} onRemove={handleRemove} onSeeInChat={handleSeeInChat} />
}

/** ปุ่มในแถบรายละเอียดของ Lightbox — โทนขาวบนพื้นเข้ม ไม่ใช่ btn ของ Paces (คนละพื้นหลัง) */
function LbButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 lg:min-h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs text-white hover:bg-white/25 disabled:opacity-50"
    >
      <Icon icon={icon} className="text-sm" aria-hidden="true" />
      {label}
    </button>
  )
}

/**
 * การ์ดรายละเอียดของวิดีโอ/ไฟล์เอกสาร (และรูปที่โหลดไม่ขึ้น)
 * Base: theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx (standard-modal, React-controlled)
 */
function CustomerFileDetailCard({
  item,
  busy,
  onClose,
  onEdit,
  onRemove,
  onSeeInChat,
}: {
  item: LibraryItem
  busy: boolean
  onClose: () => void
  onEdit: (i: LibraryItem) => void
  onRemove: (i: LibraryItem) => void
  onSeeInChat: (i: LibraryItem) => void
}) {
  const t = useT()
  const src = `/api/files/${item.fileId}`
  const [mediaFailed, setMediaFailed] = useState(false)
  const size = formatAttachmentSize(item.fileSize)

  /**
   * ESC ปิด — overlay ทุกใบในแอปนี้ปิดด้วย ESC ได้ (CustomerPanelSheet/OrderQrSheet/โมดัลคลัง)
   * และ Lightbox ก็ทำเอง การ์ดนี้เป็นทางเดียวที่ *ไม่* ทำ ⇒ ผู้ใช้ที่เคยชินจะกด ESC แล้วไม่มีอะไร
   * เกิดขึ้น ซึ่งอ่านเป็น "ค้าง" ไม่ใช่ "ปุ่มนี้ไม่มี"
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={t.inbox.librarySectionTitle}>
      {/* HR7 carve-out: z-80 = viewport overlay lock (precedent CustomerPanelSheet/OrderQrSheet) */}
      <button type="button" aria-label="ปิด" onClick={onClose} className="bg-default-900/40 absolute inset-0 backdrop-blur-xs" />
      <div className={'bg-card relative max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 shadow-lg lg:w-full lg:max-w-md lg:rounded-2xl lg:pb-5' /* HR7 carve-out: dvh + safe-area ไม่มี token ใน Paces scale — precedent CustomerPanelSheet.tsx บรรทัดเดียวกัน */}>
        <div className="flex items-start gap-2.5 px-4">
          <span className={`badge rounded-lg p-2 ${item.kind === 'VIDEO' ? 'bg-primary/15 text-primary-ink' : 'bg-warning/15 text-warning-ink'}`}>
            <Icon icon={item.kind === 'VIDEO' ? LIBRARY_ICONS.video : LIBRARY_ICONS.file} className="text-lg" aria-hidden="true" />
          </span>
          {/* min-w-0 ที่กล่อง + max-w-full ที่ลูก — ชุดที่ต้องมาด้วยกันกับ truncate เสมอ */}
          <div className="min-w-0 flex-1">
            <p className="text-default-900 max-w-full truncate text-sm font-semibold" title={item.fileName ?? undefined}>
              {item.fileName?.trim() || t.inbox.libraryFileFallbackName}
            </p>
            {size ? <p className="text-default-700 text-xs">{size}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="btn btn-icon text-default-700 hover:bg-default-100 shrink-0">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        {item.kind === 'VIDEO' && !mediaFailed ? (
          <div className="mt-3 px-4">
            <video src={src} controls playsInline onError={() => setMediaFailed(true)} className="max-h-64 w-full rounded-lg bg-black" />
          </div>
        ) : null}

        {mediaFailed ? (
          <div className="text-default-700 mt-3 flex flex-col items-center gap-1 px-4 py-6">
            <Icon icon={LIBRARY_ICONS.missing} className="text-2xl" aria-hidden="true" />
            <span className="text-xs">{t.inbox.libraryMissingFile}</span>
          </div>
        ) : null}

        <div className="mt-3 px-4">
          <MetaLines item={item} tone="light" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 px-4">
          {/* ไฟล์ที่หายแล้วต้องไม่มีปุ่มที่ทำไม่ได้จริง (BR-CFL-16) */}
          {!mediaFailed && (
            <>
              <a href={src} target="_blank" rel="noopener noreferrer" className="btn bg-primary text-white hover:bg-primary-hover">
                <Icon icon="external-link" className="me-1 text-base" aria-hidden="true" />
                {t.inbox.libraryOpenFile}
              </a>
              <a href={src} download={item.fileName ?? undefined} className="btn bg-light hover:text-default-800">
                <Icon icon="download" className="me-1 text-base" aria-hidden="true" />
                {t.inbox.libraryDownload}
              </a>
            </>
          )}
          <button type="button" disabled={busy} onClick={() => onEdit(item)} className="btn bg-light hover:text-default-800">
            <Icon icon="pencil" className="me-1 text-base" aria-hidden="true" />
            {t.inbox.libraryEdit}
          </button>
          {item.sourceMessageId ? (
            <button type="button" onClick={() => onSeeInChat(item)} className="btn bg-light hover:text-default-800">
              <Icon icon="message" className="me-1 text-base" aria-hidden="true" />
              {t.inbox.librarySeeInChat}
            </button>
          ) : null}
          {/* "เอาออกจากคลัง" ไม่ใช่การทำลายถาวร (ย้อนกลับได้ในคลิกเดียว) → ไม่ใช้สีอันตราย ไม่ต้อง confirm */}
          <button type="button" disabled={busy} onClick={() => onRemove(item)} className="btn bg-light text-default-700 hover:text-default-800 col-span-2">
            <Icon icon={LIBRARY_ICONS.remove} className="me-1 text-base" aria-hidden="true" />
            {t.inbox.libraryUnsave}
          </button>
        </div>
      </div>
    </div>
  )
}
