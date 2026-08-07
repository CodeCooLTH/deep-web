'use client'

/**
 * LibraryPanel — คอลัมน์ซ้าย "คลัง" ของตัวจัดหน้าร้าน (feature 00035, Task 7 โครง + Task 8 badge
 * picker/drag)
 *
 * Task 8 เติม 2 เรื่องที่ Task 7 ทิ้งไว้:
 *   1) badge picker — เดิม handleAddBadges auto-pick 4 ใบแรก ตอนนี้เปิด BadgePickerModal ให้ผู้ขาย
 *      เลือกเองเป็นรายใบ (ดู BadgePickerModal.tsx)
 *   2) drag-and-drop สลับลำดับแท็บ — เติมคู่กับปุ่มลูกศรเดิม (ปุ่มลูกศรยังอยู่เป็นทางหลักคู่กัน
 *      ตาม SRS §6 NFR Accessibility ไม่ใช่ทางสำรองที่ถูกลดชั้นลง)
 *
 * Base (โครง markup เดิม): docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" คอลัมน์ "คลัง" (การ์ดกว้าง 30% ของแถว, input-group ค้นหา,
 *   3 กลุ่ม: "เพิ่มเหนือแถบแท็บได้" / "แท็บของหน้าร้าน" / "ตรึงตายตัว")
 * Base (กลไกลาก, HR1): theme/paces/Admin/TS/src/app/(admin)/apps/todo/components/Todos.tsx +
 *   TaskItem.tsx (react-sortablejs) — `<Icon icon="grip-horizontal" className="sort-handle" />`
 *   ต้นแถว + `sortableOptions.handle: '.sort-handle'` ยกทรงมาเป๊ะ (ปุ่มลูกศรกดได้โดยไม่โดน drag
 *   hijack เพราะ handle จำกัดเฉพาะไอคอนกริป ไม่ใช่ทั้งแถว) `.sortable-item-ghost`/`.sort-handle`
 *   เป็นคลาสที่คอมไพล์อยู่ใน app.css อยู่แล้ว (src/assets/css/plugins/_sortablejs.css) ไม่ต้องเพิ่ม CSS ใหม่
 */
import { useEffect, useMemo, useState } from 'react'

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
  onAddBadgeBlock,
  onAddFacebookPostBlock,
  onReorderTabs,
  mirrorFacebookPost,
}: LibraryPanelProps) {
  const [q, setQ] = useState('')
  const [addingPostId, setAddingPostId] = useState<string | null>(null)
  const [badgePickerOpen, setBadgePickerOpen] = useState(false)

  // ค้นหาฝั่ง client บนหน้าแรกที่ SSR มาให้ก่อน (Task 8 ค่อยต่อ GET .../library ?q=&cursor= สำหรับ
  // ผลลัพธ์ที่เกินหน้าแรก — endpoint รองรับอยู่แล้ว API.md §4.1)
  const filteredPosts = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return initialLibrary.facebookPosts
    return initialLibrary.facebookPosts.filter((p) => (p.message ?? '').toLowerCase().includes(needle))
  }, [initialLibrary.facebookPosts, q])

  const badgeBlock = draft.blocks.find((b) => b.type === 'BADGE_HIGHLIGHT')
  const addedFacebookPostIds = new Set(
    draft.blocks.filter((b) => b.type === 'FACEBOOK_POST').map((b) => b.post.id),
  )

  // Task 8 — ลาก/สลับลำดับแถบแท็บ (react-sortablejs ต้องการ item ที่มี field `id`)
  const [tabItems, setTabItems] = useState<{ id: ProfileTabKey }[]>(() => draft.tabOrder.map((key) => ({ id: key })))
  useEffect(() => {
    setTabItems(draft.tabOrder.map((key) => ({ id: key })))
  }, [draft.tabOrder])
  const handleTabSortChange = (next: { id: ProfileTabKey }[]) => {
    setTabItems(next)
    onReorderTabs(next.map((item) => item.id))
  }

  const handleAddPost = async (postId: string) => {
    const post = initialLibrary.facebookPosts.find((p) => p.id === postId)
    if (!post || addingPostId) return
    setAddingPostId(postId)
    try {
      const result = await mirrorFacebookPost(postId)
      onAddFacebookPostBlock({
        id: post.id,
        message: post.message,
        imageUrl: result.imageUrl,
        mediaType: post.mediaType,
        reactionCount: post.reactionCount,
        fbCommentCount: post.fbCommentCount,
        shareCount: post.shareCount,
        permalink: post.permalink,
      })
    } finally {
      setAddingPostId(null)
    }
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
            placeholder="ค้นหาเนื้อหาหรือเหรียญตรา"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* กลุ่ม 1: เพิ่มเหนือแถบแท็บได้ (= ShopPageBlock) */}
        <div className="text-default-600 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="plus" className="text-sm" aria-hidden="true" />
          เพิ่มเหนือแถบแท็บได้
        </div>
        <p className="text-default-400 text-2xs mb-2">แตะปุ่มบวกเพื่อเพิ่ม แล้วลากจัดลำดับในพื้นที่ตรงกลาง</p>

        <div className="border-default-300 mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
          <span className="bg-default-100 text-default-500 flex size-8 items-center justify-center rounded-md">
            <Icon icon="award" className="text-base" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate text-sm font-medium">เหรียญตราเด่น</div>
            <div className="text-default-400 truncate text-2xs">เลือกได้สูงสุด {MAX_BADGES} ใบ · มีได้บล็อกเดียว</div>
          </div>
          {badgeBlock ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="badge bg-success/15 text-success text-2xs">เพิ่มแล้ว</span>
              {/* [Task 8] ต่างจาก "เพิ่มแล้ว" ของโพสต์ Facebook (ปุ่มบวกหายไปเลย เพิ่มซ้ำไม่ได้)
                  — บล็อกเหรียญมีบล็อกเดียว เปลี่ยนใบที่แสดง/ลำดับได้ จึงต้องมีทางแก้ไขต่อ ไม่ใช่ทางตัน
                  (ทางลบทั้งบล็อกยังอยู่ที่ ⋮ ในคอลัมน์กลาง — CanvasFrame.tsx) */}
              <button type="button" onClick={() => setBadgePickerOpen(true)} className="text-primary text-2xs font-medium">
                แก้ไข
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBadgePickerOpen(true)}
              aria-label="เพิ่มเหรียญตราเด่น"
              className="btn btn-icon btn-sm bg-primary shrink-0 rounded-full text-white hover:bg-primary-hover"
            >
              <Icon icon="plus" className="text-sm" />
            </button>
          )}
        </div>

        <div className="text-default-500 text-2xs mt-3 mb-1.5">
          โพสต์จากเพจ Facebook{initialLibrary.facebookChannelConnected ? '' : ' · ยังไม่ได้เชื่อมเพจ'}
        </div>

        {filteredPosts.length === 0 ? (
          <p className="text-default-400 text-2xs">ยังไม่มีโพสต์ให้เลือก</p>
        ) : (
          filteredPosts.map((post) => {
            const added = addedFacebookPostIds.has(post.id)
            return (
              // แถวกะทัดรัด (user ทัก 2026-08-07 "ไม่ต้องเป็น card ใหญ่มากก็ได้ ... ควรดูได้หลาย ๆ post
              // และเลื่อนดูได้ง่าย ๆ") — เดิมเป็นการ์ดรูปเต็มความกว้าง h-20 ทำให้เห็นได้ ~4 โพสต์ต่อจอ
              // และดันกลุ่ม "แท็บของหน้าร้าน" ที่ลากได้ตกจอไปจนผู้ใช้หาไม่เจอ
              <div
                key={post.id}
                className="border-default-300 mb-1.5 flex items-start gap-2.5 rounded-lg border bg-white p-2"
              >
                {post.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- คลังโหลดรูปจาก storage/Meta CDN ภายนอก ไม่ผ่าน next/image config
                  <img src={post.imageUrl} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <div className="bg-default-200 text-default-400 flex size-12 shrink-0 items-center justify-center rounded-md">
                    <Icon icon="photo" className="text-lg" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-default-700 line-clamp-2 text-2xs">{post.message ?? '(ไม่มีข้อความ)'}</p>
                  <div className="text-default-400 text-2xs mt-1 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Icon icon="heart" className="text-sm" aria-hidden="true" />
                      {post.reactionCount ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon icon="message-circle" className="text-sm" aria-hidden="true" />
                      {post.fbCommentCount ?? 0}
                    </span>
                    {added ? (
                      <span className="badge bg-success/15 text-success text-2xs ms-auto">เพิ่มแล้ว</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddPost(post.id)}
                        disabled={addingPostId === post.id}
                        aria-label="เพิ่มลงหน้าร้าน"
                        className="btn btn-icon btn-sm bg-primary ms-auto rounded-full text-white hover:bg-primary-hover disabled:opacity-60"
                      >
                        <Icon icon={addingPostId === post.id ? 'loader-2' : 'plus'} className="text-sm" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* กลุ่ม 2: แท็บ — จัดลำดับได้ ปิดไม่ได้ */}
        <div className="text-default-600 mt-5 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="layout-list" className="text-sm" aria-hidden="true" />
          แท็บของหน้าร้าน
        </div>
        <p className="text-default-400 text-2xs mb-2">
          ลากที่ไอคอนจับ หรือสลับลำดับด้วยปุ่มลูกศร — <b className="text-default-600">ปิดหรือเอาออกไม่ได้</b>{' '}
          แท็บจะขึ้นเองเมื่อมีข้อมูล
        </p>
        {/* [Task 8] ลาก — Base: theme todo app Todos.tsx/TaskItem.tsx (react-sortablejs, handle: '.sort-handle')
            ปุ่มลูกศรเดิมยังอยู่คู่กันเป็นทางหลักที่ไม่ได้ถูกลดชั้น (SRS §6 NFR Accessibility) */}
        <ReactSortable list={tabItems} setList={handleTabSortChange} tag="div" {...tabSortableOptions}>
          {tabItems.map((item, index) => {
            const key = item.id
            return (
              <div key={key} className="border-default-300 mb-2 flex items-center gap-2.5 rounded-lg border bg-white p-2.5">
                <Icon icon="grip-vertical" className="sort-handle text-default-400 shrink-0 text-base" aria-hidden="true" />
                <span className="bg-default-100 text-default-500 flex size-7 items-center justify-center rounded-md text-2xs font-semibold">
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
                    className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                  >
                    <Icon icon="chevron-up" className="text-sm" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveTab(index, 1)}
                    disabled={index === tabItems.length - 1}
                    aria-label={`ย้าย ${PROFILE_TAB_LABEL_TH[key]} ลง`}
                    className="btn btn-icon btn-sm text-default-500 disabled:opacity-30"
                  >
                    <Icon icon="chevron-down" className="text-sm" />
                  </button>
                </div>
              </div>
            )
          })}
        </ReactSortable>
        {visibleTabKeys.length === 0 && (
          <p className="text-default-400 text-2xs">ร้านนี้ยังไม่มีแท็บที่มีข้อมูล — จะขึ้นเองเมื่อมีข้อมูล</p>
        )}

        {/* กลุ่ม 3: ตรึงตายตัว */}
        <div className="text-default-600 mt-5 mb-1 flex items-center gap-1.5 text-xs font-semibold">
          <Icon icon="lock" className="text-sm" aria-hidden="true" />
          ตรึงตายตัว
        </div>
        <p className="text-default-400 text-2xs mb-2">อยู่บนสุดเสมอ ขยับและซ่อนไม่ได้</p>
        <div className="border-default-300 bg-default-50 flex items-center gap-2.5 rounded-lg border border-dashed p-2.5">
          <span className="bg-white text-default-500 flex size-8 items-center justify-center rounded-md">
            <Icon icon="shield-check" className="text-base" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-default-900 truncate text-sm font-medium">คะแนน · ป้ายยืนยันตัวตน · สถิติ</div>
            <div className="text-default-400 truncate text-2xs">อยู่ในหัวโปรไฟล์</div>
          </div>
          <span className="badge bg-default-100 text-default-600 text-2xs shrink-0">ตรึง</span>
        </div>
      </div>

      <BadgePickerModal
        open={badgePickerOpen}
        onClose={() => setBadgePickerOpen(false)}
        badges={initialLibrary.badges}
        initialSelected={badgeBlock?.badges ?? []}
        onConfirm={onAddBadgeBlock}
      />
    </div>
  )
}
