'use client'

/**
 * QuickMessageBar — แผง "ข้อความสำเร็จรูป" เหนือช่องพิมพ์ (feature 00018 composer improvement #2)
 *
 * คลิกรายการ → เติมข้อความ/แนบรูปลง composer ผ่าน onPick; "จัดการ" เปิด QuickMessageManager
 * (modal CRUD) โหลดรายการเองตอน mount + refetch หลังแก้ใน manager.
 *
 * layout (user สั่ง 2026-07-23): "ให้เหมือน AI Suggestion และต้องไม่ขึ้นซ้อนกัน" — แผงนี้กับแผง AI
 * ใช้โครงเดียวกันเป๊ะ (ดู AiSuggestPanel.tsx): **แถบในสายเลย์เอาต์** full-bleed ด้วย -mx/-mt ลบ
 * padding ของ composer ออกแล้วใส่กลับเอง → เต็มความกว้างชนขอบการ์ด ไม่มี shadow/rounded/z-index
 * คั่นด้วยเส้นประ border-default-300 พื้นบาง ๆ บอกโซน (AI = success เขียว, แผงนี้ = primary น้ำเงิน
 * ตาม Paces primary — ห้ามใช้ม่วง Vuexy). ตัวเลือกแสดงเป็นแถวการ์ดเต็มความกว้างชุดเดียวกับร่าง AI
 * (เดิมเป็น pill scroll แนวนอน อ่านเนื้อความไม่ออก) — Paces primitive เท่านั้น (HR7)
 *
 * การเปิดแผงคุมจาก ChatThread ด้วย state เดียว (activePanel) → เปิดได้ทีละแผงเท่านั้น ไม่ซ้อนกัน
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import QuickMessageManager, { type QuickMessage } from './QuickMessageManager'

type Props = {
  /** เติมข้อความ/แนบรูปของ quick message ลง composer — parent ตัดสินเรื่องช่องทาง (external รูปไม่ได้) */
  onPick: (qm: QuickMessage) => void
  /** composer ส่งไม่ได้ (window ปิด/token ตาย) — แถวกดไม่ได้ แต่ยัง "จัดการ" ได้ */
  disabled?: boolean
  /** ปิดแผง (ปุ่ม X / Escape) — ชุดเดียวกับแผง AI */
  onClose: () => void
}

export default function QuickMessageBar({ onPick, disabled, onClose }: Props) {
  const [items, setItems] = useState<QuickMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [managerOpen, setManagerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chat/quick-messages', { cache: 'no-store' })
      if (!res.ok) return
      const data: { items: QuickMessage[] } = await res.json()
      setItems(data.items)
    } catch {
      // เงียบ — แผงสำเร็จรูปเป็น enhancement ไม่ควรทำให้ composer พัง
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ไม่ปิดแผงถ้า modal จัดการเปิดอยู่ — Escape ตอนนั้นเป็นของ modal
      if (e.key === 'Escape' && !managerOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, managerOpen])

  return (
    <>
      <div className="border-default-300 bg-primary/5 -mx-4 -mt-3 mb-3 border-b border-dashed px-4 py-2 sm:-mx-6 sm:-mt-3.75 sm:px-6">
        {/* header — โครงเดียวกับแผง AI (ชื่อ+ไอคอนซ้าย, action ขวา) */}
        <div className="flex items-center justify-between pb-1.5">
          <span className="text-primary flex items-center gap-2 text-sm font-semibold">
            <Icon icon="bolt" className="text-base" />
            ข้อความสำเร็จรูป
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setManagerOpen(true)}
              className="text-default-500 hover:text-primary flex size-7 items-center justify-center rounded"
              aria-label="จัดการข้อความสำเร็จรูป"
              title="จัดการข้อความสำเร็จรูป"
            >
              <Icon icon="settings" className="text-base" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-default-500 hover:text-default-800 flex size-7 items-center justify-center rounded"
              aria-label="ปิด"
            >
              <Icon icon="x" className="text-base" />
            </button>
          </div>
        </div>

        {/* body — max-h เท่าแผง AI กันรายการเยอะดันเธรดหายทั้งจอ */}
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-default-100 h-11 animate-pulse rounded-lg" />
              ))}
            </>
          ) : items.length === 0 ? (
            <div className="text-default-500 flex flex-col items-center gap-2 py-4 text-center text-sm">
              <Icon icon="message-plus" className="text-default-400 text-2xl" />
              <span>ยังไม่มีข้อความสำเร็จรูป</span>
              <button type="button" onClick={() => setManagerOpen(true)} className="btn btn-sm border-default-300">
                <Icon icon="plus" className="me-1" /> เพิ่มข้อความ
              </button>
            </div>
          ) : (
            items.map((qm) => (
              <button
                key={qm.id}
                type="button"
                onClick={() => !disabled && onPick(qm)}
                disabled={disabled}
                title={qm.body || qm.title}
                className={`bg-card border-default-200 hover:border-primary text-default-800 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  disabled ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 font-medium">
                  {qm.imageFileId && <Icon icon="photo" className="text-default-400 shrink-0 text-sm" />}
                  <span className="truncate">{qm.title}</span>
                </span>
                {qm.body && <span className="text-default-500 mt-0.5 line-clamp-2 block text-xs">{qm.body}</span>}
              </button>
            ))
          )}
        </div>

        {/* footer — ตำแหน่งเดียวกับ disclaimer ของแผง AI */}
        <div className="text-default-400 pt-1.5 text-2xs">คลิกเพื่อเติมลงช่องพิมพ์ — แก้ไขก่อนส่งได้</div>
      </div>

      {managerOpen && (
        <QuickMessageManager items={items} onClose={() => setManagerOpen(false)} onChanged={load} />
      )}
    </>
  )
}
