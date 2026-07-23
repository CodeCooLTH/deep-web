'use client'

/**
 * QuickMessageBar — แถบ "ข้อความสำเร็จรูป" เหนือช่องพิมพ์ (feature 00018 composer improvement #2)
 *
 * pill แนวนอน scroll ได้ (คลิก → เติมข้อความ/แนบรูปลง composer ผ่าน onPick) + ปุ่มจัดการ (เฟือง)
 * เปิด QuickMessageManager (modal CRUD). โหลดรายการเองตอน mount + refetch หลังแก้ใน manager.
 *
 * Base: chip/pill = theme/paces `.badge` + horizontal scroll (pattern เดียวกับ chips กรองใน
 *   (dashboard)/orders SearchBox) — Paces primitive เท่านั้น (HR7)
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import QuickMessageManager, { type QuickMessage } from './QuickMessageManager'

type Props = {
  /** เติมข้อความ/แนบรูปของ quick message ลง composer — parent ตัดสินเรื่องช่องทาง (external รูปไม่ได้) */
  onPick: (qm: QuickMessage) => void
  /** composer ส่งไม่ได้ (window ปิด/token ตาย) — pill กดไม่ได้ แต่ยัง "จัดการ" ได้ */
  disabled?: boolean
}

export default function QuickMessageBar({ onPick, disabled }: Props) {
  const [items, setItems] = useState<QuickMessage[]>([])
  const [managerOpen, setManagerOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/quick-messages', { cache: 'no-store' })
      if (!res.ok) return
      const data: { items: QuickMessage[] } = await res.json()
      setItems(data.items)
    } catch {
      // เงียบ — แถบสำเร็จรูปเป็น enhancement ไม่ควรทำให้ composer พัง
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        {/* ปุ่มจัดการ (เฟือง) — คงที่ ซ้ายสุด ไม่เลื่อนหาย */}
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="btn btn-sm btn-icon border-default-300 shrink-0"
          aria-label="จัดการข้อความสำเร็จรูป"
          title="จัดการข้อความสำเร็จรูป"
        >
          {/* เฟือง ไม่ใช่สายฟ้า — สายฟ้าเป็นปุ่ม "เปิดแถบข้อความสำเร็จรูป" ในแถวเครื่องมือของ
              composer แล้ว (ChatThread.tsx) ถ้าใช้ไอคอนเดียวกันสองความหมายจะสับสน */}
          <Icon icon="settings" className="text-base" />
        </button>

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="text-default-400 hover:text-primary text-xs"
          >
            + เพิ่มข้อความสำเร็จรูป
          </button>
        ) : (
          <div className="flex grow gap-1.5 overflow-x-auto">
            {items.map((qm) => (
              <button
                key={qm.id}
                type="button"
                onClick={() => !disabled && onPick(qm)}
                disabled={disabled}
                title={qm.body || qm.title}
                className={`badge bg-default-100 text-default-700 hover:bg-default-200 inline-flex shrink-0 items-center gap-1 ${
                  disabled ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {qm.imageFileId && <Icon icon="photo" className="text-2xs" />}
                <span className="max-w-40 truncate">{qm.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {managerOpen && (
        <QuickMessageManager items={items} onClose={() => setManagerOpen(false)} onChanged={load} />
      )}
    </>
  )
}
