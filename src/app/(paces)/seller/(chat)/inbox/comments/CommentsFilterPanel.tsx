'use client'

/**
 * CommentsFilterPanel — ปุ่ม "ตัวกรอง" + popover เลือกเพจ ของแท็บความคิดเห็น
 *
 * Base: `../components/InboxFilterPanel.tsx` (ปุ่ม trigger + popover shell + ชิป + ปุ่มท้ายแผง)
 * ยกมาทั้งโครงเพื่อให้ปุ่มตัวกรองของสองแท็บเป็นของชิ้นเดียวกันในสายตาผู้ใช้ — user สั่ง 2026-08-04
 * "ใน tab ความคิดเห็น อยากให้ copy style มาจากฝั่งข้อความ … ควรมีตัวกรองเพิ่ม ในกรณีมีหลายเพจ
 * เพื่อไปกด modal"
 *
 * ทำไมไม่ import InboxFilterPanel มาใช้ตรง ๆ: ตัวนั้นผูกกับ ChatFilterState ทั้งก้อน (สถานะ/
 * ผูกลูกค้า/ซ่อน/แท็ก/พัสดุ/การอ่าน) ซึ่งฝั่งคอมเมนต์ไม่มีสักอย่าง — ส่งค่าปลอมเข้าไปเพื่อให้ compile
 * ผ่านจะกลายเป็นแผงที่มีหัวข้อกดไม่ได้เต็มไปหมด. ที่นี่มีหัวข้อเดียวจริง ๆ คือ "เพจ"
 *
 * พฤติกรรมที่ยกมาด้วยตั้งใจ (ต้องเหมือนฝั่งข้อความ ไม่ใช่แค่หน้าตา):
 *  - มีร่างก่อนกดใช้ — เลือกชิปแล้วยังไม่มีผลจนกด "ใช้ตัวกรอง" (การกรองยิง refetch ที่ server)
 *  - badge ตัวเลขบนปุ่มบอกว่า "มีกี่เรื่องที่กรองอยู่"
 *  - คลิกนอกแผง/Escape = ปิด และทิ้งร่าง
 */

import Icon from '@/components/wrappers/Icon'
import { useEffect, useRef, useState } from 'react'
import { ChannelBadgeOverlay } from '../components/ChannelBadge'
import { PageAvatar } from '../components/PageFilterDropdown'
import type { ChannelOption } from './CommentsClient'

type Props = {
  pageOptions: ChannelOption[]
  /** เพจที่กรองอยู่จริง — null = ทุกเพจ */
  value: string | null
  /** ยิงเมื่อกด "ใช้ตัวกรอง"/"ล้างตัวกรอง" เท่านั้น */
  onApply: (pageId: string | null) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CommentsFilterPanel({ pageOptions, value, onApply, open, onOpenChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // ร่าง — sync จากค่าจริงทุกครั้งที่เปิด ไม่ให้ค้างค่าที่เคยเลือกแล้วไม่ได้กดใช้จากรอบก่อน
  const [draftPage, setDraftPage] = useState<string | null>(value)
  useEffect(() => {
    if (open) setDraftPage(value)
  }, [open, value])

  const activeCount = value ? 1 : 0

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', onKey)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    // ไม่มี `relative` ที่ root โดยตั้งใจ — popover อ้างอิง "แถวตัวกรอง" ของ CommentsClient
    // (inset-x-0 = กว้างเท่าแถวพอดี ไม่ล้นคอลัมน์รายการ/ขอบจอมือถือ) เหมือน InboxFilterPanel
    <div ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`btn btn-sm bg-card inline-flex items-center gap-2 border ${
          activeCount > 0 || open ? 'border-primary text-primary' : 'border-default-300 text-default-800'
        }`}
      >
        <Icon icon="adjustments-horizontal" className="size-4" />
        ตัวกรอง
        {activeCount > 0 && (
          <span className="badge bg-primary text-2xs rounded-full px-1.5 text-white">{activeCount}</span>
        )}
        <Icon icon={open ? 'chevron-up' : 'chevron-down'} className="size-3.5" />
      </button>

      {open && (
        <div
          className="border-default-300 bg-card absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg"
          role="menu"
        >
          <div className="border-default-200 flex items-center justify-between border-b px-3 py-2">
            <span className="text-default-800 text-sm font-semibold">ตัวกรอง</span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-default-700 hover:text-default-800 flex size-6 items-center justify-center rounded"
              aria-label="ปิด"
            >
              <Icon icon="x" className="size-4" />
            </button>
          </div>

          {/* max-h + scroll: ร้านที่เชื่อมเพจไว้หลายสิบเพจต้องยังกดปุ่มท้ายแผงได้
              (บั๊กเดียวกับที่เจอในแผงของแท็บข้อความ 2026-07-31) */}
          <div className="max-h-96 overflow-y-auto p-3">
            <p className="text-default-700 mb-2 text-xs font-medium">เพจ</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={draftPage === null} label="ทุกเพจ" onClick={() => setDraftPage(null)} />
              {pageOptions.map((p) => (
                // ชื่อเพจอย่างเดียวไม่พอ — ร้านที่ตั้งชื่อเพจ Facebook กับ Instagram เหมือนกันจะเห็น
                // ชิปสองอันข้อความเดียวกันเป๊ะ (เหตุผลเดียวกับ InboxFilterPanel)
                <Chip
                  key={p.id}
                  on={draftPage === p.id}
                  label={p.name}
                  onClick={() => setDraftPage(p.id)}
                  leading={
                    <span className="relative block shrink-0">
                      <PageAvatar avatarUrl={p.avatarUrl} name={p.name} size="sm" />
                      <ChannelBadgeOverlay channel={p.provider} size="sm" />
                    </span>
                  }
                />
              ))}
            </div>
          </div>

          <div className="border-default-200 flex items-center justify-between gap-2 border-t px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setDraftPage(null)
                onApply(null)
                onOpenChange(false)
              }}
              className="btn btn-sm text-default-800 hover:bg-light"
            >
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(draftPage)
                onOpenChange(false)
              }}
              className="btn btn-sm bg-primary hover:bg-primary-hover text-white"
            >
              ใช้ตัวกรอง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** ชิปตัวเลือก — ยกมาจาก InboxFilterPanel.tsx (Chip) ให้หน้าตาชิปในสองแผงตรงกันทุกสถานะ */
function Chip({
  on,
  label,
  onClick,
  leading,
}: {
  on: boolean
  label: string
  onClick: () => void
  /** ภาพนำหน้าข้อความ — ใช้กับชิปเพจ (รูปเพจ + โลโก้ช่องทาง) */
  leading?: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      // ps เดียวแบบมีเงื่อนไข (เหตุผลเดียวกับต้นฉบับ: ps-1.5 กับ ps-3 พร้อมกันแล้วผู้ชนะขึ้นกับลำดับ CSS)
      className={`flex items-center gap-2 rounded-full border py-1.5 pe-3 text-sm font-medium whitespace-nowrap ${
        leading ? 'ps-1.5' : 'ps-3'
      } ${
        on
          ? 'border-primary bg-primary text-white'
          : 'border-default-300 bg-card text-default-800 hover:bg-light'
      }`}
    >
      {leading}
      {label}
    </button>
  )
}
