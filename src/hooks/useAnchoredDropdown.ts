'use client'

/**
 * useAnchoredDropdown — dropdown แบบ portal-to-body สำหรับ combobox/search-panel ที่อยู่ใน
 * scroll container ที่ตัด overflow (orders/new desktop POS: CartPanel `lg:overflow-y-auto` +
 * grid นอกสุด OrderCreateForm `lg:overflow-hidden`) — เดิม panel เป็น `absolute top-full` โดน
 * clip เมื่อเปิดใกล้ขอบล่าง, z-index แก้ไม่ได้เพราะ clip มาจาก overflow ของ ancestor ไม่ใช่ stacking
 *
 * ใช้ร่วม 3 จุดใน orders/new: ProductCombobox / CustomerSelectBlock / AddressSearchPanel
 * (เดิม copy โค้ด absolute+click-outside+escape ซ้ำกัน 3 ที่ — รวม logic ไว้ที่นี่จุดเดียว)
 *
 * Base: ไม่มี Paces theme source ตรง (portal-anchored dropdown ไม่มีใน theme/paces) — copy pattern
 *   portal+mounted-guard จาก in-repo precedent:
 *   - src/components/paces/ShopSwitchOverlay.tsx (mounted guard กัน SSR + createPortal ไป document.body)
 *   - src/app/(paces)/seller/(dashboard)/dashboard/components/AccountSwitcherSheet.tsx
 *     (portal เพราะ parent มี transform สร้าง containing block ให้ fixed)
 *
 * ตัดสินโดย Controller (2026-07-22):
 * - ไม่ reposition ตอน scroll/resize — ปิด panel แทน (ง่ายและสม่ำเสมอ กว่า reposition ทุกเฟรม)
 * - scroll listener แนบที่ window แบบ capture:true — scroll ของ descendant scrollable (เช่น
 *   CartPanel เอง) ไม่ bubble ขึ้น window แต่ capture phase ไล่จาก window ลงมาเสมอ จับได้ทุกจุด
 * - focus trap ในตัว: Tab/Shift+Tab วนเฉพาะ element ที่โฟกัสได้ใน panel, Escape ปิด + คืน focus
 *   ไปยัง trigger element ตัวแรกที่โฟกัสได้ใน anchor container
 *
 * การใช้งาน: ผูก anchorRef กับ div ที่เดิมมี `className="relative"` ครอบ trigger (ไม่ต้องมี
 * "relative" อีกต่อไป เพราะ panel ไม่ได้ position:absolute อิงมันแล้ว) ผูก panelRef กับ div
 * ของ panel ที่ createPortal ไป document.body พร้อมใส่ style ที่ hook คืนมา
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseAnchoredDropdownOptions {
  open: boolean
  onClose: () => void
}

export interface AnchoredStyle {
  position: 'fixed'
  top: number
  left: number
  width: number
}

export function useAnchoredDropdown({ open, onClose }: UseAnchoredDropdownOptions) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [style, setStyle] = useState<AnchoredStyle | null>(null)

  useLayoutEffect(() => setMounted(true), [])

  // คำนวณตำแหน่งตอนเปิด (ครั้งเดียวต่อการเปิด — ไม่ reposition ระหว่างเปิดค้าง)
  // useLayoutEffect กัน panel วาบตำแหน่ง (0,0) ก่อนขยับไปที่ถูกต้อง
  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // +4 = ระยะเดิมของ mt-1 (0.25rem) ระหว่าง anchor กับ panel
    setStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width })
  }, [open])

  // คืน focus ไป trigger ตัวแรกที่โฟกัสได้ใน anchor (ใช้ทั้งตอน Escape และปิดจาก scroll/resize)
  const focusAnchor = useCallback(() => {
    anchorRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
  }, [])

  // click-outside — ต้องเช็คทั้ง anchor (trigger, DOM tree เดิม) และ panel (portal ไป body คนละ tree)
  useLayoutEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // scroll(capture)/resize → ปิด panel เสมอ (ไม่ reposition) — capture:true ที่ window จับ
  // scroll ของ descendant scrollable ได้ด้วย (scroll ไม่ bubble แต่ capture ไล่จาก window ลงมา)
  useLayoutEffect(() => {
    if (!open) return
    const close = () => onClose()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // focus trap: Tab/Shift+Tab วนใน panel; Escape ปิด + คืน focus ไป trigger
  useLayoutEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        focusAnchor()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focusAnchor])

  return { anchorRef, panelRef, style, mounted }
}
