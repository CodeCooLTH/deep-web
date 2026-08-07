'use client'

/**
 * BuilderClient — orchestrator ของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * ถือ draft state ทั้งหมด (useState<BuilderDraft>) — ไม่มีตาราง DB (DATABASE §6) บันทึกล้มต้อง
 * คง draft ไว้เสมอ ไม่ล้างค่า (Task 7 §4) — ผู้ใช้กดบันทึกซ้ำได้ทันที
 *
 * desktop-only gate (SDS TD-007): CSS-only `hidden xl:flex` / `xl:hidden` สลับข้อความอธิบาย
 * กับ workspace 2 คอลัมน์จริง — ไม่ใช้ JS `window.innerWidth` (กัน hydration flash)
 *
 * รื้อ canvas จาก iframe เป็น Paces-native (2026-08-07, user เคาะ) — เหตุผล: บั๊ก prod ยืนยันซ้ำ
 * 2 ครั้งว่า BuilderPreviewBridge ไม่ mount เลยเพราะ canManagePage ตัดสินจาก session ของ
 * deepthailand.app แต่ builder อยู่ seller.deepthailand.app (session แยกตาม subdomain) —
 * DEEP_BUILDER_BLOCK_RECTS ไม่เคยถูกส่งกลับมาสักครั้ง คอลัมน์กลางค้างไม่อัปเดตตลอด แลกกับ canvas
 * เป็น "ภาพแทน" ไม่ใช่หน้าจริง 100% (ยอมรับตาม dispatch)
 *
 * ลากข้ามคอลัมน์ (คลัง → canvas) ทำได้จริงแล้ว เพราะ document เดียวกัน — DragDropContext เดียว
 * ต้องเป็น ancestor ร่วมของ LibraryPanel/CanvasFrame ถึงจะลากข้าม Droppable กันได้ (@hello-pangea/dnd)
 * จึงย้าย state ที่เคยอยู่ใน LibraryPanel เอง (addingPostId, badgePickerOpen) ขึ้นมาไว้ที่นี่ —
 * ปุ่มบวก (คลิก) และลากวาง ต้องเรียก handler ตัวเดียวกัน ไม่งั้นสถานะ "กำลังเพิ่ม"/โมดัลเปิดค้าง
 * จะไม่ sync กันระหว่าง 2 ทางเข้า (Product Principle 3 — ปุ่มบวกยังต้องเป็นทางหลักคู่กับการลาก)
 *
 * รอบสอง (2026-08-07, "canvas ต้องตรงกับหน้าจริง") — ลบคอลัมน์ "พรีวิว" (ขวา) ทิ้ง: หลัง canvas
 * เป็น Paces-native แล้วคอลัมน์นั้นแสดงของซ้ำกับ canvas ~90% ต่างแค่ไม่มีเครื่องมือแก้ไข (critique
 * จับได้ว่าเทาเปล่า 67%) เหลือ 2 คอลัมน์: คลัง 30% + canvas ที่เหลือ (flex-1, ไม่ต้องตั้ง width เอง
 * เพราะเดิมมีแค่ library ที่ล็อก 30% ไว้ตัวเดียว canvas เป็น flex-1 อยู่แล้วจึงขยายเต็มที่เหลือทันที)
 *
 * Base: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" (โครง toolbar/dirty-bar — คอลัมน์ "พรีวิว" ในหัวข้อนี้ถูกลบ
 *   ออกจากโค้ดแล้วตามด้านบน) และหัวข้อ "2 · มือถือ — สิ่งที่เห็นแทน" การ์ด "เหตุผลที่ตัด" (ข้อความ
 *   desktop-only + ทางออก)
 *
 * ความสูงของ workspace: HR7 carve-out — (fullscreen)/layout.tsx ห่อ children ด้วย
 * `<div class="w-full p-4 md:p-8">` (padding 4 ด้าน, 32px บน xl) FullscreenPageHeader หักลบ
 * padding บนของตัวเองด้วย `-mt-* pt-*` (sticky ทึบชนขอบบน) แต่ไม่แตะ padding ล่าง — ความสูง
 * workspace ที่ถูกต้องจึงหัก "บน + ล่าง" ของ padding นั้นเท่านั้น (2rem+2rem=4rem) ไม่ใช่หักซ้ำรวม
 * ความสูง header/dirty-bar เข้าไปด้วย (ของเดิม 9rem นับซ้ำ ทำให้เหลือช่องว่างล่าง 112px วัดจริงบน
 * prod ทั้งที่ควรเหลือแค่ 32px เท่า padding ธรรมชาติ — ดูรายงาน task นี้)
 */
import { useCallback, useMemo, useState, type FormEvent } from 'react'

import { DragDropContext, type DropResult } from '@hello-pangea/dnd'

import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { ProfileTabKey } from '@/lib/profile-tab-keys'
import type { BuilderLibrary, SavedShopPageLayout } from '@/services/shop-page-layout.service'

import BuilderToolbar from './BuilderToolbar'
import CanvasFrame from './CanvasFrame'
import LibraryPanel from './LibraryPanel'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { draftToSaveInput, isSameDraft, moveToIndex, reconcileSavedLayout } from '../lib/draft'
import {
  BUILDER_FORM_ID,
  type BuilderDraft,
  type BuilderDraftBadge,
  type BuilderDraftBadgeBlock,
  type BuilderDraftBlock,
  type BuilderDraftFacebookPostBlock,
  type BuilderDraftPost,
  type BuilderHeaderData,
} from '../types'

export type BuilderClientProps = {
  publicUrl: string
  /** "deepthailand.app/u/" หรือ "deepthailand.app/b/" */
  handlePrefix: string
  handle: string
  initialDraft: BuilderDraft
  initialIsPublished: boolean
  visibleTabKeys: ProfileTabKey[]
  initialLibrary: BuilderLibrary
  header: BuilderHeaderData
}

function newClientKey(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`
}

export default function BuilderClient({
  publicUrl,
  handlePrefix,
  handle,
  initialDraft,
  initialIsPublished,
  visibleTabKeys,
  initialLibrary,
  header,
}: BuilderClientProps) {
  const [draft, setDraft] = useState<BuilderDraft>(initialDraft)
  const [savedDraft, setSavedDraft] = useState<BuilderDraft>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [addingPostId, setAddingPostId] = useState<string | null>(null)
  const [badgePickerOpen, setBadgePickerOpen] = useState(false)

  const isDirty = useMemo(() => !isSameDraft(draft, savedDraft), [draft, savedDraft])
  useUnsavedChangesGuard(isDirty)

  // ── mutator ที่ LibraryPanel/CanvasFrame เรียกเข้ามา — setDraft ล้วน ไม่ยิง network (NFR §6 SRS) ──

  const onAddBadgeBlock = useCallback((badges: BuilderDraftBadge[]) => {
    setDraft((d) => {
      const existingIdx = d.blocks.findIndex((b) => b.type === 'BADGE_HIGHLIGHT')
      const key = existingIdx >= 0 ? d.blocks[existingIdx].key : newClientKey('badge')
      const nextBlock: BuilderDraftBadgeBlock = { key, type: 'BADGE_HIGHLIGHT', badges }
      const blocks =
        existingIdx >= 0 ? d.blocks.map((b, i) => (i === existingIdx ? nextBlock : b)) : [...d.blocks, nextBlock]
      return { ...d, blocks }
    })
  }, [])

  const onAddFacebookPostBlock = useCallback((post: BuilderDraftPost) => {
    setDraft((d) => {
      // กันเพิ่มซ้ำที่ state ด้วย (UI ซ่อนปุ่มบวก/ปิดลากไปแล้วเมื่อ "เพิ่มแล้ว" — นี่คือ safety net ชั้นสอง)
      if (d.blocks.some((b) => b.type === 'FACEBOOK_POST' && b.post.id === post.id)) return d
      const block: BuilderDraftFacebookPostBlock = { key: newClientKey('fb'), type: 'FACEBOOK_POST', post }
      return { ...d, blocks: [...d.blocks, block] }
    })
  }, [])

  const onReorderTabs = useCallback((next: ProfileTabKey[]) => {
    setDraft((d) => ({ ...d, tabOrder: next }))
  }, [])

  const onReorderBlocks = useCallback((next: BuilderDraftBlock[]) => {
    setDraft((d) => ({ ...d, blocks: next }))
  }, [])

  const onRemoveBlock = useCallback((key: string) => {
    setDraft((d) => ({ ...d, blocks: d.blocks.filter((b) => b.key !== key) }))
  }, [])

  const mirrorFacebookPost = useCallback(
    async (facebookPostId: string): Promise<{ mirrored: boolean; imageUrl: string | null }> => {
      try {
        const res = await fetch('/api/shops/current/page-builder/facebook-posts/mirror', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facebookPostId }),
        })
        if (!res.ok) return { mirrored: false, imageUrl: null }
        const body = (await res.json()) as { mirrored: boolean; imageUrl: string | null }
        return body
      } catch {
        // TFR-006/TD-004 — mirror ล้มไม่ block การเพิ่มบล็อก, ไม่มี imageUrl ก็ไปต่อได้ (ใช้ thumbnail
        // ดิบ/placeholder แทน) console.error เพื่อร่องรอย debug (NFR observability)
        console.error('[builder] mirrorFacebookPost network error', { facebookPostId })
        return { mirrored: false, imageUrl: null }
      }
    },
    [],
  )

  // ── เพิ่มโพสต์ Facebook — จุดเดียวที่ทั้งปุ่มบวก (คลิก) และลากวางจากคลังเรียกเข้ามา ──────────────
  const handleAddPost = useCallback(
    async (postId: string) => {
      if (addingPostId) return
      const post = initialLibrary.facebookPosts.find((p) => p.id === postId)
      if (!post) return
      if (draft.blocks.some((b) => b.type === 'FACEBOOK_POST' && b.post.id === postId)) return
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
    },
    [addingPostId, draft.blocks, initialLibrary.facebookPosts, mirrorFacebookPost, onAddFacebookPostBlock],
  )

  // ── ลาก — DragDropContext เดียวครอบทั้งคลัง(ซ้าย)กับ canvas(กลาง) ที่ BuilderClient เพราะต้องเป็น
  // ancestor ร่วม (@hello-pangea/dnd ข้าม Droppable กันได้เฉพาะใน DragDropContext เดียวกัน) —
  // Base: theme/paces/Admin/TS/src/app/(admin)/apps/crm/pipeline/components/Board.tsx ─────────────
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, draggableId } = result
      if (!destination) return // ปล่อยนอกพื้นที่วาง — คืนที่เดิมเอง ไม่ทำอะไร

      // ลากสลับลำดับบล็อกภายใน canvas เอง
      if (source.droppableId === 'canvas-blocks' && destination.droppableId === 'canvas-blocks') {
        if (destination.index === source.index) return
        setDraft((d) => ({ ...d, blocks: moveToIndex(d.blocks, source.index, destination.index) }))
        return
      }

      // ลากจากคลัง (ซ้าย) มาวางใน canvas (กลาง) เท่านั้น — ปล่อยที่อื่น (กลับเข้าคลัง/นอกพื้นที่) ไม่ทำอะไร
      if (destination.droppableId !== 'canvas-blocks') return

      if (draggableId === 'library-badge') {
        // เดียวกับคลิกปุ่มบวก/"แก้ไข" — เปิดโมดัลให้เลือกเหรียญเสมอ ไม่ auto-pick (Task 8 ตัดสินไว้แล้ว)
        setBadgePickerOpen(true)
        return
      }
      if (draggableId.startsWith('library-fbpost-')) {
        void handleAddPost(draggableId.slice('library-fbpost-'.length))
      }
    },
    [handleAddPost],
  )

  // ── บันทึก/ยกเลิก ──────────────────────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (saving) return
      setSaving(true)
      try {
        const res = await fetch('/api/shops/current/page-builder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draftToSaveInput(draft)),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
          // บันทึกล้ม — คง draft ไว้เดิม ไม่ล้างค่า ผู้ใช้กดบันทึกซ้ำได้ (Task 7 §4)
          pacesToast.error(body?.error?.message ?? 'บันทึกผังหน้าร้านไม่สำเร็จ กรุณาลองใหม่')
          return
        }
        const saved = (await res.json()) as SavedShopPageLayout
        const reconciled = reconcileSavedLayout(saved, draft)
        setDraft(reconciled)
        setSavedDraft(reconciled)
        pacesToast.success('บันทึกผังหน้าร้านแล้ว')
      } catch {
        pacesToast.error('บันทึกผังหน้าร้านไม่สำเร็จ กรุณาลองใหม่')
      } finally {
        setSaving(false)
      }
    },
    [draft, saving],
  )

  const handleDiscard = useCallback(async () => {
    const confirmed = await pacesConfirm.warning(
      'ยกเลิกการเปลี่ยนแปลง?',
      'ค่าที่แก้ไว้จะหายไปทั้งหมด กลับไปเป็นเวอร์ชันที่บันทึกล่าสุด',
      { confirmButtonText: 'ยกเลิกการแก้ไข' },
    )
    if (!confirmed) return
    setDraft(savedDraft)
  }, [savedDraft])

  return (
    <>
      {/* มือถือ/แท็บเล็ต (<xl) — ไม่ใช่ 3 คอลัมน์บีบจนพัง (TD-007) — ข้อความอธิบาย + ทางออก */}
      <div className="xl:hidden">
        <div className="bg-info/15 text-info-ink flex items-start gap-2.5 rounded-lg p-4 text-sm" role="alert">
          <div>
            <div className="font-medium">ตัวจัดหน้าร้าน ใช้บนคอมพิวเตอร์</div>
            <p className="mt-1">
              การสลับลำดับและเลือกเนื้อหาที่จะโชว์บนหน้าร้าน ต้องใช้พื้นที่จอกว้าง — เปิดหน้านี้บนคอมพิวเตอร์เมื่อสะดวก
              การตั้งค่าอื่น (ลิงก์ร้าน คัดลอก เปิด-ปิดการเผยแพร่) ใช้บนมือถือได้ตามปกติที่หน้าตั้งค่าหน้าร้าน
            </p>
            <a href="/public-profile" className="btn bg-primary text-white hover:bg-primary-hover mt-3 inline-flex min-h-11 items-center gap-1.5">
              กลับไปตั้งค่าหน้าร้าน
            </a>
          </div>
        </div>
      </div>

      {/* เดสก์ท็อป (>=xl) — workspace 2 คอลัมน์ (คลัง + canvas) เต็มรูป */}
      <form
        id={BUILDER_FORM_ID}
        onSubmit={handleSave}
        className="hidden xl:flex xl:h-[calc(100dvh-4rem)] xl:flex-col xl:overflow-hidden" /* HR7 carve-out: หัก padding บน+ล่างของ (fullscreen)/layout.tsx (2rem+2rem) เท่านั้น ดู comment หัวไฟล์ */
      >
        <BuilderToolbar
          handlePrefix={handlePrefix}
          handle={handle}
          publicUrl={publicUrl}
          initialIsPublished={initialIsPublished}
          saveFormId={BUILDER_FORM_ID}
          saving={saving}
          isDirty={isDirty}
          onDiscard={handleDiscard}
        />

        <div className="flex min-h-0 flex-1 items-stretch gap-3 p-3">
          <DragDropContext onDragEnd={handleDragEnd}>
            <LibraryPanel
              initialLibrary={initialLibrary}
              visibleTabKeys={visibleTabKeys}
              draft={draft}
              addingPostId={addingPostId}
              onAddPostClick={handleAddPost}
              badgePickerOpen={badgePickerOpen}
              onOpenBadgePicker={() => setBadgePickerOpen(true)}
              onCloseBadgePicker={() => setBadgePickerOpen(false)}
              onAddBadgeBlock={onAddBadgeBlock}
              onReorderTabs={onReorderTabs}
            />
            <CanvasFrame
              draft={draft}
              header={header}
              onReorderBlocks={onReorderBlocks}
              onReorderTabs={onReorderTabs}
              onRemoveBlock={onRemoveBlock}
            />
          </DragDropContext>
        </div>
      </form>
    </>
  )
}
