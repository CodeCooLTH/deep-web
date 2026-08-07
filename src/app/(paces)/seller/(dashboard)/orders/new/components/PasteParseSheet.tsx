'use client'

/**
 * PasteParseSheet — bottom sheet วางข้อความจากแชท → parse ชื่อ/เบอร์/ที่อยู่ (quick create < lg)
 * Base: mockup 2026-07-06-quick-create-order.html (frame "ปุ่ม magic → วางจากแชท") + sheet shell (QuickPriceSheet)
 * mini bubble "วางจากคลิปบอร์ด" ลอยกลางล่าง textarea — โชว์เมื่อ clipboard มีข้อความ; กด/โฟกัส/พิมพ์ → หาย
 */

import { useState, useEffect, useRef } from 'react'
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll'
import Icon from '@/components/wrappers/Icon'
import { parseOrderMessage, type ParsedOrderMessage } from '@/lib/parse-order-message'

interface Props {
  open: boolean
  onApply: (parsed: ParsedOrderMessage) => void
  onClose: () => void
  /**
   * ข้อความตั้งต้นในช่อง — ใช้เมื่อชีตถูกเปิดจาก "สร้างคำสั่งซื้อจากข้อความในแชท" แล้วกระจายได้ไม่ครบ
   * (user สั่ง 2026-08-04) ร้านจะได้แก้ต่อจากของเดิม ไม่ต้องออกไปก๊อปข้อความกลับมาวางใหม่
   */
  initialText?: string
}

export default function PasteParseSheet({ open, onApply, onClose, initialText }: Props) {
  /**
   * ตรึง scroll หน้าข้างหลังระหว่างเปิด — sheet ประกอบเองด้วย React state ไม่ได้ล็อกฟรีแบบ
   * hs-overlay (docs/conventions/overlay-scroll-lock.md) · ต้องเรียกก่อน `if (!open) return null`
   */
  useLockBodyScroll(open)

  const [text, setText] = useState(initialText ?? '')
  // ขอ AI ช่วยอ่านที่อยู่ (opt-in — ร้านต้องกดเอง ดูเหตุผลที่ปุ่มด้านล่าง)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // bubble "วางจากคลิปบอร์ด" โชว์เสมอตอนเปิด — ไม่อ่าน clipboard ตอนเปิด
  // (proactive readText เด้ง OS "Paste" permission popup บนมือถือ); อ่านจริงตอน user แตะ bubble = user gesture.
  // parent ใส่ key ให้ remount ทุกครั้งที่เปิด → state เริ่มสด (text='' / showBubble=true) โดยไม่ setState ใน effect
  const [showBubble, setShowBubble] = useState(!initialText)
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
      <div
        className={'fixed inset-x-0 bottom-0 z-80 flex h-[50dvh] flex-col rounded-t-2xl border-t border-default-300 bg-card' /* HR7: inset-x-0 bottom-0 + h-[50dvh] = viewport-lock, Paces ไม่มี token — sheet สูงครึ่งจอ */}
        role="dialog"
        aria-label="วางข้อความจากแชท"
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-default-300" aria-hidden="true" />
        </div>
        <div className={'flex min-h-0 flex-1 flex-col px-5 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))]' /* carve-out: safe-area ไม่มี token */}>
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

          {aiError && (
            <p className="text-danger mt-2 shrink-0 text-xs" role="alert">
              {aiError}
            </p>
          )}
          <div className="mt-3 flex shrink-0 gap-2">
            <button
              type="button"
              disabled={!text.trim() || aiLoading}
              onClick={() => onApply(parseOrderMessage(text))}
              className="btn min-h-11 flex-1 bg-primary font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              แยกข้อมูล → เติมให้
            </button>
            {/**
             * ปุ่ม AI เป็น opt-in ที่ร้านต้องกดเอง ไม่ใช่ fallback อัตโนมัติ (user เคาะ 2026-08-04)
             *
             * เหตุผลไม่ใช่เรื่องเทคนิค: ข้อความก้อนนี้มีเบอร์โทรและที่อยู่ของลูกค้า ซึ่งโปรเจกต์มี
             * ข้อตกลงห้ามส่งเข้าโมเดลภาษา (feature 00019 ข้อ 3 / BR-AI-09) — การกดปุ่มนี้คือการที่
             * "คนของร้านตัดสินใจส่งข้อความก้อนนี้ออกไปเอง" ไม่ใช่ระบบส่งให้เงียบ ๆ ทุกครั้งที่ parser
             * พลาด. ส่งเฉพาะข้อความก้อนนี้ ไม่มีบริบทร้าน/ประวัติแชทติดไปด้วย
             */}
            <button
              type="button"
              disabled={!text.trim() || aiLoading}
              onClick={async () => {
                setAiError(null)
                setAiLoading(true)
                try {
                  const res = await fetch('/api/orders/parse-address', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ text }),
                  })
                  const body = (await res.json().catch(() => null)) as
                    | { parsed?: ParsedOrderMessage; error?: string }
                    | null
                  if (!res.ok || !body?.parsed) {
                    setAiError(body?.error ?? 'AI อ่านไม่สำเร็จ ลองแก้ในช่องแล้วกดแยกข้อมูลเองได้')
                    return
                  }
                  onApply(body.parsed)
                } catch {
                  setAiError('เชื่อมต่อไม่สำเร็จ ลองอีกครั้ง')
                } finally {
                  setAiLoading(false)
                }
              }}
              className="btn bg-default-100 text-default-800 hover:bg-default-200 min-h-11 shrink-0 gap-1.5 px-3 font-semibold disabled:opacity-50"
            >
              <Icon icon={aiLoading ? 'loader-2' : 'sparkles'} className={`size-4 ${aiLoading ? 'animate-spin' : ''}`} />
              {aiLoading ? 'กำลังอ่าน' : 'ใช้ AI ช่วยอ่าน'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
