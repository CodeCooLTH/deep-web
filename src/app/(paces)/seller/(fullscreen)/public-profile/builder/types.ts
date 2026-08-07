/**
 * ตัวจัดหน้าร้าน (feature 00035, Task 7) — shared types ระหว่าง BuilderPage/BuilderClient/
 * BuilderToolbar/DraftDirtyBar/LibraryPanel/CanvasFrame/PreviewPanel — Task 8/9 import จากไฟล์นี้
 *
 * แบ่งเป็น 2 กลุ่ม:
 *   1) postMessage contract (Host <-> Canvas) — ล็อกแล้วโดย Controller (SDS §4.1, SRS TFR-008)
 *      ฝั่ง Canvas (BuilderPreviewBridge.tsx) implement ตามนี้ไปแล้ว — ห้ามแก้ shape เด็ดขาด
 *   2) Draft state ฝั่ง client (BuilderClient ถือ, ไม่มีตาราง DB — DATABASE §6) + prop contract
 *      ของ 3 คอลัมน์ (LibraryPanel/CanvasFrame/PreviewPanel)
 */
import type { ProfileTabKey } from '@/lib/profile-tab-keys'
import type { BuilderLibrary } from '@/services/shop-page-layout.service'

// ── FORM_ID กลาง — FullscreenPageHeader Save button + DraftDirtyBar บันทึก ต้องชี้ id เดียวกัน ──
export const BUILDER_FORM_ID = 'shop-page-builder-form'

// ── 1) postMessage contract — ล็อกแล้ว ห้ามแก้ shape (SDS §4.1) ─────────────────────────────

export type DeepBuilderBadgeRef = { id: string; name: string; icon: string }

export type DeepBuilderPostRef = {
  id: string
  message: string | null
  imageUrl: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
}

export type DeepBuilderDraftBlockPayload =
  | { key: string; type: 'BADGE_HIGHLIGHT'; badges: DeepBuilderBadgeRef[] }
  | { key: string; type: 'FACEBOOK_POST'; post: DeepBuilderPostRef }

export type DeepBuilderDraftStateMessage = {
  type: 'DEEP_BUILDER_DRAFT_STATE'
  payload: { tabOrder: string[]; blocks: DeepBuilderDraftBlockPayload[] }
}

export type DeepBuilderBlockRect = { key: string; top: number; left: number; width: number; height: number }

export type DeepBuilderBlockRectsMessage = {
  type: 'DEEP_BUILDER_BLOCK_RECTS'
  payload: { blocks: DeepBuilderBlockRect[]; scrollTop: number; scrollHeight: number }
}

export type DeepBuilderMessage = DeepBuilderDraftStateMessage | DeepBuilderBlockRectsMessage

// ── 2) Draft state (client-only — ไม่มีตาราง DB, DATABASE §6) ────────────────────────────────

/** เหรียญ 1 ใบภายในบล็อก BADGE_HIGHLIGHT — เก็บ field เต็ม (render ใน library/canvas/preview);
 *  ตอนส่งเข้า postMessage/PUT API จะถูก map ให้เหลือเท่าที่ contract ต้องการเท่านั้น (lib/draft.ts) */
export type BuilderDraftBadge = {
  /** UserBadge.id — ไม่ใช่ Badge.id (DATABASE §3.2) */
  id: string
  badgeId: string
  name: string
  nameEN: string
  icon: string | null
  imageUrl: string | null
}

export type BuilderDraftPost = {
  /** FacebookPost.id */
  id: string
  message: string | null
  /** resolve แล้ว: mirroredFileId ? getFileUrl(...) : thumbnailUrl (TFR-006) */
  imageUrl: string | null
  mediaType: string | null
  reactionCount: number | null
  fbCommentCount: number | null
  shareCount: number | null
  permalink: string | null
}

export type BuilderDraftBadgeBlock = {
  /**
   * ตัวระบุที่คงที่ตลอดอายุ draft — ใช้เป็น React key, drag-reorder id, และ postMessage `key`
   * ก่อนบันทึกครั้งแรก = client-generated (crypto.randomUUID()); หลังบันทึกสำเร็จ = ShopPageBlock.id
   * จริงจาก DB (reconcileSavedLayout ใน lib/draft.ts สลับให้)
   */
  key: string
  type: 'BADGE_HIGHLIGHT'
  /** ≤4 (API.md §4.3 v.maxLength(4)) — มีบล็อกนี้ได้สูงสุด 1 บล็อกต่อหน้า (TOO_MANY_BADGE_BLOCKS) */
  badges: BuilderDraftBadge[]
}

export type BuilderDraftFacebookPostBlock = {
  key: string
  type: 'FACEBOOK_POST'
  post: BuilderDraftPost
}

export type BuilderDraftBlock = BuilderDraftBadgeBlock | BuilderDraftFacebookPostBlock

/**
 * draft ทั้งชุดที่ BuilderClient ถือ — **ไม่รวม `isPublished`** โดยตั้งใจ
 * (TFR-009/SDS §3: publish toggle เป็น atomic operation แยก lifecycle จาก draft/Save เพื่อกัน
 * session ที่เปิด builder ค้างไว้นานกด "บันทึก" ทับค่า isPublished เก่าที่ค้างอยู่ในมือ —
 * BuilderToolbar ถือ isPublished ของตัวเอง ไม่ผ่าน BuilderClient เลย)
 */
export type BuilderDraft = {
  /**
   * ลำดับแท็บปัจจุบัน — เป็น "visible tab keys ที่เรียงแล้ว" เสมอ (ผ่าน applyTabOrder() มาแล้ว
   * ตั้งแต่ตอน initial SSR) ความยาวคงที่เท่ากับจำนวนแท็บที่ร้านนี้มีข้อมูลจริง — แท็บปิดไม่ได้ (D-9)
   * ไม่มีทางสั้นลงจากการ reorder เพียงอย่างเดียว (invariant เดียวกับ applyTabOrder)
   */
  tabOrder: ProfileTabKey[]
  blocks: BuilderDraftBlock[]
}

// ── 3) prop contract ของ 3 คอลัมน์ — Task 8/9 implement ให้ตรงเป๊ะ ───────────────────────────

export type LibraryPanelProps = {
  /** ผลลัพธ์ GET .../library หน้าแรก (SSR ที่ BuilderPage) — โหลดเพิ่ม/ค้นหาต่อผ่าน client fetch เอง
   *  (endpoint ไม่รู้จัก draft — "เพิ่มแล้ว" คำนวณจาก draft.blocks เทียบกับชุดนี้ฝั่ง client, API.md §4.1) */
  initialLibrary: BuilderLibrary
  /** แท็บทั้งหมดที่ร้านนี้มีข้อมูลจริง เรียงตามลำดับ default ของระบบ (PROFILE_TAB_KEYS filtered) —
   *  ใช้เทียบว่ามีแท็บอะไรบ้างที่ "จัดได้" ไม่ใช่ลำดับปัจจุบัน (ดู draft.tabOrder สำหรับลำดับจริง) */
  visibleTabKeys: ProfileTabKey[]
  /** draft ปัจจุบัน — คำนวณ "เพิ่มแล้ว" (badge block/facebookPostId ที่อยู่ใน blocks แล้ว) + เลขลำดับแท็บ */
  draft: BuilderDraft
  /** ผู้ขายกดปุ่มบวกที่ "เหรียญตราเด่น" — เพิ่ม/แทนที่บล็อก BADGE_HIGHLIGHT เดียว (มีได้บล็อกเดียว) */
  onAddBadgeBlock: (badges: BuilderDraftBadge[]) => void
  /** ผู้ขายกดปุ่มบวกที่โพสต์ — เรียก mirrorFacebookPost() ให้เสร็จก่อนเสมอแล้วค่อยเรียกนี้ (TFR-006) */
  onAddFacebookPostBlock: (post: BuilderDraftPost) => void
  /** ลาก/ปุ่มลูกศรขึ้นลง สลับลำดับแถวแท็บ — ปุ่มลูกศรเป็น keyboard alternative บังคับ (NFR Accessibility) */
  onReorderTabs: (next: ProfileTabKey[]) => void
  /** mirror รูปโพสต์ก่อนเพิ่ม (TFR-006) — คืน imageUrl ที่ resolve แล้วเสมอ ไม่ throw (fail-open, TD-004) */
  mirrorFacebookPost: (facebookPostId: string) => Promise<{ mirrored: boolean; imageUrl: string | null }>
}

export type CanvasFrameProps = {
  /** absolute URL ข้าม subdomain ของ /u/{username} หรือ /b/{slug} พร้อม ?builderDraft=1 (TFR-008) */
  src: string
  draft: BuilderDraft
  /** ลากสลับลำดับบล็อกเหนือแถบแท็บ ภายใน canvas overlay (SDS §4.2 — host-DOM ล้วน ไม่แตะ iframe จนกว่าจะปล่อยมือ) */
  onReorderBlocks: (next: BuilderDraftBlock[]) => void
  /** ลากสลับลำดับแท็บจากแถบแท็บใน canvas เอง — sync ทิศทางเดียวกับ library panel */
  onReorderTabs: (next: ProfileTabKey[]) => void
  /** กด "นำออก" ใน ⋮ overflow menu ของบล็อกเหนือแถบแท็บ — caller (CanvasFrame) เรียก pacesConfirm.danger เองก่อน */
  onRemoveBlock: (key: string) => void
}

export type PreviewPanelHeaderData = {
  shopName: string
  /** username (PERSONAL) หรือ slug (BUSINESS) — ใช้แสดง @handle เฉย ๆ ไม่ใช่ URL เต็ม */
  username: string
  avatarUrl: string | null
  isVerified: boolean
  completedOrders: number | null
  completionRate: number | null
  avgRating: number | null
}

export type PreviewPanelProps = {
  header: PreviewPanelHeaderData
  draft: BuilderDraft
}

// ── label/icon ไทยของแต่ละ tab key ────────────────────────────────────────────────────────
//
// Base (SSOT ที่ต้อง sync ด้วยมือ): src/views/pages/user-profile/v2/ShopProfile.tsx (tabContent
// labels) + ProfileTabs.tsx (TAB_ICON) — ไม่ import ตรงเพราะไฟล์นั้นอยู่ใต้
// src/views/pages/user-profile/** (ปิดแก้ไขรอบนี้ตาม dispatch) และ label ตรงนั้นมีตัวแปรผสม
// (เช่น "รีวิว {avgRating}") — ที่นี่เก็บเฉพาะ label คงที่สำหรับใช้ใน Paces builder UI เท่านั้น
export const PROFILE_TAB_LABEL_TH: Record<ProfileTabKey, string> = {
  pinned: 'ปักหมุด',
  rooms: 'ห้องพัก',
  calendar: 'ปฏิทิน',
  services: 'บริการ',
  items: 'สินค้า',
  about: 'เกี่ยวกับร้าน',
  reviews: 'รีวิว',
}

export const PROFILE_TAB_ICON: Record<ProfileTabKey, string> = {
  pinned: 'player-play',
  items: 'package',
  rooms: 'bed',
  calendar: 'calendar',
  services: 'armchair',
  about: 'info-circle',
  reviews: 'star',
}
