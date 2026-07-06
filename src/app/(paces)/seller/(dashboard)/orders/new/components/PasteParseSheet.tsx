'use client'

/**
 * PasteParseSheet — bottom sheet วางข้อความจากแชท → parse ชื่อ/เบอร์/ที่อยู่ (quick create < lg)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "ปุ่ม magic → วางจากแชท") + sheet shell (QuickPriceSheet)
 * mini bubble "วางจากคลิปบอร์ด" ลอยกลางล่าง textarea — โชว์เมื่อ clipboard มีข้อความ; กด/โฟกัส/พิมพ์ → หาย
 */

import { useState, useEffect, useRef } from 'react'
import Icon from '@/components/wrappers/Icon'
import { parseOrderMessage, type ParsedOrderMessage } from '@/lib/parse-order-message'

interface Props {
  open: boolean
  onApply: (parsed: ParsedOrderMessage) => void
  onClose: () => void
}

export default function PasteParseSheet({ open, onApply, onClose }: Props) {
  const [text, setText] = useState('')
  const [showBubble, setShowBubble] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setShowBubble(false)
    // auto-focus textarea ตอนเปิด (bubble ยังโชว์ได้—ซ่อนเมื่อพิมพ์ ไม่ใช่แค่ focus)
    const ft = setTimeout(() => textareaRef.current?.focus(), 80)
    let cancelled = false
    // detect ว่า clipboard มีข้อความไหม (best-effort — unsupported/denied → ไม่โชว์ bubble, ไม่ crash)
    if (navigator.clipboard?.readText) {
      navigator.clipboard
        .readText()
        .then((t) => {
          if (!cancelled && t && t.trim()) setShowBubble(true)
        })
        .catch(() => {
          // อ่านไม่ได้ (permission/insecure) → โชว์ bubble ไว้ กด→ลองอีกที
          if (!cancelled) setShowBubble(true)
        })
    } else {
      // ไม่มี Clipboard API (dev http = insecure context; ต้อง https) → โชว์ bubble ไว้ (paste ทำงานบน prod https)
      setShowBubble(true)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => {
      cancelled = true
      clearTimeout(ft)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose])

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setText(t)
    } catch {
      /* ignore */
    }
    setShowBubble(false)
  }

  if (!open) return null

  return (
    <>
      {/* dim z-70 / sheet z-80 (reuse pattern QuickPriceSheet) */}
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={onClose} aria-hidden="true" />
      {/* HR7: fixed inset-x-0 bottom-0 + h-[50dvh] = viewport-lock (Paces ไม่มี token) — sheet สูงครึ่งจอ */}
      <div
        className="fixed inset-x-0 bottom-0 z-80 flex h-[50dvh] flex-col rounded-t-2xl border-t border-default-300 bg-card"
        role="dialog"
        aria-label="วางข้อความจากแชท"
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <h3 className="shrink-0 text-base font-semibold text-dark">วางข้อความจากแชท</h3>
          <p className="mt-0.5 mb-3 shrink-0 text-xs text-default-400">ระบบแยก ชื่อ / เบอร์ / ที่อยู่ ให้อัตโนมัติ (ตรวจแล้วแก้ได้)</p>

          <div className="relative min-h-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setShowBubble(false)
              }}
              placeholder={'พิมพ์/วางเอง เช่น\nเชาวลิต เอกกุล\n6ม.4 บ้านปุหรน ต.ช้างให้ตก อ.โคกโพธิ์\nจ.ปัตตานี 94120\nโทร 081-7971726'}
              className="form-input !h-full resize-none"
            />
            {/* mini bubble กลางล่าง textarea */}
            {showBubble && (
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-lg"
              >
                <Icon icon="clipboard" className="size-4" />
                วางจากคลิปบอร์ด
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => onApply(parseOrderMessage(text))}
            className="btn mt-3 min-h-11 w-full shrink-0 bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            แยกข้อมูล → เติมให้
          </button>
        </div>
      </div>
    </>
  )
}
