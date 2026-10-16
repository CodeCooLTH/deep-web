'use client'

// ป้ายทั้งหมดเป็น DOM overlay (pill ขาว text-xs) ตาม mockup — วางนอก <Canvas> เพื่อไม่ต้องพึ่ง drei <Html>/portal
// ตำแหน่งถูก CameraRig ฉายใหม่ทุกเฟรมผ่าน refs.labels
import { Icon } from '@iconify/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'
import { LOUNGE_AREA, ROOM, type StageActor, type Vec } from '@/lib/chat-desk/scene-layout'
import type { DeskTable, DeskView } from '@/lib/chat-desk/types'
import { cn } from '@/utils/helpers'
import type { SceneRefs } from './camera'

const PILL = 'inline-flex max-w-56 items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-default-900 shadow-md'
// ปุ่มจริงสูง 44px (min-h-11) ส่วน pill ที่เห็นเล็กกว่า — พื้นที่แตะไม่ต้องเท่าก้อนสี
const HIT = 'inline-flex min-h-11 items-center'

function Pin({ id, pos, wall, mid, cls, refs, children }: {
  id: string; pos: readonly [number, number, number]; wall?: 'back' | 'left'; mid?: boolean; cls?: string; refs: SceneRefs; children: ReactNode
}) {
  const [x, y, z] = pos
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) refs.labels.set(id, { el, pos: new Vector3(x, y, z), wall, mid })
    else refs.labels.delete(id)
  }, [id, refs, x, y, z, wall, mid])
  // invisible จนกว่า CameraRig ฉายตำแหน่งครั้งแรก — กันป้ายวาบที่มุมซ้ายบน
  return <div ref={ref} className={cn('pointer-events-auto invisible absolute left-0 top-0 will-change-transform', cls)}>{children}</div>
}

/** นาทีที่รอ — นับจาก since ด้วยเวลาเครื่อง (ต่างจากเวลาเซิร์ฟเวอร์ได้ไม่กี่วินาที ยอมรับสำหรับป้ายนาที) */
function Mins({ since }: { since: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  if (!since) return null
  return <span className="tabular-nums">{Math.max(0, Math.floor((now - Date.parse(since)) / 60000))} น.</span>
}

const KIND_ICON = { EXTERNAL: 'tabler:device-mobile', META_AI: 'tabler:sparkles', BOT: 'tabler:robot' } as const

function tableAria(t: DeskTable, hide: boolean) {
  const st = t.kind !== 'ADMIN' ? '' : t.online === true ? ' ออนไลน์' : t.online === false ? ' ออฟไลน์' : ''
  return `โต๊ะ ${t.name}${st}${hide ? '' : ` แชทในมือ ${t.total}`}`
}

export function Overlay({ view, shopName, hideNumbers: hide, refs, slots, actors, onSelectRoom, onSelectTable, onOpenLounge, onOpenHiddenTables }: {
  view: DeskView; shopName: string; hideNumbers: boolean; refs: SceneRefs
  slots: Map<string, Vec>; actors: StageActor[]
  onSelectRoom: (id: string) => void; onSelectTable: (key: string) => void
  onOpenLounge: () => void; onOpenHiddenTables: () => void
}) {
  const { W, D } = ROOM
  const overdue = actors.filter((a) => a.customer.status === 'OVERDUE')
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ป้ายร้านอยู่กลางป้ายไม้บนผนังหลัง (ซ่อนพร้อมผนัง) · จอแคบซ่อน — เหลือป้ายหลักเท่านั้น */}
      <Pin id="shop" pos={[6.6, 3.5, -D / 2 + 0.12]} wall="back" mid cls="max-md:hidden" refs={refs}>
        <span aria-hidden className={cn(PILL, 'max-w-64 px-3 py-1 text-sm')}><span className="truncate">{shopName}</span></span>
      </Pin>
      <Pin id="door-in" pos={[-W / 2 + 0.1, 3.1, 5]} wall="left" cls="max-md:hidden" refs={refs}>
        <span aria-hidden className={cn(PILL, 'pointer-events-none text-default-700')}><Icon icon="tabler:door-enter" className="size-3.5" />ทางเข้า</span>
      </Pin>
      <Pin id="door-out" pos={[-2.2, 3.1, -D / 2 + 0.1]} wall="back" cls="max-md:hidden" refs={refs}>
        <span aria-hidden className={cn(PILL, 'pointer-events-none text-default-700')}><Icon icon="tabler:door-exit" className="size-3.5" />ทางออก</span>
      </Pin>

      <Pin id="lounge" pos={[LOUNGE_AREA.x, 0.4, LOUNGE_AREA.z + LOUNGE_AREA.d / 2 + 0.3]} refs={refs}>
        <button type="button" onClick={onOpenLounge} className={HIT} aria-label={hide ? 'ลูกค้ารอคำตอบ เปิดรายการ' : `ลูกค้ารอคำตอบ ${view.lounge.total} คน เปิดรายการ`}>
          <span className={cn(PILL, 'hover:ring-2 hover:ring-primary/40')}>
            <span className="grid size-4 place-items-center rounded-full bg-warning/15 text-warning-ink"><Icon icon="tabler:clock" className="size-2.5" /></span>
            ลูกค้ารอคำตอบ
            {!hide && <span className="tabular-nums">{view.lounge.total} คน</span>}
          </span>
        </button>
      </Pin>

      {/* เกินเวลาตอบหลายคน: ป้ายรายคนซ้อนกัน (ที่นั่งชิดกัน) → ยุบเป็นป้ายเดียวเหนือป้ายเลานจ์ · วงแดงที่พื้นยังบอกตัวคน */}
      {overdue.length > 1 && (
        <Pin id="over:all" pos={[LOUNGE_AREA.x, 1.5, LOUNGE_AREA.z + LOUNGE_AREA.d / 2 + 0.3]} cls="max-md:hidden" refs={refs}>
          <button type="button" onClick={onOpenLounge} className={HIT} aria-label={`เกินเวลาตอบ ${overdue.length} คน เปิดรายการ`}>
            <span className={cn(PILL, 'text-danger-ink')}>
              <span className="grid size-4 place-items-center rounded-full bg-danger/15"><Icon icon="tabler:alert-triangle" className="size-2.5" /></span>
              เกินเวลาตอบ{!hide && <span className="tabular-nums">{overdue.length} คน</span>}
            </span>
          </button>
        </Pin>
      )}

      {overdue.length === 1 && overdue.map((a) => (
        <Pin key={a.id} id={`over:${a.id}`} pos={[a.pos[0], a.seated ? 1.75 : 2.15, a.pos[1]]} cls="max-md:hidden" refs={refs}>
          <button type="button" onClick={() => onSelectRoom(a.id)} className={HIT} aria-label={`${a.customer.name} เกินเวลาตอบ`}>
            <span className={cn(PILL, 'text-danger-ink')}>
              <span className="grid size-4 place-items-center rounded-full bg-danger/15"><Icon icon="tabler:alert-triangle" className="size-2.5" /></span>
              เกินเวลาตอบ{!hide && <Mins since={a.customer.since} />}
            </span>
          </button>
        </Pin>
      ))}

      {view.tables.map((t) => {
        const [x, z] = slots.get(t.key) ?? [0, 0]
        const off = t.kind === 'ADMIN' && t.online === false
        return (
          <div key={t.key}>
            <Pin id={`t:${t.key}`} pos={[x, 2.25, z - 0.6]} refs={refs}>
              <button type="button" onClick={() => onSelectTable(t.key)} className={HIT} aria-label={tableAria(t, hide)}>
                <span className={cn(PILL, 'hover:ring-2 hover:ring-primary/40', off && 'opacity-60')}>
                  {t.kind === 'ADMIN'
                    ? t.online === null
                      ? <span aria-hidden className="text-default-400">-</span>
                      : <span aria-hidden className={cn('size-2 flex-none rounded-full', t.online ? 'bg-primary' : 'border-2 border-default-400')} />
                    : <Icon icon={KIND_ICON[t.kind]} className="size-3.5 flex-none" />}
                  <span className="truncate max-md:hidden">{t.name}</span>
                  {!hide && <span className="flex-none font-normal tabular-nums text-default-700">· <span className="max-md:hidden">{t.kind === 'ADMIN' ? 'แชทในมือ ' : ''}</span>{t.total}</span>}
                </span>
              </button>
            </Pin>
            {t.overflow > 0 && !hide && (
              <Pin id={`more:${t.key}`} pos={[x + 1.55, 1.5, z + 1.5]} cls="max-md:hidden" refs={refs}>
                <button type="button" onClick={() => onSelectTable(t.key)} className={HIT} aria-label={`อีก ${t.overflow} คนที่โต๊ะ ${t.name}`}>
                  <span className={cn(PILL, 'tabular-nums')}>+{t.overflow}</span>
                </button>
              </Pin>
            )}
          </div>
        )
      })}

      {view.hiddenAdminTables.length > 0 && (
        <Pin id="hidden" pos={[10.2, 0.3, -6.2]} refs={refs}>
          <button type="button" onClick={onOpenHiddenTables} className={HIT} aria-label={`มีโต๊ะแอดมินอีก ${view.hiddenAdminTables.length} โต๊ะ เปิดรายการ`}>
            <span className={cn(PILL, 'hover:ring-2 hover:ring-primary/40')}>+{view.hiddenAdminTables.length} โต๊ะ</span>
          </button>
        </Pin>
      )}
    </div>
  )
}
