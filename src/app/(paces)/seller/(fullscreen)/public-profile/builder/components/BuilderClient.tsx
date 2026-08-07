'use client'

/**
 * BuilderClient — orchestrator ของตัวจัดหน้าร้าน (feature 00035, Task 7)
 *
 * ถือ draft state ทั้งหมด (useState<BuilderDraft>) — ไม่มีตาราง DB (DATABASE §6) บันทึกล้มต้อง
 * คง draft ไว้เสมอ ไม่ล้างค่า (Task 7 §4) — ผู้ใช้กดบันทึกซ้ำได้ทันที
 *
 * desktop-only gate (SDS TD-007): CSS-only `hidden xl:flex` / `xl:hidden` สลับข้อความอธิบาย
 * กับ workspace 3 คอลัมน์จริง — ไม่ใช้ JS `window.innerWidth` (กัน hydration flash)
 *
 * Base: docs/superpowers/specs/2026-08-07-00035-builder-mockup-paces.html
 *   หัวข้อ "1 · จอหลัก (Desktop 1440)" (โครง toolbar/dirty-bar/3-column) และหัวข้อ
 *   "2 · มือถือ — สิ่งที่เห็นแทน" การ์ด "เหตุผลที่ตัด" (ข้อความ desktop-only + ทางออก)
 *
 * ความสูงของ workspace: HR7 carve-out — คำนวณจาก viewport เพราะ (fullscreen)/layout.tsx ไม่ได้ตั้ง
 * ความสูงคงที่ให้ children (main เป็น overflow-y-auto เนื้อหาปกติสูงตามเนื้อหา) พื้นที่ 3 คอลัมน์
 * ต้องมีความสูงที่แน่นอนถึงจะ scroll ภายในแต่ละคอลัมน์ได้ตาม mockup (ไม่ใช่ scroll ทั้งหน้า) —
 * ค่าประมาณนี้ (header + dirty-bar + padding เดิมของ (fullscreen)/layout.tsx) ต้องปรับจริงตอน
 * browser QA (ไม่ใช่หน้าที่ developer ตาม CLAUDE.md — ระบุไว้เป็น known-gap ในรายงาน)
 */
import { useCallback, useMemo, useState, type FormEvent } from 'react'

import { pacesConfirm } from '@/lib/paces-swal'
import { pacesToast } from '@/lib/paces-toast'
import type { ProfileTabKey } from '@/lib/profile-tab-keys'
import type { BuilderLibrary, SavedShopPageLayout } from '@/services/shop-page-layout.service'

import BuilderToolbar from './BuilderToolbar'
import CanvasFrame from './CanvasFrame'
import DraftDirtyBar from './DraftDirtyBar'
import LibraryPanel from './LibraryPanel'
import PreviewPanel from './PreviewPanel'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { draftToSaveInput, isSameDraft, reconcileSavedLayout } from '../lib/draft'
import {
  BUILDER_FORM_ID,
  type BuilderDraft,
  type BuilderDraftBadge,
  type BuilderDraftBadgeBlock,
  type BuilderDraftBlock,
  type BuilderDraftFacebookPostBlock,
  type BuilderDraftPost,
  type PreviewPanelHeaderData,
} from '../types'

export type BuilderClientProps = {
  publicUrl: string
  /** "deepthailand.app/u/" หรือ "deepthailand.app/b/" */
  handlePrefix: string
  handle: string
  /** absolute URL ข้าม subdomain ของ canvas iframe พร้อม ?builderDraft=1 */
  canvasSrc: string
  initialDraft: BuilderDraft
  initialIsPublished: boolean
  visibleTabKeys: ProfileTabKey[]
  initialLibrary: BuilderLibrary
  header: PreviewPanelHeaderData
}

function newClientKey(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`
}

export default function BuilderClient({
  publicUrl,
  handlePrefix,
  handle,
  canvasSrc,
  initialDraft,
  initialIsPublished,
  visibleTabKeys,
  initialLibrary,
  header,
}: BuilderClientProps) {
  const [draft, setDraft] = useState<BuilderDraft>(initialDraft)
  const [savedDraft, setSavedDraft] = useState<BuilderDraft>(initialDraft)
  const [saving, setSaving] = useState(false)

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
      // กันเพิ่มซ้ำที่ state ด้วย (UI ซ่อนปุ่มบวกไปแล้วเมื่อ "เพิ่มแล้ว" — นี่คือ safety net ชั้นสอง)
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

      {/* เดสก์ท็อป (>=xl) — workspace 3 คอลัมน์เต็มรูป */}
      <form
        id={BUILDER_FORM_ID}
        onSubmit={handleSave}
        className="hidden xl:flex xl:h-[calc(100dvh-9rem)] xl:flex-col xl:overflow-hidden" /* HR7 carve-out: ความสูง workspace คำนวณจาก viewport — (fullscreen)/layout.tsx ไม่ตั้งความสูงคงที่ให้ children, ต้องปรับค่าจริงตอน browser QA */
      >
        <BuilderToolbar
          handlePrefix={handlePrefix}
          handle={handle}
          publicUrl={publicUrl}
          initialIsPublished={initialIsPublished}
          saveFormId={BUILDER_FORM_ID}
          saving={saving}
        />

        {isDirty && <DraftDirtyBar formId={BUILDER_FORM_ID} saving={saving} onDiscard={handleDiscard} />}

        <div className="flex min-h-0 flex-1 items-stretch gap-3 p-3">
          <LibraryPanel
            initialLibrary={initialLibrary}
            visibleTabKeys={visibleTabKeys}
            draft={draft}
            onAddBadgeBlock={onAddBadgeBlock}
            onAddFacebookPostBlock={onAddFacebookPostBlock}
            onReorderTabs={onReorderTabs}
            mirrorFacebookPost={mirrorFacebookPost}
          />
          <CanvasFrame
            src={canvasSrc}
            draft={draft}
            onReorderBlocks={onReorderBlocks}
            onReorderTabs={onReorderTabs}
            onRemoveBlock={onRemoveBlock}
          />
          <PreviewPanel header={header} draft={draft} />
        </div>
      </form>
    </>
  )
}
