'use client'

/**
 * PasteParsePanel — desktop popover วางข้อความจากแชท → parse ชื่อ/เบอร์/ที่อยู่ (orders/new desktop parity S-1)
 * Base: CustomerQuickBlock.tsx (mobile precedent — trigger ~147-154, applyPaste ~106-119)
 *   + CustomerSelectBlock.tsx (popover skin: absolute right-0 top-full mt-2 z-30 bg-card border shadow-lg, ~180)
 * ต่างจากมือถือ (PasteParseSheet = full-screen bottom sheet): เป็น custom React popover ขนาด desktop
 * (useState + click-outside + Escape) ไม่ใช้ hs-dropdown (พังใน re-render context — paces-component-reference.md §3)
 * และไม่ reuse PasteParseSheet ตรง ๆ (ผิด pattern, OOS-5 ของ scope baseline)
 * reuse parseOrderMessage() ตรง ๆ (pure fn, src/lib/parse-order-message.ts) — logic layer เดียวกับมือถือ
 */

import { useEffect, useRef, useState } from 'react'
import type { UseFormSetValue } from 'react-hook-form'
import Icon from '@/components/wrappers/Icon'
import { parseOrderMessage } from '@/lib/parse-order-message'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>
}

export default function PasteParsePanel({ setValue }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // click-outside + Escape ปิด popover — custom React state (ไม่ใช้ hs-dropdown ตาม §3 คำเตือน)
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    // auto-focus textarea ตอนเปิด
    const ft = setTimeout(() => textareaRef.current?.focus(), 50)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(ft)
    }
  }, [open])

  const openPanel = () => {
    setText('')
    setOpen(true)
  }

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) setText(t)
    } catch {
      /* เงียบ — บาง browser/permission ไม่ให้อ่าน clipboard, seller พิมพ์/วางเองด้วยคีย์บอร์ดได้ */
    }
  }

  // field ที่ parse ไม่ได้ = undefined → ไม่ทับค่าเดิม (เหมือน CustomerQuickBlock.applyPaste)
  const applyParsed = () => {
    const p = parseOrderMessage(text)
    if (p.name) setValue('buyerName', p.name)
    if (p.phone) setValue('buyerContact', p.phone)
    if (p.addressLine) setValue('shippingAddress.line1', p.addressLine)
    if (p.subdistrict) setValue('shippingAddress.subdistrict', p.subdistrict)
    if (p.district) setValue('shippingAddress.district', p.district)
    if (p.province) setValue('shippingAddress.province', p.province)
    if (p.postcode) setValue('shippingAddress.postcode', p.postcode)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPanel}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
      >
        <Icon icon="clipboard" className="size-4" />
        วางจากแชท
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full z-30 mt-2 w-80 rounded border border-default-300 bg-card shadow-lg"
          role="dialog"
          aria-label="วางข้อความจากแชท"
        >
          <div className="flex items-center justify-between border-b border-dashed border-default-300 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-dark">
              <Icon icon="clipboard" className="size-4 text-primary" />
              วางข้อความจากแชท
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-default-400 hover:text-dark"
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          <div className="p-4">
            <p className="mb-2 text-xs text-default-400">
              ระบบแยก ชื่อ / เบอร์ / ที่อยู่ ให้อัตโนมัติ (ตรวจแล้วแก้ได้)
            </p>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'พิมพ์/วางเอง เช่น\nเชาวลิต เอกกุล\n6ม.4 บ้านปุหรน ต.ช้างให้ตก อ.โคกโพธิ์\nจ.ปัตตานี 94120\nโทร 081-7971726'}
              rows={6}
              className="form-textarea w-full resize-none"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="btn btn-sm text-primary hover:bg-primary hover:text-white"
              >
                วางจากคลิปบอร์ด
              </button>
              <button
                type="button"
                disabled={!text.trim()}
                onClick={applyParsed}
                className="btn bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
              >
                แยกข้อมูล → เติมให้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
