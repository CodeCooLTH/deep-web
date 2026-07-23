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
import TagInput from '../../components/TagInput'

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

/** variant — right panel แยกเป็น 3 แท็บ (user สั่ง 2026-07-23: ข้อมูลลูกค้า / คำสั่งซื้อ / โน๊ต)
 *  จึงต้องแบ่งฟิลด์ของ CRM ชุดเดียวกันออกเป็น 2 แท็บ: 'profile' = ทุกฟิลด์ยกเว้นโน้ต,
 *  'note' = โน้ตอย่างเดียว. ใช้ component เดียวกันเพื่อไม่ให้ logic fetch/save/PATCH แตกเป็น 2 ชุด
 *  (PATCH เป็น partial อยู่แล้ว — ส่งเฉพาะฟิลด์ของ variant นั้น ฟิลด์ที่ไม่ส่ง = ไม่ถูกแตะ) */
type CrmVariant = 'profile' | 'note'

export default function CustomerCrmSection({
  conversationId,
  variant = 'profile',
}: {
  conversationId: string
  variant?: CrmVariant
}) {
  const isNote = variant === 'note'
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
    setEditing(true)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      // PATCH เป็น partial — ส่งเฉพาะฟิลด์ของแท็บที่กำลังแก้ (แท็บโน้ตส่งแค่ note, แท็บข้อมูล
      // ลูกค้าไม่ส่ง note เลย) ฟิลด์ที่ไม่ส่ง = ไม่ถูกแตะ จึงแก้คนละแท็บพร้อมกันได้ไม่ทับกัน
      const body = isNote
        ? { note: note.trim() || null }
        : {
            alias: alias.trim() || null,
            ...(crm?.external
              ? {
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
      pacesToast.chat.success(isNote ? 'บันทึกโน้ตแล้ว' : 'บันทึกข้อมูลลูกค้าแล้ว')
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

    // แท็บ "โน๊ต" — โน้ตอย่างเดียว (ใช้ได้เฉพาะแชทช่องทางภายนอก เหมือนฟิลด์ CRM อื่น)
    if (isNote) {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-default-700 text-sm font-semibold">โน้ตภายในร้าน</span>
            {crm.external && (
              <button type="button" onClick={startEdit} className="text-primary flex items-center gap-1 text-xs font-medium hover:underline">
                <Icon icon="pencil" className="text-sm" /> แก้ไข
              </button>
            )}
          </div>
          {crm.external ? (
            <>
              {crm.note ? (
                <p className="text-default-800 mb-0 text-sm whitespace-pre-wrap">{crm.note}</p>
              ) : (
                <p className="text-default-400 mb-0 text-sm">ยังไม่มีโน้ต</p>
              )}
              {/* บอกผลลัพธ์ที่ผู้ใช้ได้ ไม่ใช่กลไกภายใน: โน้ตนี้ถูกส่งเป็นบริบทให้ AI ตอนช่วยร่างคำตอบ */}
              <p className="text-default-400 mb-0 text-2xs">ลูกค้าไม่เห็นโน้ตนี้ — AI ใช้ประกอบการร่างคำตอบ</p>
            </>
          ) : (
            <p className="text-default-400 mb-0 text-2xs">โน้ตใช้ได้เฉพาะแชทช่องทางภายนอก (Messenger/Instagram)</p>
          )}
        </div>
      )
    }

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
            {/* โน้ตย้ายไปแท็บ "โน๊ต" แล้ว (user สั่ง 2026-07-23) — ไม่แสดงซ้ำที่นี่ */}
          </>
        ) : (
          <p className="text-default-400 text-2xs">แท็ก/สถานะการขาย ใช้ได้เฉพาะแชทช่องทางภายนอก (Messenger/Instagram)</p>
        )}
      </div>
    )
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-default-700 text-sm font-semibold">{isNote ? 'แก้ไขโน้ต' : 'แก้ไขข้อมูลลูกค้า'}</span>
      </div>

      {isNote ? (
        <div>
          <label className="form-label">โน้ต</label>
          <textarea className="form-input min-h-32" placeholder="ข้อมูลที่ควรจำเกี่ยวกับลูกค้าคนนี้..." value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          <p className="text-default-400 mt-1 mb-0 text-2xs">ลูกค้าไม่เห็นโน้ตนี้ — AI ใช้ประกอบการร่างคำตอบ</p>
        </div>
      ) : (
        <div>
          <label className="form-label">ชื่อในแชท</label>
          <input type="text" className="form-input" placeholder="เช่น Wave 110" value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} />
        </div>
      )}

      {!isNote && crm.external && (
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
            <TagInput selected={tags} onAdd={(t) => setTags((prev) => [...prev, t])} />
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
          {/* ช่องโน้ตอยู่ในแท็บ "โน๊ต" แล้ว — ไม่ซ้ำที่นี่ */}
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
