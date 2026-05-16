import * as v from "valibot";
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from "@/lib/product-types/registry";

export const SendOtpSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(["phone", "email", "PHONE", "EMAIL"]),
});

export const VerifyOtpSchema = v.object({
  contact: v.pipe(v.string(), v.minLength(1)),
  type: v.picklist(["phone", "email", "PHONE", "EMAIL"]),
  otp: v.pipe(v.string(), v.length(6)),
});

export const CreateShopSchema = v.object({
  shopName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
  category: v.optional(v.pipe(v.string(), v.maxLength(50))),
  address: v.optional(v.pipe(v.string(), v.maxLength(200))),
  businessType: v.picklist(["INDIVIDUAL", "COMPANY"]),
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
});

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
