'use client'

/**
 * LibraryPanel — คอลัมน์ซ้าย "คลัง" ของตัวจัดหน้าร้าน (feature 00035)
 *
 * รื้อ canvas จาก iframe เป็น Paces-native (2026-08-07, user เคาะ) เปลี่ยนไฟล์นี้ 3 เรื่อง:
 *   1) ลากจากคลังมาวางที่ canvas ได้จริง — แถวเหรียญเด่น/โพสต์ Facebook ห่อด้วย Draggable
 *      (@hello-pangea/dnd) ภายใน Droppable ต้นทาง 2 กลุ่ม (isDropDisabled — เป็นต้นทางอย่างเดียว
 *      ไม่รับของกลับเข้ามา) DragDropContext อยู่ที่ BuilderClient.tsx (ต้องเป็น ancestor ร่วมกับ
 *      CanvasFrame ถึงจะลากข้าม Droppable กันได้) onDragEnd จัดการที่นั่นทั้งหมด
 *   2) addingPostId/badgePickerOpen ย้ายขึ้นไปเป็น prop จาก BuilderClient — ปุ่มบวก (คลิก) กับ
 *      ลากวาง ต้องเรียก handler เดียวกัน ไม่งั้นสถานะไม่ sync กันระหว่าง 2 ทางเข้า
 *   3) แก้ประเด็นที่ critique จับได้ (ดูรายงาน task): text-2xs→text-xs, ปุ่ม/กริป ≥44px, การ์ดโพสต์
 *      Facebook เล็กลงอีก, ย้าย "ตรึงตายตัว"/"แท็บของหน้าร้าน" ขึ้นเหนือลิสต์โพสต์ที่ยาวไม่จำกัด,
 *      แก้ placeholder ค้นหาให้ตรงความจริง (กรองเฉพาะโพสต์ ไม่กรองเหรียญ — ไม่ได้ทำ search เหรียญ
 *      เพราะเหรียญไม่ได้ลิสต์ทีละใบในคอลัมน์นี้ เลือกผ่านโมดัลเท่านั้น — ตัดสินใจเอง ดูรายงาน)
 *
 * Base (โครง markup เดิม): docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" คอลัมน์ "คลัง"
 * Base (กลไกลากข้าม Droppable, HR1): theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx
 * Base (กลไกลากสลับลำดับแท็บภายในคอลัมน์เดียวกัน, HR1): theme/paces/Admin/TS/src/app/(admin)/apps/todo/components/Todos.tsx +
 *   TaskItem.tsx (react-sortablejs) — `sortableOptions.handle: '.sort-handle'` (คนละ lib กับ
 *   @hello-pangea/dnd โดยตั้งใจ — ลากสลับลำดับแท็บไม่ข้ามคอลัมน์ จึงไม่ต้องอยู่ใน DragDropContext เดียวกัน)
 */
import { useMemo, useState } from 'react'

import { Draggable, Droppable } from '@hello-pangea/dnd'
import { ReactSortable, type Sortable } from 'react-sortablejs'

import Icon from '@/components/wrappers/Icon'
import type { ProfileTabKey } from '@/lib/profile-tab-keys'

import BadgePickerModal from './BadgePickerModal'
import { moveArrayItem } from '../lib/draft'
import { PROFILE_TAB_ICON, PROFILE_TAB_LABEL_TH, type LibraryPanelProps } from '../types'

const MAX_BADGES = 4

const tabSortableOptions: Partial<Sortable.Options> = {
  handle: '.sort-handle',
  ghostClass: 'sortable-item-ghost',
  animation: 150,
  fallbackOnBody: true,
  swapThreshold: 0.65,
}

export default function LibraryPanel({
  initialLibrary,
  visibleTabKeys,
  draft,
  addingPostId,
  onAddPostClick,
  badgePickerOpen,
  onOpenBadgePicker,
  onCloseBadgePicker,
  onAddBadgeBlock,
  onReorderTabs,
}: LibraryPanelProps) {
  const [q, setQ] = useState('')

  // ค้นหาฝั่ง client บนหน้าแรกที่ SSR มาให้ก่อน (ยังกรองเฉพาะโพสต์ — เหรียญไม่ได้ลิสต์ทีละใบใน
  // คอลัมน์นี้ เลือกผ่านโมดัลเท่านั้น ดู comment หัวไฟล์)
  const filteredPosts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return initialLibrary.facebookPosts
    return initialLibrary.facebookPosts.filter((p) => (p.message ?? '').toLowerCase().includes(needle))
  }, [initialLibrary.facebookPosts, q])

  const badgeBlock = draft.blocks.find((b) => b.type === 'BADGE_HIGHLIGHT')
  const addedFacebookPostIds = new Set(
    draft.blocks.filter((b) => b.type === 'FACEBOOK_POST').map((b) => b.post.id),
  )

  const tabItems = draft.tabOrder.map((key) => ({ id: key }))
  const handleTabSortChange = (next: { id: ProfileTabKey }[]) => {
    onReorderTabs(next.map((item) => item.id))
  }
  const handleMoveTab = (index: number, direction: -1 | 1) => {
    onReorderTabs(moveArrayItem(draft.tabOrder, index, direction))
  }

  return (
    // [สำคัญ] ต้องมี h-full — .card ของ Paces ตั้ง height:fit-content ซึ่งชนะ items-stretch ของ flex
    // parent ทำให้คอลัมน์ยืดไม่เท่ากัน (วัดจริงบน prod: คลังยาว 4308px ทะลุกรอบ overflow:hidden จน
    // overflow-auto ข้างในไม่ทำงาน / canvas เหลือ 230px จน iframe ยุบเหลือ 150px)
    // ดู feedback_paces_card_hfit_vs_hfull
    <div className="card h-full flex min-h-0 w-[30%] flex-col"> {/* HR7 carve-out: 30/40/30 ล็อกไว้ตาม SDS §3/mockup — Paces ไม่มี token สัดส่วนคอลัมน์นี้ */}
      <div className="card-header py-3">
        <h4 className="card-title text-sm">คลัง</h4>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3.5">
        <div className="input-group mb-3.5">
          <span className="input-group-text">
            <Icon icon="search" className="text-base" aria-hidden="true" />
          </span>
          <input
            className="form-input text-sm"
            placeholder="ค้นหาโพสต์"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* กลุ่ม 1 (ย้ายขึ้นบนสุด — จุดขายของ product เดิมอยู่ที่ 84% ของ scroll): ตรึงตายตัว */}
        <div className="text-default-600 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="lock" className="text-sm" aria-hidden="true" />
          ตรึงตายตัว
        </div>
        <p className="text-default-400 text-xs mb-2">อยู่บนสุดเสมอ ขยับและซ่อนไม่ได้</p>
        <div className="border-default-300 bg-default-50 mb-5 flex items-center gap-2.5 rounded-lg border border-dashed p-2.5">
          <span className="bg-white text-default-500 flex size-8 items-center justify-center rounded-md">
            <Icon icon="shield-check" className="text-base" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate text-sm font-medium">คะแนน · ป้ายยืนยันตัวตน · สถิติ</div>
            <div className="text-default-400 truncate text-xs">อยู่ในหัวโปรไฟล์</div>
          </div>
          <span className="badge bg-default-100 text-default-600 text-xs shrink-0">ตรึง</span>
        </div>

        {/* กลุ่ม 2: เพิ่มเหนือแถบแท็บได้ — เหรียญตราเด่น (ลากจากตรงนี้ไปวางที่ canvas ได้) */}
        <div className="text-default-600 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="plus" className="text-sm" aria-hidden="true" />
          เพิ่มเหนือแถบแท็บได้
        </div>
        <p className="text-default-400 text-xs mb-2">แตะปุ่มบวกหรือลากเข้าไปวางในพื้นที่ตรงกลาง</p>

        <Droppable droppableId="library-badge" isDropDisabled>
          {(dropProvided) => (
            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="mb-5">
              <Draggable draggableId="library-badge" index={0}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={
                      (dragSnapshot.isDragging ? 'border-primary shadow-lg' : 'border-default-300') +
                      ' flex cursor-grab items-center gap-2.5 rounded-lg border bg-white p-2.5'
                    }
                  >
                    <span className="bg-default-100 text-default-500 flex size-8 items-center justify-center rounded-md">
                      <Icon icon="award" className="text-base" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-default-900 truncate text-sm font-medium">เหรียญตราเด่น</div>
                      <div className="text-default-400 truncate text-xs">เลือกได้สูงสุด {MAX_BADGES} ใบ · มีได้บล็อกเดียว</div>
                    </div>
                    {badgeBlock ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="badge bg-success/15 text-success text-xs">เพิ่มแล้ว</span>
                        {/* ต่างจาก "เพิ่มแล้ว" ของโพสต์ Facebook (ปุ่มบวกหายไปเลย เพิ่มซ้ำไม่ได้) — บล็อก
                            เหรียญมีบล็อกเดียว เปลี่ยนใบที่แสดง/ลำดับได้ จึงต้องมีทางแก้ไขต่อ ไม่ใช่ทางตัน
                            (ทางลบทั้งบล็อกยังอยู่ที่ ⋮ ในคอลัมน์กลาง — CanvasFrame.tsx) */}
                        <button
                          type="button"
                          onClick={onOpenBadgePicker}
                          className="text-primary min-h-11 text-xs font-medium"
                        >
                          แก้ไข
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenBadgePicker}
                        aria-label="เพิ่มเหรียญตราเด่น"
                        className="btn btn-icon bg-primary min-h-11 min-w-11 shrink-0 rounded-full text-white hover:bg-primary-hover"
                      >
                        <Icon icon="plus" className="text-sm" />
                      </button>
                    )}
                  </div>
                )}
              </Draggable>
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>

        {/* กลุ่ม 3: แท็บ — จัดลำดับได้ ปิดไม่ได้ (ย้ายขึ้นเหนือลิสต์โพสต์ Facebook ที่ยาวไม่จำกัด) */}
        <div className="text-default-600 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="layout-list" className="text-sm" aria-hidden="true" />
          แท็บของหน้าร้าน
        </div>
        <p className="text-default-400 text-xs mb-2">
          ลากที่ไอคอนจับ หรือสลับลำดับด้วยปุ่มลูกศร — <b className="text-default-600">ปิดหรือเอาออกไม่ได้</b>{' '}
          แท็บจะขึ้นเองเมื่อมีข้อมูล
        </p>
        <ReactSortable list={tabItems} setList={handleTabSortChange} tag="div" className="mb-5" {...tabSortableOptions}>
          {tabItems.map((item, index) => {
            const key = item.id
            return (
              <div key={key} className="border-default-300 mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
                <span className="sort-handle -my-2.5 inline-flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center">
                  <Icon icon="grip-vertical" className="text-default-400 text-base" aria-hidden="true" />
                </span>
                <span className="bg-default-100 text-default-500 flex size-7 items-center justify-center rounded-md text-xs font-semibold">
                  {index + 1}
                </span>
                <Icon icon={PROFILE_TAB_ICON[key]} className="text-default-400 text-base" aria-hidden="true" />
                <div className="text-default-900 min-w-0 flex-1 truncate text-sm font-medium">
                  {PROFILE_TAB_LABEL_TH[key]}
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleMoveTab(index, -1)}
                    disabled={index === 0}
                    aria-label={`ย้าย ${PROFILE_TAB_LABEL_TH[key]} ขึ้น`}
                    className="btn btn-icon text-default-500 min-h-11 min-w-11 disabled:opacity-30"
                  >
                    <Icon icon="chevron-up" className="text-sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveTab(index, 1)}
                    disabled={index === tabItems.length - 1}
                    aria-label={`ย้าย ${PROFILE_TAB_LABEL_TH[key]} ลง`}
                    className="btn btn-icon text-default-500 min-h-11 min-w-11 disabled:opacity-30"
                  >
                    <Icon icon="chevron-down" className="text-sm" />
                  </button>
                </div>
              </div>
            )
          })}
        </ReactSortable>
        {visibleTabKeys.length === 0 && (
          <p className="text-default-400 text-xs mb-5">ร้านนี้ยังไม่มีแท็บที่มีข้อมูล — จะขึ้นเองเมื่อมีข้อมูล</p>
        )}

        {/* กลุ่ม 4: โพสต์จากเพจ Facebook — ลิสต์ยาวไม่จำกัด อยู่ล่างสุดโดยตั้งใจ */}
        <div className="text-default-500 text-xs mb-1.5">
          โพสต์จากเพจ Facebook{initialLibrary.facebookChannelConnected ? '' : ' · ยังไม่ได้เชื่อมเพจ'}
        </div>

        {filteredPosts.length === 0 ? (
          <p className="text-default-400 text-xs">ยังไม่มีโพสต์ให้เลือก</p>
        ) : (
          <Droppable droppableId="library-fbposts" isDropDisabled>
            {(dropProvided) => (
              // กริด 2 คอลัมน์ รูปนำ (user ส่ง reference มา 2026-08-07) — เดิมเป็นแถวแนวนอน
              // thumbnail 40px ซึ่งเล็กเกินกว่าจะดูออกว่าโพสต์ไหนเป็นโพสต์ไหน ทั้งที่รูปคือสิ่งที่
              // ผู้ขายใช้จำโพสต์ของตัวเอง ไม่ใช่ข้อความ (ข้อความขึ้นต้นเหมือนกันเกือบทุกโพสต์)
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="grid grid-cols-2 gap-2">
                {filteredPosts.map((post, index) => {
                  const added = addedFacebookPostIds.has(post.id)
                  const isAdding = addingPostId === post.id
                  return (
                    <Draggable
                      key={post.id}
                      draggableId={`library-fbpost-${post.id}`}
                      index={index}
                      isDragDisabled={added || isAdding}
                    >
                      {(dragProvided, dragSnapshot) => (
                        // แถวกะทัดรัด (user ทัก 2026-08-07 สองรอบ — รอบแรกจาก h-20 เต็มความกว้าง เหลือ
                        // แถว size-12; รอบสองยังใหญ่ไป) ย่อ thumbnail 12→10 + padding แน่นขึ้นอีกชั้น
                        // เพื่อเห็นได้หลายโพสต์ต่อจอ แต่ยังลากได้สะดวก (โซนลากคือทั้งแถว)
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...(added ? {} : dragProvided.dragHandleProps)}
                          className={
                            (dragSnapshot.isDragging ? 'border-primary shadow-lg' : 'border-default-300') +
                            ' overflow-hidden rounded-lg border bg-white' +
                            (added || isAdding ? ' opacity-60' : ' cursor-grab')
                          }
                        >
                          <div className="relative">
                            {post.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- คลังโหลดรูปจาก storage/Meta CDN ภายนอก ไม่ผ่าน next/image config
                              <img src={post.imageUrl} alt="" className="aspect-square w-full object-cover" />
                            ) : (
                              <div className="bg-default-200 text-default-400 flex aspect-square w-full items-center justify-center">
                                <Icon icon="photo" className="text-2xl" aria-hidden="true" />
                              </div>
                            )}
                            {/* ปุ่มเพิ่มลอยมุมขวาล่างของรูป — ไม่กินแถวของตัวเอง กริดจึงแน่นขึ้น
                                และยังได้ hit area 44px ตามเกณฑ์ */}
                            {added ? (
                              <span className="badge bg-success/15 text-success absolute bottom-1.5 end-1.5 text-xs">
                                เพิ่มแล้ว
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onAddPostClick(post.id)}
                                disabled={isAdding}
                                aria-label={`เพิ่มโพสต์ลงหน้าร้าน: ${(post.message ?? '(ไม่มีข้อความ)').slice(0, 40)}`}
                                className="btn btn-icon bg-primary absolute bottom-1.5 end-1.5 min-h-11 min-w-11 rounded-full text-white shadow hover:bg-primary-hover disabled:opacity-60"
                              >
                                <Icon icon={isAdding ? 'loader-2' : 'plus'} className="text-sm" />
                              </button>
                            )}
                          </div>
                          <div className="p-2">
                            <p className="text-default-700 line-clamp-2 text-xs">{post.message ?? '(ไม่มีข้อความ)'}</p>
                            <div className="text-default-400 mt-1.5 flex items-center gap-2.5 text-xs">
                              <span className="inline-flex items-center gap-1">
                                <Icon icon="heart" className="text-xs" aria-hidden="true" />
                                {post.reactionCount ?? 0}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Icon icon="message-circle" className="text-xs" aria-hidden="true" />
                                {post.fbCommentCount ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  )
                })}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        )}
      </div>

      <BadgePickerModal
        open={badgePickerOpen}
        onClose={onCloseBadgePicker}
        badges={initialLibrary.badges}
        initialSelected={badgeBlock?.badges ?? []}
        onConfirm={onAddBadgeBlock}
      />
    </div>
  )
}
