'use client'

/**
 * TemplateLibrary — คลังบล็อก: ≥lg = คอลัมน์ซ้าย (ลากหรือกด ＋) · <lg = แถบชิปเลื่อนแนวนอน (แตะ ＋ เท่านั้น ไม่ลาก)
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
import type { BlockType, TemplateV1 } from '@/lib/line-report/template'
import { cn } from '@/utils/helpers'
import { ADD_LABEL, BLOCK_ICON, blockTitle, LIBRARY_GROUPS } from '../lib/block-meta'

export const LIBRARY_DROPPABLE_ID = 'library-blocks'
export const libraryDraggableId = (t: BlockType) => `lib-${t}`
export const typeOfDraggableId = (id: string): BlockType | null => {
  const t = id.startsWith('lib-') ? id.slice(4) : ''
  return LIBRARY_GROUPS.some((g) => (g.types as readonly string[]).includes(t)) ? (t as BlockType) : null
}

type Entry = { type: BlockType; title: string; reason: string | null; disabled: boolean }

/** รายการที่จะแสดง: ชนิดเดียวที่ใส่แล้วถูกซ่อน · ครบ 20 = disabled ไม่ซ้ำเหตุผลทุกแถว */
export function libraryEntries(draft: TemplateV1, ctx: AvailabilityContext, word: string): { groups: { title: string; entries: Entry[] }[]; full: boolean } {
  let full = false
  const groups = LIBRARY_GROUPS.map((g) => {
    const entries: Entry[] = []
    for (const type of g.types) {
      const a = libraryAvailability(type, draft, ctx)
      if (!a.ok && a.reason === REASON.USED_UP) continue
      if (!a.ok && a.reason === REASON.BLOCKS_FULL) full = true
      entries.push({ type, title: blockTitle(type, word), disabled: !a.ok, reason: a.ok || a.reason === REASON.BLOCKS_FULL ? null : a.reason })
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
    <>
      {/* ≥lg: คอลัมน์ซ้าย */}
      <div className="hidden lg:block">
        {full && <p className="text-default-700 mb-0 text-xs">ครบ 20 บล็อกแล้ว เอาบล็อกออกก่อนจึงเพิ่มได้</p>}
        {groups.length === 0 && <p className="text-default-700 mb-0 text-sm">ใส่ครบแล้ว</p>}
        <Droppable droppableId={LIBRARY_DROPPABLE_ID} isDropDisabled>
          {(drop) => (
            <div ref={drop.innerRef} {...drop.droppableProps}>
              {groups.map((g) => (
                <div key={g.title} className="mt-5 first:mt-0">
                  <h3 className="text-default-700 mb-1 text-xs font-semibold">{g.title}</h3>
                  {g.entries.map((e) => {
                    return (
                      <Draggable key={e.type} draggableId={libraryDraggableId(e.type)} index={indexOf(e.type)} isDragDisabled={e.disabled}>
                        {(drag, snap) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            aria-disabled={e.disabled || undefined}
                            className={cn('flex items-center gap-2 rounded-lg py-0.5 ps-2', e.disabled ? 'cursor-default' : 'cursor-grab hover:bg-default-100', snap.isDragging && 'bg-card border-primary border shadow-lg')}
                          >
                            <Icon icon={BLOCK_ICON[e.type]} className="text-default-500 shrink-0 text-base" aria-hidden="true" />
                            <div className="min-w-0 flex-1 py-1.5">
                              <span className={cn('block text-sm break-words', e.disabled ? 'text-default-700' : 'text-default-900')}>{e.title}</span>
                              {e.reason && <span className="text-default-700 block text-xs">{e.reason}</span>}
                            </div>
                            {!e.disabled && <AddButton entry={e} word={word} onAdd={onAdd} />}
                          </div>
                        )}
                      </Draggable>
                    )
                  })}
                </div>
              ))}
              {drop.placeholder}
            </div>
          )}
        </Droppable>
      </div>

      {/* <lg: แถบชิปเลื่อนแนวนอน (ไม่ลาก) */}
      <div className="lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-2" role="group" aria-label="เพิ่มบล็อก">
          <span className="text-default-700 shrink-0 text-xs">เพิ่มได้</span>
          {groups.length === 0 && <span className="text-default-700 text-sm">ใส่ครบแล้ว</span>}
          {flat.map((e) => (
            <button
              key={e.type}
              type="button"
              disabled={e.disabled}
              aria-disabled={e.disabled || undefined}
              aria-label={ADD_LABEL(e.type, word)}
              title={e.reason ?? (full && e.disabled ? 'ครบ 20 บล็อกแล้ว' : undefined)}
              onClick={() => onAdd(e.type)}
              className="bg-primary/10 text-primary inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium disabled:opacity-50"
            >
              <Icon icon="plus" className="size-4" aria-hidden="true" />
              {e.title}
            </button>
          ))}
        </div>
        {/* เหตุผลที่ชิป disabled ต้องอ่านได้บนมือถือด้วย (ไม่มี hover) — แสดงเป็นบรรทัดเดียวของชิปแรกที่ใช้ไม่ได้ */}
        {flat.filter((e) => e.reason).map((e) => (
          <p key={e.type} className="text-default-700 mb-0 text-xs">
            {e.title}: {e.reason}
          </p>
        ))}
        {full && <p className="text-default-700 mb-0 text-xs">ครบ 20 บล็อกแล้ว เอาบล็อกออกก่อนจึงเพิ่มได้</p>}
      </div>
    </>
  )
}
