'use client'

/**
 * คิวคำถามที่ DeepBot ตอบไม่ได้ — แท็บ "รอกรอก"/"ข้ามแล้ว" + sheet กรอกคำตอบ
 * feature 00023 · phase `00023-qna` · S-14
 *
 * SSOT: docs/superpowers/specs/2026-07-31-00023-qna-ux-design-spec.md §หน้า B
 *       + §Revision v2 ข้อ 1 (สถานะ "ข้าม" ถาวร + ปุ่มย้อนกลับ) และข้อ 2 (รูปแบบเวลา)
 *
 * Base:
 *   - segmented control 2 แท็บ -> src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx
 *     (พื้น `bg-light` ก้อนเดียว ตัวที่เลือกเป็นการ์ด `bg-card shadow-sm`)
 *   - icon `arrow-back-up` (ปุ่มย้อนกลับ) -> InboxList.tsx ปุ่ม "เปิดใหม่"
 *   - modal/sheet shell -> src/app/(paces)/seller/(chat)/inbox/[conversationId]/components/CustomerPanelSheet.tsx
 *   - form-radio / form-input / form-textarea -> Paces `_forms.css`
 *     (theme/paces/Admin/TS/src/app/(admin)/form/elements/components/ChecksRadioSwitches.tsx)
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/wrappers/Icon'
import { pacesToast } from '@/lib/paces-toast'
import { formatRelativeDayTime } from '@/lib/format-date'
import { cn } from '@/utils/helpers'

export type QueueRow = {
  id: string
  rawSample: string
  hitCount: number
  lastSeenAt: string
}

type KeywordOption = { id: string; name: string; status: string; qnaCount: number }

type Props = {
  canEdit: boolean
  pendingCount: number
  initialPending: QueueRow[]
  initialDismissed: QueueRow[]
  keywords: KeywordOption[]
}

const KEYWORD_STATUS_LABEL: Record<string, string> = {
  LIVE: 'ตอบลูกค้าจริง',
  TEST: 'ทดสอบ',
  OFFLINE: 'ไม่ใช้งาน',
}

type TabKey = 'PENDING' | 'DISMISSED'

export default function UnansweredQueueClient({
  canEdit,
  pendingCount,
  initialPending,
  initialDismissed,
  keywords,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('PENDING')
  const [pending, setPending] = useState(initialPending)
  const [dismissed, setDismissed] = useState(initialDismissed)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [answering, setAnswering] = useState<QueueRow | null>(null)

  const rows = tab === 'PENDING' ? pending : dismissed

  async function readError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ?? fallback
  }

  async function dismiss(row: QueueRow) {
    if (!canEdit || busyId) return
    setBusyId(row.id)
    // optimistic — ย้ายข้ามแท็บทันที ไม่งั้นผู้ใช้กดซ้ำเพราะแถวยังอยู่ที่เดิม
    setPending((p) => p.filter((r) => r.id !== row.id))
    setDismissed((d) => [row, ...d])
    try {
      const res = await fetch(`/api/shops/auto-reply/unanswered/${row.id}/dismiss`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'ข้ามคำถามไม่สำเร็จ'))
      pacesToast.success('ข้ามคำถามนี้แล้ว — ดูได้ที่แท็บ "ข้ามแล้ว"')
    } catch (e) {
      // ย้อนกลับให้ตรงความจริง
      setDismissed((d) => d.filter((r) => r.id !== row.id))
      setPending((p) => [row, ...p])
      pacesToast.error(e instanceof Error ? e.message : 'ข้ามคำถามไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(row: QueueRow) {
    if (!canEdit || busyId) return
    setBusyId(row.id)
    setDismissed((d) => d.filter((r) => r.id !== row.id))
    setPending((p) => [row, ...p])
    try {
      const res = await fetch(`/api/shops/auto-reply/unanswered/${row.id}/restore`, { method: 'POST' })
      if (!res.ok) throw new Error(await readError(res, 'ย้ายกลับไม่สำเร็จ'))
      pacesToast.success('ย้ายกลับไปที่รอกรอกแล้ว')
    } catch (e) {
      setPending((p) => p.filter((r) => r.id !== row.id))
      setDismissed((d) => [row, ...d])
      pacesToast.error(e instanceof Error ? e.message : 'ย้ายกลับไม่สำเร็จ')
    } finally {
      setBusyId(null)
    }
  }

  /**
   * ป้ายหัวการ์ดใช้ยอดจริงจากฐาน ไม่ใช่ `pending.length`
   *
   * `listUnanswered` จำกัดรายการที่ 100 แถว แต่ `pendingCount` เป็น COUNT จริงทั้งหมด
   * ร้านที่มีคำถามค้าง 240 ข้อต้องเห็นเลข 240 ไม่ใช่ 100 — แล้วปรับตามการกดข้าม/ย้ายกลับ
   * ในหน้านี้ด้วยส่วนต่างของรายการ เพื่อให้เลขขยับทันทีแบบ optimistic เหมือนแถว
   */
  const livePendingCount = pendingCount - (initialPending.length - pending.length)

  return (
    <div className="card">
      <div className="card-header flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="card-title">คำถามที่ DeepBot ตอบไม่ได้</h4>
          <p className="text-default-500 mt-1 text-xs">กรอกคำตอบครั้งเดียว ครั้งหน้าตอบได้เอง</p>
        </div>
        <span className="badge bg-warning/15 text-warning shrink-0">
          รอกรอก {Math.max(0, livePendingCount).toLocaleString('th-TH')} ข้อ
        </span>
      </div>

      {/* คำอธิบายตัวกรอง PII — ต้องบอกให้ร้านรู้ว่าคิวนี้ "ไม่ครบทุกข้อความ" โดยตั้งใจ
          ไม่งั้นร้านจะคิดว่าระบบเก็บพลาด แล้วไปตามหาข้อความที่ระบบตั้งใจไม่เก็บ */}
      <div className="border-default-200 text-default-400 flex items-start gap-2 border-b px-4 py-2 text-xs">
        <Icon icon="info-circle" className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          ข้อความสั้นแบบรับคำ เบอร์โทร และที่อยู่ ถูกกรองออกอัตโนมัติ
          เพื่อไม่ให้ข้อมูลลูกค้าถูกคัดลอกมาไว้ที่นี่
        </span>
      </div>

      {/* segmented control 2 แท็บ — Base InboxList.tsx (พื้นเทาก้อนเดียว ตัวเลือกที่ active เป็นการ์ดยกขึ้น) */}
      <div className="px-4 pt-3">
        <div className="bg-light flex w-full items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="สถานะคำถามในคิว">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'PENDING'}
            onClick={() => setTab('PENDING')}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-nowrap',
              tab === 'PENDING' ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600',
            )}
          >
            รอกรอก ({pending.length.toLocaleString('th-TH')})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'DISMISSED'}
            onClick={() => setTab('DISMISSED')}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-nowrap',
              tab === 'DISMISSED' ? 'bg-card text-dark font-semibold shadow-sm' : 'text-default-600',
            )}
          >
            ข้ามแล้ว
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card-body flex flex-col items-center gap-3 py-12 text-center">
          {tab === 'PENDING' ? (
            <>
              {/* คิวว่าง = สถานะที่ดี ไม่ใช่หน้าพัง — จึงใช้เขียว success ไม่ใช่เทาแบบ empty ทั่วไป */}
              <Icon icon="circle-check" className="text-success size-12" aria-hidden="true" />
              <h5 className="text-default-800 font-semibold">ไม่มีคำถามที่รอกรอกตอนนี้</h5>
              <p className="text-default-500 max-w-md text-sm">
                ลูกค้าถามอะไร DeepBot ตอบได้หมดแล้วในช่วงนี้ — คำถามใหม่ที่ตอบไม่ได้จะมาโผล่ที่นี่เอง
              </p>
            </>
          ) : (
            <p className="text-default-500 text-sm">ยังไม่เคยข้ามคำถามไหนเลย</p>
          )}
        </div>
      ) : (
        <ul className="divide-default-200 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              {/* คำถามยาวผิดปกติต้องไม่ดันแถวพัง — ตัดที่ 2 บรรทัด */}
              <p className="text-default-800 line-clamp-2 text-sm">&ldquo;{row.rawSample}&rdquo;</p>
              <p className="text-default-500 mt-1 text-xs">
                ถูกถามแบบนี้ {row.hitCount.toLocaleString('th-TH')} ครั้ง ·{' '}
                {tab === 'PENDING' ? 'ล่าสุด' : 'ข้ามเมื่อ'} {formatRelativeDayTime(row.lastSeenAt)}
              </p>
              {canEdit && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  {tab === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => dismiss(row)}
                        className="btn btn-sm bg-light text-default-700 min-h-11"
                      >
                        ข้าม
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => setAnswering(row)}
                        className="btn btn-sm bg-primary hover:bg-primary-hover min-h-11 text-white"
                      >
                        กรอกคำตอบ
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => restore(row)}
                      className="btn btn-sm bg-light text-default-700 min-h-11"
                    >
                      <Icon icon="arrow-back-up" className="size-4" aria-hidden="true" />
                      ย้อนกลับมารอกรอก
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {answering && (
        <AnswerSheet
          row={answering}
          keywords={keywords}
          onClose={() => setAnswering(null)}
          onSaved={() => {
            setPending((p) => p.filter((r) => r.id !== answering.id))
            setAnswering(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

/* ══ Sheet — เพิ่มเข้าคลังคำถาม ═══════════════════════════════════════════════
 * Base: CustomerPanelSheet.tsx (bottom sheet <lg / centered modal ≥lg) */
function AnswerSheet({
  row,
  keywords,
  onClose,
  onSaved,
}: {
  row: QueueRow
  keywords: KeywordOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [question, setQuestion] = useState(row.rawSample)
  const [answer, setAnswer] = useState('')
  const [target, setTarget] = useState<string | 'NEW' | null>(keywords[0]?.id ?? 'NEW')
  const [newGroupName, setNewGroupName] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave =
    question.trim().length > 0 &&
    answer.trim().length > 0 &&
    target !== null &&
    (target !== 'NEW' || newGroupName.trim().length > 0) &&
    !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      let keywordId = target as string

      if (target === 'NEW') {
        /**
         * สร้างกลุ่มใหม่ก่อนแล้วค่อยผูกคำถามเข้าไป — สองคำสั่งนี้ **ไม่ atomic**
         * ถ้าคำสั่งที่สองล้ม ร้านจะได้กลุ่มเปล่าค้างไว้หนึ่งกลุ่ม (ไม่ใช่ข้อมูลเสียหาย
         * แค่มีกลุ่มว่าง) แล้วกดบันทึกซ้ำโดยเลือกกลุ่มนั้นจาก radio ได้เลย
         * ยอมรับได้เพราะทางเลือกคือเพิ่ม endpoint รวมสองงานซึ่งเกินขอบเขต S-14
         *
         * กลุ่มใหม่เกิดเป็น OFFLINE เสมอตาม default ของระบบ — ร้านต้องไปกดเปิดเอง
         * ซึ่งตรงกับเจตนา: คำตอบที่เพิ่งกรอกยังไม่ควรถูกส่งจริงจนกว่าจะตรวจ
         */
        const res = await fetch('/api/shops/auto-reply/keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newGroupName.trim() }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? 'สร้างกลุ่มใหม่ไม่สำเร็จ')
        }
        const created = (await res.json()) as { id: string }
        keywordId = created.id
      }

      const res = await fetch(`/api/shops/auto-reply/unanswered/${row.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId, question, answer }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'บันทึกคำตอบไม่สำเร็จ')
      }
      pacesToast.success('เพิ่มเข้าคลังแล้ว — ครั้งหน้าตอบได้เอง')
      onSaved()
    } catch (e) {
      pacesToast.error(e instanceof Error ? e.message : 'บันทึกคำตอบไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center bg-black/40 lg:items-center">
      <div className="bg-card max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl lg:max-h-[80dvh] lg:max-w-lg lg:rounded-2xl"> {/* HR7 carve-out: ไม่มี token viewport-height ใน Paces scale — precedent CustomerPanelSheet.tsx บรรทัดเดียวกัน */}
        <div className="border-default-200 flex items-center justify-between border-b px-4 py-3">
          <h5 className="font-semibold">เพิ่มเข้าคลังคำถาม</h5>
          <button type="button" onClick={onClose} className="btn btn-icon btn-sm bg-light text-default-700" aria-label="ปิด">
            <Icon icon="x" className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <label htmlFor="queue-question" className="form-label">คำถามของลูกค้า</label>
            <input
              id="queue-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="form-input"
              maxLength={500}
            />
            <p className="text-default-400 mt-1 text-xs">
              แก้ให้สั้นลงได้ — ระบบจับคู่ตรงตัว 100% กับข้อความนี้ (ยังไม่รองรับความหมายใกล้เคียง)
            </p>
          </div>

          <div>
            <label htmlFor="queue-answer" className="form-label">คำตอบที่ถูกต้อง</label>
            <textarea
              id="queue-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="form-textarea"
              rows={4}
              maxLength={2000}
              placeholder="คำตอบนี้จะถูกส่งถึงลูกค้าตรงตัวทุกอักษร"
            />
          </div>

          <div>
            <p className="form-label">เพิ่มเข้ากลุ่ม</p>
            <div className="border-default-200 divide-default-200 divide-y rounded-lg border">
              {keywords.map((k) => (
                <label key={k.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                  <input
                    type="radio"
                    name="queue-target"
                    className="form-radio mt-1"
                    checked={target === k.id}
                    onChange={() => setTarget(k.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-default-800 block truncate text-sm font-medium">{k.name}</span>
                    <span className="text-default-500 block text-xs">
                      {KEYWORD_STATUS_LABEL[k.status] ?? k.status} · {k.qnaCount.toLocaleString('th-TH')} ข้อ
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                <input
                  type="radio"
                  name="queue-target"
                  className="form-radio mt-1"
                  checked={target === 'NEW'}
                  onChange={() => setTarget('NEW')}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-default-800 block text-sm font-medium">สร้างกลุ่มใหม่</span>
                  <span className="text-default-500 block text-xs">ถ้าไม่เข้ากลุ่มไหนเลย</span>
                  {target === 'NEW' && (
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="form-input mt-2"
                      maxLength={100}
                      placeholder="ชื่อกลุ่มใหม่"
                      aria-label="ชื่อกลุ่มใหม่"
                    />
                  )}
                </span>
              </label>
            </div>
            {target === 'NEW' && (
              <p className="text-default-400 mt-1 text-xs">
                กลุ่มใหม่จะถูกสร้างแบบ &ldquo;ไม่ใช้งาน&rdquo; ก่อน — เปิดใช้งานเองเมื่อตรวจคำตอบเรียบร้อย
              </p>
            )}
          </div>
        </div>

        <div className="border-default-200 flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="btn bg-light text-default-700 min-h-11">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={!canSave} className="btn bg-primary hover:bg-primary-hover min-h-11 text-white">
            บันทึก
          </button>
        </div>
      </div>
    </div>
  )
}
