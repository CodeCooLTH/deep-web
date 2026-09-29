'use client'

/**
 * FollowUpBoard — กระดาน 5 คอลัมน์ (เดสก์ท็อป) / แท็บทีละคอลัมน์ (มือถือ) ของหน้ารวมติดตามลูกค้า (00066 พื้นผิว c)
 *
 * Base:
 *  - theme/paces/Admin/TS/src/app/(admin)/apps/projects/kanban/components/Board.tsx (แถวคอลัมน์ bg-light/40 + border-e border-dashed
 *    + หัวคอลัมน์ + ul space-y-2.5) — ตัด DragDropContext/Draggable/ปุ่ม + และ SimpleBar สูงคงที่ออก (ไม่ลากการ์ด ไม่สร้างที่นี่;
 *    SimpleBar สูงคงที่ทำให้กล่องเลื่อนซ้อนกล่องเลื่อนของหน้า และตัด popover — ให้หน้าเลื่อนตามปกติ)
 *  - theme/paces/Admin/TS/src/app/(admin)/ui/tabs/page.tsx (.nav-tabs — ควบคุมด้วย React state ตาม CustomerPanel; overflow-x-auto)
 *  - การ์ด: FollowUpCard variant='board' (โครง .card ของ kanban/TaskItem.tsx อยู่ในตัวการ์ดแล้ว)
 *
 * เหตุที่ไม่แสดง 200 ใบทีเดียว: แต่ละคอลัมน์ 20 ใบแรก + "ดูอีก n รายการ" (กันหน้ายาว)
 * พระเอกคือ "เลยกำหนด": เฉพาะตัวเลขของคอลัมน์นั้นที่เป็น danger เมื่อ >0 คอลัมน์อื่นเป็นเทา (UX §0.1)
 * ไม่ใช้เขียว — "ไม่มีงานเลยกำหนด" เป็นข่าวดีแต่สื่อด้วยข้อความเป็นกลาง (ทำแล้ว ไม่ใช่ verified)
 */
import { useEffect, useRef, useState } from 'react'
import FollowUpCard from '@/app/(paces)/seller/_follow-up/FollowUpCard'
import { useT } from '@/i18n/LocaleProvider'
import { fmt } from '@/i18n/fmt'
import { BOARD_COLUMNS, defaultBoardTab, type BoardColumn, type BoardCounts } from '@/lib/follow-up-page'
import { formatCount, type FollowUpChange } from '@/lib/follow-up-view'
import type { Dictionary } from '@/i18n/dictionaries/th'
import type { FollowUpDto } from '@/services/customer-follow-up.service'
import { useIsDesktop } from './useIsDesktop'

type T = Dictionary['followUps']
export type BoardData = { columns: Record<BoardColumn, FollowUpDto[]>; counts: BoardCounts }

const LABEL: Record<BoardColumn, keyof T> = {
  late: 'colOverdue', today: 'colToday', week: 'colWeek', later: 'colLater', done7d: 'colDone',
}
const SHORT: Record<BoardColumn, keyof T> = {
  late: 'colOverdue', today: 'colToday', week: 'colWeekShort', later: 'colLater', done7d: 'colDoneShort',
}
const EMPTY: Record<BoardColumn, keyof T> = {
  late: 'emptyOverdue', today: 'emptyToday', week: 'emptyWeek', later: 'emptyLater', done7d: 'emptyDone',
}
const PAGE = 20

/** ตัวเลขของคอลัมน์ — เฉพาะ "เลยกำหนด" ที่ >0 เป็นป้าย danger (พระเอกเดียว) */
function CountBadge({ col, n }: { col: BoardColumn; n: number }) {
  const hot = col === 'late' && n > 0
  return (
    <span
      className={`badge text-xs ${hot ? 'bg-danger/15 text-danger-ink' : 'text-default-600'}`}
    >
      {formatCount(n)}
    </span>
  )
}

function Skeleton() {
  return (
    <ul className="space-y-2.5" aria-hidden="true">
      {[0, 1].map((i) => (
        <li key={i} className="card border-light border p-4">
          <span className="bg-default-200 block h-4 w-3/4 animate-pulse rounded motion-reduce:animate-none" />
          <span className="bg-default-200 mt-2 block h-3 w-1/2 animate-pulse rounded motion-reduce:animate-none" />
          <span className="bg-default-200 mt-4 block h-7 w-1/3 animate-pulse rounded motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  )
}

function CardList({
  col,
  items,
  onChange,
  onEdit,
}: {
  col: BoardColumn
  items: FollowUpDto[]
  onChange: (c: FollowUpChange<FollowUpDto>) => void
  onEdit: (i: FollowUpDto) => void
}) {
  const t = useT().followUps
  const [shown, setShown] = useState(PAGE)
  if (items.length === 0) return <p className="text-default-600 px-1 py-3 text-sm">{t[EMPTY[col]]}</p>
  const rest = items.length - shown
  return (
    <>
      <ul className="space-y-2.5">
        {items.slice(0, shown).map((it) => (
          <li key={it.id}>
            <FollowUpCard item={it} variant="board" onChange={onChange} onEdit={onEdit} />
          </li>
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="btn border-default-300 text-default-800 hover:bg-light mt-2.5 min-h-11 w-full border lg:min-h-0"
        >
          {fmt(t.showMore, { n: formatCount(rest) })}
        </button>
      )}
    </>
  )
}

export default function FollowUpBoard({
  data,
  onChange,
  onEdit,
}: {
  /** null = ยังไม่เคยโหลดสำเร็จ → skeleton */
  data: BoardData | null
  onChange: (c: FollowUpChange<FollowUpDto>) => void
  onEdit: (i: FollowUpDto) => void
}) {
  const t = useT().followUps
  const isDesktop = useIsDesktop()
  // แท็บที่ผู้ใช้เลือกเอง — ยังไม่เลือก = คอลัมน์แรกที่ไม่ว่าง (derive ทุก render ไม่ต้อง effect)
  const [picked, setPicked] = useState<BoardColumn | null>(null)
  const tabRefs = useRef<Partial<Record<BoardColumn, HTMLButtonElement | null>>>({})
  const active: BoardColumn = picked ?? (data ? defaultBoardTab(data.counts) : 'late')

  // แท็บ active เลื่อนเข้าจอ (แถบเลื่อนแนวนอนได้) — inline:'nearest' ไม่ดึงหน้าทั้งหน้า
  useEffect(() => {
    tabRefs.current[active]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, isDesktop])

  if (isDesktop) {
    return (
      // ให้หน้าเลื่อนแนวตั้งตามปกติ (items-start) เลื่อนแนวนอนเมื่อจอแคบ · min-w-72 × 5 ≈ 1440 → 1440px เห็น 4 เต็ม + คอลัมน์ 5 โผล่ครึ่ง
      <div className="bg-light/40 flex items-start overflow-x-auto rounded-lg">
        {BOARD_COLUMNS.map((col) => (
          <section
            key={col}
            aria-label={t[LABEL[col]]}
            className="border-default-300 w-72 min-w-72 shrink-0 border-e border-dashed last:border-e-0"
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <h5 className="text-md font-medium">{t[LABEL[col]]}</h5>
              {data && <CountBadge col={col} n={data.counts[col]} />}
            </div>
            <div className="px-3 pb-3">
              {data ? (
                <CardList col={col} items={data.columns[col]} onChange={onChange} onEdit={onEdit} />
              ) : (
                <Skeleton />
              )}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div>
      {/* แท็บ: ป้ายย่อ ("7 วัน" "ทำแล้ว") ชื่อเต็มอยู่ใน aria-label และหัวรายการใต้แท็บ — 5 แท็บ × ไทย+เลข เกิน 288px แน่นอน จึงเลื่อนได้ */}
      <div
        role="tablist"
        aria-label={t.tabsAria}
        className="border-default-200 -mx-1 mb-3 flex flex-nowrap overflow-x-auto border-b px-1"
      >
        {BOARD_COLUMNS.map((col) => {
          const on = col === active
          return (
            <button
              key={col}
              ref={(el) => {
                tabRefs.current[col] = el
              }}
              type="button"
              role="tab"
              id={`fu-tab-${col}`}
              aria-selected={on}
              aria-controls="fu-tabpanel"
              aria-label={data ? `${t[LABEL[col]]} ${data.counts[col]}` : t[LABEL[col]]}
              onClick={() => setPicked(col)}
              className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap ${
                on ? 'border-primary text-primary-ink' : 'text-default-700 hover:text-default-900 border-transparent'
              }`}
            >
              {t[SHORT[col]]}
              {/* ตัวเลข 0 ก็แสดง (UX §0.1 มือถือ) */}
              {data && <CountBadge col={col} n={data.counts[col]} />}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id="fu-tabpanel" aria-labelledby={`fu-tab-${active}`}>
        <h5 className="text-default-800 mb-2 text-sm font-semibold">{t[LABEL[active]]}</h5>
        {data ? (
          // key = col: เปลี่ยนแท็บแล้วเริ่มนับ "ดูอีก" ใหม่ (state ของ CardList อยู่ต่อคอลัมน์)
          <CardList key={active} col={active} items={data.columns[active]} onChange={onChange} onEdit={onEdit} />
        ) : (
          <Skeleton />
        )}
      </div>
    </div>
  )
}
