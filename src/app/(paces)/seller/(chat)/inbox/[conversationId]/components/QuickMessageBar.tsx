'use client'

/**
 * QuickMessageBar — แถบ "ข้อความสำเร็จรูป" เหนือช่องพิมพ์ (feature 00018 composer improvement #2)
 *
 * pill แนวนอน scroll ได้ (คลิก → เติมข้อความ/แนบรูปลง composer ผ่าน onPick) + ลิงก์ "จัดการ" มุมขวา
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
      {/* กล่องแยกชัดจาก composer (user สั่ง 2026-07-23: "ดูกลืนกับ panel input เกินไป ต้องดูออกว่า
          โผล่ขึ้นมา") — พื้น bg-light + เส้นขอบ + หัวข้อกำกับ ทำให้อ่านออกว่าเป็นแผงที่เพิ่งกางออก
          ไม่ใช่แถวเครื่องมืออีกแถวของ composer. ไม่ใส่ shadow (ยึดแนวเดียวกับแผง AI ที่ user สั่งให้
          เลิกดูลอย) — ความต่างมาจากพื้น+ขอบ ไม่ใช่เงา */}
      <div className="border-default-300 bg-light mb-2 rounded-lg border p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-default-600 text-xs font-semibold">ข้อความสำเร็จรูป</span>
          {/* "จัดการ" เป็นข้อความมุมขวาตามที่สั่ง (เดิมเป็นปุ่มเฟืองซ้ายสุด) */}
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="text-primary shrink-0 text-xs font-medium hover:underline"
          >
            จัดการ
          </button>
        </div>

        {items.length === 0 ? (
          <button
            type="button"
            onClick={() => setManagerOpen(true)}
            className="text-default-400 hover:text-primary text-xs"
          >
            + เพิ่มข้อความสำเร็จรูป
          </button>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto">
            {items.map((qm) => (
              <button
                key={qm.id}
                type="button"
                onClick={() => !disabled && onPick(qm)}
                disabled={disabled}
                title={qm.body || qm.title}
                className={`badge bg-card text-default-700 hover:bg-default-100 border-default-200 inline-flex shrink-0 items-center gap-1 border ${
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
