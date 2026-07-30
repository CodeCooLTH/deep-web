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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
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

  // ── โหมดจัดลำดับ (user request 2026-07-30) ────────────────────────────────
  // ต้องเป็นโหมดแยก ไม่ใช่ลากได้ตลอดเวลา: การ์ดพวกนี้ "กดเพื่อใช้งาน" เป็นหลัก ถ้าลากได้ตลอด
  // การกดเร็ว ๆ บนจอสัมผัสจะกลายเป็นการลากโดยไม่ตั้งใจ แล้วลำดับเพี้ยนโดยไม่รู้ตัว
  const [sortMode, setSortMode] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // บันทึกลำดับใหม่ — optimistic (สลับบนจอทันที) แล้วค่อยยิง API; ล้มเหลว → โหลดของจริงกลับมา
  const persistOrder = useCallback(async (next: QuickMessage[]) => {
    setItems(next)
    try {
      const res = await fetch('/api/chat/quick-messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      pacesToast.chat.error('บันทึกลำดับไม่สำเร็จ')
      load() // ดึงลำดับจริงจากเซิร์ฟเวอร์กลับมา ไม่ปล่อยให้จอโชว์ลำดับที่ไม่ได้ถูกบันทึก
    }
  }, [load])

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || to >= items.length) return
      const next = [...items]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      persistOrder(next)
    },
    [items, persistOrder],
  )

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
            {/* ปุ่มจัดลำดับ — ข้างไอคอนตั้งค่าตามที่ user ระบุ (2026-07-30) ซ่อนตอนยังไม่มีอะไรให้เรียง */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setSortMode((s) => !s)}
                className={`flex size-7 items-center justify-center rounded ${
                  sortMode ? 'bg-primary text-white' : 'text-default-500 hover:text-primary'
                }`}
                aria-pressed={sortMode}
                aria-label={sortMode ? 'เสร็จสิ้นการจัดลำดับ' : 'จัดลำดับข้อความสำเร็จรูป'}
                title={sortMode ? 'เสร็จสิ้นการจัดลำดับ' : 'จัดลำดับข้อความสำเร็จรูป'}
              >
                <Icon icon={sortMode ? 'check' : 'arrows-sort'} className="text-base" />
              </button>
            )}
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
        {/* โหมดจัดลำดับซ่อนช่องค้นหา แล้วแสดงทั้งชุดเสมอ — ลากสลับบน "ผลค้นหา" จะเขียนลำดับผิด
            เพราะ orderedIds ที่ส่งไปจะมีแค่ตัวที่ตรงคำค้น ตัวที่ถูกกรองออกจะโดนดันไปท้ายทั้งหมด */}
        {sortMode ? (
          <p className="text-default-600 mb-2 flex items-center gap-1.5 text-2xs">
            <Icon icon="info-circle" className="text-sm" />
            ลากการ์ดเพื่อสลับลำดับ (หรือกดที่การ์ดแล้วใช้ลูกศรซ้าย/ขวา) — บันทึกอัตโนมัติ
          </p>
        ) : (
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
        )}

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
            (sortMode ? items : filtered).map((qm, index) => {
              // หลายรูปได้ — โชว์รูปแรก + ป้ายจำนวนที่เหลือ (การ์ดต้องสูงเท่ากันทุกใบ กวาดตาได้เร็ว)
              const imgs = qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []
              // โหมดจัดลำดับ: การ์ดเปลี่ยนหน้าที่จาก "กดเพื่อใช้" เป็น "ลากเพื่อเรียง" จึงไม่ส่ง onPick
              // HTML5 drag-and-drop ตรง ๆ ไม่พึ่ง library — เป็นลิสต์เดียวแนวนอน ไม่ต้องมี virtualization
              const sortProps = sortMode
                ? {
                    draggable: true,
                    onDragStart: () => {
                      dragFrom.current = index
                    },
                    onDragOver: (e: React.DragEvent) => {
                      e.preventDefault() // ไม่ preventDefault = เบราว์เซอร์ไม่ยอมให้ drop
                      setDragOver(index)
                    },
                    onDragLeave: () => setDragOver((c) => (c === index ? null : c)),
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault()
                      const from = dragFrom.current
                      dragFrom.current = null
                      setDragOver(null)
                      if (from != null) move(from, index)
                    },
                    onDragEnd: () => {
                      dragFrom.current = null
                      setDragOver(null)
                    },
                    // คีย์บอร์ด: ลากเมาส์ไม่ได้ก็ยังเรียงได้ (การ์ดโฟกัสได้อยู่แล้วเพราะเป็น <button>)
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault()
                        move(index, index + (e.key === 'ArrowLeft' ? -1 : 1))
                      }
                    },
                  }
                : {}
              return (
                <button
                  key={qm.id}
                  type="button"
                  {...sortProps}
                  onClick={() => !disabled && !sortMode && onPick(qm)}
                  disabled={disabled && !sortMode}
                  title={sortMode ? `ลำดับที่ ${index + 1} — ลากเพื่อสลับ` : qm.body || qm.title}
                  aria-label={sortMode ? `${qm.title} — ลำดับที่ ${index + 1} จาก ${items.length}` : undefined}
                  className={`w-32 shrink-0 snap-start overflow-hidden rounded-xl border bg-card text-left transition-transform duration-150 ${
                    sortMode
                      ? `cursor-grab active:cursor-grabbing ${
                          dragOver === index ? 'border-primary ring-primary ring-2' : 'border-default-300'
                        }`
                      : 'border-default-200 hover:shadow-sm active:scale-95'
                  } ${disabled && !sortMode ? 'pointer-events-none opacity-50' : ''}`}
                >
                  {/* ป้ายลำดับ + จุดจับ — ให้รู้ว่าตอนนี้กำลังเรียง ไม่ใช่กำลังเลือกใช้งาน */}
                  {sortMode && (
                    <span className="bg-primary/10 text-primary flex items-center justify-between px-2 py-1 text-2xs font-semibold">
                      <span>#{index + 1}</span>
                      <Icon icon="grip-vertical" className="text-sm" />
                    </span>
                  )}
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
