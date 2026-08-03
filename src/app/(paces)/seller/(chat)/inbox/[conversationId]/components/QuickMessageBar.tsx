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
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import QuickMessageManager, { type QuickMessage } from './QuickMessageManager'

const CATEGORY_ALL = 'All'

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
  const [loadError, setLoadError] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/chat/quick-messages', { cache: 'no-store' })
      if (!res.ok) throw new Error('failed')
      const data: { items: QuickMessage[] } = await res.json()
      setItems(data.items)
      setLoadError(false)
    } catch {
      // ไม่ throw ต่อ — แผงสำเร็จรูปเป็น enhancement ไม่ควรทำให้ composer พัง
      // แต่ต้อง "บอกว่าโหลดไม่ได้" ไม่ใช่เงียบ: เดิม catch เปล่าแล้วปล่อย items=[] ทำให้ทั้งแผงและ
      // modal จัดการขึ้น "ยังไม่มีข้อความสำเร็จรูป" ทั้งที่ผู้ใช้มีอยู่ 30+ รายการ → นึกว่าข้อมูลหาย
      setLoadError(true)
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

  // หมวดที่มีอยู่จริง — derive จากข้อมูล ไม่มีตาราง master (ชุดเดียวกับที่ modal จัดการใช้)
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      const c = it.category?.trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'))
  }, [items])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((qm) => {
      if (categoryFilter !== CATEGORY_ALL && (qm.category ?? '') !== categoryFilter) return false
      if (!needle) return true
      return qm.title.toLowerCase().includes(needle) || qm.body.toLowerCase().includes(needle)
    })
  }, [items, q, categoryFilter])

  // ── โหมดจัดลำดับ (user request 2026-07-30) ────────────────────────────────
  // ต้องเป็นโหมดแยก ไม่ใช่ลากได้ตลอดเวลา: การ์ดพวกนี้ "กดเพื่อใช้งาน" เป็นหลัก ถ้าลากได้ตลอด
  // การกดเร็ว ๆ บนจอสัมผัสจะกลายเป็นการลากโดยไม่ตั้งใจ แล้วลำดับเพี้ยนโดยไม่รู้ตัว
  const [sortMode, setSortMode] = useState(false)
  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  // ล้างสถานะลากที่ระดับ window — `dragend` ของการ์ดต้นทางไม่ยิงทุกกรณี (ปล่อยนอกหน้าต่าง/กด Esc
  // ยกเลิกกลางทาง/ลากออกไปนอกเบราว์เซอร์) ผลคือการ์ดค้างกรอบน้ำเงินไว้และ dragFrom ค้างค่าเก่า
  // ทำให้ลากครั้งถัดไปคำนวณตำแหน่งจากจุดเริ่มที่ผิด. ผูกครั้งเดียวเมื่ออยู่ในโหมดจัดลำดับ
  useEffect(() => {
    if (!sortMode) return
    const clear = () => {
      dragFrom.current = null
      setDragOver(null)
    }
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
      clear() // ออกจากโหมดจัดลำดับ = ต้องไม่มีไฮไลต์ค้างไว้ให้เห็นในโหมดปกติ
    }
  }, [sortMode])

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


  // จัดกลุ่มตามหมวดสำหรับแสดงผล (user สั่ง 2026-07-31)
  // **ลำดับกลุ่ม = ลำดับที่ผู้ใช้ลากเอง** (ผลตัดสิน user 2026-08-01): กลุ่มไหนมีข้อความที่อยู่
  // อันดับต้นสุด กลุ่มนั้นขึ้นก่อน — Map เก็บลำดับตอน insert อยู่แล้ว และ filtered เรียงตาม
  // sortOrder จาก DB จึงได้ลำดับนี้ฟรี ไม่ต้อง sort ทับ (เดิม sort ก.ไก่ ทำให้คุมลำดับไม่ได้)
  // ผลพลอยได้: ไม่ต้องมี UI จัดลำดับกลุ่มแยก ใช้โหมดจัดลำดับเดิมคุมได้ทั้งกลุ่มและรายการ
  const groups = useMemo(() => {
    const map = new Map<string, QuickMessage[]>()
    for (const qm of filtered) {
      const key = qm.category?.trim() || ''
      const list = map.get(key)
      if (list) list.push(qm)
      else map.set(key, [qm])
    }
    return Array.from(map, ([key, groupItems]) => ({
      key,
      label: key || 'ไม่มีหมวดหมู่',
      items: groupItems,
    }))
  }, [filtered])

  /** การ์ดหนึ่งใบ — โครงเดิมทั้งหมด ต่างแค่ไม่ล็อกความกว้าง (w-32) แล้ว เพราะอยู่ใน grid */
  function renderCard(qm: QuickMessage, index: number) {
    const imgs = qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []
    // โหมดจัดลำดับ: การ์ดเปลี่ยนหน้าที่จาก "กดเพื่อใช้" เป็น "ลากเพื่อเรียง" จึงไม่ส่ง onPick
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
        className={`bg-card overflow-hidden rounded-xl border text-left transition-transform duration-150 ${
          sortMode
            ? `cursor-grab active:cursor-grabbing ${
                dragOver === index ? 'border-primary ring-primary ring-2' : 'border-default-300'
              }`
            : 'border-default-200 hover:border-primary/40 hover:shadow-sm active:scale-95'
        } ${disabled && !sortMode ? 'pointer-events-none opacity-50' : ''}`}
      >
        {sortMode && (
          <span className="bg-primary/10 text-primary flex items-center justify-between px-2 py-1 text-2xs font-semibold">
            <span>#{index + 1}</span>
            <Icon icon="grip-vertical" className="text-sm" />
          </span>
        )}
        {imgs.length > 0 ? (
          // กรอบเป็นตัวกำหนดสี่เหลี่ยมจัตุรัส แล้วรูปเติมเต็มแบบ absolute → ครอปจริง สูงเท่ากันทุกใบ
          // ไม่ว่าไฟล์จะสัดส่วนใด (ใส่ aspect-square ที่ <img> ตรง ๆ ไม่ได้ผล — เป็น replaced element)
          // h-28 คงที่ ไม่ใช่ aspect-square — จัตุรัสทำให้ความสูงการ์ดผูกกับความกว้าง ยิ่งจอกว้าง
          // คอลัมน์ยิ่งกว้าง การ์ดยิ่งสูงจนกินพื้นที่ทั้งแผง (user เจอบน desktop 2026-08-01)
          <span className="relative block h-28 w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${imgs[0]}`} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
            {imgs.length > 1 && (
              <span className="bg-default-900/70 absolute end-1 bottom-1 rounded px-1 text-2xs text-white">
                +{imgs.length - 1}
              </span>
            )}
          </span>
        ) : (
          // ไม่มีรูป → โชว์ข้อความแทนที่ช่องรูป (ต่างจากการ์ดสินค้าที่ขึ้น "ไม่มีรูป" เฉย ๆ
          // เพราะข้อความสำเร็จรูปแบบไม่มีรูปเป็นเคสปกติ ไม่ใช่ข้อมูลขาด)
          <span className="bg-light text-default-700 flex h-28 w-full items-center p-2.5 text-2xs">
            <span className="line-clamp-5">{qm.body || qm.title}</span>
          </span>
        )}
        {/* จองพื้นที่ตายตัว 2 บรรทัดทั้งชื่อและเนื้อความ — ไม่งั้นการ์ดในแถวเดียวกันสูงไม่เท่ากัน
            min-h-8 = 2 บรรทัดของ text-xs, min-h-7 = 2 บรรทัดของ text-2xs */}
        <span className="block p-2">
          {/* ห้ามใส่ `block` คู่กับ line-clamp — line-clamp ตั้ง display:-webkit-box เอง
              `block` จะไปทับ แล้วข้อความไม่ถูกตัดเลย (พลาดซ้ำรอบสอง user เจอ 2026-07-31:
              คำอธิบายยาว 10 บรรทัดจนการ์ดสูงผิดปกติ) */}
          <span className="line-clamp-2 min-h-8 text-xs font-medium text-dark">{qm.title}</span>
          <span className="text-default-700 mt-0.5 line-clamp-3 min-h-10.5 text-2xs">{qm.body}</span>
        </span>
      </button>
    )
  }

  return (
    <>
      {/* แผงเต็มพื้นที่ข้อความ (user สั่ง 2026-07-31 "เต็มช่องแชทไปเลย") — วางทับลิสต์ข้อความ
          ที่ยัง mount อยู่ ตำแหน่ง scroll ของแชทจึงไม่รีเซ็ตตอนปิดแผง */}
      {/* z-40: ต้องสูงกว่าทุกอย่างที่ลอยอยู่ในพื้นที่ข้อความ ไม่งั้นทะลุขึ้นมาบนแผง —
          ป้าย DeepBot ของ AutoReplyTag เป็น z-20 และ tooltip ของมัน z-30 (user เจอ 2026-07-31)
          ยังต่ำกว่าโมดัลจัดการ (z-90) ตามเดิม */}
      <div className="bg-card absolute inset-0 z-40 flex flex-col">
        {/* header — โครงเดียวกับแผง AI (ชื่อ+ไอคอนซ้าย, action ขวา) */}
        <div className="border-default-300 flex items-center justify-between gap-2 border-b border-dashed px-4 py-2.5 sm:px-6">
          <span className="text-primary flex items-center gap-2 text-sm font-semibold">
            <Icon icon="bolt" className="text-base" />
            ข้อความสำเร็จรูป
          </span>
          <div className="flex items-center gap-1">
            {/* ปุ่มจัดลำดับ — ซ่อนตอนยังไม่มีอะไรให้เรียง */}
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setSortMode((s) => !s)}
                className={`flex size-9 items-center justify-center rounded ${
                  sortMode ? 'bg-primary text-white' : 'text-default-700 hover:text-primary'
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
              className="text-default-700 hover:text-primary flex size-9 items-center justify-center rounded"
              aria-label="จัดการข้อความสำเร็จรูป"
              title="จัดการข้อความสำเร็จรูป"
            >
              <Icon icon="settings" className="text-base" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-default-700 hover:text-default-800 flex size-9 items-center justify-center rounded"
              aria-label="ปิด"
            >
              <Icon icon="x" className="text-base" />
            </button>
          </div>
        </div>

        {/* ค้นหา + กรองหมวด — โหมดจัดลำดับซ่อนทั้งแถว แล้วแสดงทั้งชุดเสมอ เพราะลากสลับบน
            "ผลค้นหา" จะเขียนลำดับผิด (orderedIds ที่ส่งไปจะมีแค่ตัวที่ตรงคำค้น) */}
        {sortMode ? (
          <p className="text-default-600 border-default-300 mb-0 flex items-center gap-1.5 border-b px-4 py-2 text-2xs sm:px-6">
            <Icon icon="info-circle" className="text-sm" />
            ลากการ์ดเพื่อสลับลำดับ (หรือกดที่การ์ดแล้วใช้ลูกศรซ้าย/ขวา) — บันทึกอัตโนมัติ
          </p>
        ) : (
          <div className="border-default-300 flex items-center gap-2 border-b px-4 py-2.5 sm:px-6">
            <div className="input-icon-group grow">
              <Icon icon="search" className="input-icon" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาข้อความสำเร็จรูป"
                aria-label="ค้นหาข้อความสำเร็จรูป"
                className="form-input h-11"
              />
            </div>
            {/* ไม่มีใครตั้งหมวดเลย → ตัวกรองไม่มีประโยชน์ ซ่อนทั้งอัน */}
            {categories.length > 0 && (
              <FilterDropdown
                icon="tag"
                value={categoryFilter}
                onChange={setCategoryFilter}
                defaultLabel="หมวด"
                resetValue={CATEGORY_ALL}
                align="right"
                className="h-11"
                options={[
                  { value: CATEGORY_ALL, label: 'ทุกหมวด' },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
            )}
          </div>
        )}

        <div className="min-h-0 grow overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-default-100 h-44 animate-pulse rounded-xl" role="status" aria-label="กำลังโหลด" />
              ))}
            </div>
          ) : loadError ? (
            /* โหลดพัง ≠ ไม่มีข้อมูล — ต้องแยกให้ชัด ไม่งั้นผู้ใช้ที่มี 30+ รายการนึกว่าข้อความหายหมด */
            <div className="text-default-700 flex flex-col items-center gap-2 py-12 text-center text-sm">
              <Icon icon="alert-triangle" className="text-warning-ink text-2xl" />
              <span>โหลดข้อความสำเร็จรูปไม่สำเร็จ</span>
              <button type="button" onClick={load} className="btn border-default-300 min-h-11">
                <Icon icon="refresh" className="me-1" /> ลองใหม่
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-default-700 flex flex-col items-center gap-2 py-12 text-center text-sm">
              <Icon icon="message-plus" className="text-default-700 text-2xl" />
              <span>ยังไม่มีข้อความสำเร็จรูป</span>
              <button type="button" onClick={() => setManagerOpen(true)} className="btn border-default-300 min-h-11">
                <Icon icon="plus" className="me-1" /> เพิ่มข้อความ
              </button>
            </div>
          ) : filtered.length === 0 ? (
            /* ต้องตรงกับตัวกรองที่ใช้จริง — กรองด้วยหมวดอย่างเดียวแล้วบอกว่า "ไม่พบที่ค้นหา" คือบอกผิด */
            <p className="text-default-700 mb-0 py-12 text-center text-sm">
              {q.trim() ? `ไม่พบข้อความที่ตรงกับ "${q.trim()}"` : `ไม่มีข้อความในหมวด "${categoryFilter}"`}
            </p>
          ) : sortMode ? (
            /* โหมดจัดลำดับไม่แบ่งกลุ่ม — ลำดับที่บันทึกเป็นลำดับเดียวทั้งชุด ถ้าโชว์แยกกลุ่ม
               เลข #N จะไม่ตรงกับลำดับจริงและลากข้ามกลุ่มจะสับสน */
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((qm, index) => renderCard(qm, index))}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="mb-4 last:mb-0">
                <p className="text-default-700 mb-2 text-2xs font-semibold">
                  {g.label}
                  <span className="text-default-700 ms-1.5 font-normal">({g.items.length})</span>
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {g.items.map((qm) => renderCard(qm, items.indexOf(qm)))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {managerOpen && (
        <QuickMessageManager
          items={items}
          loading={loading}
          error={loadError}
          onRetry={load}
          onClose={() => setManagerOpen(false)}
          onChanged={load}
        />
      )}
    </>
  )
}
