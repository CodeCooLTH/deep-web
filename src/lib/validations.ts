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
import {
  SHOP_VERTICAL_KEYS,
  CANCEL_REASON_KEYS,
  ROOM_FACILITY_KEYS,
  MAX_ROOM_IMAGES,
  MAX_ROOM_NAME_LENGTH,
  MAX_ROOM_DESCRIPTION_LENGTH,
  MAX_ROOM_GUESTS,
} from "@/lib/lodging";
import { isStrongPassword } from "@/lib/password";
import { isValidSlugFormat } from "@/lib/shop-slug";
import { EXPENSE_CATEGORIES } from "@/lib/expense";

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
  // cost — Expense & Cost Tracking (feature 00016): undefined=ไม่แตะ, null=ล้างค่า, ≥0=ตั้งค่า (min 0 ไม่ใช่ 0.01 เหมือน price — cost อนุญาต ฿0)
  cost: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
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
  // cost — Expense & Cost Tracking (feature 00016): undefined=ไม่แตะ, null=ล้างค่า, ≥0=ตั้งค่า (min 0 ไม่ใช่ 0.01 เหมือน price — cost อนุญาต ฿0)
  cost: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
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
  // buyerContact — feature 00015 (Order Claim & Forced Login) TFR-009: บังคับเป็นเบอร์โทรไทย
  // (ไม่รับอีเมล/optional อีกต่อไป) เพราะ resolveOrderAccess ต้องมีเบอร์แน่นอนเพื่อ match กับ session.phone
  buyerContact: v.pipe(
    v.string(),
    v.regex(/^0[0-9]{9}$/, "buyerContact ต้องเป็นเบอร์โทรไทย 10 หลัก ขึ้นต้นด้วย 0"),
  ),
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
  // feature 00018 (user 2026-07-24): สร้างจากเธรดแชท → ผูก ExternalContact กับ Customer ทันที
  // ownership ตรวจซ้ำที่ service (WHERE {id, shopId}) — client ปลอม id ร้านอื่นมาก็ผูกไม่ได้
  conversationId: v.optional(v.pipe(v.string(), v.uuid())),
});

// ClaimOrderSchema — feature 00015 (Order Claim & Forced Login) API.md §4.3
// body ของ POST /api/orders/[token]/claim — เบอร์ resolve จาก session เอง
// ไม่รับจาก client เลย (แค่ otp 6 หลัก)
export const ClaimOrderSchema = v.object({
  otp: v.pipe(v.string(), v.length(6)),
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
  // feature 00017 — ประเภทกิจการ; optional เพื่อ backward-compat (ผู้เรียกเดิมไม่ส่ง = GENERAL)
  // ตั้งได้ครั้งเดียวตอนสร้างเท่านั้น เปลี่ยนภายหลังไม่ได้ (BR-LODG-30)
  vertical: v.optional(v.picklist(SHOP_VERTICAL_KEYS)),
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
  // ORDER = การ์ดออเดอร์/ใบเสนอราคาในแชท DEEP (user 2026-07-24) — อ้าง Order.publicToken
  type: v.picklist(["TEXT", "IMAGE", "PRODUCT", "ORDER"]),
  // nullish ไม่ใช่ optional — client ส่ง `body: null` มาจริงเมื่อแนบรูปโดยไม่ใส่ caption
  // (useSellerChatThread.handleSend + payload ที่เก็บไว้สำหรับปุ่ม "ลองใหม่") ซึ่ง v.optional รับแค่
  // undefined → เด้ง "Invalid type: Expected string but received null" = **ส่งรูปอย่างเดียวไม่ได้เลย**
  // (bug prod 2026-07-23) route เช็ค conditional-required ต่ออยู่แล้ว null จึงปลอดภัย
  body: v.nullish(v.pipe(v.string(), v.maxLength(2000))),
  imageUrl: v.nullish(v.pipe(v.string(), v.minLength(1))), // fileId จาก POST /api/upload
  productRefId: v.optional(v.pipe(v.string(), v.uuid())), // extension #1 Chat Product Context Card — เฉพาะ type=PRODUCT (FR-CTX-05)
  orderRefToken: v.optional(v.pipe(v.string(), v.uuid())), // การ์ดออเดอร์ในแชท — เฉพาะ type=ORDER (Order.publicToken)
  replyToMessageId: v.optional(v.pipe(v.string(), v.uuid())), // reply/quote (user 2026-07-25) — id ของข้อความที่ตอบทับ (route resolve → replyToMid/Meta reply_to)
});
// ตรวจ conditional-required ที่ route:
//   type='TEXT' → body ต้องมีจริง (minLength 1, ห้ามว่าง — FR-CHAT-04-AC-02)
//   type='IMAGE' → imageUrl ต้องมีจริง; body เป็น caption optional
//   type='PRODUCT' → productRefId ต้องมีจริง (S-17 verify Product.shopId===conversation.shopId + idempotent-guard)

export const StartConversationSchema = v.object({
  shopId: v.pipe(v.string(), v.uuid()),
});

export const ChatMessagesQuerySchema = v.object({
  cursor: v.optional(v.string()), // ISO datetime ของ createdAt ข้อความเก่าสุดที่เห็น
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 30),
});

// T1 (feature 00018): filter/ค้นหา ฝั่ง seller inbox — channel/shopChannelId/q เป็น optional ทั้งหมด
// (buyer surface ไม่ใช้ field พวกนี้ — route derive role จาก subdomain แล้วไม่ส่งต่อให้ buyer branch)
export const ChatConversationsQuerySchema = v.object({
  cursor: v.optional(v.string()), // ISO datetime ของ lastMessageAt แถวสุดท้ายที่เห็น
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 20),
  channel: v.optional(v.picklist(['DEEP', 'MESSENGER', 'INSTAGRAM'])),
  shopChannelId: v.optional(v.pipe(v.string(), v.uuid())),
  q: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  // S-7 (ตัวกรองแชท) — seller เท่านั้น (buyer branch ไม่ใช้). hidden แปลงเป็น boolean ที่ route แล้ว
  status: v.optional(v.picklist(['open', 'resolved', 'all'])),
  customerLinked: v.optional(v.picklist(['all', 'linked', 'unlinked'])),
  hidden: v.optional(v.boolean()),
  // feature 00018: แท็บกลุ่ม + อ่านแล้ว/ยังไม่อ่าน
  chatGroupId: v.optional(v.pipe(v.string(), v.uuid())),
  readState: v.optional(v.picklist(['unread', 'read'])),
  spam: v.optional(v.boolean()), // feature 00018: true = ดูเฉพาะสแปม (user สั่ง 2026-07-24)
});

export const MarkChatReadSchema = v.object({}); // empty body — conversationId มาจาก path param, role derive จาก subdomain/ownership

// S-7 (ตัวกรองแชท + ปักหมุด/ซ่อน/ปิดงาน) + set-group (ย้ายเข้ากลุ่ม feature 00018):
// body ของ PATCH /api/chat/conversations/{id}
// action='set-group' → ใช้ chatGroupId (string=ย้ายเข้ากลุ่มนั้น, null=เอาออก); action อื่นไม่ต้องมี chatGroupId
export const ConversationPatchSchema = v.object({
  action: v.picklist(["pin", "unpin", "hide", "unhide", "resolve", "reopen", "spam", "unspam", "set-group"]),
  chatGroupId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
});

// ── feature 00018: กลุ่ม/แท็บจัดหมวดแชท (ChatGroup) ──────
export const ChatGroupCreateSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "กรุณาระบุชื่อกลุ่ม"), v.maxLength(40, "ชื่อกลุ่มยาวเกินไป")),
});
export const ChatGroupRenameSchema = ChatGroupCreateSchema;

// ── feature 00018 composer #2 Quick Messages (ข้อความสำเร็จรูป ระดับร้าน) ──────
// create/update ใช้ shape เดียวกัน (update = full replace). cross-field: ต้องมี body หรือ
// imageFileId อย่างน้อยหนึ่ง (quick message รองรับ message + image — อย่างน้อยต้องมีอะไรส่ง)
// QUICK_MESSAGE_MAX_IMAGES — user เลือก 5 รูป (2026-07-23): พอสำหรับชุดรีวิว/หลายมุมสินค้า โดยไม่หนัก
// ตอนส่ง เพราะช่องทางนอกส่งได้ทีละรูป (Messenger ไม่รองรับหลายรูปในข้อความเดียว) = 5 request/ครั้ง
export const QUICK_MESSAGE_MAX_IMAGES = 5;

const quickMessageObject = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1, "กรุณากรอกหัวข้อ"), v.maxLength(80)),
  category: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(40)))),
  body: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
  // deprecated — คงไว้รับ payload เก่า; ตัวจริงคือ imageFileIds (route รวมสองอันให้เป็นอาร์เรย์เดียว)
  imageFileId: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
  imageFileIds: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
      v.maxLength(QUICK_MESSAGE_MAX_IMAGES, `แนบรูปได้สูงสุด ${QUICK_MESSAGE_MAX_IMAGES} รูป`),
    ),
  ),
});
export const QuickMessageCreateSchema = v.pipe(
  quickMessageObject,
  v.check(
    (o) => (o.body?.trim().length ?? 0) > 0 || !!o.imageFileId || (o.imageFileIds?.length ?? 0) > 0,
    "ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง",
  ),
);
export const QuickMessageUpdateSchema = QuickMessageCreateSchema;

// ── feature 00018 CRM/tag ต่อผู้ติดต่อ ─────────────────────────────────────────
// PATCH partial — ทุกฟิลด์ optional (omit = ไม่แตะ). alias→Conversation, ที่เหลือ→ExternalContact
export const ChatCrmPatchSchema = v.object({
  alias: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(80)))),
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000)))),
  address: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
  salesStatus: v.optional(v.picklist(["UNSPECIFIED", "INTERESTED", "NOT_INTERESTED"])),
  tags: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(30)))),
  phones: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20)))),
});

// ── feature 00013 Pin Products (SRS §4 / API §4.3) ───────────────────────────
// body ของ POST /api/seller/pin-slots/buy — ซื้อ slot ฿99 + ปักหมุด productId ในธุรกรรมเดียว
export const BuyPinSlotSchema = v.object({
  productId: v.pipe(v.string(), v.uuid()),
});

// ── feature 00012 Shop Staff Invite Link (Task 2.1) ──────────────────────────
// SSOT: docs/superpowers/plans/2026-07-04-shop-staff-invite-link.md

export const inviteLinkCreateSchema = v.object({
  // omit ได้ — route ใช้ DEFAULT_INVITE_EXPIRY_KEY (@/lib/invite-link) แทนถ้าไม่ส่งมา
  expiryKey: v.optional(v.picklist(["24h", "7d", "30d"])),
});

// ── feature 00016 Expense & Cost Tracking (SDS §4.1 / API.md §4.1/§4.3/§4.5) ─
// SSOT: docs/20 - Features/00016 - Expense & Cost Tracking/{SDS,API}.md

export const CreateExpenseSchema = v.object({
  category: v.picklist(EXPENSE_CATEGORIES),
  amount: v.pipe(v.number(), v.minValue(0.01)),
  expenseDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  note: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

// UpdateExpenseSchema — partial update (ทุก field optional, omit = ไม่แตะ) ตาม API.md §4.3
export const UpdateExpenseSchema = v.object({
  category: v.optional(v.picklist(EXPENSE_CATEGORIES)),
  amount: v.optional(v.pipe(v.number(), v.minValue(0.01))),
  expenseDate: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  note: v.optional(v.pipe(v.string(), v.maxLength(500))),
});

// PnlReportQuerySchema — manual parse (query params ไม่ใช่ JSON body) ตาม API.md §4.5
export const PnlReportQuerySchema = v.object({
  range: v.optional(v.picklist(["today", "7d", "30d", "month", "custom"]), "today"),
  start: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  end: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
});

// ── feature 00017 Lodging Vertical (Phase 1) ─────────────────────────────────
// SSOT: docs/20 - Features/00017 - Lodging Vertical/{BRD,SRS,API}.md

// เงินส่งมาเป็น string (เลี่ยง float) แล้วแปลงเป็น Prisma.Decimal ที่ service layer
// ให้ตรงกับชนิด Decimal(12,2) ของ Order.totalAmount / Product.price เดิม
const DecimalString = v.pipe(
  v.string(),
  v.regex(/^\d{1,10}(\.\d{1,2})?$/, "รูปแบบตัวเลขไม่ถูกต้อง"),
);

// pricePerNight ต้อง > 0 (BR-LODG-05) — เทียบเป็นตัวเลขหลัง regex ผ่านแล้ว
const PositiveDecimalString = v.pipe(
  DecimalString,
  v.check((s) => Number(s) > 0, "ราคาต่อคืนต้องมากกว่า 0"),
);

const RoomBaseFields = {
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ROOM_NAME_LENGTH)),
  description: v.optional(v.pipe(v.string(), v.maxLength(MAX_ROOM_DESCRIPTION_LENGTH))),
  // images = fileId จาก POST /api/upload (ไม่ใช่ URL ตรง) เรียงตามลำดับแสดงผล ตัวแรก = รูปหลัก
  images: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))), v.maxLength(MAX_ROOM_IMAGES)),
  ),
  pricePerNight: PositiveDecimalString,
  maxGuests: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_ROOM_GUESTS))),
  facilities: v.optional(v.array(v.picklist(ROOM_FACILITY_KEYS))),
  depositMode: v.optional(v.picklist(["FIXED", "PERCENT"])),
  depositValue: v.optional(DecimalString),
};

export const CreateRoomSchema = v.object(RoomBaseFields);

// PATCH — ทุก field optional; isActive แก้ได้ (ปิดการใช้งานห้อง BR-LODG-07)
// ไม่มี shopId ให้แก้ (ห้ามย้ายห้องข้ามร้าน) และไม่มี id
export const UpdateRoomSchema = v.object({
  name: v.optional(RoomBaseFields.name),
  description: RoomBaseFields.description,
  images: RoomBaseFields.images,
  pricePerNight: v.optional(PositiveDecimalString),
  maxGuests: RoomBaseFields.maxGuests,
  facilities: RoomBaseFields.facilities,
  depositMode: RoomBaseFields.depositMode,
  depositValue: RoomBaseFields.depositValue,
  isActive: v.optional(v.boolean()),
});

// ── feature 00017 Lodging Vertical (Phase 2 — การจอง) ────────────────────────

// วันที่ส่งเป็น 'YYYY-MM-DD' (วันล้วน) ไม่ใช่ ISO datetime เต็ม —
// การเข้าพักคิดเป็นวัน การส่ง datetime ทำให้เกิดปัญหาเลื่อนวันข้าม timezone
const DateOnlyString = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ต้องเป็น YYYY-MM-DD"),
);

export const BookingQuoteSchema = v.object({
  roomId: v.pipe(v.string(), v.uuid()),
  checkIn: DateOnlyString,
  checkOut: DateOnlyString,
});

export const CreateBookingSchema = v.object({
  roomId: v.pipe(v.string(), v.uuid()),
  checkIn: DateOnlyString,
  checkOut: DateOnlyString,
  guestName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  // required เสมอ — ต้องผูก Customer เพื่อเก็บสถิติผู้จอง (D-09) และเพื่อให้
  // ผู้จองเข้าถึงการจองผ่าน Access Gate ของ feature 00015 ได้
  guestPhone: v.pipe(v.string(), v.minLength(9), v.maxLength(20)),
  depositAmount: v.optional(DecimalString),
  internalNote: v.optional(v.pipe(v.string(), v.maxLength(1000))),
});

// PATCH — แก้มัดจำหรือช่วงวัน (ก่อนผู้จองแนบสลิปเท่านั้น)
export const UpdateBookingSchema = v.object({
  depositAmount: v.optional(DecimalString),
  checkIn: v.optional(DateOnlyString),
  checkOut: v.optional(DateOnlyString),
});

export const AvailabilityQuerySchema = v.object({
  from: DateOnlyString,
  to: DateOnlyString,
  roomId: v.optional(v.pipe(v.string(), v.uuid())),
});

// body ของ POST /api/orders/[token]/cancel — reason บังคับเมื่อเจ้าของยกเลิกการจอง
// (ตรวจเงื่อนไข "บังคับเมื่อไหร่" ที่ service เพราะต้องรู้ type/initiator ก่อน)
export const CancelOrderSchema = v.object({
  reason: v.optional(v.picklist(CANCEL_REASON_KEYS)),
});

// ── feature 00017 Lodging Vertical (Phase 3 — แม่บ้าน) ───────────────────────
export const CreateHousekeeperSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  phone: v.pipe(v.string(), v.minLength(9), v.maxLength(20)),
});

export const UpdateHousekeeperSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(100))),
  phone: v.optional(v.pipe(v.string(), v.minLength(9), v.maxLength(20))),
  isActive: v.optional(v.boolean()),
});

// มอบหมายแม่บ้าน — housekeeperId เป็น null ได้ (ยกเลิกมอบหมาย)
export const AssignHousekeeperSchema = v.object({
  housekeeperId: v.nullable(v.pipe(v.string(), v.uuid())),
});

export const SetHousekeepingStatusSchema = v.object({
  status: v.picklist(["PENDING", "DONE"]),
});

// ── feature 00019 AI Reply Assistant ─────────────────────────────────────────
// body ของ PUT /api/shops/ai-settings — full replace ไม่ใช่ partial patch (API.md §4.2)
// instruction ≤2000 ตัวอักษร (BR-AI-03) ส่งค่าว่างเพื่อล้างคำสั่งได้
export const ShopAiSettingSchema = v.object({
  instruction: v.pipe(v.string(), v.maxLength(2000, "คำสั่งประจำร้านต้องไม่เกิน 2,000 ตัวอักษร")),
  includeProductContext: v.boolean(),
  includeCustomerContext: v.boolean(),
  // feature 00019 ext (user 2026-07-24): ให้ AI อ่านรูป/ฟังข้อความเสียงในแชท
  // optional + default true — client เวอร์ชันเก่าที่ยังไม่ส่ง field นี้ต้องบันทึกได้ (ไม่ 400)
  includeMediaContext: v.optional(v.boolean(), true),
});

// ── feature 00018 — ยืนยันเลือกเพจที่จะเชื่อม (POST /api/channels/facebook/confirm) ──────
// pageIds: เพจที่ user ติ๊กเลือกในหน้า /settings/channels/select
// forceIds: subset ของ pageIds ที่ user "ยืนยันย้ายข้ามร้าน" ทีละเพจ (ไม่ใช่ทั้งชุด) — route ตรวจ
//   ต่อว่าเป็น subset จริง และตรวจว่าทุก id อยู่ในเพจที่ token นี้จัดการได้ (authorization ที่ Meta)
// id เพจของ Meta เป็นตัวเลขล้วนความยาวไม่แน่นอน — ไม่ใช่ uuid จึงตรวจแค่ string ไม่ว่าง + จำกัดจำนวน
export const ConfirmChannelPagesSchema = v.object({
  pageIds: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
    v.minLength(1, "กรุณาเลือกอย่างน้อย 1 เพจ"),
    v.maxLength(50),
  ),
  forceIds: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(64))), v.maxLength(50))),
});

// ── feature 00022 — iShip Shipping Integration ───────────────────────────────

// token ที่ร้านคัดลอกมาจากหลังบ้าน iShip. ตัวอย่างจริงยาว ~100 ตัว แต่ผู้ให้บริการ
// ไม่ประกาศความยาวตายตัว จึงกำหนดช่วงกว้างพอที่จะไม่ปฏิเสธของจริง แต่ยังกันการวางผิดช่อง
// ห้ามมีช่องว่างภายใน — เคสจริงที่เจอบ่อยคือ copy ติดขึ้นบรรทัดใหม่มาด้วย
export const IShipConnectSchema = v.object({
  token: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(20, "Token สั้นเกินไป กรุณาตรวจว่าคัดลอกมาครบ"),
    v.maxLength(500, "Token ยาวเกินกว่าที่ระบบรองรับ"),
    v.regex(/^\S+$/, "Token ต้องไม่มีช่องว่าง กรุณาคัดลอกใหม่"),
  ),
});

const thaiPostcode = v.pipe(v.string(), v.regex(/^[0-9]{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"));
const shortText = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

// ค่าตั้งต้นของร้าน — nullable ทุกช่อง เพราะร้านทยอยกรอกได้ ความครบถ้วนบังคับตอน
// "จะเปิดพัสดุ" ไม่ใช่ตอนบันทึกฟอร์ม (BR-ISHIP-30 บังคับที่ service ไม่ใช่ที่ schema)
// senderSubdistrict = ตำบล/แขวง, senderDistrict = อำเภอ/เขต — ดู BR-ISHIP-31
export const IShipSettingsSchema = v.object({
  senderName: v.nullish(shortText(120)),
  senderPhone: v.nullish(v.pipe(v.string(), v.regex(/^0[0-9]{9}$/, "เบอร์โทรไม่ถูกต้อง"))),
  senderAddress: v.nullish(shortText(255)),
  senderSubdistrict: v.nullish(shortText(100)),
  senderDistrict: v.nullish(shortText(100)),
  senderProvince: v.nullish(shortText(100)),
  senderPostcode: v.nullish(thaiPostcode),
  defaultCourierCode: v.nullish(shortText(50)),
  defaultWeight: v.nullish(v.pipe(v.number(), v.minValue(0.01), v.maxValue(100))),
  defaultWidth: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
  defaultLength: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
  defaultHeight: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
  // หมวดพัสดุตามที่ iShip กำหนด (0-11 และ 99) — ไม่ใช่ช่วงต่อเนื่อง จึงใช้ picklist
  defaultCategoryId: v.nullish(v.picklist([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 99])),
  defaultCodEnabled: v.optional(v.boolean()),
  optOnTime: v.optional(v.boolean()),
  optBoxShield: v.optional(v.boolean()),
  optIsInsured: v.optional(v.boolean()),
  optProductValue: v.nullish(v.pipe(v.number(), v.minValue(1))),
  optServiceType: v.nullish(v.picklist([1, 2])),
  defaultRemark: v.nullish(shortText(255)),
  createMode: v.optional(v.picklist(["AUTO", "ASK", "OFF"])),
});

// override รายออเดอร์ — ทุก field optional เพราะไม่ส่งมา = ใช้ค่าตั้งต้นของร้าน
export const IShipCreateShipmentSchema = v.object({
  orderId: v.pipe(v.string(), v.uuid()),
  /** ข้อมูลผู้รับที่ร้านกรอกเพิ่มตอนสร้าง — จะถูกเขียนกลับเข้าออเดอร์ก่อนเปิดพัสดุ */
  receiver: v.optional(
    v.object({
      name: v.nullish(shortText(120)),
      phone: v.nullish(v.pipe(v.string(), v.regex(/^0[0-9]{9}$/, "เบอร์โทรผู้รับไม่ถูกต้อง"))),
      line1: v.nullish(shortText(255)),
      subdistrict: v.nullish(shortText(100)),
      district: v.nullish(shortText(100)),
      province: v.nullish(shortText(100)),
      postcode: v.nullish(thaiPostcode),
      note: v.nullish(shortText(255)),
    }),
  ),
  override: v.optional(
    v.object({
      courierCode: v.optional(shortText(50)),
      weight: v.optional(v.pipe(v.number(), v.minValue(0.01), v.maxValue(100))),
      width: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
      length: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
      height: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300))),
      categoryId: v.optional(v.picklist([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 99])),
      codAmount: v.optional(v.pipe(v.number(), v.minValue(0))),
      remark: v.nullish(shortText(255)),
      options: v.optional(
        v.object({
          onTime: v.optional(v.boolean()),
          boxShield: v.optional(v.boolean()),
          isInsured: v.optional(v.boolean()),
          productValue: v.nullish(v.pipe(v.number(), v.minValue(1))),
          serviceType: v.nullish(v.picklist([1, 2])),
        }),
      ),
    }),
  ),
});

// ข้อมูลผู้รับที่ร้านกรอกเพิ่ม ณ ตอนกดสร้างพัสดุ (user feedback 2026-07-26)
// ทุกช่อง optional — ส่งมาเฉพาะช่องที่กรอก ช่องที่ไม่ส่งจะคงค่าเดิมในออเดอร์ไว้
// subdistrict = ตำบล/แขวง, district = อำเภอ/เขต (BR-ISHIP-31 — คนละความหมายกับของ iShip)
export const IShipReceiverPatchSchema = v.object({
  name: v.nullish(shortText(120)),
  phone: v.nullish(v.pipe(v.string(), v.regex(/^0[0-9]{9}$/, "เบอร์โทรผู้รับไม่ถูกต้อง"))),
  line1: v.nullish(shortText(255)),
  subdistrict: v.nullish(shortText(100)),
  district: v.nullish(shortText(100)),
  province: v.nullish(shortText(100)),
  postcode: v.nullish(thaiPostcode),
  note: v.nullish(shortText(255)),
});

// พิมพ์หลายใบ — เพดาน 50 ใบต่อครั้ง (เกินแล้วต้องบอกจำนวนสูงสุด ไม่ใช่ตัดทิ้งเงียบ FR-ISHIP-031)
export const IShipBulkLabelSchema = v.object({
  shipmentIds: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.uuid())),
      v.minLength(1, "กรุณาเลือกอย่างน้อย 1 รายการ"),
      v.maxLength(50, "พิมพ์ได้สูงสุดครั้งละ 50 ใบ"),
    ),
  ),
  // orderTokens: ทางเลือกสำหรับหน้ารายการคำสั่งซื้อ ซึ่งรู้จักแค่ publicToken/shortCode
  // ไม่รู้จัก id ของพัสดุ — เซิร์ฟเวอร์แปลงให้เอง (ดู getLabelPdfForOrders)
  orderTokens: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(4), v.maxLength(64))),
      v.minLength(1, "กรุณาเลือกอย่างน้อย 1 รายการ"),
      v.maxLength(50, "พิมพ์ได้สูงสุดครั้งละ 50 ใบ"),
    ),
  ),
});

export const IShipPickupSchema = v.object({
  courierCode: shortText(50),
  parcelCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  remark: v.nullish(shortText(255)),
});
