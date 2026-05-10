'use client'

// Base: theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx
//   (อ้างอิง pill style + bg-primary/10 text-primary chip pattern จาก radio toggle)
// Base (sibling): src/app/(paces)/seller/(dashboard)/products/components/ProductTagsCardV2.tsx
//   (chips input UX — Enter/comma commit, Backspace remove last, dedupe case-insensitive,
//    container border focus-within ring; ที่นี่ duplicate pattern เป็น per-row chip input)
// Layout override (Shopee/Lazada-style variant editor, desktop only):
//   - hidden lg:block — mobile ไม่กรอกที่นี่ (ใช้พื้นที่เยอะเกินไป)
//   - preset quick-add buttons (สี/ขนาด/วัสดุ/น้ำหนัก/ปริมาณ/รุ่น) + "+ อื่นๆ" ปลายแถว
//   - แต่ละหัวข้อเป็น row card (border + rounded + padding) — key locked สำหรับ preset,
//     editable input สำหรับ "อื่นๆ"; chips input ด้านล่างให้ใส่หลายค่าได้
//   - schema unchanged: Record<string, string> โดย value เป็น "แดง, น้ำเงิน, ดำ" comma-joined
import { Icon } from '@iconify/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'

interface ProductAttributesCardV2Props {
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  maxRows?: number
  error?: string
}

interface Row {
  id: string
  key: string
  values: string[]
  keyLocked: boolean
}

interface Preset {
  key: string
  icon: string
}

const PRESETS: Preset[] = [
  { key: 'สี', icon: 'tabler:palette' },
  { key: 'ขนาด', icon: 'tabler:ruler' },
  { key: 'วัสดุ', icon: 'tabler:texture' },
  { key: 'น้ำหนัก', icon: 'tabler:weight' },
  { key: 'ปริมาณ', icon: 'tabler:flask' },
  { key: 'รุ่น', icon: 'tabler:device-mobile' },
]

const PRESET_KEYS = new Set(PRESETS.map((p) => p.key))
const PRESET_ICON_BY_KEY: Record<string, string> = Object.fromEntries(
  PRESETS.map((p) => [p.key, p.icon]),
)

const MAX_VALUES_PER_ROW = 20
const MAX_VALUE_LEN = 200
const MAX_KEY_LEN = 50

// stable id สำหรับ React key — ไม่ต้อง persist
const newId = () => `attr-${Math.random().toString(36).slice(2, 10)}`

// แยก comma-joined string → string[] (trim + filter empty)
const splitValues = (raw: string): string[] =>
  raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)

// แปลง record (comma-joined value) → rows (ใช้ตอน mount/reset เท่านั้น)
const recordToRows = (rec: Record<string, string>): Row[] =>
  Object.entries(rec).map(([k, v]) => ({
    id: newId(),
    key: k,
    values: splitValues(v),
    keyLocked: PRESET_KEYS.has(k),
  }))

// แปลง rows → record (comma-joined; ข้าม row ที่ key หรือ values ว่าง — last-write-wins ฝั่ง dup key)
const rowsToRecord = (rows: Row[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    const cleaned = r.values.map((v) => v.trim()).filter((v) => v.length > 0)
    if (!k || cleaned.length === 0) continue
    out[k] = cleaned.join(', ')
  }
  return out
}

export default function ProductAttributesCardV2({
  value,
  onChange,
  maxRows = 10,
  error,
}: ProductAttributesCardV2Props) {
  const [rows, setRows] = useState<Row[]>(() => recordToRows(value))
  // chip input ปัจจุบัน per row (uncommitted text)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // refs สำหรับ auto-focus chip input ตอนกด preset / + อื่นๆ
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const focusTargetRef = useRef<string | null>(null)

  // sync เมื่อ parent reset form (key length เปลี่ยน) — ไม่ sync ทุก keystroke เพื่อกัน loop
  const valueLengthRef = useRef(Object.keys(value).length)
  useEffect(() => {
    const incomingLength = Object.keys(value).length
    if (incomingLength !== valueLengthRef.current && incomingLength !== rows.length) {
      setRows(recordToRows(value))
      setDrafts({})
      valueLengthRef.current = incomingLength
    }
  }, [value, rows.length])

  // focus หลัง render เมื่อมี target
  useEffect(() => {
    const id = focusTargetRef.current
    if (!id) return
    const el = inputRefs.current[id]
    if (el) {
      el.focus()
      focusTargetRef.current = null
    }
  }, [rows])

  const emit = useCallback(
    (next: Row[]) => {
      setRows(next)
      onChange(rowsToRecord(next))
    },
    [onChange],
  )

  const canAdd = rows.length < maxRows

  const handleAddPreset = (preset: Preset) => {
    // ถ้า preset key มี row อยู่แล้ว → focus chip input ของ row นั้น
    const existing = rows.find((r) => r.key === preset.key)
    if (existing) {
      focusTargetRef.current = existing.id
      // trigger effect by setting state เดิม (rows ref เปลี่ยน) — ใช้ setRows([...rows])
      setRows((prev) => [...prev])
      return
    }
    if (!canAdd) return
    const id = newId()
    focusTargetRef.current = id
    emit([...rows, { id, key: preset.key, values: [], keyLocked: true }])
  }

  const handleAddCustom = () => {
    if (!canAdd) return
    const id = newId()
    focusTargetRef.current = id
    emit([...rows, { id, key: '', values: [], keyLocked: false }])
  }

  const handleRemoveRow = (id: string) => {
    setDrafts((d) => {
      const { [id]: _, ...rest } = d
      return rest
    })
    emit(rows.filter((r) => r.id !== id))
  }

  const handleKeyEdit = (id: string, nextKey: string) => {
    emit(rows.map((r) => (r.id === id ? { ...r, key: nextKey } : r)))
  }

  const setDraft = (id: string, text: string) => {
    setDrafts((d) => ({ ...d, [id]: text }))
  }

  const commitChip = (id: string, raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const row = rows.find((r) => r.id === id)
    if (!row) return
    if (row.values.length >= MAX_VALUES_PER_ROW) {
      toast.error(`ใส่ค่าได้สูงสุด ${MAX_VALUES_PER_ROW} รายการต่อหัวข้อ`)
      return
    }
    // dedupe case-insensitive ภายใน row เดียวกัน
    const lower = row.values.map((v) => v.toLowerCase())
    if (lower.includes(trimmed.toLowerCase())) {
      setDraft(id, '')
      return
    }
    const cleaned = trimmed.length > MAX_VALUE_LEN ? trimmed.slice(0, MAX_VALUE_LEN) : trimmed
    emit(rows.map((r) => (r.id === id ? { ...r, values: [...r.values, cleaned] } : r)))
    setDraft(id, '')
  }

  const removeChip = (id: string, idx: number) => {
    emit(
      rows.map((r) =>
        r.id === id ? { ...r, values: r.values.filter((_, i) => i !== idx) } : r,
      ),
    )
  }

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    const draft = drafts[id] ?? ''
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitChip(id, draft)
      return
    }
    if (e.key === 'Backspace' && draft.length === 0) {
      const row = rows.find((r) => r.id === id)
      if (row && row.values.length > 0) {
        e.preventDefault()
        emit(
          rows.map((r) => (r.id === id ? { ...r, values: r.values.slice(0, -1) } : r)),
        )
      }
    }
  }

  return (
    <div className="px-3 py-2.5 hidden lg:block">
      <div className="text-xs text-default-400 mb-2">รายละเอียดสินค้า</div>

      {/* Preset quick-add buttons — แสดงเป็น pill เล็ก ๆ */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PRESETS.map((p) => {
          const exists = rows.some((r) => r.key === p.key)
          const disabled = !exists && !canAdd
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handleAddPreset(p)}
              disabled={disabled}
              className={`inline-flex items-center gap-1 rounded-full border text-xs px-2.5 py-1 transition ${
                exists
                  ? 'border-primary/30 bg-primary/5 text-primary'
                  : 'border-default-200 text-default-600 hover:border-primary/30 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <Icon icon={p.icon} className="size-3.5" />
              <span>{p.key}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-default-300 text-xs px-2.5 py-1 text-default-600 hover:border-primary/30 hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon icon="tabler:plus" className="size-3.5" />
          <span>อื่นๆ</span>
        </button>
      </div>

      {/* Empty state helper */}
      {rows.length === 0 && (
        <div className="text-xs text-default-400 italic mb-2">
          ตัวอย่าง: สี = แดง, น้ำเงิน, ดำ
        </div>
      )}

      {/* Rows */}
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => {
            const presetIcon = row.keyLocked ? PRESET_ICON_BY_KEY[row.key] : null
            const draft = drafts[row.id] ?? ''
            const chipFull = row.values.length >= MAX_VALUES_PER_ROW
            return (
              <div
                key={row.id}
                className="border border-default-200 rounded-lg p-3"
              >
                {/* Row header — key field + remove */}
                <div className="flex items-center gap-2 mb-2">
                  {row.keyLocked ? (
                    <>
                      {presetIcon && (
                        <Icon icon={presetIcon} className="text-default-500 size-4" />
                      )}
                      <span className="font-medium text-sm">{row.key}</span>
                    </>
                  ) : (
                    <input
                      type="text"
                      aria-label="หัวข้อรายละเอียด"
                      placeholder="หัวข้อ เช่น น้ำหนัก"
                      value={row.key}
                      maxLength={MAX_KEY_LEN}
                      onChange={(e) => handleKeyEdit(row.id, e.target.value)}
                      className="form-input min-h-8 text-sm border-default-200 rounded-md px-2 flex-1"
                    />
                  )}
                  <button
                    type="button"
                    aria-label="ลบหัวข้อ"
                    onClick={() => handleRemoveRow(row.id)}
                    className="ms-auto text-default-400 hover:text-danger inline-flex items-center justify-center rounded p-1"
                  >
                    <Icon icon="tabler:x" className="size-4" />
                  </button>
                </div>

                {/* Chips input area */}
                <div className="flex flex-wrap gap-1.5 items-center min-h-9 border border-default-200 rounded-md px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/20">
                  {row.values.map((v, idx) => (
                    <span
                      key={`${row.id}-${idx}-${v}`}
                      className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs rounded px-2 py-0.5"
                    >
                      {v}
                      <button
                        type="button"
                        onClick={() => removeChip(row.id, idx)}
                        className="hover:text-danger inline-flex items-center"
                        aria-label={`ลบค่า ${v}`}
                      >
                        <Icon icon="tabler:x" className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    ref={(el) => {
                      inputRefs.current[row.id] = el
                    }}
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(row.id, e.target.value)}
                    onKeyDown={(e) => handleChipKeyDown(e, row.id)}
                    onBlur={() => {
                      // commit ค่าที่ยังพิมพ์ค้างอยู่ตอน blur (ตาม UX Shopee)
                      if (draft.trim().length > 0) commitChip(row.id, draft)
                    }}
                    placeholder={
                      row.values.length === 0 ? 'พิมพ์ค่าแล้วกด Enter' : ''
                    }
                    disabled={chipFull}
                    maxLength={MAX_VALUE_LEN}
                    aria-label={`เพิ่มค่าให้หัวข้อ ${row.key || 'ใหม่'}`}
                    className="flex-1 min-w-32 outline-none border-0 text-sm py-0.5 bg-transparent disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!canAdd && (
        <div className="text-xs text-default-300 mt-2">
          ครบ {maxRows} หัวข้อแล้ว
        </div>
      )}

      {error && <p className="text-danger text-xs mt-2">{error}</p>}
    </div>
  )
}
