/**
 * badge-family.ts — allow-list เดียวของ "ตระกูลเหรียญ" (feature 00052 P1-a)
 *
 * ไฟล์นี้เป็น SSOT ของทุกอย่างที่ตอบคำถามว่า *เหรียญใบหนึ่งเป็นเรื่องอะไร*:
 * อยู่ตระกูลไหน · ขั้นเท่าไร · เป็นเหรียญเหตุการณ์หรือเหรียญสถานะ · เป็นของร้านหรือของคน ·
 * ขึ้นหน้าร้านสาธารณะได้ไหม · ร้านประเภทไหนเห็น · เกณฑ์ของแต่ละขั้นคือเท่าไร
 *
 * 🛑 **ไม่มี dependency เลยแม้แต่ตัวเดียว** — ห้าม import `@/lib/prisma`, service, หรือ React
 * เพราะ `BadgeDetailModal.tsx` / `BadgeGrid.tsx` / `BadgeShowcase.tsx` / `BadgePickerModal.tsx`
 * เป็น `'use client'` ทั้งหมด การ import จาก service จะลาก Prisma เข้า client bundle
 * (แบบอย่างและเหตุผลเดียวกับ `src/lib/badge-score-rule.ts` ซึ่งเกิดจาก impeccable critique P0
 *  เมื่อ 2026-08-09 ที่จอสัญญา "เพิ่ม 10%" ขณะที่ของจริงคือ 1 คะแนน)
 *
 * 🛑 **`nature` (ชนิดเหรียญ) อยู่ที่นี่เท่านั้น ไม่มีคอลัมน์คู่ในฐานข้อมูล** — FR-BDG-01 AC
 * ข้อสุดท้ายเขียนไว้ตรงตัวว่าชนิดเหรียญ "อ่านจากนิยามตระกูลชุดเดียวในโค้ด … และไม่ใช่คอลัมน์
 * ใหม่ใน Badge" · งานรายวันเป็น TypeScript จึง import map นี้ได้ตรง ไม่มีคิวรีไหนจำเป็นต้อง
 * กรองด้วยชนิดที่ระดับฐานข้อมูล ⇒ การเพิ่มคอลัมน์จะสร้างผู้เขียนความจริงรายที่สองให้ค่าที่มี
 * SSOT อยู่แล้ว (Hard Rule 16)
 *
 * เอกสาร: `docs/20 - Features/00052 - Badge & Achievement v2/` (SRS TFR-001 · DATABASE §3.1)
 */

// ─── ชนิดข้อมูล ────────────────────────────────────────────────────────────────

/** เหรียญเหตุการณ์ = ได้แล้วเป็นจริงตลอดไป · เหรียญสถานะ = ต้องผ่านเกณฑ์ในหน้าต่างล่าสุดเสมอ */
export type BadgeNature = 'EVENT' | 'STATUS'

/** เจ้าของแถว `UserBadge` ที่ถูกต้องของเหรียญใบนี้ */
export type BadgeOwnerScope = 'SHOP' | 'USER'

/**
 * เหรียญใบนี้ไปโผล่ที่ไหน
 * - `EVIDENCE` — ขึ้นหน้าร้านสาธารณะได้ (ต้องบอกสิ่งที่แถวตัวเลขบนหน้านั้นบอกไม่ได้)
 * - `GOAL` — เห็นเฉพาะเจ้าของร้าน มีไว้ให้ไล่เก็บ
 * - `COMMEMORATIVE` — เหรียญที่ระลึก แสดงได้แต่ไม่นับเป็นหลักฐานและไม่กินโควตา 4 ช่อง
 *
 * 🛑 ค่าที่ระบบไม่รู้จักต้องถูกปฏิบัติเป็น `GOAL` เสมอ (BR-BDG-20) — ดู `resolveSurface()`
 */
export type BadgeSurface = 'EVIDENCE' | 'GOAL' | 'COMMEMORATIVE'

/**
 * หมวดของตระกูล — ใช้เป็นด่านเดียวที่ครอบทั้งหมวดประมูล (FR-BDG-19)
 *
 * 🛑 **ตัวตัดสินคือ field นี้ ไม่ใช่ prefix ของคีย์** — SRS เขียนไว้ว่า "ตัดทุกตระกูลที่ขึ้นต้น
 * ด้วย `AUCTION_`" ซึ่งถูกในเชิงผลลัพธ์ แต่การใช้ชื่อสตริงเป็นกลไกคือของที่พังเงียบ:
 * วันที่มีคนตั้งชื่อตระกูลประมูลใหม่ว่า `BIDDING_STREAK` มันจะหลุดด่านทันทีโดยไม่มีอะไรฟ้อง
 * (คลาสเดียวกับ `deny-list` ที่ถูกเปลี่ยนเป็น allow-list ใน `seller-menu.ts` เมื่อ 00028)
 */
export type BadgeCategory = 'CORE' | 'AUCTION'

/** ประเภทกิจการของร้าน — ยืมรายชื่อจาก `Shop.vertical` (มี CHECK constraint กำกับที่ฐาน) */
export type ShopVertical = 'ONLINE_SALES' | 'SERVICE_QUEUE' | 'LODGING'

export interface FamilyDef {
  category: BadgeCategory
  nature: BadgeNature
  ownerScope: BadgeOwnerScope
  /** ชื่อไทยของตระกูลที่ผู้ใช้เห็น — คำเดียวกันทุกหน้าจอ (Hard Rule 16) */
  labelTH: string
  /**
   * ประเภทร้านที่เห็นตระกูลนี้ — **อาเรย์ว่าง = ทุกประเภทร้าน (ชุดกลาง)**
   *
   * 🛑 เลือกรูปแบบนี้เพราะทำให้ BR-BDG-19 (ค่าประเภทร้านที่ไม่รู้จักต้องได้ชุดกลาง) เกิดขึ้นเอง
   * จากรูปร่างของข้อมูล ไม่ต้องมีบรรทัด fallback ให้ใครเขียนผิด — ร้านที่ `vertical` เพี้ยนจะ
   * match เฉพาะตระกูลที่ `verticals` ว่าง ซึ่งคือชุดกลางเป๊ะ ๆ
   *
   * 🛑 **ห้ามลอก fallback ของ `VERTICAL_VISIBLE_SLUGS` ใน `seller-menu.ts`** — ตัวนั้นเขียนว่า
   * `?? VERTICAL_VISIBLE_SLUGS.ONLINE_SALES` ซึ่งถูกสำหรับเมนู แต่ผิดสำหรับเหรียญ เพราะจะทำให้
   * ร้านข้อมูลเพี้ยนเห็นตระกูล "ส่งไว"/"ตามพัสดุได้ทุกใบ" ที่ไม่มีวันได้
   */
  verticals: ShopVertical[]
  /** ขั้น → กลุ่มการแสดงผล · ขั้นที่ไม่ได้ระบุถือว่าไม่มีอยู่จริง */
  surfaceByTier: Record<number, BadgeSurface>
  /**
   * ขั้น → เกณฑ์ที่ต้องผ่าน · ความหมายของตัวเลขต่างกันตามตระกูล (ดู `thresholdUnit`)
   * 🛑 ตัวเลขทุกตัวห้ามขยับหลังปล่อย (BR-BDG-09) — มีเทส snapshot ผูกไว้
   */
  thresholdByTier: Record<number, number>
  /** หน่วยของ `thresholdByTier` — มีไว้ให้หน้าจอประกอบประโยคได้โดยไม่ต้องเดา */
  thresholdUnit: 'orders' | 'days' | 'cancels' | 'percent' | 'hours' | 'baht' | 'rating' | 'reviewers' | 'count'
  /**
   * ขั้น → ขนาดตัวอย่างขั้นต่ำก่อนระบบจะยอมสรุปผล
   * 🛑 **มีเฉพาะตระกูล `STATUS`** — ต่ำกว่านี้ต้องตอบว่า "ยังสรุปไม่ได้" ห้ามแสดง 0
   * (BR-BDG-15 · `docs/conventions/partial-data-must-be-labeled-or-filled.md`)
   */
  minSampleByTier?: Record<number, number>
}

export type BadgeFamilyKey =
  // ── ชุดกลาง: ทุกประเภทร้านเห็น (7 ตระกูล) ──
  | 'ORDER_VOLUME'
  | 'SHOP_TENURE'
  | 'NO_SELLER_CANCEL'
  | 'REVIEW_REPLY'
  | 'REVENUE_MILESTONE'
  | 'REVIEW_RATING'
  | 'REVIEWER_COUNT'
  // ── เฉพาะร้านขายของ (2 ตระกูล) ──
  | 'SHIP_SPEED'
  | 'TRACKING_COVERAGE'
  // ── เหรียญบุคคล ──
  | 'IDENTITY_VERIFIED'
  | 'FOUNDING_MEMBER'
  // ── หมวดประมูล (ซ่อนทั้งหมวดจนกว่าจะมีกิจกรรมประมูล — FR-BDG-19) ──
  | 'AUCTION_HOST'
  | 'AUCTION_CLOSE'
  | 'AUCTION_HYPE'
  | 'AUCTION_BID'
  | 'AUCTION_WIN'
  | 'AUCTION_COMPLETE'
  | 'AUCTION_ENGAGE'

// ─── ทะเบียนตระกูล ─────────────────────────────────────────────────────────────

export const BADGE_FAMILY_REGISTRY: Record<BadgeFamilyKey, FamilyDef> = {
  // ══ ชุดกลาง ══════════════════════════════════════════════════════════════════

  ORDER_VOLUME: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'ออเดอร์สะสม',
    verticals: [],
    // ขั้น 1-4 เป็นเป้าหมายหลังบ้าน เพราะจำนวนออเดอร์ที่สำเร็จอยู่ในแถวตัวเลขบนโปรไฟล์อยู่แล้ว
    // ขั้น 5 ขึ้นไปเท่านั้นที่เป็นหลักฐาน — เลขใหญ่พอจะเป็นเรื่องราวที่ตัวเลขดิบสื่อไม่ติด (D-BDG มติข้อ 10)
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL', 3: 'GOAL', 4: 'GOAL', 5: 'EVIDENCE', 6: 'EVIDENCE', 7: 'EVIDENCE' },
    thresholdByTier: { 1: 1, 2: 10, 3: 25, 4: 50, 5: 100, 6: 250, 7: 500 },
    thresholdUnit: 'orders',
  },

  SHOP_TENURE: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'อยู่มานานและยังขายอยู่',
    verticals: [],
    // อายุร้านอย่างเดียวอยู่ในแถวตัวเลขแล้ว — สิ่งที่ตระกูลนี้เพิ่มคือเงื่อนไข "ยังขายอยู่"
    // (ต้องมีออเดอร์ปิดจบใน 30 วันล่าสุด) ซึ่งแถวตัวเลขบอกไม่ได้
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL', 3: 'EVIDENCE', 4: 'EVIDENCE' },
    thresholdByTier: { 1: 90, 2: 180, 3: 365, 4: 730 },
    thresholdUnit: 'days',
  },

  NO_SELLER_CANCEL: {
    category: 'CORE',
    nature: 'STATUS',
    ownerScope: 'SHOP',
    labelTH: 'ไม่ทิ้งลูกค้า',
    verticals: [],
    surfaceByTier: { 1: 'EVIDENCE', 2: 'EVIDENCE', 3: 'EVIDENCE' },
    // ทุกขั้นใช้เกณฑ์เดียวกัน (ยกเลิกเอง 0 ใบ) ต่างกันที่ขนาดตัวอย่าง — ยิ่งขายเยอะยิ่งพิสูจน์ได้มาก
    thresholdByTier: { 1: 0, 2: 0, 3: 0 },
    thresholdUnit: 'cancels',
    minSampleByTier: { 1: 20, 2: 100, 3: 300 },
  },

  REVIEW_REPLY: {
    category: 'CORE',
    nature: 'STATUS',
    ownerScope: 'SHOP',
    labelTH: 'ตอบทุกรีวิว',
    verticals: [],
    surfaceByTier: { 1: 'EVIDENCE', 2: 'EVIDENCE' },
    thresholdByTier: { 1: 90, 2: 100 },
    thresholdUnit: 'percent',
    minSampleByTier: { 1: 5, 2: 20 },
  },

  REVENUE_MILESTONE: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    // 🛑 ห้ามเรียกว่า "ยอดขาย" เฉย ๆ — คำนั้นถูกใช้ไปแล้วโดย NET_PROFIT_FORMULA และ
    // SALES_PROFIT_FORMULA ใน `src/lib/format-money.ts` ในความหมายที่ยังถูกหักต่ออีก
    // ร้านที่บวกเลขจากสองหน้าจอแล้วไม่ตรงจะสรุปว่าระบบคิดผิด (Hard Rule 16)
    labelTH: 'ยอดที่ลูกค้าจ่ายสะสม',
    verticals: [],
    // 🛑 ทุกขั้นเป็น GOAL เท่านั้น ห้ามเป็น EVIDENCE ไม่ว่ากรณีใด (FR-BDG-13)
    // การประกาศต่อคนนอกว่าร้านนี้ขายได้ระดับไหน ไม่ใช่สิ่งที่ร้านเลือกจะบอกเอง
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL', 3: 'GOAL', 4: 'GOAL' },
    thresholdByTier: { 1: 50_000, 2: 250_000, 3: 1_000_000, 4: 5_000_000 },
    thresholdUnit: 'baht',
  },

  REVIEW_RATING: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'คะแนนรีวิว',
    verticals: [],
    // ซ้ำกับดาวและจำนวนรีวิวในแถวตัวเลข ⇒ เป็นเป้าหมายหลังบ้านทุกขั้น (D-BDG-2)
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL', 3: 'GOAL' },
    thresholdByTier: { 1: 4.5, 2: 4.8, 3: 5.0 },
    thresholdUnit: 'rating',
  },

  REVIEWER_COUNT: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'จำนวนผู้รีวิว',
    verticals: [],
    // 🛑 แยกจาก REVIEW_RATING โดยตั้งใจ (D-BDG-2) — สองตระกูลนี้วัดคนละเรื่อง
    // ร้านที่มีผู้รีวิว 50 คนแต่คะแนน 4.2 กับร้านที่มีผู้รีวิว 10 คนแต่คะแนนเต็ม
    // ไม่มีใครสูงกว่าใคร ⇒ ยุบเป็นตระกูลเดียวแล้วขั้นจะโกหกทันที
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL' },
    thresholdByTier: { 1: 10, 2: 50 },
    thresholdUnit: 'reviewers',
  },

  // ══ เฉพาะร้านขายของ ══════════════════════════════════════════════════════════

  SHIP_SPEED: {
    category: 'CORE',
    nature: 'STATUS',
    ownerScope: 'SHOP',
    labelTH: 'ส่งไว',
    verticals: ['ONLINE_SALES'],
    surfaceByTier: { 1: 'EVIDENCE', 2: 'EVIDENCE', 3: 'EVIDENCE' },
    // ค่าเฉลี่ยชั่วโมงจนพัสดุออก — ยิ่งน้อยยิ่งดี (ตัวเปรียบเทียบเป็น <= ไม่ใช่ >=)
    thresholdByTier: { 1: 24, 2: 12, 3: 6 },
    thresholdUnit: 'hours',
    minSampleByTier: { 1: 20, 2: 20, 3: 20 },
  },

  TRACKING_COVERAGE: {
    category: 'CORE',
    nature: 'STATUS',
    ownerScope: 'SHOP',
    labelTH: 'ตามพัสดุได้ทุกใบ',
    verticals: ['ONLINE_SALES'],
    surfaceByTier: { 1: 'EVIDENCE', 2: 'EVIDENCE' },
    thresholdByTier: { 1: 95, 2: 100 },
    thresholdUnit: 'percent',
    minSampleByTier: { 1: 20, 2: 100 },
  },

  // ══ เหรียญบุคคล ══════════════════════════════════════════════════════════════

  IDENTITY_VERIFIED: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'ยืนยันตัวตน',
    verticals: [],
    // ระดับการยืนยันอยู่ในแถวตัวเลขบนโปรไฟล์อยู่แล้ว ⇒ เหรียญไม่ต้องพูดซ้ำ
    surfaceByTier: { 1: 'GOAL' },
    thresholdByTier: { 1: 3 },
    thresholdUnit: 'count',
  },

  FOUNDING_MEMBER: {
    category: 'CORE',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'สมาชิกรุ่นก่อตั้ง',
    verticals: [],
    // เหรียญที่ระลึก — 51 จาก 52 คนมี ⇒ ไม่แยกใครออกจากใคร จึงไม่ใช่หลักฐาน
    // แต่เป็นของที่คนผูกพันและได้อีกไม่ได้แล้ว จึงแสดงได้โดยไม่กินโควตา (มติข้อ 16)
    surfaceByTier: { 1: 'COMMEMORATIVE' },
    thresholdByTier: { 1: 2026 },
    thresholdUnit: 'count',
  },

  // ══ หมวดประมูล — ซ่อนทั้งหมวดจนกว่าผู้ถือจะมีกิจกรรมประมูล (FR-BDG-19) ══════════
  // ระบบมีรายการประมูล 0 รายการ ณ 2026-08-21 ⇒ วันเปิดใช้ต้องไม่มีร้านใดเห็นหมวดนี้เลย
  // ผู้ที่ "ถือ" เหรียญประมูลอยู่แล้วยังเห็นตามปกติ — ด่านนี้กรองเฉพาะรายการที่ยังไม่ได้

  AUCTION_HOST: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'เปิดประมูล',
    verticals: ['ONLINE_SALES'],
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL' },
    thresholdByTier: { 1: 1, 2: 10 },
    thresholdUnit: 'count',
  },

  AUCTION_CLOSE: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'ปิดการประมูลได้',
    verticals: ['ONLINE_SALES'],
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL', 3: 'GOAL' },
    thresholdByTier: { 1: 1, 2: 10, 3: 50 },
    thresholdUnit: 'count',
  },

  AUCTION_HYPE: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'SHOP',
    labelTH: 'ประมูลที่มีคนสู้ราคา',
    verticals: ['ONLINE_SALES'],
    surfaceByTier: { 1: 'GOAL' },
    thresholdByTier: { 1: 20 },
    thresholdUnit: 'count',
  },

  AUCTION_BID: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'เสนอราคา',
    verticals: [],
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL' },
    thresholdByTier: { 1: 1, 2: 50 },
    thresholdUnit: 'count',
  },

  AUCTION_WIN: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'ชนะประมูล',
    verticals: [],
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL' },
    thresholdByTier: { 1: 1, 2: 5 },
    thresholdUnit: 'count',
  },

  AUCTION_COMPLETE: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'ชนะประมูลแล้วรับของครบ',
    verticals: [],
    surfaceByTier: { 1: 'GOAL' },
    thresholdByTier: { 1: 3 },
    thresholdUnit: 'count',
  },

  AUCTION_ENGAGE: {
    category: 'AUCTION',
    nature: 'EVENT',
    ownerScope: 'USER',
    labelTH: 'มีส่วนร่วมกับการประมูล',
    verticals: [],
    surfaceByTier: { 1: 'GOAL', 2: 'GOAL' },
    thresholdByTier: { 1: 20, 2: 10 },
    thresholdUnit: 'count',
  },
}

// ─── แผนที่เหรียญ → ตระกูล/ขั้น (ใช้ตอน backfill และตอน seed) ─────────────────

/**
 * `Badge.nameEN` → ตระกูลและขั้นของเหรียญใบนั้น
 *
 * 🛑 **เลข `tier` มีช่องว่างโดยตั้งใจ — ห้าม "แก้" ให้เรียงติดกัน**
 * ขั้นที่หายไปคือขั้นที่เหรียญใหม่ของ P2 จะมาเติม (เช่น `SHOP_TENURE` ขั้น 2 = 180 วัน)
 * ถ้าบีบให้เป็น 1,2,3 ติดกัน ขั้นจะชนกันทันทีที่ P2 seed เหรียญใหม่เข้ามา แล้วไปโผล่เป็น
 * "ขั้นสูงสุดของตระกูล" ที่เลือกผิดใบตอน rollup บนโปรไฟล์ โดยไม่มีอะไรฟ้อง
 *
 * `tier` คือ **ตำแหน่งความยากในตระกูลที่ประกาศไว้ล่วงหน้าทั้งชุด** ไม่ใช่ลำดับการมาถึงของเหรียญ
 * ⇒ เลขของเหรียญที่ปล่อยไปแล้วห้ามขยับตลอดกาล (BR-BDG-09)
 */
export const BADGE_TO_FAMILY: Record<string, { family: BadgeFamilyKey; tier: number }> = {
  // ออเดอร์สะสม — ขั้น 6 (250 ใบ) และ 7 (500 ใบ) มาใน P2
  'First Sale': { family: 'ORDER_VOLUME', tier: 1 },
  'Getting Started': { family: 'ORDER_VOLUME', tier: 2 },
  'Rising Seller': { family: 'ORDER_VOLUME', tier: 3 },
  'Trusted Seller 50': { family: 'ORDER_VOLUME', tier: 4 },
  'Century Club': { family: 'ORDER_VOLUME', tier: 5 },

  // อยู่มานานและยังขายอยู่ — ขั้น 2 (180 วัน) และ 4 (730 วัน) มาใน P2
  '3 Months Strong': { family: 'SHOP_TENURE', tier: 1 },
  Veteran: { family: 'SHOP_TENURE', tier: 3 },

  // ไม่ทิ้งลูกค้า — ขั้น 3 (ตัวอย่าง 300 ใบ) มาใน P2
  'Zero Complaint': { family: 'NO_SELLER_CANCEL', tier: 1 },
  'Spotless 100': { family: 'NO_SELLER_CANCEL', tier: 2 },

  // คะแนนรีวิว
  'Well Rated': { family: 'REVIEW_RATING', tier: 1 },
  'Highly Rated': { family: 'REVIEW_RATING', tier: 2 },
  'Perfect Rating': { family: 'REVIEW_RATING', tier: 3 },

  // จำนวนผู้รีวิว
  'Getting Noticed': { family: 'REVIEWER_COUNT', tier: 1 },
  'Community Favorite': { family: 'REVIEWER_COUNT', tier: 2 },

  // ส่งไว — ขั้น 3 (≤6 ชม.) มาใน P2
  'Speed Demon': { family: 'SHIP_SPEED', tier: 1 },
  'Same-Day Hero': { family: 'SHIP_SPEED', tier: 2 },

  // เหรียญบุคคล
  'Fully Verified': { family: 'IDENTITY_VERIFIED', tier: 1 },
  '2026_BADGE': { family: 'FOUNDING_MEMBER', tier: 1 },

  // หมวดประมูล
  'First Auctioneer': { family: 'AUCTION_HOST', tier: 1 },
  'Auction Host 10': { family: 'AUCTION_HOST', tier: 2 },
  'First Auction Win': { family: 'AUCTION_CLOSE', tier: 1 },
  'Auction Closer 10': { family: 'AUCTION_CLOSE', tier: 2 },
  'Auction Pro 50': { family: 'AUCTION_CLOSE', tier: 3 },
  'Bid Magnet': { family: 'AUCTION_HYPE', tier: 1 },
  'First Bidder': { family: 'AUCTION_BID', tier: 1 },
  'Active Bidder': { family: 'AUCTION_BID', tier: 2 },
  'First Winner': { family: 'AUCTION_WIN', tier: 1 },
  "Winner's Circle": { family: 'AUCTION_WIN', tier: 2 },
  'Auction Completer': { family: 'AUCTION_COMPLETE', tier: 1 },
  'Bid Cheerer': { family: 'AUCTION_ENGAGE', tier: 1 },
  'Auction Watcher': { family: 'AUCTION_ENGAGE', tier: 2 },
}

// ─── ตัวอ่าน (ทุกตัว fail-closed) ──────────────────────────────────────────────

const SURFACES: readonly BadgeSurface[] = ['EVIDENCE', 'GOAL', 'COMMEMORATIVE']

/**
 * แปลงค่า `Badge.surface` ดิบจากฐานข้อมูลเป็นค่าที่ระบบรู้จัก
 *
 * 🛑 **ค่าที่ไม่รู้จักหรือว่าง คืน `GOAL` เสมอ ห้ามคืน `EVIDENCE`** (BR-BDG-20) —
 * ทิศทางของความผิดพลาดถูกเลือกไว้แล้ว: เหรียญที่ใครลืมตั้งค่าจะเงียบอยู่หลังบ้าน
 * ไม่ใช่หลุดขึ้นหน้าร้านให้ผู้ซื้อเห็นสิ่งที่ระบบยังไม่รู้ว่าแปลว่าอะไร
 */
export function resolveSurface(raw: string | null | undefined): BadgeSurface {
  return SURFACES.includes(raw as BadgeSurface) ? (raw as BadgeSurface) : 'GOAL'
}

/** คืนนิยามตระกูลจากคีย์ — คีย์ที่ไม่รู้จักคืน `null` ไม่ throw (ห้ามล้มกลาง evaluation loop) */
export function resolveFamily(key: string | null | undefined): FamilyDef | null {
  if (!key) return null
  return BADGE_FAMILY_REGISTRY[key as BadgeFamilyKey] ?? null
}

/**
 * คืนตระกูลและขั้นของเหรียญจากชื่อระบบ — เหรียญที่แมปไม่ได้คืน `null`
 * ห้ามเดาตระกูลจากรูปแบบของเกณฑ์ (FR-BDG-01)
 */
export function resolveBadgeFamily(nameEN: string): { family: BadgeFamilyKey; tier: number } | null {
  return BADGE_TO_FAMILY[nameEN] ?? null
}

/**
 * ตระกูลที่ร้านประเภทนี้มองเห็น — **ค่าที่ไม่รู้จักได้ชุดกลางเสมอ** (BR-BDG-19)
 *
 * ไม่กรองหมวดประมูลออกให้ที่นี่ — การซ่อนหมวดประมูลเป็นด่านแยกที่ตัดสินจาก
 * "ผู้ถือรายนี้เคยมีกิจกรรมประมูลหรือยัง" ไม่ใช่จากประเภทร้าน (FR-BDG-19)
 * ⇒ ใช้ `coreFamiliesForVertical()` เมื่อต้องการเฉพาะชุดที่นับเป็นแคตตาล็อกหลัก
 */
export function familiesForVertical(vertical: string | null | undefined): BadgeFamilyKey[] {
  const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
  return keys.filter((key) => {
    const def = BADGE_FAMILY_REGISTRY[key]
    if (def.verticals.length === 0) return true
    return def.verticals.includes(vertical as ShopVertical)
  })
}

/**
 * **แคตตาล็อกของร้าน** — ตระกูลหมวดหลักที่เป็นเหรียญของร้าน และร้านประเภทนี้มองเห็น
 *
 * จำนวนที่ต้องได้: **ร้านขายของ 9 ตระกูล · ประเภทอื่นและค่าที่ไม่รู้จัก 7 ตระกูล**
 * ส่วนต่าง 2 ตระกูลคือ "ส่งไว" กับ "ตามพัสดุได้ทุกใบ" ซึ่งร้านที่ไม่ได้ส่งของทำไม่ได้จริง ๆ
 * — ยอมรับความไม่เท่ากันนี้โดยตั้งใจ ห้ามเติมเหรียญให้จำนวนเท่ากัน (มติข้อ 22)
 *
 * 🛑 **กรอง `ownerScope === 'SHOP'` ด้วย ไม่ใช่แค่ `category` และ `verticals`** — เหรียญบุคคล
 * (ยืนยันตัวตน · สมาชิกรุ่นก่อตั้ง) มี `verticals` ว่างเหมือนชุดกลาง แต่**ไม่ใช่ของร้าน**
 * จึงไม่อยู่ในแคตตาล็อกที่ร้านไล่เก็บ ⇒ ถ้าไม่กรอง จะนับได้ 9/11 แทนที่จะเป็น 7/9
 * (จับได้ตอนเขียนเทสรอบแรกของ P1-a — ตัวเลขในเอกสารเป็นตัวที่บอกว่าโค้ดผิด ไม่ใช่กลับกัน)
 */
export function coreFamiliesForVertical(vertical: string | null | undefined): BadgeFamilyKey[] {
  return familiesForVertical(vertical).filter((key) => {
    const def = BADGE_FAMILY_REGISTRY[key]
    return def.category === 'CORE' && def.ownerScope === 'SHOP'
  })
}

/** ตระกูลเหรียญบุคคล — ไม่ผูกกับร้านใด คนที่ไม่เคยเปิดร้านก็มีได้ */
export function personalFamilies(): BadgeFamilyKey[] {
  const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
  return keys.filter((key) => BADGE_FAMILY_REGISTRY[key].ownerScope === 'USER')
}

/** ตระกูลที่เป็นเหรียญสถานะทั้งหมด — ต้องมีคู่คอลัมน์ค่า+ตัวหารบน `Shop` ครบทุกตัว */
export function statusFamilies(): BadgeFamilyKey[] {
  const keys = Object.keys(BADGE_FAMILY_REGISTRY) as BadgeFamilyKey[]
  return keys.filter((key) => BADGE_FAMILY_REGISTRY[key].nature === 'STATUS')
}

/** ขั้นทั้งหมดของตระกูล เรียงจากน้อยไปมาก */
export function tiersOf(key: BadgeFamilyKey): number[] {
  return Object.keys(BADGE_FAMILY_REGISTRY[key].surfaceByTier)
    .map(Number)
    .sort((a, b) => a - b)
}
