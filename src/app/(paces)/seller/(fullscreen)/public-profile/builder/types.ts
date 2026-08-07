/**
 * ตัวจัดหน้าร้าน (feature 00035, Task 7) — shared types ระหว่าง BuilderPage/BuilderClient/
 * BuilderToolbar/DraftDirtyBar/LibraryPanel/CanvasFrame
 *
 * รื้อ canvas จาก iframe เป็น Paces-native (2026-08-07, user เคาะ) — postMessage contract เดิม
 * (DEEP_BUILDER_DRAFT_STATE / DEEP_BUILDER_BLOCK_RECTS) ถูกถอดทิ้งทั้งชุด ไม่มีผู้ใช้แล้ว
 * (BuilderPreviewBridge.tsx ที่เคยรับฝั่ง Canvas ถูกลบไปแล้วเช่นกัน — ดูรายงาน Task นี้)
 *
 * รอบสอง (2026-08-07, "canvas ต้องตรงกับหน้าจริง") — ลบคอลัมน์ "พรีวิว" (PreviewPanel.tsx) ทิ้ง
 * เพราะซ้ำกับ canvas ~90% หลัง canvas เป็น Paces-native แล้ว (critique จับได้ว่าเทาเปล่า 67%)
 * `PreviewPanelHeaderData` → เปลี่ยนชื่อเป็น `BuilderHeaderData` (ไม่ใช่ของ "พรีวิว" อีกต่อไป — เป็น
 * ข้อมูลหัวโปรไฟล์ที่ CanvasFrame ใช้วาด) และขยาย field ให้ครบตามที่หน้าร้านจริงมี (ดูรายงาน task นี้)
 */
import type { ProfileTabKey } from '@/lib/profile-tab-keys'
import type { BuilderLibrary } from '@/services/shop-page-layout.service'

// ── FORM_ID กลาง — FullscreenPageHeader Save button + DraftDirtyBar บันทึก ต้องชี้ id เดียวกัน ──
export const BUILDER_FORM_ID = 'shop-page-builder-form'

// ── Draft state (client-only — ไม่มีตาราง DB, DATABASE §6) ────────────────────────────────────

/** เหรียญ 1 ใบภายในบล็อก BADGE_HIGHLIGHT — เก็บ field เต็ม (render ใน library/canvas) */
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
   * ตัวระบุที่คงที่ตลอดอายุ draft — ใช้เป็น React key + drag-reorder id (@hello-pangea/dnd draggableId)
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

// ── prop contract ของ 3 คอลัมน์ ────────────────────────────────────────────────────────────

export type LibraryPanelProps = {
  /** ผลลัพธ์ GET .../library หน้าแรก (SSR ที่ BuilderPage) — โหลดเพิ่ม/ค้นหาต่อผ่าน client fetch เอง
   *  (endpoint ไม่รู้จัก draft — "เพิ่มแล้ว" คำนวณจาก draft.blocks เทียบกับชุดนี้ฝั่ง client, API.md §4.1) */
  initialLibrary: BuilderLibrary
  /** แท็บทั้งหมดที่ร้านนี้มีข้อมูลจริง เรียงตามลำดับ default ของระบบ (PROFILE_TAB_KEYS filtered) —
   *  ใช้เทียบว่ามีแท็บอะไรบ้างที่ "จัดได้" ไม่ใช่ลำดับปัจจุบัน (ดู draft.tabOrder สำหรับลำดับจริง) */
  visibleTabKeys: ProfileTabKey[]
  /** draft ปัจจุบัน — คำนวณ "เพิ่มแล้ว" (badge block/facebookPostId ที่อยู่ใน blocks แล้ว) + เลขลำดับแท็บ */
  draft: BuilderDraft
  /** id ของโพสต์ที่กำลัง mirror อยู่ (ยกขึ้นมาไว้ที่ BuilderClient เพราะ drag-drop ต้องเรียก handler
   *  เดียวกับปุ่มบวก — คนละ owner ก็ sync สถานะไม่ตรงกัน) */
  addingPostId: string | null
  /** กดปุ่มบวกที่แถวโพสต์ — BuilderClient เป็นคนเรียก mirrorFacebookPost ให้เสร็จก่อนเสมอ (TFR-006) */
  onAddPostClick: (postId: string) => void
  /** เปิด/ปิดโมดัลเลือกเหรียญ — ยกสถานะขึ้นไปที่ BuilderClient เพราะการลากบล็อกเหรียญจากคลังเข้า canvas
   *  ต้องเปิดโมดัลเดียวกันนี้ได้เหมือนกดปุ่มบวก */
  badgePickerOpen: boolean
  onOpenBadgePicker: () => void
  onCloseBadgePicker: () => void
  /** ยืนยันเลือกเหรียญในโมดัล — เพิ่ม/แทนที่บล็อก BADGE_HIGHLIGHT เดียว (มีได้บล็อกเดียว) */
  onAddBadgeBlock: (badges: BuilderDraftBadge[]) => void
  /** ลาก/ปุ่มลูกศรขึ้นลง สลับลำดับแถวแท็บ — ปุ่มลูกศรเป็น keyboard alternative บังคับ (NFR Accessibility) */
  onReorderTabs: (next: ProfileTabKey[]) => void
}

export type CanvasFrameProps = {
  draft: BuilderDraft
  /** ข้อมูลหัวโปรไฟล์ตรึงบนสุด (ตรึงตายตัว — ไม่มีที่จับลาก ไม่มีปุ่มลบ) */
  header: BuilderHeaderData
  /** ลากสลับลำดับบล็อกเหนือแถบแท็บ ภายใน canvas เอง หรือลากจากคลัง (ซ้าย) มาวางที่นี่ — จัดการที่
   *  BuilderClient (DragDropContext ต้องเป็น ancestor ร่วมของ LibraryPanel กับ CanvasFrame) */
  onReorderBlocks: (next: BuilderDraftBlock[]) => void
  /** ลากสลับลำดับแท็บจากแถบแท็บใน canvas เอง — sync ทิศทางเดียวกับ library panel */
  onReorderTabs: (next: ProfileTabKey[]) => void
  /** กด "นำออก" ใน ⋮ overflow menu ของบล็อกเหนือแถบแท็บ — caller (CanvasFrame) เรียก pacesConfirm.danger เองก่อน */
  onRemoveBlock: (key: string) => void
}

/**
 * ข้อมูลหัวโปรไฟล์ที่ canvas ต้องวาด — ครบตามที่ ProfileHero.tsx (หน้าร้านจริง /u,/b) แสดงจริง
 * (2026-08-07 รอบสอง: canvas เดิมขาดหลายฟิลด์ — user เทียบภาพหน้าจอแล้วทักว่าไม่ตรงกัน)
 *
 * ไม่ import `ProfileHeroData` จาก ProfileHero.tsx ตรง ๆ (แม้ field เกือบเหมือนกัน) เพราะไฟล์นั้น
 * เป็น 'use client' ที่พึ่ง MUI + `--mui-palette-*` (Vuexy token) — canvas วาดด้วย Paces primitive
 * คนละชุด token กัน (HR1: ห้าม import component/value จากธีมอื่นมาใช้ตรง ๆ) รักษา field ให้ตรงกัน
 * ด้วยมือแทน — Base ของ field ชุดนี้ (SSOT ที่ต้อง sync ด้วยมือ): ProfileHero.tsx::ProfileHeroData
 */
export type BuilderHeaderData = {
  shopName: string
  /** username (PERSONAL) หรือ slug (BUSINESS) — ใช้แสดง @handle เฉย ๆ ไม่ใช่ URL เต็ม */
  username: string
  avatarUrl: string | null
  coverImageUrl: string | null
  /** ไล่สีตามระดับความน่าเชื่อถือ (getTierGradient) — ใช้เป็นพื้นหลังปกเมื่อไม่มี coverImageUrl */
  tierGradient: string
  trustScore: number
  tierLabel: string
  isVerified: boolean
  category: string | null
  /** ว่าง = ไม่แสดงส่วนนี้ในบรรทัดรอง (กันกรณี query ล้มเหลว/ไม่มีวันที่) */
  memberSince: string
  /** เหรียญความสำเร็จของร้าน (audience SELLER|ANY) — แถวชิปใต้ชื่อร้าน คนละอันกับบล็อก BADGE_HIGHLIGHT
   *  ที่ผู้ขายเลือกเพิ่มเองเหนือแถบแท็บ (เหรียญแถวนี้ render เสมอเมื่อมี ไม่ต้องจัดผ่าน builder) */
  badges: { id: string; name: string; nameEN: string; icon: string | null }[]
  totalBadgeCount: number
  completedOrders: number | null
  customerCount: number | null
  repeatCustomerCount: number | null
  completionRate: number | null
  isLodging: boolean
  isServiceQueue: boolean
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
