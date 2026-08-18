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
import { useId, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import TagInput from '../../components/TagInput'
import { useT } from '@/i18n/LocaleProvider'
import type { Dictionary } from '@/i18n/dictionaries/th'

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

/**
 * ป้ายสถานะการขาย — เคยเป็นค่าคงที่ระดับ module จึงค้างเป็นไทยตลอดไป (feature 00047)
 * คลาสสี (`cls`) คงเดิมทุกตัว งานนี้แตะแต่คำ ไม่แตะสี
 */
export function salesStatusMeta(t: Dictionary): Record<SalesStatus, { label: string; cls: string }> {
  return {
    UNSPECIFIED: { label: t.inbox.customerPanel.salesStatusUnspecified, cls: 'bg-default-100 text-default-700' },
    INTERESTED: { label: t.inbox.customerPanel.salesStatusInterested, cls: 'bg-success/15 text-success' },
    NOT_INTERESTED: { label: t.inbox.customerPanel.salesStatusNotInterested, cls: 'bg-default-200 text-default-600' },
  }
}
const STATUS_ORDER: SalesStatus[] = ['UNSPECIFIED', 'INTERESTED', 'NOT_INTERESTED']

/** แถวข้อมูล view-mode — label เล็กบนหัว ค่าอยู่ล่าง
 *  text-xs (12px) ไม่ใช่ text-2xs: PRODUCT.md กำหนดว่า default ขนาดตัวอักษรต้องใหญ่กว่ามาตรฐาน
 *  เล็กน้อยเพื่อกลุ่ม digital-literacy ต่ำ/ผู้สูงวัย — 2xs กับ label ไทยที่มีสระบน-ล่างอ่านยากเกินไป */

function ViewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-default-700 mb-0.5 text-xs">{label}</p>
      <div className="text-default-800 text-sm">{children}</div>
    </div>
  )
}

/** ค่าว่าง — เดิมใช้ text-default-700 ซึ่งวัดได้ 2.46:1 บนการ์ดขาว (ตก AA ที่ต้อง 4.5:1) ทั้งที่
 *  PRODUCT.md ผูกมัด AA + "เข้าถึงพิเศษ" สำหรับผู้สูงวัย — default-600 อ่านออกกว่าโดยยังดูเป็นค่าว่าง */
const EmptyValue = () => <span className="text-default-600">—</span>

/** ปุ่ม "แก้ไข" — hit area ≥44px (เดิมเป็นลิงก์ข้อความสูง ~18px) โดยที่หน้าตายังเป็นลิงก์ข้อความ
 *  ตามเดิม: padding อยู่ใน element ไม่ใช่กรอบที่มองเห็น (impeccable critique P1-A) */
function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-primary hover:bg-primary/10 -me-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium"
    >
      <Icon icon="pencil" className="text-sm" /> แก้ไข
    </button>
  )
}

/** variant — right panel แยกเป็น 3 แท็บ (user สั่ง 2026-07-23: ข้อมูลลูกค้า / คำสั่งซื้อ / โน๊ต)
 *  จึงต้องแบ่งฟิลด์ของ CRM ชุดเดียวกันออกเป็น 2 แท็บ: 'profile' = ทุกฟิลด์ยกเว้นโน้ต,
 *  'note' = โน้ตอย่างเดียว. ใช้ component เดียวกันเพื่อไม่ให้ logic fetch/save/PATCH แตกเป็น 2 ชุด
 *  (PATCH เป็น partial อยู่แล้ว — ส่งเฉพาะฟิลด์ของ variant นั้น ฟิลด์ที่ไม่ส่ง = ไม่ถูกแตะ) */
type CrmVariant = 'profile' | 'note'

/**
 * `section` — ซอย **โหมดดู** ของ variant 'profile' ออกเป็น 3 กล่องตามม็อกอัพ V1
 * (user เคาะ 2026-08-18: "ซอยตาม V1 เลย ให้ทุกกล่องมีปุ่มแก้ไขเปิดฟอร์มเดียวกัน")
 *
 * 🛑 ซอยเฉพาะ **โหมดดู** เท่านั้น — โหมดแก้ไขยังเป็นฟอร์มเดียวเสมอ เพราะ:
 *   1) `PATCH /crm` เป็น partial ก็จริง แต่ฟิลด์พวกนี้ผู้ขายมักแก้พร้อมกันในรอบเดียว
 *      (ได้เบอร์มาพร้อมที่อยู่จากข้อความเดียวของลูกค้า) แยกฟอร์มคือบังคับให้กดบันทึก 3 รอบ
 *   2) draft state ชุดเดียวกันทั้งหมด แยกฟอร์ม = ต้องมี draft 3 ชุดที่ต้องคอย sync กันเอง
 * ⇒ ผู้เรียกจึงต้องเลิก render 3 กล่องแล้วเปิดฟอร์มเดียวแทนตอนเข้าโหมดแก้ไข (ดู `forceEdit`)
 *
 * `undefined` = ไม่ซอย (แสดงครบทุกฟิลด์) — ท่าเดิมก่อน V1 ที่ยังต้องรองรับ
 */
export type CrmSection = 'contact' | 'tags' | 'address'

/** CRM state ถูกยกไปไว้ที่ CustomerPanelBody (parent) แล้ว — เหตุผล (impeccable critique P0-1):
 *  1) เดิม fetch อยู่ในนี้ และ component ถูก unmount ทุกครั้งที่สลับแท็บ → โน้ตที่พิมพ์ค้างหายเงียบ ๆ
 *     + ยิง GET ใหม่ + skeleton กระพริบทุกครั้ง (แม่ค้าเปิดวันละหลายสิบเธรด = กระพริบหลายร้อยครั้ง)
 *  2) เดิม fetch fail แล้ว `return` เฉย ๆ → crm ค้าง null → `if (!crm) return null` → **แท็บว่างเปล่า
 *     สนิท** ไม่มีข้อความ ไม่มีปุ่มลองใหม่ (comment เดิมที่ว่า "CRM เป็นส่วนเสริม" ไม่จริงแล้ว
 *     ตั้งแต่ CRM กลายเป็นทั้งแท็บ)
 *  ตอนนี้ parent fetch ครั้งเดียว ถือ error state เอง และ panel ทุกแท็บ mount ค้างไว้ (ซ่อนด้วย
 *  `hidden`) → draft อยู่รอดข้ามแท็บ */
export type { Crm as ConversationCrm }

export default function CustomerCrmSection({
  conversationId,
  variant = 'profile',
  section,
  forceEdit = false,
  onRequestEdit,
  onExitEdit,
  crm,
  onSaved,
}: {
  conversationId: string
  variant?: CrmVariant
  /** ซอยโหมดดูเป็นกล่องย่อย (ดู `CrmSection`) — ไม่มีผลกับโหมดแก้ไข */
  section?: CrmSection
  /**
   * เปิดมาเป็นฟอร์มแก้ไขทันที — instance นี้ **mount ใหม่ตอนเข้าโหมดแก้ไข** ⇒ draft ถูกเติมจาก
   * `crm` ที่ initializer ไม่ต้องผ่าน `startEdit()` และไม่มี draft ค้างจากรอบก่อนหลุดมา
   */
  forceEdit?: boolean
  /** ผู้เรียกคุมโหมดแก้ไขเอง (กล่องซอยตาม V1) — ไม่ส่งมา = component คุมเองแบบเดิม */
  onRequestEdit?: () => void
  onExitEdit?: () => void
  crm: Crm
  /** parent เก็บ crm ที่อัปเดตแล้วต่อ (แชร์ระหว่างแท็บ) */
  onSaved: (next: Crm) => void
}) {
  const t = useT()
  const SALES_STATUS_META = salesStatusMeta(t)
  const isNote = variant === 'note'
  const fieldId = useId()
  const [editing, setEditing] = useState(forceEdit)
  const [saving, setSaving] = useState(false)

  /** ออกจากโหมดแก้ไข — ผู้เรียกที่คุมเอง (V1) เป็นคนถอด instance นี้ทิ้ง ไม่ใช่ setState ที่นี่ */
  const leaveEdit = () => (onExitEdit ? onExitEdit() : setEditing(false))

  // draft state (edit mode) — เติมจาก crm ตั้งแต่ initializer เพื่อให้ `forceEdit` ใช้ได้โดยไม่ต้อง
  // ผ่าน startEdit(); ท่าเดิม (กดดินสอในตัวเอง) ยังเรียก startEdit() เติมทับอีกทีตามปกติ
  const [alias, setAlias] = useState(crm?.alias ?? '')
  const [note, setNote] = useState(crm?.note ?? '')
  const [address, setAddress] = useState(crm?.address ?? '')
  const [salesStatus, setSalesStatus] = useState<SalesStatus>(crm?.salesStatus ?? 'UNSPECIFIED')
  const [tags, setTags] = useState<string[]>(crm?.tags ?? [])
  const [phones, setPhones] = useState<string[]>(crm?.phones ?? [])

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
      onSaved(data)
      leaveEdit()
      pacesToast.chat.success(isNote ? 'บันทึกโน้ตแล้ว' : 'บันทึกข้อมูลลูกค้าแล้ว')
    } catch {
      pacesToast.chat.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  // ── VIEW MODE ──
  if (!editing) {
    const status = SALES_STATUS_META[crm.salesStatus]
    const show = (k: CrmSection) => !section || section === k

    // แท็บ "โน๊ต" — โน้ตอย่างเดียว (ใช้ได้เฉพาะแชทช่องทางภายนอก เหมือนฟิลด์ CRM อื่น)
    if (isNote) {
      return (
        <div className="space-y-3">
          {/* ไม่มีหัวข้อซ้ำชื่อแท็บ (แท็บที่ active บอกอยู่แล้วว่าอยู่หน้าไหน) — เหลือแค่ปุ่มแก้ไข
              ชิดขวา (user ทัก 2026-07-23 เรื่อง "การเน้น title"): หัวข้อ "โน้ตภายในร้าน"/"ข้อมูล
              ลูกค้า" ที่ซ้ำกับแท็บทำให้มี 2 ระดับหัวเรื่องซ้อนกันโดยไม่เพิ่มข้อมูลอะไร */}
          {crm.external && (
            <div className="flex justify-end">
              <EditButton onClick={startEdit} />
            </div>
          )}
          {crm.external ? (
            <>
              {crm.note ? (
                <p className="text-default-800 mb-0 text-sm whitespace-pre-wrap">{crm.note}</p>
              ) : (
                <p className="text-default-600 mb-0 text-sm">ยังไม่มีโน้ต</p>
              )}
              {/* บอกผลลัพธ์ที่ผู้ใช้ได้ ไม่ใช่กลไกภายใน: โน้ตนี้ถูกส่งเป็นบริบทให้ AI ตอนช่วยร่างคำตอบ */}
              <p className="text-default-700 mb-0 text-xs">ลูกค้าไม่เห็นโน้ตนี้ — AI ใช้ประกอบการร่างคำตอบ</p>
            </>
          ) : (
            <p className="text-default-700 mb-0 text-xs">โน้ตใช้ได้เฉพาะแชทช่องทางภายนอก (Messenger/Instagram)</p>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {/* หัวข้อซ้ำชื่อแท็บถูกตัดออก — ดูเหตุผลที่ variant โน้ต */}
        <div className="flex justify-end">
          <EditButton onClick={onRequestEdit ?? startEdit} />
        </div>

        {/* 🛑 `show(...)` = ตัวเดียวที่ตัดสินว่าฟิลด์ไหนอยู่กล่องไหน — ไม่มี section ส่งมา = แสดงครบ
            (ท่าเดิมก่อน V1 ที่ยังมีผู้เรียกอยู่) เพิ่ม section ใหม่ต้องมาแก้ที่นี่ที่เดียว */}
        {show('contact') && (
          <>
            {crm.alias && <ViewRow label={t.inbox.customerPanel.aliasLabel}>{crm.alias}</ViewRow>}
            <ViewRow label={t.inbox.customerPanel.realNameLabel}>{crm.realName || <EmptyValue />}</ViewRow>
          </>
        )}

        {crm.external ? (
          <>
            {show('tags') && (
              <>
                <ViewRow label={t.inbox.customerPanel.salesStatusLabel}>
                  <span className={`badge text-2xs ${status.cls}`}>{status.label}</span>
                </ViewRow>
                <ViewRow label={t.inbox.tagsLabel}>
                  {crm.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {crm.tags.map((t) => (
                        <span key={t} className="badge bg-primary/15 text-primary text-xs">{t}</span>
                      ))}
                    </div>
                  ) : (
                    <EmptyValue />
                  )}
                </ViewRow>
              </>
            )}
            {show('contact') && (
              <ViewRow label={t.inbox.customerPanel.phoneLabel}>
                {crm.phones.length ? (
                  <div className="space-y-0.5">{crm.phones.map((p) => <p key={p} className="mb-0">{p}</p>)}</div>
                ) : (
                  <EmptyValue />
                )}
              </ViewRow>
            )}
            {show('address') && (
              <ViewRow label={t.inbox.customerPanel.addressLabel}>{crm.address || <EmptyValue />}</ViewRow>
            )}
            {/* โน้ตย้ายไปแท็บ "โน้ต" แล้ว (user สั่ง 2026-07-23) — ไม่แสดงซ้ำที่นี่ */}
          </>
        ) : (
          /* คำอธิบาย "ใช้ได้เฉพาะช่องทางภายนอก" ขึ้นกล่องเดียวพอ — 3 กล่องพูดประโยคเดียวกัน
             เรียงต่อกันคือเสียงรบกวน ไม่ใช่ข้อมูลเพิ่ม (กล่องแรกของชุดเป็นคนพูด) */
          show('contact') && <p className="text-default-700 text-xs">{t.inbox.customerPanel.externalOnlyNotice}</p>
        )}
      </div>
    )
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-3">
      {/* ไม่มีหัวข้อ "แก้ไข…" — โหมดสื่อผ่านปุ่ม (ดินสอ ↔ บันทึก/ยกเลิก) ซึ่งชัดกว่าอยู่แล้ว และ
          การมีหัวข้อเฉพาะตอน edit ทำให้เนื้อหากระโดดลง ~24px ทุกครั้งที่สลับโหมด (critique P2-2) */}
      {isNote ? (
        <div>
          <label className="form-label" htmlFor={`${fieldId}-note`}>โน้ต</label>
          <textarea id={`${fieldId}-note`} className="form-input min-h-32" placeholder="ข้อมูลที่ควรจำเกี่ยวกับลูกค้าคนนี้..." value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          <p className="text-default-700 mt-1 mb-0 text-xs">ลูกค้าไม่เห็นโน้ตนี้ — AI ใช้ประกอบการร่างคำตอบ</p>
        </div>
      ) : (
        <div>
          <label className="form-label" htmlFor={`${fieldId}-alias`}>ชื่อในแชท</label>
          <input id={`${fieldId}-alias`} type="text" className="form-input" placeholder="เช่น Wave 110" value={alias} maxLength={80} onChange={(e) => setAlias(e.target.value)} />
        </div>
      )}

      {!isNote && crm.external && (
        <>
          <div>
            <span className="form-label" id={`${fieldId}-status-label`}>สถานะการขาย</span>
            {/* chip เลือกได้: ตอน selected ใช้ primary + ring สีเดียวกันทุกสถานะ — เดิม "ยังไม่ระบุ"
                ตอน selected ใช้สไตล์เดียวกับ unselected เป๊ะ (ต่างแค่ ring เทา) จนมองไม่ออกว่าเลือกอยู่
                (critique P2-1) และ min-h-11 ให้ hit area ผ่านเกณฑ์ ≥44px */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${fieldId}-status-label`}>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSalesStatus(s)}
                  aria-pressed={salesStatus === s}
                  className={`badge inline-flex min-h-11 items-center px-3 text-xs ${
                    salesStatus === s
                      ? 'bg-primary/15 text-primary ring-1 ring-primary'
                      : 'bg-default-100 text-default-700'
                  }`}
                >
                  {SALES_STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="form-label">แท็ก</span>
            {tags.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="badge bg-primary/15 text-primary inline-flex items-center gap-0.5 ps-3 pe-0.5 text-xs">
                    {t}
                    {/* ปุ่มลบแท็กเดิมเป็นไอคอน 11px เปล่า ๆ (เล็กกว่าเกณฑ์ ≥44px เกือบ 4 เท่า —
                        critique P1-A) ตอนนี้ hit area size-9 + ไอคอนคงขนาดเดิมเพื่อไม่ให้ chip บวม */}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      aria-label={`ลบแท็ก ${t}`}
                      className="hover:bg-primary/15 flex size-9 items-center justify-center rounded-full"
                    >
                      <Icon icon="x" width={12} height={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <TagInput selected={tags} onAdd={(t) => setTags((prev) => [...prev, t])} />
          </div>

          <div>
            <span className="form-label">เบอร์โทร (เพิ่มได้หลายเบอร์)</span>
            <div className="space-y-1.5">
              {phones.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="tel"
                    className="form-input"
                    placeholder="เบอร์โทร"
                    aria-label={`เบอร์โทรที่ ${i + 1}`}
                    value={p}
                    maxLength={20}
                    onChange={(e) => setPhones((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button type="button" onClick={() => setPhones((prev) => prev.filter((_, j) => j !== i))} className="btn btn-icon border-default-300 size-11 shrink-0" aria-label={`ลบเบอร์ที่ ${i + 1}`}>
                    <Icon icon="trash" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPhones((prev) => [...prev, ''])} className="text-primary hover:bg-primary/10 -ms-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium">
                <Icon icon="plus" className="text-sm" /> เพิ่มเบอร์
              </button>
            </div>
          </div>

          <div>
            <label className="form-label" htmlFor={`${fieldId}-address`}>ที่อยู่</label>
            <input id={`${fieldId}-address`} type="text" className="form-input" placeholder="ที่อยู่จัดส่ง" value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {/* ช่องโน้ตอยู่ในแท็บ "โน้ต" แล้ว — ไม่ซ้ำที่นี่ */}
        </>
      )}

      {/* ปุ่มหลักของแผงเดิมเป็น .btn-sm สูง ~26px (เล็กที่สุดในแผงทั้งที่สำคัญที่สุด — critique P1-A)
          → .btn ปกติ + min-h-11 ให้ผ่านเกณฑ์ ≥44px ของ PRODUCT.md */}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving} className="btn bg-primary text-white hover:bg-primary-hover min-h-11 disabled:opacity-60">
          <Icon icon={saving ? 'loader-2' : 'check'} className={`me-1 ${saving ? 'animate-spin' : ''}`} /> บันทึก
        </button>
        <button type="button" onClick={leaveEdit} className="btn border-default-300 min-h-11">
          ยกเลิก
        </button>
      </div>
    </div>
  )
}
