'use client'

/**
 * คลังความรู้ของ ChatBot — รายการ + ค้นหา + เพิ่ม/แก้/ลบ
 * feature 00023 · phase `00023-ai-enhance`
 *
 * Base: settings/auto-reply/[id]/qna/QnaListingClient.tsx (ยกโครงรายการ/โมดัล/สวิตช์มา
 *   ตัดส่วนที่เป็นของกลุ่มคำออก: ชิปกรอง 4 ตัว, เลือกหลายข้อ, ย้ายกลุ่ม — คลังกลาง
 *   ไม่มีกลุ่มให้ย้ายไป และรายการยังไม่โตพอจะต้องใช้ bulk)
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { pacesConfirm } from '@/lib/paces-swal'

export type KnowledgeRow = {
  id: string
  question: string
  answer: string
  isActive: boolean
  useCount: number
}

type Props = {
  canEdit: boolean
  initialItems: KnowledgeRow[]
  initialStats: { total: number; active: number; totalUses: number }
}

export default function KnowledgeClient({ canEdit, initialItems, initialStats }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<KnowledgeRow | 'NEW' | null>(null)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (it) => it.question.toLowerCase().includes(q) || it.answer.toLowerCase().includes(q),
    )
  }, [items, search])

  async function readError(res: Response, fallback: string) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  async function toggleActive(row: KnowledgeRow) {
    if (!canEdit || busy) return
    const next = !row.isActive
    setItems((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: next } : r)))
    try {
      const res = await fetch(`/api/shops/auto-reply/knowledge/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) throw new Error(await readError(res, 'บันทึกไม่สำเร็จ'))
    } catch (e) {
      setItems((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)))
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function remove(row: KnowledgeRow) {
    if (!canEdit || busy) return
    const ok = await pacesConfirm.danger('ลบข้อนี้ออกจากคลัง?', 'คำถามและคำตอบจะหายไปและกู้คืนไม่ได้', {
      confirmButtonText: 'ลบ',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/shops/auto-reply/knowledge/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await readError(res, 'ลบไม่สำเร็จ'))
      pacesToast.success('ลบเรียบร้อย')
      router.refresh()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="card-title">คลังความรู้ของบอท</h4>
          <p className="text-default-500 mt-0.5 text-xs">
            {initialStats.total.toLocaleString('th-TH')} ข้อ · ใช้งานอยู่ {initialStats.active.toLocaleString('th-TH')} ·
            ถูกใช้ตอบ {initialStats.totalUses.toLocaleString('th-TH')} ครั้ง
          </p>
        </div>
        <div className="flex items-center gap-2 sm:w-auto">
          {/* ยุบช่องค้นหาเข้าแถวหัวการ์ด — เดิมกินอีกหนึ่งบล็อกเต็มความกว้างเหนือรายการ */}
          <div className="input-icon-group min-w-0 flex-1 sm:w-56 sm:flex-none">
            <Icon icon="search" className="input-icon" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="text"
              className="form-input form-input-sm"
              placeholder="ค้นหา"
              aria-label="ค้นหาในคลังความรู้"
            />
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing('NEW')}
              /* min-h-11 (44px): tap-target มือถือ — btn-sm สูงราว 31px ไม่พอ (HR7 carve-out) */
              className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 shrink-0 rounded-full text-white"
              aria-label="เพิ่มความรู้"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">เพิ่ม</span>
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          <Icon icon="message-2-bolt" className="text-default-300 size-12" aria-hidden="true" />
          <h5 className="text-default-800 font-semibold">คลังยังว่าง</h5>
          <p className="text-default-500 max-w-md text-sm">
            ChatBot ตอบจากคลังนี้เท่านั้น ไม่ได้เดาเอง — ใส่คำถามที่ลูกค้าถามบ่อยพร้อมคำตอบที่ถูกต้องไว้ก่อน
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing('NEW')}
              className="btn bg-primary hover:bg-primary-hover min-h-11 rounded-full text-white"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              เพิ่มข้อแรก
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="card-body text-default-500 py-10 text-center text-sm">ไม่พบข้อที่ตรงกับคำค้นหา</div>
      ) : (
        <ul className="divide-default-200 divide-y">
          {visible.map((row) => (
            <li
              key={row.id}
              className={`flex items-center gap-2.5 px-4 py-2 ${!row.isActive ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-default-800 truncate text-sm font-medium">{row.question}</p>
                <p className="text-default-400 truncate text-xs">{row.answer || 'ตอบด้วยรูปอย่างเดียว'}</p>
              </div>
              {/* จำนวนครั้งซ่อนบนมือถือ — ไม่ใช่ข้อมูลที่ต้องตัดสินใจ ณ ตรงนั้น */}
              <span className="text-default-500 hidden shrink-0 text-xs tabular-nums sm:inline">
                {row.useCount.toLocaleString('th-TH')} ครั้ง
              </span>
              {canEdit && (
                <>
                  {/* ลบย้ายไปอยู่ในโมดัลแก้ไข — แถวเหลือ 2 ปุ่ม อ่านง่ายขึ้นและกดลบพลาดยากขึ้น */}
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="btn btn-icon btn-sm bg-light text-default-700 shrink-0"
                    aria-label={`แก้ไข ${row.question}`}
                  >
                    <Icon icon="pencil" className="size-4" aria-hidden="true" />
                  </button>
                  <input
                    type="checkbox"
                    className="form-switch form-switch-sm shrink-0"
                    checked={row.isActive}
                    onChange={() => toggleActive(row)}
                    aria-label={row.isActive ? `ปิดใช้งาน ${row.question}` : `เปิดใช้งาน ${row.question}`}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <KnowledgeModal
          row={editing === 'NEW' ? null : editing}
          onDelete={editing === 'NEW' ? undefined : () => remove(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/** โมดัลเพิ่ม/แก้ — Base: qna/QnaListingClient.tsx QnaEditModal (shell เดียวกัน) */
function KnowledgeModal({
  row,
  onClose,
  onSaved,
  onDelete,
}: {
  row: KnowledgeRow | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const [question, setQuestion] = useState(row?.question ?? '')
  const [answer, setAnswer] = useState(row?.answer ?? '')
  const [saving, setSaving] = useState(false)
  const canSave = question.trim().length > 0 && answer.trim().length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      const url = row ? `/api/shops/auto-reply/knowledge/${row.id}` : '/api/shops/auto-reply/knowledge'
      const res = await fetch(url, {
        method: row ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ')
      }
      pacesToast.success('บันทึกเรียบร้อย')
      onSaved()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/40 lg:items-center">
      <div className="bg-card max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl lg:max-h-[80dvh] lg:max-w-lg lg:rounded-2xl"> {/* HR7 carve-out: ไม่มี token viewport-height ใน Paces scale — precedent CustomerPanelSheet.tsx บรรทัดเดียวกัน */}
        <div className="border-default-200 flex items-center justify-between border-b px-4 py-3">
          <h5 className="font-semibold">{row ? 'แก้ไขความรู้' : 'เพิ่มความรู้'}</h5>
          <button type="button" onClick={onClose} className="btn btn-icon btn-sm bg-light text-default-700" aria-label="ปิด">
            <Icon icon="x" className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div>
            <label htmlFor="kn-q" className="form-label">คำถาม</label>
            <input
              id="kn-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="form-input"
              maxLength={500}
              placeholder="เช่น ค่าส่งต่างจังหวัดคิดยังไง"
            />
          </div>
          <div>
            <label htmlFor="kn-a" className="form-label">คำตอบ</label>
            <textarea
              id="kn-a"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="form-textarea"
              rows={4}
              maxLength={2000}
              placeholder="คำตอบที่ถูกต้อง — ChatBot จะใช้ข้อมูลนี้ตอบ ห้ามเดาเอง"
            />
          </div>
        </div>
        <div className="border-default-200 flex items-center gap-2 border-t px-4 py-3">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn btn-icon bg-light text-danger min-h-11 me-auto"
              aria-label="ลบข้อนี้"
            >
              <Icon icon="trash" className="size-4" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onClose} className="btn bg-light text-default-700 min-h-11 ms-auto">ยกเลิก</button>
          <button type="button" onClick={save} disabled={!canSave} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
