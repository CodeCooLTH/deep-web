'use client'

/**
 * PrivateReplyModal — โมดัลยืนยันข้อความก่อน "ทักแชท" จากคอมเมนต์ (feature 00038 Task 8)
 *
 * user report บน prod: "UI Modal แย่มาก" — ของเดิมใช้ SweetAlert2 (input:'textarea') แล้วยัด
 * คำเตือนที่สำคัญที่สุดไว้ใน `footer` ซึ่ง render ท้ายสุดเสมอ (ผู้ใช้กดปุ่มไปแล้วก่อนจะเห็น) บวกไม่มี
 * ไอคอน/ข้อความจัดกลาง/textarea ไม่ใช่สไตล์ Paces จริง — ต้นเหตุคือเลือก base ผิดตั้งแต่แรก:
 * โมดัลนี้มี textarea + ปุ่มกระทำ = ฟอร์มจริง ไม่ใช่ confirm dialog ที่ตอบแค่ใช่/ไม่ใช่ Hard Rule 1
 * (theme-copy) บังคับ copy จากธีมที่ "รูปร่างตรงกับสิ่งที่จะสร้าง" ไม่ใช่หยิบ Swal helper ที่ใกล้เคียง
 * ที่สุดในโค้ดเดิม
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ChatEditModal.tsx
 *   (โมดัล "Start New Chat" — ผู้รับ + textarea ข้อความ, card > card-header/card-body/card-footer,
 *   ปุ่มยกเลิกซ้าย-ยืนยันขวา `btn bg-light hover:text-primary` / `btn bg-primary text-white
 *   hover:bg-primary-hover`) — ตัดช่อง "ผู้รับ" ทิ้งเพราะรู้ผู้รับจากคอมเมนต์ที่กดมาแล้ว
 *
 * เปลือกโมดัล (controlled div แทน `data-hs-overlay`, Escape/focus-trap/backdrop-click/scroll-lock):
 * ยกจาก src/app/(paces)/seller/(dashboard)/expenses/components/ExpenseFormModal.tsx ที่ทำ
 * ChatEditModal-shape เดียวกันนี้ไว้ก่อนแล้ว (การ์ดกลางจอ + card-header/body/footer + bottom-sheet
 * บนมือถือ) — ต้อง controlled เพราะรับ props แบบไดนามิก (ชื่อคนคอมเมนต์/prefill ข้อความ) และคืน
 * ผลลัพธ์กลับ parent ตรง ๆ — `data-hs-overlay` ทำแบบนี้ไม่ได้ (Preline ยังพังเมื่อ re-render ด้วย
 * ดู feedback_filterdropdown_reusable) จึงต้องเรียก useLockBodyScroll เอง
 * (docs/conventions/overlay-scroll-lock.md — ไม่งั้นลากนิ้วบนมือถือแล้วหน้าข้างหลังเลื่อนตาม)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const MAX_LENGTH = 1000

type Props = {
  /** ชื่อคนคอมเมนต์จาก Facebook — JSX interpolate ตรง ๆ ได้ปลอดภัย (React escape ให้เอง ไม่ใช่ innerHTML) */
  fromName: string | null
  /** prefill จากข้อความสวิตช์ B ของเพจ (commentPrivateReplyText) — '' = ไม่มี */
  defaultValue: string
  /** true = กำลังยิง request อยู่ — ปิดปุ่ม/ห้ามปิดโมดัลกลางคัน */
  sending: boolean
  onClose: () => void
  onSend: (message: string) => void
}

export default function PrivateReplyModal({ fromName, defaultValue, sending, onClose, onSend }: Props) {
  const t = useT()
  // parent render โมดัลนี้ใต้ `{comment && <PrivateReplyModal/>}` เท่านั้น — mount = เปิดอยู่แล้ว
  useLockBodyScroll(true)

  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [value, setValue] = useState(defaultValue)
  const trimmed = value.trim()
  // เกินเพดานแล้วห้ามส่ง — Valibot ฝั่ง API กันอีกชั้นอยู่แล้ว (maxLength 1000) แต่ให้รู้ตั้งแต่
  // ก่อนกดดีกว่าโดนปฏิเสธหลังยิง เพราะ private reply ยิงพลาดแล้วเสียสิทธิ์ครั้งเดียวของคอมเมนต์นั้น
  const overLimit = value.length > MAX_LENGTH
  const invalid = trimmed.length === 0 || overLimit

  const dismiss = () => {
    if (sending) return
    onClose()
  }

  // sending ต้องอ่านผ่าน ref ใน keydown handler — ใส่เป็น dep ตรง ๆ จะทำให้ cleanup ยิงทุกครั้งที่
  // เริ่ม/จบการส่ง แล้ว previouslyFocused.focus() ดีดโฟกัสออกไปหลังโมดัลทั้งที่ยังเปิดอยู่ (ก็อปแพตเทิร์น
  // เดียวกับ ExpenseFormModal.tsx)
  const sendingRef = useRef(sending)
  sendingRef.current = sending

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // 🛑 โฟกัสไปที่ **ช่องพิมพ์** ไม่ใช่ "ตัวแรกที่โฟกัสได้"
    //
    // ตัวแรกใน DOM คือปุ่ม "ปิด" ที่หัวโมดัล — ผู้ใช้คีย์บอร์ดที่เปิดฟอร์มมาเพื่อพิมพ์จะลงที่ปุ่ม
    // ยกเลิกแทน (กด Enter = ปิดโมดัล ไม่ใช่เริ่มพิมพ์) และผู้ใช้เมาส์ก็เห็นคำเตือนสีแดงเหนือช่อง
    // ที่ยังไม่มีเคอร์เซอร์อยู่ในนั้น. โมดัลนี้มีเจตนาเดียวคือ "พิมพ์แล้วส่ง" จุดเริ่มจึงต้องเป็น
    // textarea เสมอ (impeccable critique 2026-08-09 — persona Sam)
    const textarea = dialogRef.current?.querySelector<HTMLElement>('#privateReplyText')
    ;(textarea ?? dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)[0])?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (sendingRef.current) return
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus()
    }
    // ผูกครั้งเดียวตอน mount — dep ว่างคือสิ่งที่ทำให้ cleanup ยิงตอนปิดโมดัลจริงเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSend = () => {
    if (invalid || sending) return
    onSend(trimmed)
  }

  const title = fromName ? fmt(t.comments.prTitleWithName, { name: fromName }) : t.comments.prTitle
  const scopeText = fromName
    ? fmt(t.comments.prScopeWithName, { name: fromName })
    : t.comments.prScope

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="privateReplyModalTitle"
      tabIndex={-1}
      className="size-full bg-dark/40 fixed top-0 start-0 z-80 flex items-end overflow-x-hidden overflow-y-auto sm:items-center sm:p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      {/* ขอบรอบโมดัลมาจาก sm:p-3 ที่ backdrop (ไม่ใช่ w-[calc()]) — เลี่ยง arbitrary value (HR7) */}
      <div className="w-full sm:mx-auto sm:max-w-lg">
        <div className="card max-h-dvh w-full flex-col overflow-hidden rounded-t-2xl sm:rounded-lg">
          {/* ที่จับลากบนมือถือ — บอกว่าแผ่นนี้เลื่อนขึ้นมาจากล่าง (ตกแต่งล้วน ซ่อนบนจอกว้าง) */}
          <div className="bg-default-300 mx-auto mt-2.5 h-1 w-9 rounded-full sm:hidden" aria-hidden="true" />

          <div className="card-header">
            <h3 id="privateReplyModalTitle" className="card-title flex items-center gap-1.5">
              <Icon icon="message-circle" className="text-base" aria-hidden="true" />
              {title}
            </h3>
            <button
              type="button"
              aria-label={t.common.close}
              onClick={dismiss}
              disabled={sending}
              className="btn btn-icon text-default-700 min-h-11 min-w-11 disabled:opacity-50"
            >
              <Icon icon="x" className="align-middle text-2xl" />
            </button>
          </div>

          <div className="card-body grid gap-4 overflow-y-auto overscroll-contain">
            {/* แถบเตือนย้ายมาอยู่เหนือช่องพิมพ์ — ของเดิมเป็น footer ของ Swal ซึ่ง render ท้ายสุดเสมอ
                ผู้ใช้กดปุ่มไปก่อนจะเห็น (user report prod "UI Modal แย่มาก") ตอนนี้เป็น element แรก
                ใน card-body ที่ตาเห็นก่อนช่องพิมพ์เสมอ ไม่ว่าจะพิมพ์ยาวแค่ไหน */}
            <div className="bg-danger/15 text-danger-ink flex items-start gap-2 rounded-lg p-3 text-start text-sm font-semibold">
              <Icon icon="alert-triangle" className="mt-0.5 shrink-0 text-base" aria-hidden="true" />
              <span>{t.comments.prOnceOnly}</span>
            </div>

            <p className="text-default-700 text-start text-sm">
              {fmt(t.comments.prWindowNote, { scope: scopeText })}
            </p>

            <div>
              <label htmlFor="privateReplyText" className="form-label">
                {t.comments.prMessageLabel}
              </label>
              {/* 🛑 ไม่ใช้ `maxLength` ตัดดิบ — ท่าเดียวกับหน้าตั้งค่า (CommentReplyClient) ซึ่งยอมให้
                  เกินแล้วเตือน: วางข้อความยาวมาแล้วค่อยตัดคือ workflow จริง ส่วน maxLength จะกลืน
                  ตัวอักษรท้าย ๆ เงียบ ๆ โดยผู้ใช้ไม่รู้ว่าหายไปกี่ตัว กฎเดียวกันต้องทำงานแบบเดียวกัน
                  ทั้งสองหน้า (impeccable critique 2026-08-09) */}
              <textarea
                id="privateReplyText"
                rows={3}
                placeholder={t.comments.prPlaceholder}
                className={`form-textarea ${overLimit ? 'is-invalid' : ''}`}
                value={value}
                disabled={sending}
                aria-describedby="privateReplyCounter"
                aria-invalid={overLimit || undefined}
                onChange={(e) => setValue(e.target.value)}
              />
              <p
                id="privateReplyCounter"
                className={`mt-1 text-end text-2xs ${overLimit ? 'text-danger-ink font-semibold' : 'text-default-700'}`}
              >
                {value.length} / {MAX_LENGTH}
              </p>
              {overLimit && (
                <p className="text-danger-ink mt-1 text-xs">
                  {fmt(t.comments.prTooLong, { n: MAX_LENGTH.toLocaleString('th-TH') })}
                </p>
              )}
            </div>
          </div>

          <div
            className="card-footer flex items-center justify-end gap-2"
            /* carve-out safe-area (HR7): แผ่นนี้ชิดขอบล่างจอบนมือถือ ต้องเผื่อ home indicator ของ iOS
               ไม่มี token Paces แทนได้เพราะค่ามาจากตัวเครื่อง — precedent: ExpenseFormModal.tsx */
            style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={dismiss}
              disabled={sending}
              className="btn bg-light text-dark hover:bg-light-hover min-h-11 disabled:opacity-60"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={invalid || sending}
              className="btn bg-primary hover:bg-primary-hover min-h-11 inline-flex items-center gap-1.5 text-white disabled:opacity-60"
            >
              {sending ? (
                <>
                  <Icon icon="loader-2" className="animate-spin" aria-hidden="true" />
                  {t.comments.sending}
                </>
              ) : (
                <>
                  <Icon icon="send" aria-hidden="true" />
                  {t.comments.prSend}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
