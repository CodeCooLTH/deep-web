'use client'

/**
 * FollowUpFilterPanel — ปุ่ม "ตัวกรอง" + แผงชิปของหน้ารวมติดตามลูกค้า (00066 พื้นผิว c)
 *
 * Base: src/app/(paces)/seller/(chat)/inbox/components/InboxFilterPanel.tsx (Chip / Section / ร่าง→"ใช้ตัวกรอง" / ล้าง)
 *   ← Base ของมัน: PageFilterDropdown.tsx + OrderCardMenu.tsx (custom React dropdown — ไม่ใช้ Preline hs-dropdown)
 * ทุกความกว้างใช้แผงเดียวกัน (ไม่มี 2 รูปแบบ) — popover ยึด "แถวเครื่องมือ" (relative ที่ผู้เรียก) ไม่ใช่ปุ่ม
 *
 * ตัวเลขต่อคนเป็นของทั้งร้าน ไม่ขึ้นกับตัวกรองอื่น (AC-ACT-26) — มาจาก counts ของ API ตรง ๆ
 * ซ่อนหัวข้อ "ผู้รับผิดชอบ" เมื่อเลือก "ของฉัน" หรือเป็นร้าน PERSONAL (ผู้เรียกส่ง showAssignee)
 */
import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/wrappers/Icon'
import { useT } from '@/i18n/LocaleProvider'
import { formatCount } from '@/lib/follow-up-view'
import type { PersonDto } from '@/services/customer-follow-up.service'

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-11 items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap lg:min-h-0 lg:py-1.5 ${
        on ? 'border-primary bg-primary text-white' : 'border-default-300 bg-card text-default-800 hover:bg-light'
      }`}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-default-700 mb-2 text-xs font-medium">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

type Props = {
  assignee: string | null
  tags: string[]
  /** จำนวนตัวกรองที่ไม่ใช่ค่าตั้งต้น (รวมช่องค้นหา) — วงกลมบนปุ่ม */
  activeCount: number
  assignees: PersonDto[] | null
  showAssignee: boolean
  allTags: string[]
  byUser: Record<string, number>
  unassigned: number
  onApply: (next: { assignee: string | null; tags: string[] }) => void
}

export default function FollowUpFilterPanel({
  assignee,
  tags,
  activeCount,
  assignees,
  showAssignee,
  allTags,
  byUser,
  unassigned,
  onApply,
}: Props) {
  const t = useT().followUps
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // ร่าง — sync จากค่าจริงทุกครั้งที่เปิด ไม่ให้ค้างค่าที่เคยเลือกแล้วไม่ได้กดใช้
  const [dAssignee, setDAssignee] = useState(assignee)
  const [dTags, setDTags] = useState(tags)
  const tagsKey = tags.join(',')
  useEffect(() => {
    if (open) {
      setDAssignee(assignee)
      setDTags(tagsKey ? tagsKey.split(',') : [])
    }
  }, [open, assignee, tagsKey])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleTag = (x: string) => setDTags((d) => (d.includes(x) ? d.filter((y) => y !== x) : [...d, x]))
  const hasPeople = showAssignee && assignees !== null

  return (
    <div ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.filterButton}
        className={`btn bg-card inline-flex min-h-11 items-center gap-2 border lg:min-h-0 ${
          activeCount > 0 || open ? 'border-primary text-primary' : 'border-default-300 text-default-800'
        }`}
      >
        <Icon icon="adjustments-horizontal" className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">{t.filterButton}</span>
        {activeCount > 0 && (
          <span className="badge bg-primary text-2xs rounded-full px-1.5 text-white">{activeCount}</span>
        )}
      </button>

      {open && (
        // ยึดแถวเครื่องมือ (relative ที่ผู้เรียก) — มือถือเต็มแถว, ≥sm กว้างคงที่ชิดขวา (ไม่ inset-x-0 บนจอกว้าง)
        <div
          className="border-default-300 bg-card absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border shadow-lg sm:inset-x-auto sm:end-0 sm:w-96"
          role="menu"
        >
          <div className="border-default-200 flex items-center justify-between border-b px-3 py-2">
            <span className="text-default-800 text-sm font-semibold">{t.filterButton}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-default-700 hover:text-default-800 flex size-11 items-center justify-center rounded lg:size-6"
              aria-label={t.cancel}
            >
              <Icon icon="x" className="size-4" aria-hidden="true" />
            </button>
          </div>
          {/* max-h + scroll: กันเนื้อหายาวทะลุจอจนกดปุ่มท้ายไม่ได้ · overscroll-contain กัน chaining */}
          <div className="max-h-96 overflow-y-auto overscroll-contain p-3">
            {hasPeople && (
              <Section title={t.filterAssignee}>
                {assignees.map((p) => (
                  <Chip
                    key={p.userId}
                    on={dAssignee === p.userId}
                    label={`${p.name} (${formatCount(byUser[p.userId] ?? 0)})`}
                    onClick={() => setDAssignee(dAssignee === p.userId ? null : p.userId)}
                  />
                ))}
                <Chip
                  on={dAssignee === 'unassigned'}
                  label={`${t.filterUnassigned} (${formatCount(unassigned)})`}
                  onClick={() => setDAssignee(dAssignee === 'unassigned' ? null : 'unassigned')}
                />
              </Section>
            )}
            {allTags.length > 0 && (
              <Section title={t.filterTags}>
                {allTags.map((x) => (
                  <Chip key={x} on={dTags.includes(x)} label={x} onClick={() => toggleTag(x)} />
                ))}
              </Section>
            )}
            {!hasPeople && allTags.length === 0 && (
              <p className="text-default-600 text-sm">{t.filterNone}</p>
            )}
          </div>
          <div className="border-default-200 bg-default-100 flex items-center justify-between gap-2 border-t px-3 py-2.5">
            <button
              type="button"
              // ล้างแล้วมีผลทันที (คนกดล้างต้องการเห็นรายการเต็มเดี๋ยวนั้น) — เหมือน InboxFilterPanel
              onClick={() => {
                setDAssignee(null)
                setDTags([])
                onApply({ assignee: null, tags: [] })
                setOpen(false)
              }}
              className="text-default-600 hover:text-default-800 flex min-h-11 shrink-0 items-center text-sm underline underline-offset-4"
            >
              {t.filterClear}
            </button>
            <button
              type="button"
              onClick={() => {
                onApply({ assignee: dAssignee, tags: dTags })
                setOpen(false)
              }}
              className="btn bg-primary hover:bg-primary-hover min-h-11 text-white"
            >
              {t.filterApply}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
