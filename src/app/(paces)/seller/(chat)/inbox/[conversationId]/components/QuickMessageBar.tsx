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
 * เนื้อหาในแผง (user สั่ง 2026-07-23 รอบสอง): "ให้แสดงผลเหมือนเลือกสินค้า — การ์ด ค้นหาได้ ถ้ามี
 * เยอะก็ slide" → ยกโครง body จาก ProductPickerPanel.tsx ทั้งชุด (ช่องค้นหา + สไลด์การ์ดแนวนอน
 * snap-x + ซ่อน scrollbar). การ์ดกว้าง w-32 (ของสินค้า w-24) เพราะเนื้อหาหลักคือข้อความไม่ใช่รูป
 * และการ์ดที่ "ไม่มีรูป" ใช้ช่องรูปแสดงเนื้อความแทน placeholder — ข้อความสำเร็จรูปแบบไม่มีรูปเป็น
 * เคสปกติ ไม่ใช่ข้อมูลขาดเหมือนสินค้าที่ยังไม่ได้ใส่รูป
 *
 * การเปิดแผงคุมจาก ChatThread ด้วย state เดียว (activePanel) → เปิดได้ทีละแผงเท่านั้น ไม่ซ้อนกัน
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [q, setQ] = useState('')

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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (qm) => qm.title.toLowerCase().includes(needle) || qm.body.toLowerCase().includes(needle),
    )
  }, [items, q])

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

        {/* ค้นหา + สไลด์การ์ด — user สั่ง 2026-07-23: "แสดงผลเหมือนเลือกสินค้า (การ์ด ค้นหาได้
            ถ้ามีเยอะก็ slide)" จึงยกโครงจาก ProductPickerPanel.tsx มาทั้งชุด: input-icon-group
            ด้านบน + แถบการ์ดเลื่อนแนวนอน snap-x + ซ่อน scrollbar
            การ์ดกว้างกว่าของสินค้า (w-32 vs w-24) เพราะเนื้อหาหลักคือ "ข้อความ" ไม่ใช่รูป */}
        <div className="input-icon-group mb-2">
          <Icon icon="search" className="input-icon" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาข้อความสำเร็จรูป"
            aria-label="ค้นหาข้อความสำเร็จรูป"
            className="form-input bg-card"
          />
        </div>

        <div
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-contain pb-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
        >
          {loading ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-default-100 h-36 w-32 shrink-0 animate-pulse rounded-xl" role="status" aria-label="กำลังโหลด" />
              ))}
            </>
          ) : items.length === 0 ? (
            <div className="text-default-700 flex w-full flex-col items-center gap-2 py-4 text-center text-sm">
              <Icon icon="message-plus" className="text-default-500 text-2xl" />
              <span>ยังไม่มีข้อความสำเร็จรูป</span>
              <button type="button" onClick={() => setManagerOpen(true)} className="btn border-default-300 min-h-11">
                <Icon icon="plus" className="me-1" /> เพิ่มข้อความ
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-default-700 mb-0 w-full py-4 text-center text-sm">ไม่พบข้อความที่ค้นหา</p>
          ) : (
            filtered.map((qm) => {
              // หลายรูปได้ — โชว์รูปแรก + ป้ายจำนวนที่เหลือ (การ์ดต้องสูงเท่ากันทุกใบ กวาดตาได้เร็ว)
              const imgs = qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []
              return (
                <button
                  key={qm.id}
                  type="button"
                  onClick={() => !disabled && onPick(qm)}
                  disabled={disabled}
                  title={qm.body || qm.title}
                  className={`w-32 shrink-0 snap-start overflow-hidden rounded-xl border border-default-200 bg-card text-left transition-transform duration-150 hover:shadow-sm active:scale-95 ${
                    disabled ? 'pointer-events-none opacity-50' : ''
                  }`}
                >
                  {imgs.length > 0 ? (
                    <span className="relative block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${imgs[0]}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                      {imgs.length > 1 && (
                        <span className="bg-default-900/70 absolute end-1 bottom-1 rounded px-1 text-2xs text-white">
                          +{imgs.length - 1}
                        </span>
                      )}
                    </span>
                  ) : (
                    // ไม่มีรูป → โชว์ข้อความแทนที่ช่องรูป (ต่างจากการ์ดสินค้าที่ขึ้น "ไม่มีรูป" เฉย ๆ
                    // เพราะข้อความสำเร็จรูปแบบไม่มีรูปเป็นเคสปกติ ไม่ใช่ข้อมูลขาด)
                    <span className="bg-light text-default-700 flex aspect-square w-full items-center p-2 text-2xs">
                      <span className="line-clamp-5">{qm.body || qm.title}</span>
                    </span>
                  )}
                  <div className="p-2">
                    <p className="line-clamp-2 text-xs font-medium text-dark">{qm.title}</p>
                    {qm.body && <p className="text-default-700 mt-0.5 line-clamp-2 text-2xs">{qm.body}</p>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {managerOpen && (
        <QuickMessageManager items={items} onClose={() => setManagerOpen(false)} onChanged={load} />
      )}
    </>
  )
}
