'use client'

/**
 * QuickMessageManager — modal จัดการข้อความสำเร็จรูป (CRUD) — feature 00018 composer improvement #2
 *
 * Base (modal shell / responsive sizing): theme/paces/Admin/TS/src/app/(admin)/ui/modals/page.tsx
 *   block "Full Screen Below lg" (บรรทัด 645-671) — เต็มจอใต้ lg / การ์ดกึ่งกลางที่ lg ขึ้นไป
 *   เอาเฉพาะ "class มิติ" มาใช้ ส่วนกลไก open/close ยังเป็น React state จาก parent (ไม่ใช้
 *   Preline hs-overlay เพราะ parent คุมด้วย managerOpen อยู่แล้ว — ใช้ทั้งคู่จะขัดกัน)
 * Base (ตารางรายการ): theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx
 *   (.table-wrapper > table.table.table-hover > thead.font-semibold)
 * Base (ช่องค้นหา): theme/paces/Admin/TS/src/app/(admin)/apps/chat/components/ContactList.tsx:20-24
 * Base (ปุ่ม icon / ลูกศรจัดลำดับ): theme/paces/Admin/TS/src/app/(admin)/ui/buttons/page.tsx (.btn.btn-icon)
 * Base (กรองหมวด): src/components/safepay/FilterDropdown.tsx (Base เดิม ui/dropdowns/page.tsx)
 * Base (confirm ลบ): theme/paces/.../plugins/sweet-alerts/components/SweetAlerts.tsx ผ่าน lib/paces-swal
 * Form field: Base theme/paces form/elements (form-input/form-label) — Paces primitive (HR7)
 * upload รูป: reuse POST /api/upload (คืน {fileId}) เหมือน composer แนบรูป
 *
 * โครง (spec docs/superpowers/specs/2026-07-31-quick-message-manager-design.md):
 *   **หนึ่งหน้าต่อหนึ่งงาน** — โมดัลแสดงทีละอย่างเสมอ ไม่ว่าจอเล็กหรือใหญ่
 *   - viewMode 'list' = ตารางเต็มโมดัล (หัวข้อ/หมวด/ข้อความ/จัดการ) + toolbar ค้นหา-กรอง-จัดลำดับ-เพิ่ม
 *   - viewMode 'form' = ฟอร์มเต็มโมดัล มีลูกศรย้อนกลับที่ header (กดแถวไหนก็เข้าฟอร์มของแถวนั้น)
 *   เดิมเคยเป็น 2 pane (list ซ้าย + ฟอร์มขวา) บน >=lg แต่ user เห็นของจริงแล้วสั่งเปลี่ยนเป็น
 *   ตาราง + เปลี่ยนทั้งหน้าตอนกด เพราะ "เข้าใจง่ายกว่า" (2026-07-31) — ทั้งสองแบบแก้ bug เดิม
 *   ได้เหมือนกัน (startEdit เติมค่าลงฟอร์มบนสุดแต่ไม่เลื่อนจอไปหา ผู้ใช้เลยเห็นว่ากดแล้วไม่มีอะไรเกิดขึ้น)
 *   จัดลำดับยกมาจากแถบล่างด้วย (API PATCH {orderedIds} เดิม): >=lg ลากที่ grip / <lg ปุ่มลูกศร 44px
 *   เพราะ HTML5 draggable ไม่ยิง event บนจอสัมผัส
 *
 * ข้อความสำเร็จรูปผูกระดับร้าน — ทุกคนในร้านเห็น/แก้ชุดเดียวกัน (ผลตัดสินผู้ใช้ 2026-07-23)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import FilterDropdown from '@/components/safepay/FilterDropdown'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

// client-side type (ไม่ import service — เลี่ยง prisma เข้า client bundle)
export type QuickMessage = {
  id: string
  title: string
  category: string | null
  body: string
  /** deprecated — รูปแรกของ imageFileIds (ยังส่งมาจาก API เพื่อ backward-compat) */
  imageFileId: string | null
  /** รูปแนบทั้งหมด ตามลำดับที่จะส่ง (user สั่ง 2026-07-23 "ใส่รูปได้มากกว่า 1") */
  imageFileIds?: string[]
  createdAt: string
}

/** ต้องตรงกับ QUICK_MESSAGE_MAX_IMAGES ใน validations.ts (backend เป็นคนบังคับจริง) */
const MAX_IMAGES = 5
/** ต้องตรงกับ QuickMessageCreateSchema.body ใน validations.ts */
const BODY_MAX = 2000
/** เตือน "ใกล้ครบ" ก่อนถึงเพดาน — ไม่ใช่ error เพราะ maxLength กันเกินอยู่แล้ว */
const BODY_WARN = 1800
const CATEGORY_ALL = 'All'

type Props = {
  items: QuickMessage[]
  /** parent ยังโหลดรายการแรกอยู่ — กัน empty-state หลอกตาระหว่างรอ */
  loading?: boolean
  /** parent โหลดไม่สำเร็จ — ต้องแยกจาก "ไม่มีข้อมูล" ไม่งั้นผู้ใช้นึกว่าข้อความหายหมด */
  error?: boolean
  onRetry?: () => void
  onClose: () => void
  onChanged: () => void // ให้ parent refetch หลังสร้าง/แก้/ลบ
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'
const IMAGE_MAX = 5 * 1024 * 1024

/** รูปของรายการหนึ่ง — รวม field เก่า (เดี่ยว) กับใหม่ (อาร์เรย์) ให้เหลือรูปเดียวกันทั้งไฟล์ */
function imagesOf(qm: QuickMessage): string[] {
  return qm.imageFileIds?.length ? qm.imageFileIds : qm.imageFileId ? [qm.imageFileId] : []
}

export default function QuickMessageManager({
  items,
  loading = false,
  error = false,
  onRetry,
  onClose,
  onChanged,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [imageFileIds, setImageFileIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // view: มีผลเฉพาะ <lg (ที่ ≥lg render ทั้งสอง pane พร้อมกันด้วย responsive class)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list')
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL)
  const [sortMode, setSortMode] = useState(false)

  // จัดลำดับแบบ optimistic — สลับบนจอทันทีแล้วค่อยยิง API (เหมือน QuickMessageBar)
  // localItems คือของที่เอาไปแสดง; sync จาก prop ทุกครั้งที่ parent refetch สำเร็จ
  const [localItems, setLocalItems] = useState<QuickMessage[]>(items)
  useEffect(() => {
    setLocalItems(items)
  }, [items])

  const dragFrom = useRef<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const isEditing = editingId !== null
  const canSave = title.trim().length > 0 && (body.trim().length > 0 || imageFileIds.length > 0)

  const resetForm = useCallback(() => {
    setEditingId(null)
    setTitle('')
    setCategory('')
    setBody('')
    setImageFileIds([])
  }, [])

  /** ฟอร์มมีอะไรที่จะหายถ้าย้อนกลับตอนนี้ไหม — ใช้ตัดสินว่าต้อง confirm ก่อนออกจาก form view */
  const isDirty = useCallback(() => {
    if (editingId) {
      const orig = localItems.find((i) => i.id === editingId)
      if (!orig) return false
      return (
        title !== orig.title ||
        category !== (orig.category ?? '') ||
        body !== orig.body ||
        imageFileIds.join(',') !== imagesOf(orig).join(',')
      )
    }
    return title.trim() !== '' || category.trim() !== '' || body.trim() !== '' || imageFileIds.length > 0
  }, [editingId, localItems, title, category, body, imageFileIds])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // ล้างสถานะลากที่ระดับ window — dragend ของแถวต้นทางไม่ยิงทุกกรณี (ปล่อยนอกหน้าต่าง/กด Esc
  // ยกเลิกกลางทาง) ผลคือแถวค้างไฮไลต์ไว้และ dragFrom ค้างค่าเก่า ทำให้ลากครั้งถัดไปคำนวณผิด
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
      clear()
    }
  }, [sortMode])

  // ── หมวดทั้งหมดที่มีอยู่จริง (derive จากข้อมูล ไม่มีตาราง master) ──────────
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const it of localItems) {
      const c = it.category?.trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'th'))
  }, [localItems])

  // โหมดจัดลำดับต้องแสดงทั้งชุดเสมอ — ลากสลับบน "ผลค้นหา" จะเขียนลำดับผิด เพราะ orderedIds
  // ที่ส่งไปจะมีแค่ตัวที่ตรงคำค้น ตัวที่ถูกกรองออกจะโดนดันไปท้ายทั้งหมด (เหตุผลเดียวกับ bar)
  const visibleItems = useMemo(() => {
    if (sortMode) return localItems
    const needle = q.trim().toLowerCase()
    return localItems.filter((qm) => {
      if (categoryFilter !== CATEGORY_ALL && (qm.category ?? '') !== categoryFilter) return false
      if (!needle) return true
      return qm.title.toLowerCase().includes(needle) || qm.body.toLowerCase().includes(needle)
    })
  }, [localItems, q, categoryFilter, sortMode])

  const hasFilter = q.trim() !== '' || categoryFilter !== CATEGORY_ALL

  function clearFilters() {
    setQ('')
    setCategoryFilter(CATEGORY_ALL)
  }

  function startEdit(qm: QuickMessage) {
    setEditingId(qm.id)
    setTitle(qm.title)
    setCategory(qm.category ?? '')
    setBody(qm.body)
    setImageFileIds(imagesOf(qm))
    // <lg: สลับไปหน้าฟอร์ม (≥lg ฟอร์มอยู่ pane ขวาที่มองเห็นอยู่แล้ว — บรรทัดนี้ไม่มีผล)
    setViewMode('form')
  }

  function startAdd() {
    resetForm()
    setViewMode('form')
  }

  async function backToList() {
    if (isDirty()) {
      const ok = await pacesConfirm.question('ยกเลิกการแก้ไข?', 'การเปลี่ยนแปลงที่ยังไม่บันทึกจะหายไป', {
        confirmButtonText: 'ยกเลิกการแก้ไข',
      })
      if (!ok) return
    }
    resetForm()
    setViewMode('list')
  }

  // อัปโหลดได้ทีละหลายไฟล์ (multiple) — ทยอยยิงทีละไฟล์ตามลำดับที่เลือก เพื่อให้ลำดับรูปที่บันทึก
  // ตรงกับที่ผู้ใช้เห็นตอนเลือก (Promise.all จะได้ลำดับไม่แน่นอนเมื่อไฟล์ขนาดต่างกัน)
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const room = MAX_IMAGES - imageFileIds.length
    if (room <= 0) {
      pacesToast.warning(`แนบรูปได้สูงสุด ${MAX_IMAGES} รูป`)
      return
    }
    if (files.length > room) pacesToast.warning(`เพิ่มได้อีก ${room} รูป (สูงสุด ${MAX_IMAGES} รูป)`)

    setUploading(true)
    try {
      for (const file of files.slice(0, room)) {
        if (!IMAGE_ACCEPT.split(',').includes(file.type)) {
          pacesToast.error(`${file.name}: รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp, gif)`)
          continue
        }
        if (file.size > IMAGE_MAX) {
          pacesToast.error(`${file.name}: ไฟล์รูปต้องไม่เกิน 5MB`)
          continue
        }
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          pacesToast.error(`${file.name}: อัปโหลดไม่สำเร็จ`)
          continue
        }
        const data: { fileId: string } = await res.json()
        setImageFileIds((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, data.fileId]))
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        category: category.trim() || null,
        body: body,
        imageFileIds,
      }
      const url = isEditing ? `/api/chat/quick-messages/${editingId}` : '/api/chat/quick-messages'
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        pacesToast.error(d?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success(isEditing ? 'แก้ไขข้อความสำเร็จรูปแล้ว' : 'เพิ่มข้อความสำเร็จรูปแล้ว')
      resetForm()
      // <lg: กลับไปหน้ารายการเพื่อให้เห็นผลของสิ่งที่เพิ่งบันทึก (≥lg ไม่มีผล — เห็นอยู่แล้ว)
      setViewMode('list')
      onChanged()
    } catch {
      pacesToast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(qm: QuickMessage) {
    // บอกผลที่ตามมาให้ครบ: ข้อความผูกระดับร้าน ลบแล้วหายทั้งร้าน ไม่ใช่แค่ของคนกด และกู้คืนไม่ได้
    const ok = await pacesConfirm.danger(
      `ลบ "${qm.title}"`,
      'ทุกคนในร้านจะไม่เห็นข้อความนี้อีก และกู้คืนไม่ได้',
      { confirmButtonText: 'ลบข้อความนี้' },
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/chat/quick-messages/${qm.id}`, { method: 'DELETE' })
      if (!res.ok) {
        pacesToast.error('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      pacesToast.success(`ลบ "${qm.title}" แล้ว`)
      if (editingId === qm.id) {
        resetForm()
        setViewMode('list')
      }
      onChanged()
    } catch {
      pacesToast.error('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
  }

  // บันทึกลำดับใหม่ — optimistic แล้วค่อยยิง API; ล้มเหลว → ดึงของจริงกลับมา (เหมือน bar)
  const persistOrder = useCallback(
    async (next: QuickMessage[]) => {
      setLocalItems(next)
      try {
        const res = await fetch('/api/chat/quick-messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedIds: next.map((x) => x.id) }),
        })
        if (!res.ok) throw new Error('failed')
      } catch {
        pacesToast.error('บันทึกลำดับไม่สำเร็จ')
        onChanged() // ดึงลำดับจริงกลับมา ไม่ปล่อยให้จอโชว์ลำดับที่ไม่ได้ถูกบันทึก
      }
    },
    [onChanged],
  )

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || to >= localItems.length) return
      const next = [...localItems]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      persistOrder(next)
    },
    [localItems, persistOrder],
  )


  const bodyLen = body.length
  const isList = viewMode === 'list'
  const formHeading = isEditing ? 'แก้ไขข้อความสำเร็จรูป' : 'เพิ่มข้อความสำเร็จรูป'

  return (
    <div
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-label="จัดการข้อความสำเร็จรูป"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* ความสูงคงที่ (sm:h-176 = 44rem) ไม่ใช่ h-auto — ไม่งั้นโมดัลหดตามจำนวนแถวทุกครั้งที่กรอง
          แล้วเนื้อหาเด้งขึ้นลงกวนตา (user report 2026-07-31). max-h-full กันล้นบนจอเตี้ย */}
      <div className="card bg-card flex h-full max-h-full w-full flex-col rounded-b-none sm:h-176 sm:rounded-lg lg:max-w-5xl">
        {/* ── header ───────────────────────────────────────────────────────── */}
        {/* header คงที่ทุก view — เดิมสลับเป็น [ลูกศรย้อนกลับ + ชื่อฟอร์ม] ตอนกดแก้ไข ทำให้ไอคอน
            หายและหัวข้อเลื่อนตำแหน่ง ผู้ใช้รายงานว่า "เปลี่ยนไปแปลกๆ" (2026-07-31)
            → ทางกลับย้ายไปอยู่แถบรองใต้ header แทน header จึงนิ่งตลอด */}
        <div className="card-header flex items-center justify-between gap-2">
          <h5 className="mb-0 flex min-w-0 grow items-center gap-2 text-base">
            <Icon icon="message-2-bolt" className="text-primary text-lg" />
            <span className="truncate">
              {sortMode ? 'จัดลำดับข้อความสำเร็จรูป' : 'จัดการข้อความสำเร็จรูป'}
            </span>
            {!loading && !error && (
              <span className="badge bg-primary/15 text-primary shrink-0">{localItems.length}</span>
            )}
          </h5>
          <button type="button" onClick={onClose} className="btn btn-icon border-default-300 shrink-0" aria-label="ปิด">
            <Icon icon="x" className="text-lg" />
          </button>
        </div>

        {/* แถบรอง — มีเฉพาะตอนอยู่หน้าฟอร์ม บอกว่ากำลังทำอะไรกับรายการไหน + ทางกลับ */}
        {!isList && (
          <div className="border-default-200 flex items-center gap-2 border-b px-5 py-2.5">
            <button
              type="button"
              onClick={backToList}
              className="text-default-700 hover:text-primary flex size-9 shrink-0 items-center justify-center rounded"
              aria-label="ย้อนกลับไปรายการ"
            >
              <Icon icon="arrow-left" className="text-lg" />
            </button>
            <span className="text-default-800 min-w-0 grow truncate text-sm font-semibold">
              {isEditing ? (
                <>
                  แก้ไข: <span className="text-primary">{title || 'ข้อความสำเร็จรูป'}</span>
                </>
              ) : (
                formHeading
              )}
            </span>
          </div>
        )}

        {isList ? (
          /* ══════════ หน้ารายการ (ตาราง) ══════════ */
          <>
            {/* toolbar — ทุกตัวสูง h-11 (44px) เท่ากันหมด: ค่าตั้งต้นของธีมไม่เท่ากันอยู่แล้ว
                (.form-input = h-9.25 / 37px, .btn = py-1.75+text-sm ≈ 36px) ต่างกัน 1px
                เห็นชัดเมื่อวางเรียงกัน (user รายงาน "ขนาดปุ่มไม่เท่ากัน" 2026-07-31)
                44px ยังได้ tap target ตาม PRODUCT.md ไปในตัว
                โหมดจัดลำดับซ่อนค้นหา/กรอง/เพิ่ม เหลือแค่ปุ่ม toggle ที่เป็นทางออกจากโหมดด้วย */}
            <div className="border-default-200 flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center">
              {!sortMode && (
                <div className="input-icon-group grow">
                  <Icon icon="search" className="input-icon" />
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ค้นหาหัวข้อหรือเนื้อหา"
                    aria-label="ค้นหาข้อความสำเร็จรูป"
                    className="form-input h-11"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                {/* ไม่มีใครตั้งหมวดเลย → ตัวกรองไม่มีประโยชน์ ซ่อนทั้งอัน */}
                {!sortMode && categories.length > 0 && (
                  <FilterDropdown
                    icon="tag"
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    defaultLabel="หมวด"
                    resetValue={CATEGORY_ALL}
                    className="h-11"
                    options={[
                      { value: CATEGORY_ALL, label: 'ทุกหมวด' },
                      ...categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                )}
                {localItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSortMode((s) => !s)}
                    aria-pressed={sortMode}
                    className={`btn h-11 text-nowrap ${sortMode ? 'bg-primary text-white' : 'bg-light text-dark'}`}
                    aria-label={sortMode ? 'เสร็จสิ้นการจัดลำดับ' : 'จัดลำดับข้อความสำเร็จรูป'}
                  >
                    <Icon icon={sortMode ? 'check' : 'arrows-sort'} className="text-base" />
                    <span className="sm:sr-only">{sortMode ? 'เสร็จสิ้น' : 'จัดลำดับ'}</span>
                  </button>
                )}
                {!sortMode && (
                  <button
                    type="button"
                    onClick={startAdd}
                    className="btn bg-primary hover:bg-primary-hover ms-auto h-11 text-nowrap text-white sm:ms-0"
                  >
                    <Icon icon="plus" className="text-base" />
                    เพิ่มข้อความ
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 grow overflow-y-auto">
              {loading ? (
                <div className="p-4" role="status" aria-label="กำลังโหลด">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-default-100 mb-2 h-12 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : error ? (
                /* แยกจาก empty state ให้ชัด — เดิมโหลดพังแล้วขึ้น "ยังไม่มีข้อความ" ผู้ใช้นึกว่าข้อมูลหาย */
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <span className="bg-warning/15 text-warning flex size-12 items-center justify-center rounded-lg">
                    <Icon icon="alert-triangle" className="text-2xl" />
                  </span>
                  <span className="text-default-800 text-sm font-semibold">โหลดข้อความสำเร็จรูปไม่สำเร็จ</span>
                  <span className="text-default-700 text-xs">
                    ข้อความของคุณยังอยู่ครบ แค่ดึงข้อมูลไม่ได้ตอนนี้ ลองใหม่อีกครั้งได้เลย
                  </span>
                  {onRetry && (
                    <button type="button" onClick={onRetry} className="btn border-default-300 mt-1 min-h-11">
                      <Icon icon="refresh" className="me-1" /> ลองใหม่
                    </button>
                  )}
                </div>
              ) : localItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg">
                    <Icon icon="message-plus" className="text-2xl" />
                  </span>
                  <span className="text-default-800 text-sm font-semibold">ยังไม่มีข้อความสำเร็จรูป</span>
                  <span className="text-default-700 max-w-xs text-xs">
                    เพิ่มข้อความที่ใช้บ่อย เช่น ทักทายลูกค้าใหม่ หรือแจ้งเลขพัสดุ จะได้พิมพ์ครั้งเดียวใช้ได้ทุกแชท
                  </span>
                  <button
                    type="button"
                    onClick={startAdd}
                    className="btn bg-primary hover:bg-primary-hover mt-1 min-h-11 text-white"
                  >
                    <Icon icon="plus" className="me-1" /> เพิ่มข้อความแรก
                  </button>
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <span className="bg-default-100 text-default-700 flex size-12 items-center justify-center rounded-lg">
                    <Icon icon="search" className="text-2xl" />
                  </span>
                  {/* ข้อความต้องตรงกับตัวกรองที่ใช้จริง — กรองด้วยหมวดอย่างเดียวแล้วบอกว่า "ไม่พบคำค้น"
                      คือบอกผิด ผู้ใช้จะไปนั่งแก้คำค้นที่ไม่มีอยู่ */}
                  <span className="text-default-800 text-sm font-semibold">
                    {q.trim() ? `ไม่พบข้อความที่ตรงกับ "${q.trim()}"` : `ไม่มีข้อความในหมวด "${categoryFilter}"`}
                  </span>
                  <span className="text-default-700 text-xs">
                    {q.trim() ? 'ลองใช้คำอื่น หรือ' : ''}ล้างตัวกรองเพื่อดูทั้ง {localItems.length} รายการ
                  </span>
                  <button type="button" onClick={clearFilters} className="btn border-default-300 mt-1 min-h-11">
                    <Icon icon="x" className="me-1" /> ล้างตัวกรอง
                  </button>
                </div>
              ) : (
                /* Base: theme/paces/Admin/TS/src/app/(admin)/tables/static/components/HoverableRows.tsx
                   (.table-wrapper > table.table.table-hover > thead.font-semibold) */
                <div className="table-wrapper">
                  <table className="table table-hover">
                    <thead className="font-semibold">
                      <tr>
                        {sortMode && <th className="w-10">ลำดับ</th>}
                        {!sortMode && <th className="w-1">รูป</th>}
                        <th>หัวข้อ</th>
                        {!sortMode && <th className="hidden sm:table-cell">หมวด</th>}
                        {!sortMode && <th className="hidden lg:table-cell">ข้อความ</th>}
                        <th className="w-1 text-end">{sortMode ? 'ย้าย' : 'จัดการ'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((qm, index) => {
                        const imgs = imagesOf(qm)
                        if (sortMode) {
                          /* จัดลำดับ — ≥lg ลากที่ grip (HTML5 draggable ใช้ได้จริงเฉพาะเมาส์)
                             <lg ปุ่มลูกศร 44px เพราะ draggable ไม่ยิง event บนจอสัมผัส
                             คีย์บอร์ด: ลูกศรขึ้น/ลงเมื่อโฟกัสที่แถว (ใช้ได้ทุกขนาด) */
                          return (
                            <tr
                              key={qm.id}
                              draggable
                              tabIndex={0}
                              onDragStart={() => {
                                dragFrom.current = index
                              }}
                              onDragOver={(e) => {
                                e.preventDefault() // ไม่ preventDefault = เบราว์เซอร์ไม่ยอมให้ drop
                                setDragOver(index)
                              }}
                              onDragLeave={() => setDragOver((c) => (c === index ? null : c))}
                              onDrop={(e) => {
                                e.preventDefault()
                                const from = dragFrom.current
                                dragFrom.current = null
                                setDragOver(null)
                                if (from != null) move(from, index)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  move(index, index + (e.key === 'ArrowUp' ? -1 : 1))
                                }
                              }}
                              aria-label={`${qm.title} — ลำดับที่ ${index + 1} จาก ${visibleItems.length}`}
                              className={`lg:cursor-grab lg:active:cursor-grabbing ${
                                dragOver === index ? 'bg-primary/5' : ''
                              }`}
                            >
                              <td className="text-default-700 text-2xs font-semibold">{index + 1}</td>
                              <td className="text-default-800 font-medium">{qm.title}</td>
                              <td className="text-end">
                                <span className="flex items-center justify-end gap-1 lg:hidden">
                                  <button
                                    type="button"
                                    onClick={() => move(index, index - 1)}
                                    disabled={index === 0}
                                    className="btn btn-icon border-default-300 min-h-11 min-w-11 disabled:opacity-40"
                                    aria-label={`ย้าย "${qm.title}" ขึ้น`}
                                  >
                                    <Icon icon="chevron-up" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => move(index, index + 1)}
                                    disabled={index === visibleItems.length - 1}
                                    className="btn btn-icon border-default-300 min-h-11 min-w-11 disabled:opacity-40"
                                    aria-label={`ย้าย "${qm.title}" ลง`}
                                  >
                                    <Icon icon="chevron-down" />
                                  </button>
                                </span>
                                <Icon icon="grip-vertical" className="text-default-700 hidden text-base lg:inline" />
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr
                            key={qm.id}
                            onClick={() => startEdit(qm)}
                            className={`cursor-pointer ${editingId === qm.id ? 'bg-primary/5' : ''}`}
                          >
                            <td>
                              {imgs.length > 0 ? (
                                <span className="border-default-200 relative block size-10 overflow-hidden rounded border">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`/api/files/${imgs[0]}`} alt="" className="size-full object-cover" />
                                  {/* มีหลายรูป → ป้ายจำนวนมุมล่างขวา (เห็นจากตารางโดยไม่ต้องกดเข้าไปดู) */}
                                  {imgs.length > 1 && (
                                    <span className="bg-default-900/70 absolute end-0 bottom-0 px-1 text-2xs text-white">
                                      +{imgs.length - 1}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                /* ไม่มีรูป → เว้นว่างจริง ๆ ไม่ใส่กล่องเทา (กล่องเทาอ่านเป็น "รูปเสีย"
                                   ทั้งคอลัมน์ — user ติว่า UI ดูไม่ทันสมัย 2026-07-31)
                                   ความสูงแถวมาจากปุ่ม 44px ในคอลัมน์จัดการอยู่แล้ว ไม่ต้องค้ำ */
                                <span className="block size-10" aria-hidden="true" />
                              )}
                            </td>
                            <td>
                              <span className="block min-w-0">
                                <span className="text-default-800 block truncate font-medium">{qm.title}</span>
                                {/* จอเล็กไม่มีคอลัมน์ข้อความ — ยกตัวอย่างเนื้อหามาไว้ใต้หัวข้อแทน ไม่งั้นแยกไม่ออก
                                    ว่าอันไหนคืออันไหน (line-clamp ตั้ง display เอง ห้ามใส่ block ทับ) */}
                                <span className="text-default-700 line-clamp-1 text-2xs lg:hidden">{qm.body}</span>
                              </span>
                            </td>
                            <td className="hidden sm:table-cell">
                              {qm.category ? (
                                <span className="badge bg-default-100 text-default-700 text-2xs">{qm.category}</span>
                              ) : (
                                <span className="text-default-300">—</span>
                              )}
                            </td>
                            <td className="hidden max-w-xs lg:table-cell">
                              <span className="text-default-700 line-clamp-2 text-xs">{qm.body}</span>
                            </td>
                            {/* ปุ่มแบบ ghost — เดิมมีกรอบทุกใบ ทำให้ทั้งคอลัมน์เป็นตารางกล่องเล็ก ๆ
                                รกและดูเก่า (user ติ 2026-07-31) เหลือพื้นตอน hover ก็พอ
                                ยังกดง่ายเท่าเดิมเพราะพื้นที่กด 44px ไม่เปลี่ยน */}
                            <td className="text-end">
                              <span className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    startEdit(qm)
                                  }}
                                  className="text-default-700 hover:bg-light hover:text-primary flex size-11 items-center justify-center rounded-lg"
                                  aria-label={`แก้ไข ${qm.title}`}
                                >
                                  <Icon icon="pencil" className="text-base" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDelete(qm)
                                  }}
                                  className="text-default-700 hover:bg-danger/10 hover:text-danger flex size-11 items-center justify-center rounded-lg"
                                  aria-label={`ลบ ${qm.title}`}
                                >
                                  <Icon icon="trash" className="text-base" />
                                </button>
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {hasFilter && !sortMode && !loading && !error && localItems.length > 0 && (
              <p className="text-default-700 border-default-200 mb-0 border-t px-4 py-2 text-2xs">
                แสดง {visibleItems.length} จาก {localItems.length} รายการ
              </p>
            )}
          </>
        ) : (
          /* ══════════ หน้าฟอร์ม (เต็มโมดัล) ══════════ */
          <>
            <div className="min-h-0 grow overflow-y-auto p-4">
              <div className="mb-3 sm:flex sm:gap-3">
                <div className="mb-3 sm:mb-0 sm:flex-1">
                  <label className="form-label" htmlFor="qm-title">
                    หัวข้อ
                  </label>
                  <input
                    id="qm-title"
                    type="text"
                    className="form-input"
                    placeholder="เช่น ทักทาย, แจ้งเลขพัสดุ"
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="sm:flex-1">
                  <label className="form-label" htmlFor="qm-category">
                    หมวด (ไม่บังคับ)
                  </label>
                  <input
                    id="qm-category"
                    type="text"
                    className="form-input"
                    placeholder="เช่น การจัดส่ง, ราคา"
                    value={category}
                    maxLength={40}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="qm-body">
                  ข้อความ
                </label>
                <textarea
                  id="qm-body"
                  className="form-input min-h-40"
                  placeholder="พิมพ์เนื้อหาข้อความสำเร็จรูป..."
                  value={body}
                  maxLength={BODY_MAX}
                  onChange={(e) => setBody(e.target.value)}
                />
                <p
                  className={`mb-0 mt-1 text-end text-2xs ${
                    bodyLen > BODY_WARN ? 'text-warning' : 'text-default-700'
                  }`}
                >
                  {bodyLen} / {BODY_MAX}
                </p>
              </div>

              {/* รูปแนบ — ได้สูงสุด MAX_IMAGES รูป (user สั่ง 2026-07-23) เรียงตามลำดับที่จะส่งจริง */}
              <div>
                <span className="form-label">รูปแนบ (ไม่บังคับ · สูงสุด {MAX_IMAGES} รูป)</span>
                <div className="flex flex-wrap items-center gap-2">
                  {imageFileIds.map((fileId, i) => (
                    <div
                      key={fileId}
                      className="border-default-200 relative size-16 shrink-0 overflow-hidden rounded-lg border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/files/${fileId}`} alt={`รูปแนบที่ ${i + 1}`} className="size-full object-cover" />
                      {/* ปุ่มลบมุมขวาบน — hit area 28px บนรูป 64px (เล็กกว่า 44px โดยตั้งใจ ไม่งั้นทับรูปทั้งใบ
                          จนดูรูปไม่ออก) ปุ่มนี้เป็น action รองที่มีทางอื่นทดแทน: ลบทั้งชุดแล้วเลือกใหม่ */}
                      <button
                        type="button"
                        onClick={() => setImageFileIds((prev) => prev.filter((x) => x !== fileId))}
                        aria-label={`ลบรูปที่ ${i + 1}`}
                        className="bg-default-900/60 absolute end-0.5 top-0.5 flex size-7 items-center justify-center rounded-full text-white"
                      >
                        <Icon icon="x" width={14} height={14} />
                      </button>
                    </div>
                  ))}
                  {imageFileIds.length < MAX_IMAGES && (
                    <label className="btn border-default-300 min-h-11 cursor-pointer">
                      <input
                        type="file"
                        accept={IMAGE_ACCEPT}
                        multiple
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                      <Icon
                        icon={uploading ? 'loader-2' : 'photo-plus'}
                        className={`me-1 ${uploading ? 'animate-spin' : ''}`}
                      />
                      {uploading ? 'กำลังอัปโหลด...' : 'เพิ่มรูป'}
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="card-footer flex items-center gap-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={() => {
                    const target = localItems.find((i) => i.id === editingId)
                    if (target) handleDelete(target)
                  }}
                  className="text-danger flex min-h-11 items-center gap-2 text-sm font-semibold"
                >
                  <Icon icon="trash" />
                  <span className="hidden sm:inline">ลบข้อความนี้</span>
                </button>
              )}
              <div className="grow" />
              <button type="button" onClick={backToList} className="btn border-default-300 min-h-11">
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || saving}
                className="btn bg-primary hover:bg-primary-hover min-h-11 text-white disabled:opacity-60"
              >
                <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} />
                {isEditing ? 'บันทึกการแก้ไข' : 'เพิ่มข้อความ'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
