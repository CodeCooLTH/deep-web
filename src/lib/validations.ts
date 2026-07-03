import * as v from "valibot";
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from "@/lib/product-types/registry";
// isHttpUrl — ใช้ logic เดียวกับ render layer (S-10) เพื่อ validate accessUrl (S-3)
import { isHttpUrl } from "@/lib/order-display";
import { SHOP_CATEGORY_KEYS } from "@/lib/shop-categories";
import { isStrongPassword } from "@/lib/password";
import { isValidSlugFormat } from "@/lib/shop-slug";

export const SendOtpSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1), v.maxLength(20)),
  type: v.picklist(["phone", "email", "PHONE", "EMAIL"]),
});

export const VerifyOtpSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(["phone", "email", "PHONE", "EMAIL"]),
  otp: v.pipe(v.string(), v.length(6)),
});

// รหัสผ่าน seller — ผูกกฎเดียวกับ isStrongPassword (SSOT)
export const PasswordSchema = v.pipe(
  v.string(),
  v.maxLength(1000),
  v.check((s) => isStrongPassword(s), "รหัสผ่านต้องมีอย่างน้อย 8 ตัว และมีตัวอักษร ตัวเลข และอักขระพิเศษ"),
);

// slug ร้าน — format เท่านั้น (reserved + uniqueness ตรวจที่ service layer)
export const ShopSlugSchema = v.pipe(
  v.string(),
  v.check((s) => isValidSlugFormat(s), "URL ร้านไม่ถูกต้อง (a-z, 0-9, - เท่านั้น 3–30 ตัว)"),
);

export const ShopCategorySchema = v.picklist(SHOP_CATEGORY_KEYS);

// ── feature 00001 Login & Onboarding ────────────────────────────────────────
// ช่องทางการขาย (sales channels) — enum คงที่ (Product team กำหนด, Seller เพิ่มเองไม่ได้)
export const SALES_CHANNEL_KEYS = [
  "facebook",
  "offline",
  "line",
  "tiktok_shop",
  "lazada",
  "shopee",
] as const;
export const SALES_CHANNEL_LABELS: Record<(typeof SALES_CHANNEL_KEYS)[number], string> = {
  facebook: "Facebook",
  offline: "หน้าร้าน",
  line: "LINE",
  tiktok_shop: "TikTok Shop",
  lazada: "Lazada",
  shopee: "Shopee",
};

// Step 1 — sales channels (empty array = valid, ข้ามได้)
export const SalesChannelsSchema = v.object({
  channels: v.array(v.picklist(SALES_CHANNEL_KEYS)),
});

// Step 2 — multi-category ≤5 (submit ต้องเลือก ≥1; ข้ามได้ที่ client โดยไม่เรียก API)
export const CategoriesSchema = v.object({
  categories: v.pipe(
    v.array(ShopCategorySchema),
    v.minLength(1, "ต้องเลือกอย่างน้อย 1 หมวด"),
    v.maxLength(5, "เลือกได้สูงสุด 5 หมวด"),
  ),
});

// Step 3 — address + map pin (lat/lng ขอบเขตประเทศไทย; lat+lng ต้องมาคู่ — XOR check ที่ route handler)
export const ShopUpdateWithGeoSchema = v.object({
  category: v.optional(ShopCategorySchema),
  address: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500))),
  latitude: v.optional(v.pipe(v.number(), v.minValue(5), v.maxValue(21))),
  longitude: v.optional(v.pipe(v.number(), v.minValue(97), v.maxValue(106))),
});

// Step 3 — Nominatim reverse-geocode proxy input
export const GeoReverseSchema = v.object({
  lat: v.pipe(v.number(), v.minValue(5), v.maxValue(21)),
  lng: v.pipe(v.number(), v.minValue(97), v.maxValue(106)),
});
// ─────────────────────────────────────────────────────────────────────────────

export const SetPasswordSchema = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/)),
  otp: v.pipe(v.string(), v.length(6)),
  password: PasswordSchema,
});

export const CreateShopSchema = v.object({
  shopName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
  category: v.optional(ShopCategorySchema),
  address: v.optional(v.pipe(v.string(), v.maxLength(200))),
  businessType: v.picklist(["INDIVIDUAL", "COMPANY"]),
  // logo: fileId จาก /api/upload — เดิมไม่อยู่ใน schema → /api/shops POST
  // strip logo ที่ user อัปโหลดตอนสร้างร้านทิ้ง (B6 retro). Shop.logo = String?
  logo: v.optional(v.pipe(v.string(), v.maxLength(200))),
});

// TagNameSchema — ใช้ซ้ำในหลายที่ (CreateProduct.tags, autocomplete API)
// ชื่อ tag 1-50 ตัวอักษร — server upsert เข้า Tag table แล้วสร้าง relation M:N
export const TagNameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(50));

// CapabilityFieldsSchema — ใช้ซ้ำใน Product create/update
// fulfillmentMode/billingMode/billingPeriod/billingPeriodDays เป็น optional ทั้งหมด
// ไม่ break existing callers ที่ไม่ส่ง fields เหล่านี้
const CapabilityFieldsSchema = {
  fulfillmentMode: v.optional(v.picklist(FULFILLMENT_MODES)),
  billingMode: v.optional(v.picklist(BILLING_MODES)),
  billingPeriod: v.optional(v.nullable(v.picklist(BILLING_PERIODS))),
  billingPeriodDays: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365))),
  ),
};

export const CreateProductSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  // sku — รหัสสินค้า optional (feature 00001 onboarding); ≤100 chars
  sku: v.optional(v.pipe(v.string(), v.maxLength(100))),
  // description ขยายเป็น 5000 chars ตามตกลง (DB ไม่มี length limit แล้ว)
  description: v.optional(v.pipe(v.string(), v.maxLength(5000))),
  // shortDescription ใช้แสดงในการ์ดสินค้า/ผลค้นหา — สูงสุด 200 chars
  shortDescription: v.optional(v.pipe(v.string(), v.maxLength(200))),
  price: v.pipe(v.number(), v.minValue(0.01)),
  // type — derive จาก registry (replaces hardcoded picklist)
  type: v.picklist(PRODUCT_TYPE_IDS),
  images: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      v.maxLength(10),
    ),
    [],
  ),
  // tags เป็น array ของ "ชื่อ tag" (ไม่ใช่ id) — server จะ upsert ลง Tag table
  // จำกัดสูงสุด 10 tags ต่อ product, แต่ละชื่อ 1-50 chars
  tags: v.optional(
    v.pipe(v.array(TagNameSchema), v.maxLength(10)),
    [],
  ),
  // attributes เป็น key-value pairs (เช่น size: M, color: red)
  // key 1-50 chars, value 0-200 chars — UI จำกัดไม่เกิน 10 keys
  attributes: v.optional(
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
      v.pipe(v.string(), v.maxLength(200)),
    ),
    {},
  ),
  ...CapabilityFieldsSchema,
  // stockQty — Inventory Add-on (feature 00003): undefined=ไม่แตะ, null=untrack, ≥0=track
  stockQty: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  // lowStockThreshold — Deep Stock Pro (feature 00009): undefined=ไม่แตะ, null=ปิด alert explicit, ≥0=ตั้งค่า
  lowStockThreshold: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

export const UpdateProductSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.pipe(v.string(), v.maxLength(5000))),
  shortDescription: v.optional(v.pipe(v.string(), v.maxLength(200))),
  price: v.optional(v.pipe(v.number(), v.minValue(0.01))),
  // type — derive จาก registry (replaces hardcoded picklist)
  type: v.optional(v.picklist(PRODUCT_TYPE_IDS)),
  images: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      v.maxLength(10),
    ),
  ),
  // partial update: omit = ไม่เปลี่ยน, ส่ง [] = ลบ tag ทั้งหมด
  tags: v.optional(v.pipe(v.array(TagNameSchema), v.maxLength(10))),
  // partial update: omit = ไม่เปลี่ยน, ส่ง {} = ลบ attributes ทั้งหมด
  attributes: v.optional(
    v.record(
      v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
      v.pipe(v.string(), v.maxLength(200)),
    ),
  ),
  isActive: v.optional(v.boolean()),
  ...CapabilityFieldsSchema,
  // stockQty — Inventory Add-on (feature 00003): undefined=ไม่แตะ, null=untrack, ≥0=track
  stockQty: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  // lowStockThreshold — Deep Stock Pro (feature 00009): undefined=ไม่แตะ, null=ปิด alert explicit, ≥0=ตั้งค่า
  lowStockThreshold: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
});

// --- Deep Stock Pro (feature 00009) ---

export const InventoryPackageSchema = v.picklist(["BASIC", "PRO"] as const);

export const SubscribeInventorySchema = v.object({
  package: InventoryPackageSchema,
});

export const ReactivateInventorySchema = v.object({
  package: InventoryPackageSchema,
});

// POST /api/inventory/upgrade — ไม่มี body schema (empty POST เหมือน subscribe เดิมของ 00003)

export const ManualStockAdjustSchema = v.object({
  productId: v.pipe(v.string(), v.uuid()),
  delta: v.pipe(v.number(), v.integer(), v.check((n) => n !== 0, "delta ห้ามเป็น 0")),
  note: v.pipe(v.string(), v.minLength(1, "กรุณาระบุเหตุผล"), v.maxLength(200)),
});

export const CsvImportRowSchema = v.object({
  productId: v.pipe(v.string(), v.uuid()),
  stockQty: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const CsvImportSchema = v.object({
  rows: v.pipe(
    v.array(CsvImportRowSchema),
    v.minLength(1),
    v.maxLength(500, "นำเข้าได้สูงสุด 500 แถวต่อครั้ง"),
  ),
});

// GET /api/inventory/movements query params (validate ผ่าน manual parse — searchParams ไม่ใช่ JSON body)
export const MovementHistoryQuerySchema = v.object({
  productId: v.pipe(v.string(), v.uuid()),
  cursor: v.optional(v.pipe(v.string())), // ISO datetime ของ createdAt รายการสุดท้ายที่เห็น
  take: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    20,
  ),
});

// GET /api/notifications query params (manual parse — searchParams ไม่ใช่ JSON body)
export const NotificationsQuerySchema = v.object({
  cursor: v.optional(v.pipe(v.string())), // ISO datetime ของ createdAt รายการสุดท้ายที่เห็น
  take: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
    20,
  ),
})

// POST /api/notifications/read body — id ไม่ระบุ = mark ทั้งหมดอ่านแล้ว
export const MarkNotificationReadSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
})

export const CreateOrderSchema = v.object({
  items: v.pipe(
    v.array(v.object({
      productId: v.optional(v.pipe(v.string(), v.uuid())),
      name: v.pipe(v.string(), v.minLength(1)),
      description: v.optional(v.string()),
      qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
      price: v.pipe(v.number(), v.minValue(0.01)),
    })),
    v.minLength(1),
  ),
  // type — derive จาก registry (replaces hardcoded picklist)
  type: v.picklist(PRODUCT_TYPE_IDS),
  // Phase B fields — ทั้งหมด optional เพื่อ backward-compatible กับ caller เดิม
  buyerContact: v.optional(v.string()),
  buyerName: v.optional(v.string()),
  paymentMethod: v.optional(v.string()),
  salesChannel: v.optional(v.string()),
  internalNote: v.optional(v.string()),
  // discount/vatRate/vatAmount เป็นตัวเลข: minValue(0) กัน negative
  discount: v.optional(v.pipe(v.number(), v.minValue(0))),
  // vatRate เก็บเป็น decimal fraction (0.07 = 7%) — maxValue(1) ป้องกัน input ผิด (เช่น 7 แทน 0.07)
  vatRate: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  vatAmount: v.optional(v.pipe(v.number(), v.minValue(0))),
  // shippingAddress เป็น Json? ใน DB — validate shape ที่ app-layer ก่อน persist
  shippingAddress: v.optional(v.object({
    line1: v.optional(v.string()),
    subdistrict: v.optional(v.string()),
    district: v.optional(v.string()),
    province: v.optional(v.string()),
    postcode: v.optional(v.string()),
    note: v.optional(v.string()),
  })),
});

// ConfirmOrderSchema — OTP ถูกถอดออกตาม UX ใหม่ (2026-04-18) buyer เปิดลิงก์
// และพิสูจน์ตัวตนด้วยการกรอกเบอร์ที่ตรงกับ order.buyerContact (ถ้า seller ใส่
// เบอร์ไว้ตอนสร้าง order) หรือถ้า buyerContact ยังว่าง — เบอร์แรกที่กรอกจะ
// claim order นั้น. ดูเพิ่มใน order.service.confirmOrder + /api/orders/[token]/unlock
export const ConfirmOrderSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1)),
  contactType: v.optional(v.picklist(["phone", "email", "PHONE", "EMAIL"])),
});

export const UnlockOrderSchema = v.object({
  phone: v.pipe(v.string(), v.regex(/^0[0-9]{9}$/)),
});

export const CreateReviewSchema = v.object({
  rating: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
  comment: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

export const ShipOrderSchema = v.object({
  provider: v.pipe(v.string(), v.minLength(1)),
  trackingNo: v.pipe(v.string(), v.minLength(1)),
});

// ─── Badge schemas (admin write endpoints) ───────────────────────────────────
// ทำไม: POST/PATCH /api/admin/badges เคย pass raw JSON เข้า prisma.badge.create/update
// โดยไม่ validate — ป้องกัน malformed criteria, audience ผิด, field ไม่ครบ
// criteria discriminated union: validate fields ตาม type แต่ละ variant
// unknown criteria.type → reject ทันที (ห้าม pass ค่าที่ service ไม่รู้จัก)

/** criteria variants ที่รู้จักใน src/types/badge.ts (ต้องตรงกับ seed + service) */
const KnownCriteriaTypes = [
  'FIRST_ORDER',
  'ORDER_COUNT',
  'PERFECT_RATING',
  'HIGH_RATING',
  'ZERO_COMPLAINT',
  'VETERAN',
  'FAST_SHIPPING',
  'FULL_VERIFICATION',
  'UNIQUE_REVIEWERS',
  'SIGNUP_YEAR',
] as const;

const BadgeCriteriaSchema = v.union([
  // FIRST_ORDER — ไม่มี field เพิ่มเติม
  v.object({ type: v.literal('FIRST_ORDER') }),
  // ORDER_COUNT — count: number (จำนวน order สำเร็จ)
  v.object({
    type: v.literal('ORDER_COUNT'),
    count: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  // PERFECT_RATING — minReviews: number
  v.object({
    type: v.literal('PERFECT_RATING'),
    minReviews: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  // HIGH_RATING — minRating: number (decimal ok), minReviews: number
  v.object({
    type: v.literal('HIGH_RATING'),
    minRating: v.pipe(v.number(), v.minValue(0.1)),
    minReviews: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  // ZERO_COMPLAINT — minOrders: number
  v.object({
    type: v.literal('ZERO_COMPLAINT'),
    minOrders: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  // VETERAN — minDays: number; statuses optional (service อาจ pass หรือไม่ก็ได้)
  v.object({
    type: v.literal('VETERAN'),
    minDays: v.pipe(v.number(), v.integer(), v.minValue(1)),
    statuses: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  }),
  // FAST_SHIPPING — maxHours: number (decimal ok), minOrders: number; statuses optional
  v.object({
    type: v.literal('FAST_SHIPPING'),
    maxHours: v.pipe(v.number(), v.minValue(0.1)),
    minOrders: v.pipe(v.number(), v.integer(), v.minValue(1)),
    statuses: v.optional(v.array(v.pipe(v.string(), v.minLength(1)))),
  }),
  // FULL_VERIFICATION — ไม่มี field เพิ่มเติม
  v.object({ type: v.literal('FULL_VERIFICATION') }),
  // UNIQUE_REVIEWERS — count: number
  v.object({
    type: v.literal('UNIQUE_REVIEWERS'),
    count: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  // SIGNUP_YEAR — year: number (เช่น 2024)
  v.object({
    type: v.literal('SIGNUP_YEAR'),
    year: v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100)),
  }),
]);

export const CreateBadgeSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  nameEN: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  // icon เป็น String? ใน Prisma — nullable; ถ้าส่งมาต้องเป็น string non-empty
  icon: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  type: v.picklist(['ACHIEVEMENT', 'VERIFICATION']),
  audience: v.optional(v.picklist(['SELLER', 'BUYER', 'ANY'])),
  criteria: BadgeCriteriaSchema,
});

export const UpdateBadgeSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  nameEN: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
  icon: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
  type: v.optional(v.picklist(['ACHIEVEMENT', 'VERIFICATION'])),
  audience: v.optional(v.picklist(['SELLER', 'BUYER', 'ANY'])),
  criteria: v.optional(BadgeCriteriaSchema),
});

// ─── BadgeImageUploadSchema ───────────────────────────────────────────────────
// ทำไม: SVG เป็น XSS vector — reject ทั้ง mime + extension; จำกัด 256 KB
const BADGE_IMAGE_MAX_BYTES = 256 * 1024;
const BADGE_IMAGE_ALLOWED_MIMES = ['image/png', 'image/webp', 'image/jpeg'] as const;
export const BadgeImageUploadSchema = v.object({
  mime: v.picklist(BADGE_IMAGE_ALLOWED_MIMES),
  size: v.pipe(v.number(), v.integer(), v.minValue(1, 'ไฟล์ว่างเปล่า'), v.maxValue(BADGE_IMAGE_MAX_BYTES, `ไฟล์ต้องไม่เกิน ${BADGE_IMAGE_MAX_BYTES / 1024} KB`)),
  badgeId: v.pipe(v.string(), v.minLength(1, 'ต้องระบุ badgeId')),
});

// ─── SMS Wallet schemas (Phase 4 — SMS Order Link + Seller Wallet) ────────────

// SendSmsSchema — body ของ POST /api/orders/[token]/send-sms
// ทำไม ไม่มี phone field: RC-8/RC-6 — buyer phone ต้องมาจาก order.buyerContact
// ที่ server ดึงผ่าน DAL (getOrderForShop(token, shopId)) เท่านั้น.
// ถ้ารับ phone จาก client = seller อาจส่งเบอร์ที่ไม่ตรง order (RC-6 bypass)
// หรือ raw PII ข้าม trust boundary (RC-8 S-C1). token อยู่ใน path param ไม่ใช่ body.
export const SendSmsSchema = v.object({});

// CreateTopUpRequestSchema — body ของ POST /api/wallet/topup
// seller ส่ง amount + slipFileId (fileId จาก /api/upload เหมือน verification doc)
export const CreateTopUpRequestSchema = v.object({
  // amount หน่วย ฿ integer:
  //   min 100 — กัน top-up ขนาดเล็กที่ค่า overhead admin review ไม่คุ้ม (฿1/SMS → 100 SMS/ครั้ง)
  //   max 100000 — ceiling กัน abuse/typo ที่ทำให้ยอดเกินที่ admin จะ approve ได้จริง
  //   (RC-4 daily cap ~200 SMS/day → max balance ที่สมเหตุสมผลคือ ~฿200-500/เดือน
  //   แต่ให้ headroom ฝาก bulk; ฿100000 คือ hard ceiling ไม่ใช่ expected amount)
  amount: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(100),
    v.maxValue(100000),
  ),
  // slipFileId — fileId ที่ได้จาก /api/upload (ไม่ใช่ URL ตรง)
  // รูปแบบเดียวกับ CreateShopSchema.logo และ verification doc upload
  slipFileId: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
});

// AdminTopUpActionSchema — body ของ POST /api/admin/topups/[id]/reject
// ใช้กับ reject endpoint เท่านั้น; approve ไม่มี body (action ชัดจาก path เอง)
export const AdminTopUpActionSchema = v.object({
  // reason — เหตุผล reject เป็นภาษาไทย แสดงให้ seller เห็น
  // min 1 กัน reject โดยไม่ให้เหตุผล, max 500 เพียงพอสำหรับข้อความอธิบาย
  reason: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
});

// ─── Phase 2 — Order Detail: accessUrl schema (S-3) ──────────────────────────

// SetAccessUrlSchema — body ของ POST /api/orders/[token]/access-url (seller endpoint)
// ทำไม: accessUrl ต้องเป็น http/https เท่านั้น — กัน stored-XSS ผ่าน javascript:/data:
// (isHttpUrl import อยู่บนสุดของไฟล์)
export const SetAccessUrlSchema = v.object({
  url: v.pipe(
    v.string(),
    v.minLength(1, "กรุณาระบุ URL"),
    v.check(isHttpUrl, "ลิงก์ต้องเป็น http หรือ https"),
  ),
});

// ── Scam Report (spec 2026-06-20-scam-risk-check-report) ─────────────────────
export const ScamIdentifierTypeSchema = v.picklist([
  "PHONE",
  "NAME",
  "NATIONAL_ID",
  "BANK_ACCOUNT",
]);

export const SCAM_TYPES = [
  "TRANSFER_NO_DELIVERY",
  "ITEM_NOT_AS_DESCRIBED",
  "FAKE_INVESTMENT",
  "OTHER",
] as const;

// ตัวระบุ 1 ตัว + validate ความถูกต้องตามชนิด (เบอร์ 9-10 หลัก, บัตร 13 หลัก, บัญชี 8-15 หลัก)
export const ScamReportIdentifierSchema = v.pipe(
  v.object({
    type: ScamIdentifierTypeSchema,
    value: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
    bankName: v.optional(v.pipe(v.string(), v.maxLength(50))),
  }),
  v.check((i) => {
    const d = i.value.replace(/\D/g, "");
    if (i.type === "PHONE") return d.length >= 9 && d.length <= 10;
    if (i.type === "NATIONAL_ID") return d.length === 13;
    if (i.type === "BANK_ACCOUNT") return d.length >= 8 && d.length <= 15;
    return i.value.trim().length >= 2; // NAME
  }, "ค่าตัวระบุไม่ถูกต้องตามชนิด"),
);

export const CreateScamReportSchema = v.object({
  identifiers: v.pipe(v.array(ScamReportIdentifierSchema), v.minLength(1), v.maxLength(4)),
  scamType: v.picklist(SCAM_TYPES),
  amountLost: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000_000)),
  description: v.pipe(v.string(), v.trim(), v.minLength(10), v.maxLength(2000)),
  evidence: v.pipe(v.array(v.string()), v.minLength(1, "ต้องแนบหลักฐานอย่างน้อย 1 ไฟล์"), v.maxLength(10)),
});

export const ScamSearchSchema = v.object({
  type: ScamIdentifierTypeSchema,
  q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
});

export const ReviewScamReportSchema = v.object({
  status: v.picklist(["APPROVED", "REJECTED"]),
  rejectedReason: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

// ── feature 00002 Seller Auction (Batch B task #4) ──────────────────────────
// SSOT ของ rule: docs/20 - Features/00002 - Seller Auction/SRS.md §5.4 (ตาราง validation)
// + BRD.md §2.7 OQ-4 (แก้ price fields ขณะ draft/scheduled ได้) / OQ-6 (schedule startTime อดีต → reject 400)

// รับ ISO datetime string จาก client แล้วแปลงเป็น Date ตรงกับ CreateAuctionInput/UpdateAuctionInput
// (service layer ใช้ Date ล้วน) — ไม่ใช้ v.isoTimestamp() เพราะ regex เข้มกว่าที่ API.md ตัวอย่างส่งมา
// (ต้องการ .sss + 'Z' เท่านั้น ขณะที่ตัวอย่างจริงส่ง offset "+07:00" แบบไม่มี millisecond) — ใช้
// `new Date()` เป็น parser ตรง ๆ (ครอบคลุมกว่า, JS Date parse ISO 8601 ทุก offset รูปแบบมาตรฐานได้)
const isValidDateString = (s: string) => !Number.isNaN(new Date(s).getTime());
const AuctionDateTimeSchema = v.pipe(
  v.string(),
  v.check(isValidDateString, "รูปแบบวันที่ไม่ถูกต้อง"),
  v.transform((s: string) => new Date(s)),
);

const AUCTION_MODES = ["draft", "publishNow", "schedule"] as const;

// SRS §5.6: Min endTime lead time (create) = now + 30 นาที — ใช้ค่าเดียวกันตอน revalidate ใน UpdateAuctionSchema
const MIN_AUCTION_END_LEAD_MS = 30 * 60 * 1000;

// เพดานราคาบน — กัน Decimal(12,2) overflow/Infinity (Prisma throw ที่ DB layer ถ้าไม่กันตั้งแต่ Valibot)
const AUCTION_MAX_PRICE = 9_999_999_999.99;

export const CreateAuctionSchema = v.pipe(
  v.object({
    title: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(1, "title และรูปภาพอย่างน้อย 1 ใบเป็นข้อมูลบังคับ"),
      v.maxLength(200, "title ยาวเกินไป"),
    ),
    description: v.optional(v.pipe(v.string(), v.maxLength(5000, "description ยาวเกินไป"))),
    images: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1, "title และรูปภาพอย่างน้อย 1 ใบเป็นข้อมูลบังคับ"),
    ),
    category: v.optional(v.pipe(v.string(), v.maxLength(50, "หมวดหมู่ยาวเกินไป"))),
    productId: v.optional(v.string()),
    startPrice: v.pipe(
      v.number(),
      v.gtValue(0, "startPrice ต้องมากกว่า 0"),
      v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
    ),
    reservePrice: v.optional(
      v.pipe(v.number(), v.gtValue(0, "reservePrice ต้องไม่ต่ำกว่า startPrice"), v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด")),
    ),
    buyNowPrice: v.optional(
      v.pipe(
        v.number(),
        v.gtValue(0, "buyNowPrice ต้องสูงกว่า reservePrice หรือ startPrice"),
        v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
      ),
    ),
    expectedPrice: v.optional(
      v.pipe(v.number(), v.gtValue(0, "expectedPrice ต้องมากกว่า 0"), v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด")),
    ),
    bidIncrement: v.pipe(
      v.number(),
      v.gtValue(0, "bidIncrement ต้องมากกว่า 0"),
      v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
    ),
    mode: v.picklist(AUCTION_MODES, "mode ไม่ถูกต้อง"),
    startTime: v.optional(AuctionDateTimeSchema),
    endTime: AuctionDateTimeSchema,
  }),
  v.check(
    (d) => d.reservePrice == null || d.reservePrice >= d.startPrice,
    "reservePrice ต้องไม่ต่ำกว่า startPrice",
  ),
  v.check(
    (d) => d.buyNowPrice == null || d.buyNowPrice > (d.reservePrice ?? d.startPrice),
    "buyNowPrice ต้องสูงกว่า reservePrice หรือ startPrice",
  ),
  v.check(
    (d) => d.endTime.getTime() >= Date.now() + MIN_AUCTION_END_LEAD_MS,
    "endTime ต้องอยู่ในอนาคตอย่างน้อย 30 นาที",
  ),
  // mode==='schedule' → startTime บังคับ (API.md §4.1)
  v.check((d) => d.mode !== "schedule" || d.startTime != null, "startTime ต้องระบุเมื่อเลือกตั้งเวลาเปิดประมูล"),
  // OQ-6: startTime อดีต/ปัจจุบัน → reject 400 ชัดเจน (ไม่ auto-fallback publishNow) + ต้องมาก่อน endTime
  v.check(
    (d) => d.mode !== "schedule" || d.startTime == null || d.startTime.getTime() > Date.now(),
    "startTime ต้องอยู่ในอนาคตและก่อน endTime",
  ),
  v.check(
    (d) => d.mode !== "schedule" || d.startTime == null || d.startTime.getTime() < d.endTime.getTime(),
    "startTime ต้องอยู่ในอนาคตและก่อน endTime",
  ),
);

// แก้ไข auction (TFR-002) — ทุก field optional (partial update); เฉพาะ status draft/scheduled เท่านั้นที่แก้ได้
// (guard ที่ service layer) — price fields (startPrice/reservePrice/buyNowPrice/expectedPrice) แก้ได้ตาม OQ-4
// หมายเหตุ: cross-field check (reservePrice>=startPrice ฯลฯ) ที่ merge กับค่าเดิมใน DB ทำที่ service
// (`updateAuction`) ไม่ใช่ที่ schema นี้ — Valibot รู้แค่ field ที่ส่งมาในคำขอนี้ ไม่รู้ค่าที่ไม่ได้แก้
export const UpdateAuctionSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200, "title ยาวเกินไป"))),
  description: v.optional(v.pipe(v.string(), v.maxLength(5000, "description ยาวเกินไป"))),
  images: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1))),
  category: v.optional(v.pipe(v.string(), v.maxLength(50, "หมวดหมู่ยาวเกินไป"))),
  productId: v.optional(v.string()),
  startPrice: v.optional(
    v.pipe(
      v.number(),
      v.gtValue(0, "startPrice ต้องมากกว่า 0"),
      v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
    ),
  ),
  reservePrice: v.optional(
    v.pipe(v.number(), v.gtValue(0, "reservePrice ต้องไม่ต่ำกว่า startPrice"), v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด")),
  ),
  buyNowPrice: v.optional(
    v.pipe(
      v.number(),
      v.gtValue(0, "buyNowPrice ต้องสูงกว่า reservePrice หรือ startPrice"),
      v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
    ),
  ),
  expectedPrice: v.optional(
    v.pipe(v.number(), v.gtValue(0, "expectedPrice ต้องมากกว่า 0"), v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด")),
  ),
  bidIncrement: v.optional(
    v.pipe(
      v.number(),
      v.gtValue(0, "bidIncrement ต้องมากกว่า 0"),
      v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด"),
    ),
  ),
  endTime: v.optional(
    v.pipe(
      AuctionDateTimeSchema,
      v.check(
        (d) => d.getTime() >= Date.now() + MIN_AUCTION_END_LEAD_MS,
        "endTime ต้องอยู่ในอนาคตอย่างน้อย 30 นาที",
      ),
    ),
  ),
});

// จบประมูลก่อนเวลา (TFR-012) — ต้องส่ง confirmBelowReserve:true ซ้ำเมื่อได้ 409 BELOW_RESERVE_CONFIRM_REQUIRED มาก่อน
export const EndEarlyAuctionSchema = v.object({
  confirmBelowReserve: v.optional(v.boolean()),
});

// feature 00004 Buyer Web Auction — session-authed bid route body { amount }
// (เหมือน AppPlaceBidSchema ของ mobile ใน lib/app-validations.ts แต่แยกไฟล์ตาม convention
// backend validation ของ web routes มาจาก lib/validations.ts เสมอ)
export const PlaceBidSchema = v.object({
  // maxValue กัน Decimal(12,2) overflow (security LOW — defense-in-depth เหมือน CreateAuctionSchema)
  amount: v.pipe(v.number(), v.minValue(0.01), v.maxValue(AUCTION_MAX_PRICE, "ราคาเกินขีดจำกัด")),
});

// ── feature 00008 Business Account & Packages (SRS §9) ───────────────────────
// SSOT: docs/20 - Features/00008 - Business Account & Packages/SRS.md §9

export const SubscribeBusinessPackageSchema = v.object({
  tier: v.picklist(["GROWTH", "PRO", "BUSINESS"]),
});

export const UpgradeBusinessPackageSchema = v.object({
  tier: v.picklist(["GROWTH", "PRO", "BUSINESS"]),
});

export const DowngradeBusinessPackageSchema = v.object({
  tier: v.picklist(["GROWTH", "PRO", "BUSINESS"]),
  keepShopIds: v.array(v.pipe(v.string(), v.uuid())),
});

export const CreateBusinessShopSchema = v.object({
  shopName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  businessType: v.string(),
  category: v.optional(v.string()),
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

export const InviteShopMemberSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  contactType: v.picklist(["PHONE", "EMAIL"]),
});

export const SwitchActiveShopSchema = v.object({
  shopId: v.pipe(v.string(), v.uuid()),
});

// ── feature 00011 Deep Chat (SRS §11) ────────────────────────────────────────
// SSOT: docs/20 - Features/00011 - Deep Chat/SRS.md §11

export const SendChatMessageSchema = v.object({
  type: v.picklist(["TEXT", "IMAGE"]),
  body: v.optional(v.pipe(v.string(), v.maxLength(2000))),
  imageUrl: v.optional(v.pipe(v.string(), v.minLength(1))), // fileId จาก POST /api/upload
});
// ตรวจ conditional-required ที่ route:
//   type='TEXT' → body ต้องมีจริง (minLength 1, ห้ามว่าง — FR-CHAT-04-AC-02)
//   type='IMAGE' → imageUrl ต้องมีจริง; body เป็น caption optional

export const StartConversationSchema = v.object({
  shopId: v.pipe(v.string(), v.uuid()),
});

export const ChatMessagesQuerySchema = v.object({
  cursor: v.optional(v.string()), // ISO datetime ของ createdAt ข้อความเก่าสุดที่เห็น
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 30),
});

export const ChatConversationsQuerySchema = v.object({
  cursor: v.optional(v.string()), // ISO datetime ของ lastMessageAt แถวสุดท้ายที่เห็น
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 20),
});

export const MarkChatReadSchema = v.object({}); // empty body — conversationId มาจาก path param, role derive จาก subdomain/ownership
