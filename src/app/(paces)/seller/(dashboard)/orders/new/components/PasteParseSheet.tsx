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
  // bubble "วางจากคลิปบอร์ด" โชว์เสมอตอนเปิด — ไม่อ่าน clipboard ตอนเปิด
  // (proactive readText เด้ง OS "Paste" permission popup บนมือถือ); อ่านจริงตอน user แตะ bubble = user gesture.
  // parent ใส่ key ให้ remount ทุกครั้งที่เปิด → state เริ่มสด (text='' / showBubble=true) โดยไม่ setState ใน effect
  const [showBubble, setShowBubble] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // เวลาที่ sheet เพิ่งเปิด — กัน "click-through": tap ปุ่มเปิด sheet แล้ว synthetic click ตกลงบน dim
  // ที่ mount ใต้ปลายนิ้ว → onClose ทันที (มือถือ). ไม่รับ dismiss ภายใน ~350ms แรก
  const openedAtRef = useRef(0)

  useEffect(() => {
    if (!open) return
    openedAtRef.current = Date.now()
    // auto-focus textarea ตอนเปิด (bubble ยังโชว์ได้—ซ่อนเมื่อพิมพ์ ไม่ใช่แค่ focus)
    const ft = setTimeout(() => textareaRef.current?.focus(), 80)
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => {
      clearTimeout(ft)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose])

  // dismiss ผ่าน dim — กัน click-through ช่วง 350ms แรกหลังเปิด
  const handleDimClose = () => {
    if (Date.now() - openedAtRef.current > 350) onClose()
  }

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
      <div className="fixed inset-0 z-70 bg-dark/40" onClick={handleDimClose} aria-hidden="true" />
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
