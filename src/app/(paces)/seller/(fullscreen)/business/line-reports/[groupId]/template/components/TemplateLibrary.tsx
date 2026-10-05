'use client'

/**
 * TemplateLibrary — การ์ด "เพิ่มบล็อก": กริดการ์ดย่อย (ไอคอน + ชื่อ + คำอธิบาย + ปุ่ม ＋) · ≥lg ลากได้หรือกด ＋ · <lg กด ＋ เท่านั้น (ไม่ลาก)
 * Base (การ์ดโค้งมน): docs/superpowers/specs/2026-10-05-line-report-rounded-card-mockup.html + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx
 *
 * Base: src/app/(paces)/seller/(fullscreen)/public-profile/builder/components/LibraryPanel.tsx (Droppable isDropDisabled + Draggable + ปุ่ม ＋ คู่กับการลาก)
 *   + theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx (@hello-pangea/dnd ข้าม Droppable)
 *   + theme/paces/Admin/TS/src/app/(admin)/plugins/sortable/components/SortableWithIconAndLabels.tsx (โครงแถวไอคอน+ชื่อ)
 * ต่างจากต้นแบบ: ไม่ห่อ .card (แถวไม่มีกรอบ) · บล็อกชนิดเดียวที่ใส่แล้ว = ซ่อน (สเปก §3.3 / audit กฎ 5) · markup สองชุดสลับด้วย CSS ไม่ใช้ JS ตรวจ viewport
 * เหตุผลที่ใช้ไม่ได้มาจาก `REASON.*` ใน availability.ts เท่านั้น (ไม่เขียนข้อความใหม่)
 */
import { Draggable, Droppable } from '@hello-pangea/dnd'
import Icon from '@/components/wrappers/Icon'
import { libraryAvailability, REASON, type AvailabilityContext } from '@/lib/line-report/availability'
import { MAX_BLOCKS, type BlockType, type TemplateV1 } from '@/lib/line-report/template'
import { cn } from '@/utils/helpers'
import CardHead, { GroupLabel, Plate, ROUND_CARD } from '@/app/(paces)/seller/(dashboard)/business/line-reports/_components/CardHead'
import { ADD_LABEL, BLOCK_ICON, blockTitle, libraryDesc, LIBRARY_GROUPS } from '../lib/block-meta'

export const LIBRARY_DROPPABLE_ID = 'library-blocks'
export const libraryDraggableId = (t: BlockType) => `lib-${t}`
export const typeOfDraggableId = (id: string): BlockType | null => {
  const t = id.startsWith('lib-') ? id.slice(4) : ''
  return LIBRARY_GROUPS.some((g) => (g.types as readonly string[]).includes(t)) ? (t as BlockType) : null
}

type Entry = { type: BlockType; title: string; desc: string; reason: string | null; disabled: boolean }

/** รายการที่จะแสดง: ชนิดเดียวที่ใส่แล้วถูกซ่อน · ครบ 20 = disabled ไม่ซ้ำเหตุผลทุกแถว */
export function libraryEntries(draft: TemplateV1, ctx: AvailabilityContext, word: string): { groups: { title: string; entries: Entry[] }[]; full: boolean } {
  let full = false
  const groups = LIBRARY_GROUPS.map((g) => {
    const entries: Entry[] = []
    for (const type of g.types) {
      const a = libraryAvailability(type, draft, ctx)
      if (!a.ok && a.reason === REASON.USED_UP) continue
      if (!a.ok && a.reason === REASON.BLOCKS_FULL) full = true
      entries.push({ type, title: blockTitle(type, word), desc: libraryDesc(type, word, draft), disabled: !a.ok, reason: a.ok || a.reason === REASON.BLOCKS_FULL ? null : a.reason })
    }
    return { title: g.title, entries }
  }).filter((g) => g.entries.length > 0)
  return { groups, full }
}

function AddButton({ entry, word, onAdd }: { entry: Entry; word: string; onAdd: (t: BlockType) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(entry.type)}
      aria-label={ADD_LABEL(entry.type, word)}
      className="btn btn-icon text-default-700 hover:bg-default-100 min-h-11 min-w-11 shrink-0 rounded-full"
    >
      <Icon icon="plus" className="size-4" aria-hidden="true" />
    </button>
  )
}

const GROUP_SUB: Record<string, string> = {
  ข้อมูล: 'ตัวเลขจากระบบ ใส่ได้อย่างละ 1',
  กราฟ: 'ถ้าข้อความยาวเกิน ระบบตัดกราฟก่อนตัวเลขหลัก',
  ข้อความของคุณ: 'ข้อความใส่ได้ 6 อัน เส้นคั่น 8 อัน',
}

const TILE = 'flex items-center gap-3 rounded-xl border p-3'
const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'

/** ส่วนข้อความของการ์ดย่อย — ใช้ร่วมทั้งแบบลากได้และแบบกดอย่างเดียว · มือถือเล็กซ่อนคำอธิบาย เหลือชื่อ + เหตุผลที่ใช้ไม่ได้ */
function TileText({ e }: { e: Entry }) {
  return (
    <>
      <Plate icon={BLOCK_ICON[e.type]} tone="mute" small />
      <div className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium break-words', e.disabled ? 'text-default-700' : 'text-default-900')}>{e.title}</span>
        {e.reason ? (
          <span className="text-default-700 flex items-start gap-1 text-xs">
            <Icon icon="info-circle" className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {e.reason}
          </span>
        ) : (
          !e.disabled && <span className="text-default-700 hidden text-xs sm:block">{e.desc}</span>
        )}
      </div>
    </>
  )
}

export default function TemplateLibrary({
  draft,
  ctx,
  word,
  onAdd,
}: {
  draft: TemplateV1
  ctx: AvailabilityContext
  word: string
  onAdd: (t: BlockType) => void
}) {
  const { groups, full } = libraryEntries(draft, ctx, word)
  // index ของ Draggable คำนวณล่วงหน้า (ไม่เพิ่มค่าใน render prop — StrictMode เรียกซ้ำแล้วเลขเพี้ยน)
  const flat = groups.flatMap((g) => g.entries)
  const indexOf = (t: BlockType) => flat.findIndex((e) => e.type === t)
  return (
    <section className={ROUND_CARD} aria-labelledby="h-lib">
      <div className="card-body">
        <CardHead
          icon="layout-grid-add"
          title="เพิ่มบล็อก"
          headingId="h-lib"
          desc={
            <>
              <span className="lg:hidden">กด + เพื่อต่อท้ายข้อความ</span>
              <span className="hidden lg:inline">กด + เพื่อต่อท้ายข้อความ หรือลากไปวางตรงที่ต้องการ</span>
            </>
          }
        >
          <span className="badge bg-default-200/60 text-default-700 tabular-nums">
            {draft.blocks.length} / {MAX_BLOCKS} บล็อก
          </span>
        </CardHead>
        {full && <p className="text-default-700 mb-3 text-xs">ครบ 20 บล็อกแล้ว เอาบล็อกออกก่อนจึงเพิ่มได้</p>}
        {groups.length === 0 && <p className="text-default-700 mb-0 text-sm">ใส่ครบแล้ว</p>}

        {/* ≥lg: ลากได้ */}
        <div className="hidden lg:block">
          <Droppable droppableId={LIBRARY_DROPPABLE_ID} isDropDisabled>
            {(drop) => (
              <div ref={drop.innerRef} {...drop.droppableProps}>
                {groups.map((g) => (
                  <div key={g.title} className="mt-6 first:mt-0">
                    <GroupLabel sub={GROUP_SUB[g.title]}>{g.title}</GroupLabel>
                    <div className={GRID}>
                      {g.entries.map((e) => (
                        <Draggable key={e.type} draggableId={libraryDraggableId(e.type)} index={indexOf(e.type)} isDragDisabled={e.disabled}>
                          {(drag, snap) => (
                            <div
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              aria-disabled={e.disabled || undefined}
                              className={cn(TILE, e.disabled ? 'border-default-300 bg-default-100 border-dashed' : 'border-default-300 hover:bg-default-100', snap.isDragging && 'bg-card border-primary shadow-lg')}
                            >
                              {/* ที่จับลาก = ไอคอน+ชื่อ · ปุ่ม ＋ อยู่นอก element ที่มี dragHandleProps (กัน interactive ซ้อน interactive) */}
                              <div {...drag.dragHandleProps} className={cn('flex min-w-0 flex-1 items-center gap-3', e.disabled ? 'cursor-default' : 'cursor-grab')}>
                                <TileText e={e} />
                              </div>
                              {!e.disabled && <AddButton entry={e} word={word} onAdd={onAdd} />}
                            </div>
                          )}
                        </Draggable>
                      ))}
                    </div>
                  </div>
                ))}
                {drop.placeholder}
              </div>
            )}
          </Droppable>
        </div>

        {/* <lg: กดอย่างเดียว (ลากชนกับการเลื่อน) */}
        <div className="lg:hidden">
          {groups.map((g) => (
            <div key={g.title} className="mt-6 first:mt-0">
              <GroupLabel sub={GROUP_SUB[g.title]}>{g.title}</GroupLabel>
              <div className={GRID}>
                {g.entries.map((e) => (
                  <div key={e.type} aria-disabled={e.disabled || undefined} className={cn(TILE, e.disabled ? 'border-default-300 bg-default-100 border-dashed' : 'border-default-300')}>
                    <TileText e={e} />
                    {!e.disabled && <AddButton entry={e} word={word} onAdd={onAdd} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
