'use client'

/**
 * CustomerCrmSection — CRM/tag ต่อผู้ติดต่อ ในแท็บ "ลูกค้า" ของ right panel (feature 00018)
 *
 * View-only + ปุ่มดินสอ (pencil) กดแก้ไขทั้งชุด → save (PATCH /api/chat/conversations/[id]/crm).
 * ฟิลด์: ชื่อในแชท (alias, ต่อแชท) / ชื่อจริง (view-only) / สถานะการขาย / tag / เบอร์ (หลายเบอร์) /
 * ที่อยู่ / Note (AI ใช้ประกอบการตอบ). external=false (DEEP) → แก้ได้แค่ alias.
 *
 * Base: theme/paces form/elements (form-input/form-textarea/form-label) + badge (chip) — Paces primitive (HR7)
 */
import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'

type SalesStatus = 'UNSPECIFIED' | 'INTERESTED' | 'NOT_INTERESTED'

type Crm = {
  alias: string | null
  realName: string | null
  external: boolean
  note: string | null
  address: string | null
  salesStatus: SalesStatus
  tags: string[]
  phones: string[]
}

export const SALES_STATUS_META: Record<SalesStatus, { label: string; cls: string }> = {
  UNSPECIFIED: { label: 'ยังไม่ระบุ', cls: 'bg-default-100 text-default-500' },
  INTERESTED: { label: 'สนใจ', cls: 'bg-success/15 text-success' },
  NOT_INTERESTED: { label: 'ไม่สนใจ', cls: 'bg-default-200 text-default-600' },
}
const STATUS_ORDER: SalesStatus[] = ['UNSPECIFIED', 'INTERESTED', 'NOT_INTERESTED']

function ViewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-default-400 mb-0.5 text-2xs">{label}</p>
      <div className="text-default-800 text-sm">{children}</div>
    </div>
  )
}

export default function CustomerCrmSection({ conversationId }: { conversationId: string }) {
  const [crm, setCrm] = useState<Crm | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // draft state (edit mode)
  const [alias, setAlias] = useState('')
  const [note, setNote] = useState('')
  const [address, setAddress] = useState('')
  const [salesStatus, setSalesStatus] = useState<SalesStatus>('UNSPECIFIED')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [phones, setPhones] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/crm`, { cache: 'no-store' })
      if (!res.ok) return
      const data: Crm = await res.json()
      setCrm(data)
    } catch {
      // เงียบ — CRM เป็นส่วนเสริมของ panel
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    load()
  }, [load])

  function startEdit() {
    if (!crm) return
    setAlias(crm.alias ?? '')
    setNote(crm.note ?? '')
    setAddress(crm.address ?? '')
    setSalesStatus(crm.salesStatus)
    setTags(crm.tags)
    setPhones(crm.phones)
    setTagInput('')
    setEditing(true)
  }

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput('')
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const body = {
        alias: alias.trim() || null,
        ...(crm?.external
          ? {
              note: note.trim() || null,
              address: address.trim() || null,
              salesStatus,
              tags,
              phones: phones.map((p) => p.trim()).filter(Boolean),
            }
          : {}),
      }
      const res = await fetch(`/api/chat/conversations/${conversationId}/crm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        pacesToast.chat.error(d?.error ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
        return
      }
      const data: Crm = await res.json()
      setCrm(data)
      setEditing(false)
      pacesToast.chat.success('บันทึกข้อมูลลูกค้าแล้ว')
    } catch {
      pacesToast.chat.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="bg-default-100 h-40 animate-pulse rounded-lg" />
  }
  if (!crm) return null

  // ── VIEW MODE ──
  if (!editing) {
    const status = SALES_STATUS_META[crm.salesStatus]
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-default-700 text-sm font-semibold">ข้อมูลลูกค้า</span>
          <button type="button" onClick={startEdit} className="text-primary flex items-center gap-1 text-xs font-medium hover:underline">
            <Icon icon="pencil" className="text-sm" /> แก้ไข
          </button>
        </div>

        {crm.alias && <ViewRow label="ชื่อในแชท">{crm.alias}</ViewRow>}
        <ViewRow label="ชื่อจริง">{crm.realName || <span className="text-default-400">—</span>}</ViewRow>

        {crm.external ? (
          <>
            <ViewRow label="สถานะการขาย">
              <span className={`badge text-2xs ${status.cls}`}>{status.label}</span>
            </ViewRow>
            <ViewRow label="แท็ก">
              {crm.tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {crm.tags.map((t) => (
                    <span key={t} className="badge bg-primary/15 text-primary text-2xs">{t}</span>
                  ))}
                </div>
              ) : (
                <span className="text-default-400">—</span>
              )}
            </ViewRow>
            <ViewRow label="เบอร์โทร">
              {crm.phones.length ? (
                <div className="space-y-0.5">{crm.phones.map((p) => <p key={p} className="mb-0">{p}</p>)}</div>
              ) : (
                <span className="text-default-400">—</span>
              )}
            </ViewRow>
            <ViewRow label="ที่อยู่">{crm.address || <span className="text-default-400">—</span>}</ViewRow>
            <ViewRow label="โน้ต (AI ใช้ประกอบการตอบ)">
              {crm.note ? <span className="whitespace-pre-wrap">{crm.note}</span> : <span className="text-default-400">—</span>}
            </ViewRow>
          </>
        ) : (
          <p className="text-default-400 text-2xs">แท็ก/โน้ต/สถานะ ใช้ได้เฉพาะแชทช่องทางภายนอก (Messenger/Instagram)</p>
        )}
      </div>
    )
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-default-700 text-sm font-semibold">แก้ไขข้อมูลลูกค้า</span>
      </div>

      <div>
        <label className="form-label">ชื่อในแชท</label>
        <input type="text" className="form-input" placeholder="เช่น Wave 110" value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} />
      </div>

      {crm.external && (
        <>
          <div>
            <label className="form-label">สถานะการขาย</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSalesStatus(s)}
                  className={`badge text-xs ${salesStatus === s ? SALES_STATUS_META[s].cls + ' ring-1 ring-current' : 'bg-default-100 text-default-500'}`}
                >
                  {SALES_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">แท็ก</label>
            {tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="badge bg-primary/15 text-primary text-2xs inline-flex items-center gap-1">
                    {t}
                    <button type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} aria-label={`ลบแท็ก ${t}`}>
                      <Icon icon="x" width={11} height={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="form-input"
                placeholder="พิมพ์แท็กแล้วกด +"
                value={tagInput}
                maxLength={30}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
              />
              <button type="button" onClick={addTag} className="btn btn-icon border-default-300 shrink-0" aria-label="เพิ่มแท็ก">
                <Icon icon="plus" />
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">เบอร์โทร (เพิ่มได้หลายเบอร์)</label>
            <div className="space-y-1.5">
              {phones.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="เบอร์โทร"
                    value={p}
                    maxLength={20}
                    onChange={(e) => setPhones((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button type="button" onClick={() => setPhones((prev) => prev.filter((_, j) => j !== i))} className="btn btn-icon border-default-300 shrink-0" aria-label="ลบเบอร์">
                    <Icon icon="trash" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPhones((prev) => [...prev, ''])} className="text-primary text-xs font-medium hover:underline">
                + เพิ่มเบอร์
              </button>
            </div>
          </div>

          <div>
            <label className="form-label">ที่อยู่</label>
            <input type="text" className="form-input" placeholder="ที่อยู่จัดส่ง" value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div>
            <label className="form-label">โน้ต (AI ใช้ประกอบการตอบ)</label>
            <textarea className="form-input min-h-20" placeholder="ข้อมูลที่ควรจำเกี่ยวกับลูกค้าคนนี้..." value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving} className="btn btn-sm bg-primary text-white hover:bg-primary-hover disabled:opacity-60">
          <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} /> บันทึก
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn btn-sm border-default-300">
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
