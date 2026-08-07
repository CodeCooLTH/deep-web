/**
 * ตัวจัดหน้าร้าน (feature 00035, Task 7) — pure helper แปลงระหว่าง 3 รูปแบบของ "ผัง":
 *   1) ShopPageBlockView (จาก service — ใช้ตอน SSR initial state ที่ BuilderPage)
 *   2) BuilderDraft (client working state ที่ BuilderClient ถือ — มี field hydrate เต็ม)
 *   3) payload ที่ยิงจริง — SaveShopPageLayoutInput (ไป PUT API, id ล้วน) /
 *      DEEP_BUILDER_DRAFT_STATE payload (ไป Canvas ผ่าน postMessage, shape ล็อกตาม SDS §4.1)
 *
 * แยกออกจาก BuilderClient.tsx เพื่อให้อ่าน/ทดสอบง่าย — pure function ล้วน ไม่มี 'use client'
 */
import { PROFILE_TAB_KEYS, type ProfileTabKey } from '@/lib/profile-tab-keys'
import type {
  SavedShopPageLayout,
  SaveShopPageLayoutInput,
  ShopPageBlockView,
} from '@/services/shop-page-layout.service'

import type {
  BuilderDraft,
  BuilderDraftBadge,
  BuilderDraftBadgeBlock,
  BuilderDraftBlock,
  BuilderDraftFacebookPostBlock,
  DeepBuilderDraftStateMessage,
} from '../types'

/**
 * สลับตำแหน่ง 1 ช่องในอาเรย์ — ใช้ร่วมกันทั้งปุ่มลูกศรขึ้น/ลงใน LibraryPanel (keyboard alternative
 * บังคับตาม NFR Accessibility, SRS §6) และ Task 8 จะเรียกใช้ตัวเดียวกันสำหรับ drag-reorder ใน
 * CanvasFrame กัน logic สลับตำแหน่งเดินคนละทางระหว่างสองจุด
 */
export function moveArrayItem<T>(arr: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= arr.length) return [...arr]
  const next = [...arr]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** SSR initial blocks (ShopPageBlockView จาก service) → draft block (key = ShopPageBlock.id จริง) */
export function blockViewToDraftBlock(block: ShopPageBlockView): BuilderDraftBlock {
  if (block.type === 'BADGE_HIGHLIGHT') {
    return { key: block.id, type: 'BADGE_HIGHLIGHT', badges: block.badges }
  }
  return { key: block.id, type: 'FACEBOOK_POST', post: block.post }
}

/** draft ปัจจุบัน → body ที่ยิง PUT .../page-builder (API.md §4.3) — ตัด field hydrate ทิ้งเหลือแค่ id */
export function draftToSaveInput(draft: BuilderDraft): SaveShopPageLayoutInput {
  return {
    tabOrder: draft.tabOrder,
    blocks: draft.blocks.map((b) =>
      b.type === 'BADGE_HIGHLIGHT'
        ? { type: 'BADGE_HIGHLIGHT' as const, badgeIds: b.badges.map((x) => x.id) }
        : { type: 'FACEBOOK_POST' as const, facebookPostId: b.post.id },
    ),
  }
}

/**
 * draft ปัจจุบัน → payload ของ DEEP_BUILDER_DRAFT_STATE (SDS §4.1 — ห้ามแก้ shape)
 * `icon` ของเหรียญเป็น `string` เสมอในสัญญา postMessage (ต่างจาก BuilderDraftBadge.icon ที่เป็น
 * string|null) — แทน null ด้วย '' ที่จุดแปลงนี้จุดเดียว
 */
export function draftToMessagePayload(draft: BuilderDraft): DeepBuilderDraftStateMessage['payload'] {
  return {
    tabOrder: draft.tabOrder,
    blocks: draft.blocks.map((b) =>
      b.type === 'BADGE_HIGHLIGHT'
        ? {
            key: b.key,
            type: 'BADGE_HIGHLIGHT' as const,
            badges: b.badges.map((x) => ({ id: x.id, name: x.name, icon: x.icon ?? '' })),
          }
        : {
            key: b.key,
            type: 'FACEBOOK_POST' as const,
            post: {
              id: b.post.id,
              message: b.post.message,
              imageUrl: b.post.imageUrl,
              mediaType: b.post.mediaType,
              reactionCount: b.post.reactionCount,
              fbCommentCount: b.post.fbCommentCount,
              shareCount: b.post.shareCount,
            },
          },
    ),
  }
}

/**
 * เทียบ draft สองชุดว่า "เหมือนกันพอจะไม่ dirty" ไหม — เทียบเฉพาะ payload ที่จะบันทึกจริง
 * (ไม่เทียบ `key` ที่เป็น client-only id เพราะ key เปลี่ยนได้เองหลัง reconcile โดยไม่ถือเป็นการแก้ไข)
 */
export function isSameDraft(a: BuilderDraft, b: BuilderDraft): boolean {
  return JSON.stringify(draftToSaveInput(a)) === JSON.stringify(draftToSaveInput(b))
}

/**
 * หลังบันทึกสำเร็จ — server คืนแค่ id ดิบ (SavedShopPageLayout, TFR-007 ข้อ 6 "query กลับจาก DB
 * จริง ไม่ echo request ดิบ") ไม่ใช่ข้อมูล hydrate เต็ม (ชื่อเหรียญ/รูปโพสต์ ฯลฯ) — ประกอบกลับจาก
 * `prior` (draft ก่อนกดบันทึก ซึ่งมีข้อมูล hydrate ครบอยู่แล้วเพราะเพิ่งผ่าน library panel มา)
 * ไม่ query รายละเอียดซ้ำ — ยกเว้นกรณี race ที่คนอื่นแก้ badge/post ต้นทางระหว่างนั้นพอดี (ไม่ครอบ
 * เคสนี้ในเฟสนี้ — ผู้ใช้คนเดียวกำลัง save งานของตัวเอง ผลกระทบคือ label ค้างชั่วคราวจนโหลดหน้าใหม่)
 */
export function reconcileSavedLayout(saved: SavedShopPageLayout, prior: BuilderDraft): BuilderDraft {
  const priorBadgeBlock = prior.blocks.find((b): b is BuilderDraftBadgeBlock => b.type === 'BADGE_HIGHLIGHT')
  const priorBadgeById = new Map<string, BuilderDraftBadge>(
    (priorBadgeBlock?.badges ?? []).map((x) => [x.id, x] as const),
  )
  const priorPostById = new Map(
    prior.blocks
      .filter((b): b is BuilderDraftFacebookPostBlock => b.type === 'FACEBOOK_POST')
      .map((b) => [b.post.id, b.post] as const),
  )

  const blocks: BuilderDraftBlock[] = saved.blocks.map((b) => {
    if (b.type === 'BADGE_HIGHLIGHT') {
      return {
        key: b.id,
        type: 'BADGE_HIGHLIGHT',
        badges: b.badgeIds.map((id) => priorBadgeById.get(id)).filter((x): x is BuilderDraftBadge => x != null),
      }
    }
    return {
      key: b.id,
      type: 'FACEBOOK_POST',
      post: priorPostById.get(b.facebookPostId) ?? {
        id: b.facebookPostId,
        message: null,
        imageUrl: null,
        mediaType: null,
        reactionCount: null,
        fbCommentCount: null,
        shareCount: null,
        permalink: null,
      },
    }
  })

  // defense-in-depth — server (Valibot) กรองคีย์แปลกปลอมทิ้งมาก่อนแล้ว แต่ client ไม่ควรเชื่อ response
  // 100% เผื่อ contract เพี้ยนในอนาคต (มิเรอร์ความระวังเดียวกับ applyTabOrder ฝั่งอ่าน)
  const knownKeys = new Set<string>(PROFILE_TAB_KEYS)
  const tabOrder = saved.tabOrder.filter((k): k is ProfileTabKey => knownKeys.has(k))

  return { tabOrder, blocks }
}
