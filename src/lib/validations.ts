import * as v from "valibot";
import { UPLOAD_PURPOSES } from "@/lib/upload-policy";
import {
  PRODUCT_TYPE_IDS,
  FULFILLMENT_MODES,
  BILLING_MODES,
  BILLING_PERIODS,
} from "@/lib/product-types/registry";
// isHttpUrl — ใช้ logic เดียวกับ render layer (S-10) เพื่อ validate accessUrl (S-3)
import { isHttpUrl } from "@/lib/order-display";
import { SHOP_CATEGORY_KEYS } from "@/lib/shop-categories";
import { CHAT_CHANNELS } from "@/lib/chat-channel";
import { LOCALES } from "@/i18n/locales";
import {
  APPOINTMENT_CLOSING_MAX,
  HIDEABLE_APPOINTMENT_SUMMARY_KEYS,
} from "@/lib/appointment-summary";
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
import { PROFILE_TAB_KEYS } from "@/lib/profile-tab-keys";
import { isValidSlugFormat } from "@/lib/shop-slug";
import { EXPENSE_CATEGORIES } from "@/lib/expense";
import { orderDateRejectReason, ORDER_DATE_OUT_OF_WINDOW_MESSAGE } from "./order-date-window";

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
// feature 00028 (SDS §3.3 task #16) — เพิ่ม vertical (optional): ตั้ง/เปลี่ยนประเภทร้านค้าได้เฉพาะ
// ระหว่าง onboarding เท่านั้น (route handler เช็ค Shop.slug===null ก่อน — TD-002)
export const ShopUpdateWithGeoSchema = v.object({
  category: v.optional(ShopCategorySchema),
  address: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500))),
  latitude: v.optional(v.pipe(v.number(), v.minValue(5), v.maxValue(21))),
  longitude: v.optional(v.pipe(v.number(), v.minValue(97), v.maxValue(106))),
  vertical: v.optional(v.picklist(SHOP_VERTICAL_KEYS)),
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

// UpdateProfileSchema — allow-list ของ PATCH /api/users/me
//
// สำคัญ — เหตุผลที่ต้องเป็น allow-list ไม่ใช่แค่ type: เดิม route ส่ง body ดิบเข้า
// prisma.user.update({ data }) ตรง ๆ โดยไม่ parse — TS type บน updateProfile() กรองอะไรไม่ได้ตอน
// runtime → user ที่ล็อกอินคนไหนก็ได้ยิง {"isAdmin":true} แล้วยกระดับตัวเองเป็นแอดมินระบบ
// (รวมถึงเซ็ต trustScore/passwordHash/phone ทับกฎ phone-immutable). ห้ามเปลี่ยนกลับไปรับ body ดิบ
// และห้ามเพิ่ม field ที่ user ไม่ควรตั้งเองเข้ามาใน schema นี้
//
// ทุก field เป็น optional = partial update (caller ส่งมาเฉพาะที่แก้) — ดูรูปแบบที่ caller ใช้จริงที่
// (marketing)/m/settings/profile/AvatarEditable.tsx (avatar) และ .../settings/profile/ProfileForm.tsx (displayName)
export const UpdateProfileSchema = v.object({
  displayName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
  // regex เดียวกับ /api/account/shop-info (SSOT ของรูปแบบ username ทั้งระบบ)
  username: v.optional(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.regex(/^[a-z0-9_]{3,30}$/))),
  // avatar: path ของไฟล์ที่อัปโหลดเอง (/api/files/{fileId}) หรือ https URL (รูปจาก FB/LINE ที่
  // auth.ts เซ็ตไว้). null = ลบรูป. จำกัดไว้แค่ 2 รูปแบบนี้เพื่อกัน javascript:/data: หลุดเข้า src
  avatar: v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.maxLength(2048),
        v.regex(/^(\/api\/files\/|https:\/\/)/, "รูปแบบรูปโปรไฟล์ไม่ถูกต้อง"),
      ),
    ),
  ),
  // chatScopeMode (feature 00037) — มุมมองกล่องข้อความของผู้ใช้เอง เข้าเกณฑ์ allow-list นี้ได้
  // เพราะเป็นค่าที่ "ผู้ใช้ตั้งเองได้จริง" ไม่ใช่สิทธิ์/คะแนน/ตัวตน (ต่างจาก isAdmin/trustScore/phone
  // ที่ห้ามเข้ามาเด็ดขาด ดู comment หัว schema) — picklist กันค่าประหลาดตั้งแต่ขาเขียน ส่วนขาอ่าน
  // ยังมี normalizeChatScopeMode ป้องกันซ้ำอีกชั้น (แถวเก่า/แถวที่ถูกแก้จากที่อื่น)
  chatScopeMode: v.optional(v.picklist(["SINGLE", "UNIFIED"])),
  // locale (feature 00047) — ภาษาของหน้าจอของผู้ใช้เอง เข้าเกณฑ์ allow-list นี้ด้วยเหตุผล
  // เดียวกับ chatScopeMode เป๊ะ: เป็นค่าที่ "ผู้ใช้ตั้งเองได้จริง" ไม่ใช่สิทธิ์/คะแนน/ตัวตน
  //
  // ใช้ LOCALES จาก @/i18n/locales เป็น SSOT ไม่ pin รายชื่อค่าซ้ำที่นี่ — วันที่เพิ่มภาษาที่สาม
  // จะได้ไม่มีจุดที่ลืมแก้ (คอลัมน์ใน DB ไม่มี CHECK constraint โดยตั้งใจ ด่านขาเขียนคือบรรทัดนี้)
  // ขาอ่านยังมี toLocale() กันซ้ำอีกชั้น (แถวเก่า/แถวที่ถูกแก้จากที่อื่น)
  locale: v.optional(v.picklist(LOCALES)),
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
  // ราคาทุน (feature 00016 ส่วนขยาย 2026-08-07) — optional โดยตั้งใจ:
  // ไม่ส่ง key = "ไม่แตะค่าเดิม" · ส่ง 0 = "ตั้งเป็นศูนย์บาทจริง" สองอย่างนี้ต่างกันสิ้นเชิง
  // client จึงห้ามแปลง cell ว่างเป็น 0 (ไม่งั้น export→import โดยไม่แก้อะไร = ล้างต้นทุนทั้งร้าน)
  //
  // ค่าติดลบตกที่นี่ = 400 ทั้งไฟล์ ไม่ใช่ error รายแถว — จงใจให้เหมือน stockQty ที่อยู่บรรทัดบน:
  // ตัวเลขที่ผิดรูปคือ "ไฟล์ผิด" ส่วน error รายแถว (PRODUCT_NOT_FOUND/NOT_PHYSICAL/
  // CONCURRENT_MODIFICATION) สงวนไว้ให้เงื่อนไขทางธุรกิจที่รู้ได้ตอนแตะ DB เท่านั้น
  // การมีสองกฎในโมดัลเดียวกันสับสนกว่า และการปฏิเสธทั้งไฟล์ทำให้ร้านรู้แน่ว่าสถานะยังไม่เปลี่ยน
  cost: v.optional(v.pipe(v.number(), v.minValue(0, "ราคาทุนต้องไม่ต่ำกว่า 0"))),
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

// เวลาส่งเป็น ISO-8601 ที่มี offset เสมอ — การไม่มี offset ทำให้ตีความเวลาเพี้ยนข้ามเขตเวลา
// [สำคัญ] ต้องประกาศ *เหนือ* schema ทุกตัวที่ใช้มัน: const ไม่ hoist และ v.object() ประเมิน
// ตอนโหลดโมดูล — วางไว้ท้ายไฟล์เมื่อไหร่ ทั้งแอปจะล่มด้วย TDZ ReferenceError ตอน import
// ผู้ใช้: CreateOrderSchema.createdAt (00033), OrderAppointmentSchema.start/end (00024)
const IsoDateTimeWithOffset = v.pipe(
  v.string(),
  v.regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    "ต้องเป็นเวลารูปแบบ ISO-8601 พร้อมเขตเวลา",
  ),
)

export const CreateOrderSchema = v.object({
  items: v.pipe(
    v.array(v.object({
      productId: v.optional(v.pipe(v.string(), v.uuid())),
      name: v.pipe(v.string(), v.minLength(1)),
      description: v.optional(v.string()),
      qty: v.pipe(v.number(), v.integer(), v.minValue(1)),
      // ราคา ฿0 บันทึกได้ (user 2026-08-10) — ร้านคิวงานจองไว้ก่อนโดยยังไม่เก็บเงิน/ไม่เก็บมัดจำ
      // และร้านขายของก็มีบรรทัด "ของแถม" จริง. ห้ามกลับไปเป็น minValue(0.01):
      // "ยังไม่คิดเงิน" กับ "กรอกราคาไม่ครบ" เป็นคนละเรื่อง — อย่างหลังกันด้วย typeError ที่ฟอร์ม
      // (ช่องว่าง = NaN ไม่ใช่ 0) ไม่ใช่ด้วยเพดานล่างของราคา. ติดลบยังห้ามเหมือนเดิม
      price: v.pipe(v.number(), v.minValue(0, "ราคาต้องไม่ติดลบ")),
      // ราคาทุนรายบรรทัด (FR-EXP-17) — optional เสมอ ห้ามบล็อกการบันทึกออเดอร์ (D-EXT-4)
      // ไม่ส่ง key = พฤติกรรมเดิม (fallback Product.cost) · ส่ง 0 = ต้นทุนศูนย์บาทจริง
      cost: v.optional(v.pipe(v.number(), v.minValue(0, "ราคาทุนต้องไม่ต่ำกว่า 0"))),
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
  /**
   * feature 00033 — วันที่/เวลาที่ลูกค้าสั่ง (ไม่ใช่เวลาที่คีย์เข้าระบบ)
   *
   * ไม่ส่งมา = เส้นทางเดิมทุกประการ Order.createdAt ได้ @default(now()) เหมือนเดิม
   * ด่านนี้เป็นด่านแรก — service ตรวจซ้ำอีกชั้นเสมอ (client ปลอม body ข้ามด่านนี้ไม่ได้
   * แต่ caller ฝั่ง server ที่เรียก createOrder ตรง ๆ ไม่ผ่าน schema นี้)
   */
  createdAt: v.optional(
    v.pipe(
      IsoDateTimeWithOffset,
      v.check(
        (iso) => orderDateRejectReason(new Date(iso).getTime(), Date.now()) === null,
        ORDER_DATE_OUT_OF_WINDOW_MESSAGE,
      ),
    ),
  ),
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

// AttachSlipSchema — body ของ POST /api/orders/[token]/slip (ทางหลักตั้งแต่ 2026-08-10)
// fileId มาจาก direct upload (`@/lib/upload-client` → /api/uploads/commit) ไม่ใช่ไฟล์ใน body
// เพราะ body ของ function ตันที่ 4.5MB ของ Vercel — สลิปจากมือถือเกินได้ง่าย
// (ดู docs/conventions/upload-body-size-limit.md); รูปแบบเดียวกับ CreateTopUpRequestSchema.slipFileId
export const AttachSlipSchema = v.object({
  fileId: v.pipe(v.string(), v.minLength(1, "กรุณาแนบไฟล์สลิป"), v.maxLength(200)),
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
  // category (ช่องเดียว) = LEGACY คงไว้เพื่อ backward-compat ของผู้เรียกเดิม
  category: v.optional(v.string()),
  // categories = SSOT จริงของหมวดร้าน (Shop.categories String[] ≤5, feature 00001)
  // เพิ่มรับที่นี่ 2026-08-04 — เดิม API สร้างธุรกิจรับได้แต่ช่องเดียว ทั้งที่ฐานเก็บได้หลายหมวด
  categories: v.optional(v.pipe(v.array(v.picklist(SHOP_CATEGORY_KEYS)), v.maxLength(5))),
  description: v.optional(v.pipe(v.string(), v.maxLength(500))),
  // feature 00030 — ย้ายของที่เคยอยู่ใน /business/[shopId]/onboarding เข้ามาสร้างทีเดียว
  // (user 2026-08-05: onboarding ซ้ำซ้อนกับ modal) สร้างครบใน transaction เดียว ไม่มีร้านครึ่ง ๆ
  logo: v.optional(v.pipe(v.string(), v.maxLength(200))),
  slug: v.optional(ShopSlugSchema),
  address: v.optional(v.pipe(v.string(), v.maxLength(300))),
  // พิกัดไทย: lat 5-21N / lng 97-106E (validate ที่ app layer ตาม schema.prisma:147-148)
  latitude: v.optional(v.pipe(v.number(), v.minValue(5), v.maxValue(21))),
  longitude: v.optional(v.pipe(v.number(), v.minValue(97), v.maxValue(106))),
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
  // VIDEO/AUDIO/FILE (2026-08-02 multi-attachment): ร้านแนบไฟล์ทุกชนิดได้ ไม่ใช่แค่รูป
  // เดิม 3 ชนิดนี้เกิดได้ทางเดียวคือ mirror ขาเข้าจาก Messenger/IG (เขียน DB ตรง ไม่ผ่าน schema นี้)
  // STICKER (2026-08-04): ไม่ใช่ไฟล์แนบ — ยิง sticker_id ให้ Meta แล้วฝั่งเราเก็บเป็นแถว IMAGE
  // (ดู sendOutboundMessage) จึงไม่อยู่ในชุด isAttachmentType
  // IMAGE_GRID (2026-08-04): รูปหลายใบในข้อความเดียว (Meta image_grid template) — ส่ง imageFileIds
  // มาแทน imageUrl เดี่ยว; route แบ่งเป็นก้อนละไม่เกิน 6 ใบตามเพดานของ Meta
  // APPOINTMENT (ส่วนขยาย 00024, 2026-08-11): การ์ดสรุปนัดหมาย — 🛑 มีอยู่ **ที่ระดับ API เท่านั้น**
  // ฝั่งฐานข้อมูลยังเก็บเป็น ChatMessage.type='ORDER' + orderRefToken ตัวเดิม ไม่มีค่า enum ใหม่
  // ไม่มี migration (type ใน request = "อยากให้ประกอบอะไร" ส่วน ChatMessage.type = "ของที่เก็บ
  // คือชนิดไหน" — precedent เดียวกับ IMAGE_GRID ซึ่งก็ไม่มีในตาราง)
  type: v.picklist([
    "TEXT",
    "IMAGE",
    "VIDEO",
    "AUDIO",
    "FILE",
    "PRODUCT",
    "ORDER",
    "APPOINTMENT",
    "STICKER",
    "IMAGE_GRID",
  ]),
  // nullish ไม่ใช่ optional — client ส่ง `body: null` มาจริงเมื่อแนบรูปโดยไม่ใส่ caption
  // (useSellerChatThread.handleSend + payload ที่เก็บไว้สำหรับปุ่ม "ลองใหม่") ซึ่ง v.optional รับแค่
  // undefined → เด้ง "Invalid type: Expected string but received null" = **ส่งรูปอย่างเดียวไม่ได้เลย**
  // (bug prod 2026-07-23) route เช็ค conditional-required ต่ออยู่แล้ว null จึงปลอดภัย
  body: v.nullish(v.pipe(v.string(), v.maxLength(2000))),
  imageUrl: v.nullish(v.pipe(v.string(), v.minLength(1))), // fileId จาก POST /api/chat/upload — ใช้กับ IMAGE/VIDEO/AUDIO/FILE
  // ชื่อไฟล์เดิม + ขนาด (2026-08-02) — snapshot ตอนส่ง เพราะ storage ตั้งชื่อเป็น uuid.ext
  // WARNING: attachmentSize มาจาก client จึงเชื่อไม่ได้ — ใช้ให้ error สวยเท่านั้น ไม่ใช่ security control
  // เพดานขนาดตัวจริงบังคับที่ POST /api/chat/upload ซึ่งเป็นจุดเดียวที่เห็นไฟล์จริง
  attachmentName: v.nullish(v.pipe(v.string(), v.maxLength(200))),
  attachmentSize: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(0))),
  productRefId: v.optional(v.pipe(v.string(), v.uuid())), // extension #1 Chat Product Context Card — เฉพาะ type=PRODUCT (FR-CTX-05)
  /**
   * (ส่วนขยาย 2026-08-11) การ์ดสินค้าหลายชิ้น — ส่งแทน `productRefId` เมื่อผู้ขายเลือกหลายรายการ
   *
   * เพดาน 36 = ค่าสูงสุดข้ามทุกช่องทาง (LINE 12 × 3 ตาม `maxSelectableProducts`) — ด่านนี้กัน payload
   * ที่ใหญ่เกินเหตุเท่านั้น **ไม่ใช่กฎธุรกิจ** เพดานจริงต่อช่องทางถูกบังคับอีกชั้นใน route ซึ่งรู้ว่า
   * เธรดนี้เป็นช่องทางอะไร (ที่นี่ยังไม่รู้ — schema ถูก parse ก่อน fetch conversation)
   */
  productRefIds: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.minLength(1), v.maxLength(36)),
  ),
  orderRefToken: v.optional(v.pipe(v.string(), v.uuid())), // การ์ดออเดอร์/สรุปนัดในแชท — type=ORDER|APPOINTMENT (Order.publicToken)
  /**
   * (ส่วนขยาย 00024, 2026-08-11) บรรทัดที่ร้านติ๊กปิดบนการ์ดสรุปนัด — เฉพาะ type='APPOINTMENT'
   *
   * 🛑 เป็น **allow-list** และ **`'when'` ไม่อยู่ในนั้นโดยตั้งใจ** (SSOT =
   * `HIDEABLE_APPOINTMENT_SUMMARY_KEYS`) — การ์ดชื่อ "ยืนยันนัดหมาย" ที่ไม่มีวันนัดคือของที่
   * ทำให้ลูกค้ามาผิดวัน. นี่คือด่านที่สองของกฎเดียวกัน ชั้นแรกอยู่ที่ checkbox ซึ่ง disabled
   * — UI กันได้แค่คนที่เดินผ่านประตู
   */
  hiddenSummaryKeys: v.optional(
    v.pipe(
      // อ่านรายการจาก SSOT ตรง ๆ ไม่พิมพ์ซ้ำ — ถ้าวันหนึ่งมีบรรทัดใหม่ที่ซ่อนได้ จะได้ไม่มีที่ให้ลืม
      v.array(v.picklist([...HIDEABLE_APPOINTMENT_SUMMARY_KEYS])),
      v.maxLength(HIDEABLE_APPOINTMENT_SUMMARY_KEYS.length),
    ),
  ),
  /** ข้อความปิดท้ายการ์ดสรุปนัด — เฉพาะ type='APPOINTMENT'; trim แล้วว่าง = ไม่มีบรรทัดปิดท้าย */
  summaryClosing: v.nullish(v.pipe(v.string(), v.maxLength(APPOINTMENT_CLOSING_MAX))),
  replyToMessageId: v.optional(v.pipe(v.string(), v.uuid())), // reply/quote (user 2026-07-25) — id ของข้อความที่ตอบทับ (route resolve → replyToMid/Meta reply_to)
  /**
   * สติกเกอร์ Meta (user สั่ง 2026-08-04) — ส่งคู่กับ type='STICKER'
   * stickerId: id จาก Sticker Catalog API (ตัวเลขล้วนเป็นสตริง) — Meta ยืนยันเองว่าส่งได้หรือไม่
   * stickerImageUrl: รูปจาก catalog (โดเมน CDN ของ Meta) — server เอาไป mirror เก็บฝั่งเรา
   *   บังคับ https + จำกัดความยาว: ค่านี้มาจาก client และถูกเอาไป fetch ฝั่ง server (SSRF)
   *   host allow-list ตัวจริงอยู่ที่ mirrorRemoteImage (เฉพาะ CDN ของ Meta) — ที่นี่เป็นชั้นแรก
   */
  /** รูปหลายใบสำหรับ type='IMAGE_GRID' — fileId จาก POST /api/chat/upload (จำกัด 24 ใบต่อคำขอ) */
  imageFileIds: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(24))),
  stickerId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(32), v.regex(/^[0-9]+$/))),
  stickerImageUrl: v.optional(v.pipe(v.string(), v.url(), v.maxLength(2000), v.startsWith('https://'))),
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
  // 🛑 อ้าง CHAT_CHANNELS ห้ามพิมพ์ list ซ้ำที่นี่ — เดิมเป็น ['DEEP','MESSENGER','INSTAGRAM']
  // เขียนตายตัว พอเพิ่ม 'LINE' เข้า type ChatChannel (2026-08-09) ที่นี่ไม่ถูกแตะ tsc เขียวสนิท
  // แล้วผู้ใช้กดแท็บ LINE ได้ 400 Bad Request บน production (type ไม่ผูกกับ validator ตอน runtime)
  channel: v.optional(v.picklist(CHAT_CHANNELS)),
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
  // user สั่ง 2026-07-31 — กรองด้วยแท็กผู้ติดต่อ (ติดอันใดก็ได้) cap 20 กันยิง payload ยาวผิดปกติ
  tags: v.optional(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))), v.maxLength(20))),
  // user สั่ง 2026-07-31 — สถานะพัสดุของออเดอร์ล่าสุด (เฉพาะร้านที่เชื่อม iShip)
  shipment: v.optional(v.picklist(['none', 'unprinted', 'printed', 'problem'])),
  // feature 00037 — กรองเฉพาะร้านเดียวในกล่องแชทรวม
  // 🛑 ค่านี้ไม่ใช่ "ขอบเขต" แต่เป็น "ตัวกรองภายในขอบเขต" — route ต้องเอาไปผ่าน
  //    intersectScopedShopIds() กับ scope ที่ระบบคำนวณเองเสมอ ห้ามส่งเข้า service ตรง ๆ (BR-UNI-01/02)
  shopId: v.optional(v.pipe(v.string(), v.uuid())),
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

// จัดลำดับข้อความสำเร็จรูป (user request 2026-07-30) — ส่ง id ทั้งชุดตามลำดับใหม่
// cap 500: ป้องกัน payload ยาวผิดปกติมาสั่ง transaction ใหญ่ (ร้านจริงมีหลักสิบ)
export const QuickMessageReorderSchema = v.object({
  orderedIds: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.minLength(1), v.maxLength(500)),
});

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
  // default ต้องตรงกับหน้า /expenses (30d) — เดิม API เป็น "today" ส่วนหน้าเป็น "30d"
  // ใครเรียก endpoint นี้โดยไม่ส่ง range จะได้คนละช่วงกับที่เห็นบนจอ
  range: v.optional(v.picklist(["today", "7d", "30d", "month", "custom"]), "30d"),
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
// body ของ PUT /api/shops/ai-settings
// instruction ≤2000 ตัวอักษร (BR-AI-03) ส่งค่าว่างเพื่อล้างคำสั่งได้
//
// feature 00019 ext (2026-07-29): 3 ฟิลด์บริบทเป็น optional — **ไม่ส่งมา = "ไม่เปลี่ยนค่าเดิม"**
// (service เติมจากค่า stored ให้เอง) ไม่ใช่ full-replace แบบเดิมอีกต่อไป เพราะ:
//   1. ร้าน non-paid ถูก gate ห้ามเปลี่ยน 3 ฟิลด์นี้ (FR-AIQ-10) client จึงส่งมาแค่ instruction
//      ถ้ายังบังคับ required ที่นี่ จะ 400 ตั้งแต่ชั้น validate ก่อนถึง gate → ร้าน non-paid
//      แก้ "คำสั่งประจำร้าน" ไม่ได้เลย ทั้งที่ BR-AIQ-13 บอกว่าช่องนี้ไม่ถูก gate
//   2. default `true` แบบเดิมของ includeMediaContext อันตรายกว่า: client ที่ไม่ส่ง field มา
//      จะถูกเขียนทับเป็นเปิด ทั้งที่ร้านอาจตั้งใจปิดไว้ (ไฟล์ลูกค้าเข้า AI ทั้งไฟล์) — fallback
//      ไปค่า stored ปลอดภัยกว่าและยังไม่ 400 กับ client เก่าเหมือนเดิม
// feature 00019 ext (2026-07-29) — body ของ POST /api/chat/conversations/{id}/ai-suggest
// confirmUseCredit: ผู้ใช้ยืนยันแล้วว่ายอมให้หักเงิน ฿1 เมื่อโควตาฟรีหมด (FR-AIQ-04)
// input ตัวนี้ทำให้ "เงินจริงถูกหัก" จึงต้องเป็น boolean แท้เท่านั้น — ค่าอื่น (string "true",
// object, array) ต้องตกเป็น false ไม่ใช่ตีความเป็น truthy
export const AiSuggestRequestSchema = v.object({
  confirmUseCredit: v.optional(v.boolean(), false),
});

export const ShopAiSettingSchema = v.object({
  instruction: v.pipe(v.string(), v.maxLength(2000, "คำสั่งประจำร้านต้องไม่เกิน 2,000 ตัวอักษร")),
  includeProductContext: v.optional(v.boolean()),
  includeCustomerContext: v.optional(v.boolean()),
  // feature 00019 ext (user 2026-07-24): ให้ AI อ่านรูป/ฟังข้อความเสียงในแชท
  includeMediaContext: v.optional(v.boolean()),
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
  // รับได้ 2 แบบ: orderId (uuid) จากหน้ารายละเอียดคำสั่งซื้อ หรือ orderToken
  // (publicToken/shortCode) จากการ์ดในแชท ซึ่งรู้จักแค่ token — เซิร์ฟเวอร์แปลงให้เอง
  orderId: v.optional(v.pipe(v.string(), v.uuid())),
  orderToken: v.optional(v.pipe(v.string(), v.minLength(4), v.maxLength(64))),
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

// ผูกพัสดุที่ร้านเปิดไว้บน iShip แล้วเข้ากับคำสั่งซื้อ (ส่วนขยาย 2026-08-01)
//
// addressResolution บังคับให้ส่งมาเสมอ ไม่มีค่าปริยาย โดยเจตนา: มันคือคำตอบของคำถาม
// "ที่อยู่สองฝั่งไม่ตรงกัน จะยึดฝั่งไหน" ซึ่งเป็นการตัดสินใจของร้าน ไม่ใช่สิ่งที่ระบบ
// ควรเดาแทน — ค่าปริยายที่เงียบ ๆ จะกลายเป็นการเขียนทับที่อยู่โดยร้านไม่รู้ตัว
export const IShipLinkShipmentSchema = v.object({
  orderId: v.optional(v.pipe(v.string(), v.uuid())),
  orderToken: v.optional(v.pipe(v.string(), v.minLength(4), v.maxLength(64))),
  trackingNo: v.pipe(v.string(), v.minLength(4), v.maxLength(64)),
  addressResolution: v.picklist(["KEEP_ORDER", "USE_ISHIP"]),
});

// ดึงพัสดุจาก iShip มาสร้างคำสั่งซื้อใหม่ (user สั่ง 2026-08-01)
// รับแค่เลขติดตาม — ข้อมูลที่เหลือเซิร์ฟเวอร์ไปอ่านจาก iShip เอง ไม่รับจาก client
// เพราะทั้งใบจะกลายเป็นคำสั่งซื้อจริง (ชื่อ/เบอร์/ที่อยู่ลูกค้า) เชื่อ payload ไม่ได้
export const IShipImportParcelSchema = v.object({
  trackingNo: v.pipe(v.string(), v.minLength(4), v.maxLength(64)),
  // ร้านแก้ได้ก่อนกดสร้าง — ไม่ส่งมา = ใช้ค่าเริ่มต้นที่ service ประกอบจากพัสดุ
  // (iShip ไม่คืนรายการสินค้า จึงเดาชื่อจริงแทนร้านไม่ได้ ต้องเปิดช่องให้แก้)
  itemName: v.optional(shortText(200)),
  itemPrice: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(10000000))),
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

// feature 00022 — ประเมินค่าส่งก่อนเปิดพัสดุ (ไม่ก่อค่าใช้จ่าย ยิงได้บ่อย)
// ที่อยู่ผู้ส่งไม่รับจาก client โดยเจตนา — service อ่านจากการตั้งค่าร้านเสมอ
export const IShipPriceQuoteSchema = v.object({
  courierCode: shortText(50),
  receiver: v.object({
    subdistrict: v.nullish(shortText(120)),
    district: v.nullish(shortText(120)),
    province: v.nullish(shortText(120)),
    postcode: v.nullish(shortText(10)),
  }),
  weight: v.pipe(v.number(), v.minValue(0.01), v.maxValue(100)),
  width: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300)),
  length: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(300)),
});

// ส่วนขยาย 00022 — เทียบราคาทุกขนส่งในคำขอเดียว (ปุ่ม "เทียบราคา")
// input เดียวกับ quote รายตัวแต่ไม่ระบุขนส่ง — server เป็นคนไล่ทุกขนส่งของร้านเอง
export const IShipPriceCompareSchema = v.omit(IShipPriceQuoteSchema, ["courierCode"]);

export const IShipPickupSchema = v.object({
  courierCode: shortText(50),
  parcelCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  remark: v.nullish(shortText(255)),
});

// ── feature 00023 Chat Auto-Reply ───────────────────────────────────────────
// SSOT: docs/20 - Features/00023 - Chat Auto-Reply/{API.md, DATABASE.md §3.8}
//
// WARNING: ห้ามรับ `specificity` จาก client เด็ดขาด — เป็น invariant ที่ service คำนวณเอง
// ด้วย computeSpecificity() ทุกครั้งที่เขียน ถ้าเปิดให้ส่งมาได้ ลำดับการเลือกกฎจะเพี้ยน
// โดยไม่มีใครรู้ตัว (ดู DATABASE.md §3.4)

/**
 * ค่าตั้งระดับร้าน — route รับเป็น **partial** แล้ว merge กับค่าปัจจุบันฝั่ง server
 * เพราะ UI มีทั้งการกดสวิตช์ตัวเดียว (ส่งมาแค่ isEnabled) และการบันทึกฟอร์มเต็ม
 * ถ้าบังคับส่งครบทุกครั้ง การกดสวิตช์จะต้องพก state ทั้งก้อนไปด้วย ซึ่งเสี่ยงเขียนทับค่าที่
 * คนอื่นเพิ่งแก้ในแท็บอื่น
 */
export const AutoReplyConfigPatchSchema = v.partial(
  v.object({
  isEnabled: v.boolean(),
  humanTakeoverPauseMode: v.picklist(['30M', '2H', 'MANUAL', 'UNTIL_RESOLVED']),
  keywordCooldownSec: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(86_400)),
  maxRepliesPerConversation: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  adsContextMode: v.picklist(['UNTIL_RESOLVED', 'HOURS', 'UNTIL_NEW_PRODUCT']),
  adsContextHours: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(720))),
    handoffPhrases: v.pipe(v.array(v.pipe(v.string(), v.trim(), v.maxLength(100))), v.maxLength(50)),
    // เวลาทำงาน (feature 00023 เฟส A) — นาทีจากเที่ยงคืนเวลาไทย 0-1439
    // ไม่บังคับ start < end: end <= start = ช่วงข้ามคืน (18:00→09:00) ซึ่งเป็นเคสหลักที่ร้านขอ
    activeScheduleMode: v.picklist(['ALWAYS', 'WINDOW']),
    activeStartMin: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439))),
    activeEndMin: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439))),
    // bitmask 7 วัน (จันทร์=1 ... อาทิตย์=64); 0 = ไม่ทำงานวันไหนเลย ซึ่งเป็นเจตนาที่ถูกต้อง
    activeDays: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
  }),
)

export const AutoReplyKeywordCreateSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, 'ต้องระบุชื่อกลุ่มคำ'), v.maxLength(100)),
  matchType: v.optional(v.picklist(['EXACT', 'CONTAINS', 'STARTS_WITH'])),
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000))),
})

export const AutoReplyKeywordUpdateSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))),
  matchType: v.optional(v.picklist(['EXACT', 'CONTAINS', 'STARTS_WITH'])),
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000))),
  // AI Enhance รายกลุ่มคำ (phase `00023-ai-enhance`) — ให้ AI เรียบเรียงคำตอบก่อนส่ง
  // น้ำเสียงของ AI Enhance — ว่างได้ (= กลับไปใช้ค่ากลาง)
  // OFFLINE ไม่ตอบใครเลย · TEST ตอบเฉพาะเธรดที่ผูกไว้กับกลุ่มนี้ · LIVE ตอบทุกเธรด
  status: v.optional(v.picklist(['OFFLINE', 'TEST', 'LIVE'])),
})

/* ── คลังคำถาม-คำตอบ (phase `00023-qna` — API.md §4.30-§4.34) ─────────────── */

// NOTE: ความยาวสูงสุดตรงกับ QNA_QUESTION_MAX_LEN / QNA_ANSWER_MAX_LEN ใน service
// ตั้งใจให้ตรวจซ้ำสองชั้น — Valibot ให้ 400 พร้อมข้อความไทยทันที ส่วน service เป็นด่านสุดท้าย
// ที่ทางเรียกอื่น (mini action ในห้องแชท, การแปลงจากคิว) ต้องผ่านเหมือนกัน
const QnaQuestionField = v.pipe(v.string(), v.trim(), v.minLength(1, 'กรุณาระบุคำถาม'), v.maxLength(500, 'คำถามยาวเกิน 500 ตัวอักษร'))
const QnaAnswerField = v.pipe(v.string(), v.trim(), v.maxLength(2000, 'คำตอบยาวเกิน 2,000 ตัวอักษร'))
const QnaImagesField = v.pipe(v.array(v.string()), v.maxLength(5, 'แนบรูปได้สูงสุด 5 รูป'))

export const AutoReplyQnaCreateSchema = v.object({
  question: QnaQuestionField,
  // คำตอบว่างได้ถ้ามีรูป — service เป็นคนตัดสินร่วมกันสองฟิลด์ (AUTO_REPLY_QNA_ANSWER_EMPTY)
  answer: QnaAnswerField,
  imageFileIds: v.optional(QnaImagesField),
})

export const AutoReplyQnaUpdateSchema = v.object({
  question: v.optional(QnaQuestionField),
  answer: v.optional(QnaAnswerField),
  imageFileIds: v.optional(QnaImagesField),
  isActive: v.optional(v.boolean()),
})

export const AutoReplyQnaListQuerySchema = v.object({
  filter: v.optional(v.picklist(['ALL', 'ACTIVE', 'INACTIVE', 'NEVER_USED'])),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
})

export const AutoReplyQnaBulkSchema = v.object({
  qnaIds: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.minLength(1))),
    v.minLength(1, 'กรุณาเลือกอย่างน้อย 1 ข้อ'),
    v.maxLength(500, 'เลือกได้สูงสุด 500 ข้อต่อครั้ง'),
  ),
  action: v.picklist(['ACTIVATE', 'DEACTIVATE', 'MOVE', 'DELETE']),
  // บังคับเฉพาะตอน action = MOVE — service เป็นคนโยน AUTO_REPLY_QNA_MOVE_TARGET_REQUIRED
  // ถ้าไม่ส่งมา (ตรวจที่นี่ด้วยจะต้องเขียน cross-field validation ซึ่งแตกเป็นสองที่โดยไม่จำเป็น)
  targetKeywordId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
})

/* ── คิวคำถามที่ตอบไม่ได้ (phase `00023-qna` — API.md §4.37-§4.40) ─────────── */

export const AutoReplyUnansweredListQuerySchema = v.object({
  // ตรงกับแท็บ 2 ตัวใน UI (Revision v2 ข้อ 1): "รอกรอก" = PENDING · "ข้ามแล้ว" = DISMISSED
  // ANSWERED รับไว้ด้วยเพื่อให้ debug/ตรวจย้อนหลังได้ แม้ยังไม่มีแท็บให้กด
  status: v.optional(v.picklist(['PENDING', 'DISMISSED', 'ANSWERED'])),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200))),
})

export const AutoReplyUnansweredConvertSchema = v.object({
  keywordId: v.pipe(v.string(), v.trim(), v.minLength(1, 'กรุณาเลือกกลุ่มคำปลายทาง')),
  question: v.pipe(v.string(), v.trim(), v.minLength(1, 'กรุณาระบุคำถาม'), v.maxLength(500, 'คำถามยาวเกิน 500 ตัวอักษร')),
  answer: v.pipe(v.string(), v.trim(), v.maxLength(2000, 'คำตอบยาวเกิน 2,000 ตัวอักษร')),
  imageFileIds: v.optional(v.pipe(v.array(v.string()), v.maxLength(5, 'แนบรูปได้สูงสุด 5 รูป'))),
})

/* ── ตั้งค่า ChatBot ระดับร้าน (phase `00023-ai-enhance`) ──────────────────── */

// HH:mm 24 ชม. — รูปแบบเดียวกับตารางเวลาของ Auto Reply เพื่อไม่ให้มีสองมาตรฐานในระบบเดียว
const TimeHHmm = v.pipe(v.string(), v.trim(), v.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาต้องเป็น HH:mm'))

export const AiChatbotConfigPatchSchema = v.object({
  // ตรงกับ CHECK ในฐาน — ค่าอื่นถูกปฏิเสธตั้งแต่ชั้นนี้ ไม่ปล่อยให้ไปตายที่ DB
  aiChatbotStatus: v.optional(v.picklist(['OFFLINE', 'TEST', 'LIVE'])),
  aiChatbotEnabled: v.optional(v.boolean()),
  aiChatbotTone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300, 'น้ำเสียงยาวเกิน 300 ตัวอักษร'))),
  aiChatbotShopOnly: v.optional(v.boolean()),
  aiChatbotOutOfScopeText: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300, 'ข้อความยาวเกิน 300 ตัวอักษร'))),
  aiChatbotExtraPrompt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000, 'คำสั่งเพิ่มเติมยาวเกิน 2000 ตัวอักษร'))),
  aiChatbotFallbackMode: v.optional(v.picklist(['SILENT', 'MESSAGE', 'AI_FREE'])),
  aiChatbotFallbackText: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500, 'ข้อความสำรองยาวเกิน 500 ตัวอักษร'))),
  aiChatbotUseShopData: v.optional(v.boolean()),
  aiChatbotUseChatHistory: v.optional(v.boolean()),
  aiChatbotUseWebSearch: v.optional(v.boolean()),
  // 0 = ไม่เว้นระยะ / ไม่จำกัด — ต่างจากเพดานเงินที่ 0 ไม่มีความหมาย เพราะการ "ไม่จำกัด"
  // ที่นี่เป็นทางเลือกที่ร้านต้องการจริง (ร้านที่คุยกับลูกค้าถี่ ๆ)
  aiChatbotCooldownSec: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3600, 'เว้นระยะได้ไม่เกิน 1 ชั่วโมง'))),
  aiChatbotMaxPerHour: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(200, 'เพดานได้ไม่เกิน 200 ครั้งต่อชั่วโมง'))),
  aiChatbotStartTime: v.optional(v.union([TimeHHmm, v.literal('')])),
  aiChatbotEndTime: v.optional(v.union([TimeHHmm, v.literal('')])),
  // ต้อง > 0 ตรงกับ CHECK ในฐาน — 0 แปลว่าปิดฟีเจอร์ ซึ่งมีสวิตช์ของตัวเองอยู่แล้ว
  aiDailyCapBaht: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1, 'เพดานต้องมากกว่า 0'), v.maxValue(100000))),
  aiCapAlertSmsOptIn: v.optional(v.boolean()),
})

/* ── กฎห้ามตอบ Guardrails (phase `00023-ai-enhance`) ─────────────────────── */

const GuardrailRuleField = v.pipe(
  v.string(), v.trim(),
  v.minLength(1, 'กรุณาระบุกฎ'),
  v.maxLength(200, 'กฎยาวเกิน 200 ตัวอักษร'),
)
// คำดักชั้นแรก — จำกัดจำนวนเพราะยิ่งเยอะยิ่งเสี่ยง false positive (บอทเงียบใส่ลูกค้าโดยไม่มีเหตุผลดี)
const GuardrailPhrasesField = v.pipe(v.array(v.pipe(v.string(), v.trim())), v.maxLength(20, 'ใส่คำดักได้สูงสุด 20 คำต่อกฎ'))

export const AutoReplyGuardrailCreateSchema = v.object({
  rule: GuardrailRuleField,
  denyPhrases: v.optional(GuardrailPhrasesField),
  /** BLOCK = ชนแล้วเงียบ · AVOID = ยังตอบ แต่ห้ามพูดแบบนั้น */
  mode: v.optional(v.picklist(['BLOCK', 'AVOID'])),
})

export const AutoReplyGuardrailUpdateSchema = v.object({
  rule: v.optional(GuardrailRuleField),
  denyPhrases: v.optional(GuardrailPhrasesField),
  mode: v.optional(v.picklist(['BLOCK', 'AVOID'])),
  isActive: v.optional(v.boolean()),
})

export const AutoReplyPhrasesSchema = v.object({
  phrases: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
    v.minLength(1, 'ต้องระบุคำตรวจจับอย่างน้อย 1 คำ'),
    v.maxLength(50),
  ),
})

/** คำตอบยาวสุด — Meta จำกัดข้อความ 2000 ตัวอักษร เผื่อไว้ที่ 1000 ให้อ่านง่ายในแชท */
const REPLY_TEXT_MAX = 1000

export const AutoReplyRuleCreateSchema = v.object({
  keywordId: v.nullable(v.string()),
  shopChannelId: v.nullable(v.string()),
  adId: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(64))),
  adLabel: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  productId: v.nullable(v.string()),
  replyText: v.pipe(v.string(), v.trim(), v.minLength(1, 'คำตอบต้องไม่ว่าง'), v.maxLength(REPLY_TEXT_MAX)),
  isActive: v.optional(v.boolean()),
  activeFrom: v.nullable(v.string()),
  activeUntil: v.nullable(v.string()),
})

/**
 * แก้กฎ = full replace ของเงื่อนไข/คำตอบ (ไม่ใช่ partial) และ **ไม่รับ keywordId**
 * เพราะ service ตรึงกลุ่มคำไว้ตั้งแต่สร้าง (AutoReplyRuleUpdateInput = Omit<Input,'keywordId'>)
 * เหตุผล: ถ้าย้ายกลุ่มได้ specificity/ระดับการเลือกจะเปลี่ยนความหมายทั้งชุดโดยไม่มี error ให้เห็น
 */
export const AutoReplyRuleUpdateSchema = v.object({
  shopChannelId: v.nullable(v.string()),
  adId: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(64))),
  adLabel: v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(100))),
  productId: v.nullable(v.string()),
  replyText: v.pipe(v.string(), v.trim(), v.minLength(1, 'คำตอบต้องไม่ว่าง'), v.maxLength(REPLY_TEXT_MAX)),
  isActive: v.boolean(),
  activeFrom: v.nullable(v.string()),
  activeUntil: v.nullable(v.string()),
})

/** หน้าทดสอบกฎ (FR-020) — ไม่ส่งจริง ไม่บันทึก */
export const AutoReplySimulateSchema = v.object({
  message: v.pipe(v.string(), v.minLength(1, 'ต้องระบุข้อความลูกค้า'), v.maxLength(2000)),
  shopChannelId: v.nullable(v.optional(v.string())),
  adId: v.nullable(v.optional(v.string())),
  productId: v.nullable(v.optional(v.string())),
})

/** เธรดที่ใช้ทดสอบของกลุ่มคำหนึ่ง ๆ (แทนโหมดทดสอบระดับร้านเดิม — user 2026-07-29) */
export const AutoReplyTestThreadSchema = v.object({
  conversationId: v.string(),
  /** AC-021-06: UI ต้องให้ผู้ใช้ยืนยันก่อน เพราะข้อความจะถูกส่งถึงคนจริง — API บังคับ flag นี้ */
  confirmed: v.literal(true, 'ต้องยืนยันก่อนเพิ่มเธรดเข้าโหมดทดสอบ'),
})

export const ConversationAutoReplyPatchSchema = v.object({
  autoReplyEnabled: v.optional(v.nullable(v.boolean())),
  clearPause: v.optional(v.boolean()),
  clearHandoff: v.optional(v.boolean()),
  contextProductId: v.optional(v.nullable(v.string())),
})

// ── feature 00024 Service Appointment Booking ────────────────────────────────

// จำนวนคิวที่รับพร้อมกัน — จำนวนเต็มตั้งแต่ 1 (BR-RSV-06)
const CapacityInt = v.pipe(
  v.number(),
  v.integer("จำนวนคิวต้องเป็นจำนวนเต็ม"),
  v.minValue(1, "จำนวนคิวต้องมีอย่างน้อย 1"),
)

const ServiceResourceBaseFields = {
  name: v.pipe(v.string(), v.trim(), v.minLength(1, "ต้องระบุชื่อ"), v.maxLength(100)),
  description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
  durationMinutes: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1, "ระยะเวลาต้องมากกว่า 0"))),
  ),
  capacity: v.optional(CapacityInt),
  // มัดจำเริ่มต้นของทรัพยากร (BR-RSV-43/44/45) — เป็นแค่ "ค่าตั้งต้นช่วยกรอก" ตอนสร้างออเดอร์
  // IMPORTANT: ยอดจริงของแต่ละนัด snapshot ไว้ที่ Order.depositAmount (BR-RSV-46)
  // DecimalString กันค่าติดลบไว้แล้วที่ระดับ regex; เพดาน 100 ของ PERCENT ตรวจที่ระดับ object
  depositMode: v.optional(v.picklist(["FIXED", "PERCENT"])),
  depositValue: v.optional(DecimalString),
}

// PERCENT ต้องไม่เกิน 100 (BR-RSV-45) — ตรวจที่ระดับ object เพราะต้องเห็นสองฟิลด์พร้อมกัน
// มิเรอร์ CHECK constraint ServiceResource_deposit_value ใน migration
//
// IMPORTANT: ต้องเขียน callback แบบ inline ให้ TS infer พารามิเตอร์จาก context
// ถ้าแยกเป็น const แล้ว annotate เองจะ compile ไม่ผ่าน — v.check บังคับให้ input type
// ตรงกับ output ของ object เป๊ะ ๆ (Create มี name บังคับ, Update ไม่มี) ซึ่งเขียนตัวเดียว
// ให้ครอบทั้งสอง schema ไม่ได้
const DEPOSIT_PERCENT_MESSAGE = "เปอร์เซ็นต์มัดจำต้องไม่เกิน 100"

export const CreateServiceResourceSchema = v.pipe(
  v.object(ServiceResourceBaseFields),
  v.check(
    (o) =>
      o.depositMode !== "PERCENT" ||
      o.depositValue === undefined ||
      Number(o.depositValue) <= 100,
    DEPOSIT_PERCENT_MESSAGE,
  ),
)

export const UpdateServiceResourceSchema = v.pipe(
  v.object({
    name: v.optional(ServiceResourceBaseFields.name),
    description: ServiceResourceBaseFields.description,
    durationMinutes: ServiceResourceBaseFields.durationMinutes,
    capacity: ServiceResourceBaseFields.capacity,
    depositMode: ServiceResourceBaseFields.depositMode,
    depositValue: ServiceResourceBaseFields.depositValue,
    isActive: v.optional(v.boolean()),
  }),
  v.check(
    (o) =>
      o.depositMode !== "PERCENT" ||
      o.depositValue === undefined ||
      Number(o.depositValue) <= 100,
    DEPOSIT_PERCENT_MESSAGE,
  ),
)

// ── ตอบกลับคอมเมนต์ (feature 00038) — field name/status code อิง API.md (frozen contract) ──
// ตอนเขียนสคีมานี้พบว่า brief ของ task ใช้ชื่อย่อ (publicEnabled/publicText) แต่ schema.prisma
// จริง (ShopChannel.commentPublicReplyEnabled ฯลฯ) กับ API.md ตรงกันเป๊ะ — ยึด API.md/schema จริง

/**
 * PATCH /api/shops/comment-reply/config — partial update (API.md §4.2: ส่งเฉพาะฟิลด์ที่จะแก้)
 * ด่านนี้เช็ค BR-CR-05 ได้แค่ "เปิด+ข้อความว่างในคำขอเดียวกัน" — เคสเปิดสวิตช์ไว้ก่อนแล้วมา PATCH
 * ลบข้อความทีหลัง (ไม่แตะ *Enabled ในคำขอนี้) ต้องเช็คสถานะ "หลัง merge กับแถวเดิมใน DB" ที่
 * route handler เท่านั้น (Valibot ไม่เห็นแถวเดิม) — ดู src/app/api/shops/comment-reply/config/route.ts
 */
export const CommentReplyConfigSchema = v.pipe(
  v.object({
    shopChannelId: v.pipe(v.string(), v.uuid()),
    commentPublicReplyEnabled: v.optional(v.boolean()),
    commentPublicReplyText: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
    commentPrivateReplyEnabled: v.optional(v.boolean()),
    commentPrivateReplyText: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(1000)))),
  }),
  v.forward(
    v.check(
      (i) => i.commentPublicReplyEnabled !== true || !!i.commentPublicReplyText?.trim(),
      "ต้องกรอกข้อความก่อนเปิดใช้งาน",
    ),
    ["commentPublicReplyText"],
  ),
  v.forward(
    v.check(
      (i) => i.commentPrivateReplyEnabled !== true || !!i.commentPrivateReplyText?.trim(),
      "ต้องกรอกข้อความก่อนเปิดใช้งาน",
    ),
    ["commentPrivateReplyText"],
  ),
)

/** GET /api/shops/comment-reply/logs — query (API.md §4.3, offset cursor pattern มิเรอร์ BuilderLibraryQuerySchema) */
export const CommentReplyLogsQuerySchema = v.object({
  shopChannelId: v.optional(v.pipe(v.string(), v.uuid())),
  cursor: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, "cursor ต้องเป็นตัวเลข"))),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))),
})

/** POST /api/chat/comments/[commentId]/private-reply — ทักแชทส่วนตัวจากคอมเมนต์ (ปุ่มแมนนวล) */
export const PrivateReplySchema = v.object({
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1000)),
})

// ตั้ง/เลื่อนนัด — ฝั่งร้าน
export const SetAppointmentSchema = v.object({
  resourceId: v.pipe(v.string(), v.minLength(1)),
  start: IsoDateTimeWithOffset,
  end: IsoDateTimeWithOffset,
  reason: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
})

// ปิดผลนัด — ฝั่งร้าน
export const AppointmentOutcomeSchema = v.object({
  outcome: v.picklist(["COMPLETED", "NO_SHOW"]),
})

// ขอเลื่อนนัด — ฝั่งลูกค้า (ขอได้อย่างเดียว เปลี่ยนเวลาเองไม่ได้ BR-RSV-23)
export const RequestRescheduleSchema = v.object({
  note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
})

// ฟิลด์นัดที่แนบมากับการสร้างออเดอร์ (โหมด A) — แยก schema ไม่ยัดเข้า CreateOrderSchema
// เพื่อไม่ให้ blast radius ไปโดน caller เดิมของ schema นั้น
export const OrderAppointmentSchema = v.object({
  resourceId: v.pipe(v.string(), v.minLength(1)),
  start: IsoDateTimeWithOffset,
  end: IsoDateTimeWithOffset,
  // ยอดมัดจำที่ตกลงกับลูกค้า (FR-RSV-12) — ไม่ส่งมา = ให้ service คำนวณจากค่าเริ่มต้นของทรัพยากร
  // ส่งมา = ใช้ค่านี้ (ร้านแก้เองได้เสมอ, BR-RSV-48). DecimalString กันค่าติดลบแล้ว
  // เพดาน "ไม่เกินยอดรวม" บังคับที่ service เพราะต้องรู้ totalAmount ก่อน (BR-RSV-47)
  depositAmount: v.optional(DecimalString),
})

// ── Shop Page Builder (feature 00035) — ดู API.md §4 ของโมดูลนี้ (contract ห้ามเปลี่ยนชื่อ/ชนิด) ──

// GET .../library — query: ?q=&cursor=&take= (API.md §4.1)
export const BuilderLibraryQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.maxLength(200))),
  // offset-based cursor เป็น string ของตัวเลขล้วน (service ทำ Number(cursor) เอง) — ปฏิเสธค่าที่ไม่ใช่ตัวเลข
  // ตรง ๆ แทนปล่อยให้ตกไป fallback 0 เงียบ ๆ (client ควรได้ 400 ถ้าส่งค่าผิดรูป ไม่ใช่ได้หน้าแรกเงียบ ๆ)
  cursor: v.optional(v.pipe(v.string(), v.regex(/^\d+$/, "cursor ต้องเป็นตัวเลข"))),
  take: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))),
});

// POST .../facebook-posts/mirror (API.md §4.2)
export const MirrorFacebookPostSchema = v.object({
  facebookPostId: v.pipe(v.string(), v.uuid()),
});

// PUT /page-builder — บันทึกผังทั้งชุด (API.md §4.3)
//
// tabOrder: ค่าที่ไม่ใช่ 1 ใน 7 tab key ถูกกรองทิ้งเงียบ ๆ ด้วย transform (ไม่ reject ทั้ง request)
// — mirror ปรัชญาเดียวกับ Shop.categories/Shop.salesChannels ที่ validate แบบ allow-list เงียบ
// reuse PROFILE_TAB_KEYS จาก src/lib/profile-tab-keys.ts เป็น SSOT เดียว ไม่ hardcode ซ้ำที่นี่
// (กัน drift — เพิ่ม/ลบ tab key ต้องแก้ที่เดียว)
const ShopPageBlockSchema = v.variant("type", [
  v.object({
    type: v.literal("BADGE_HIGHLIGHT"),
    badgeIds: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(4)),
  }),
  v.object({
    type: v.literal("FACEBOOK_POST"),
    facebookPostId: v.pipe(v.string(), v.uuid()),
  }),
]);

export const SaveShopPageLayoutSchema = v.object({
  tabOrder: v.pipe(
    v.array(v.string()),
    v.maxLength(PROFILE_TAB_KEYS.length),
    v.transform((arr) =>
      arr.filter((k): k is (typeof PROFILE_TAB_KEYS)[number] =>
        (PROFILE_TAB_KEYS as readonly string[]).includes(k),
      ),
    ),
  ),
  // เพดานกันส่ง array มหาศาล (โพสต์ปกติไม่ถึงหลักสิบ) — เพดานจำนวนเหรียญ/โพสต์ซ้ำเช็คที่ service (TFR-007)
  blocks: v.pipe(v.array(ShopPageBlockSchema), v.maxLength(200)),
});

// PATCH .../publish (API.md §4.4)
export const SetShopPagePublishedSchema = v.object({
  isPublished: v.boolean(),
});

// ── feature 00025 — LINE OA Chat Integration (S-5) ───────────────────────────
// POST /api/channels/line/connect (API.md §4.2) — channelSecret เป็น hex 32 ตัวเสมอตามสเปก LINE
// Developers Console (Channel secret คือ MD5-length hex string) ส่วน channelAccessToken เป็น JWT/opaque
// ยาวไม่ตายตัว (ตัวอย่างจริงยาวหลักร้อย) — กำหนดเพดานกว้างพอไม่ปฏิเสธของจริงแต่กันวางผิดช่อง
export const LineConnectSchema = v.object({
  channelSecret: v.pipe(
    v.string(),
    v.trim(),
    v.regex(/^[0-9a-fA-F]{32}$/, "รูปแบบ Channel secret ไม่ถูกต้อง (ต้องเป็นตัวอักษร 32 ตัว)"),
  ),
  channelAccessToken: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "กรุณากรอก Channel access token"),
    v.maxLength(512, "Channel access token ยาวเกินกว่าที่ระบบรองรับ"),
  ),
});

// PATCH /api/channels/line/[channelId] (API.md §4.3) — ส่งเฉพาะฟิลด์ที่ต้องการแก้ ทั้งคู่ optional
// แต่ต้องมาคู่กันเสมอ (verify กับ LINE ใหม่ต้องใช้ทั้ง secret+token) — บังคับคู่ที่ route ไม่ใช่ schema
// เพราะ Valibot union/partial ที่บังคับ "มีอย่างใดอย่างหนึ่งแล้วต้องมีอีกตัว" อ่านยากกว่าเช็คตรง ๆ
export const LinePatchSchema = v.object({
  channelSecret: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^[0-9a-fA-F]{32}$/, "รูปแบบ Channel secret ไม่ถูกต้อง (ต้องเป็นตัวอักษร 32 ตัว)"),
    ),
  ),
  channelAccessToken: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1, "กรุณากรอก Channel access token"), v.maxLength(512)),
  ),
});

/**
 * POST /api/uploads/ticket — ขอใบอนุญาตอัปโหลดตรงเข้า storage (2026-08-10)
 *
 * `size`/`mime` ที่ client แจ้งมาที่นี่ **เชื่อไม่ได้** และไม่ได้ถูกใช้เป็นด่าน — มีไว้ให้ปฏิเสธ
 * ได้เร็วก่อนผู้ใช้เสียเวลาอัปโหลดจนจบ. ด่านจริงคือ `file_size_limit` ของ bucket (413 จาก
 * Supabase) + `POST /api/uploads/commit` ที่อ่านขนาดจริงด้วย HEAD (ดู `src/lib/upload-policy.ts`)
 */
export const UploadTicketSchema = v.object({
  // 🛑 อ้าง UPLOAD_PURPOSES ห้ามพิมพ์ list ซ้ำที่นี่ — บทเรียนจาก `channel` ของแท็บอินบ็อกซ์
  // (42b71894): เพิ่มค่าใหม่เข้า type แล้ว picklist ที่เขียนตายตัวไม่ถูกแตะ tsc เขียวสนิท
  // แต่ผู้ใช้ได้ 400 บน prod เพราะ validator ไม่ผูกกับ type ตอน runtime
  purpose: v.picklist(UPLOAD_PURPOSES),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
  size: v.pipe(v.number(), v.integer(), v.minValue(1)),
  mime: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
  /** เฉพาะ purpose='CHAT' — route ใช้ resolve channel + เช็คสิทธิ์เข้าถึงเธรด */
  conversationId: v.optional(v.pipe(v.string(), v.uuid())),
});

/** POST /api/uploads/commit — ยืนยันว่าไฟล์ขึ้นไปแล้วจริง แล้วให้ server ตรวจของจริง */
export const UploadCommitSchema = v.object({
  /** HMAC claim ที่ได้จาก /api/uploads/ticket — ผูก fileId กับ user/purpose/เพดาน */
  ticket: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
  /** ชื่อไฟล์เดิมเพื่อเก็บเป็น snapshot (storage ตั้งชื่อเป็น uuid.ext) */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
  mime: v.optional(v.pipe(v.string(), v.maxLength(200)), ""),
});

// AuthFlowStartSchema — body ของ POST /api/orders/[token]/auth-flow/start (feature 00041, TFR-013)
// instrumentation ล้วน: ทุกฟิลด์ optional และ parse ล้มไม่ทำให้คำขอล้ม (route คืน 204 เสมอ)
// เก็บ method ไว้ดูภายหลังว่าเส้นทางไหนคนหลุดเยอะ — Facebook คือเส้นที่ยาวที่สุดตาม PRD
export const AuthFlowStartSchema = v.object({
  method: v.optional(v.picklist(["facebook", "phone_otp", "other"])),
});

// UpdateReviewSchema — body ของ PATCH /api/orders/[token]/review (feature 00041, BR-BOE-17/19)
// ทุกฟิลด์ optional (partial update) แต่ต้องมีอย่างน้อย 1 ฟิลด์ — ไม่งั้นเป็น no-op ที่สับสน
// (ผู้ใช้กดบันทึกแล้วไม่มีอะไรเปลี่ยน แต่ระบบตอบว่าสำเร็จ)
export const UpdateReviewSchema = v.pipe(
  v.object({
    rating: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))),
    comment: v.optional(v.pipe(v.string(), v.maxLength(500))),
    // images: fileId จาก /api/uploads/commit (purpose=IMAGE) — เพดาน 4 ใบตาม BR-BOE-19
    // ขนาดต่อไฟล์ (≤10MB) ถูกบังคับไปแล้วที่ commit ด้วยขนาดจริงจาก HEAD ที่นี่ตรวจแค่จำนวน/รูปแบบ
    images: v.optional(
      v.pipe(v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))), v.maxLength(4, "แนบรูปได้สูงสุด 4 รูป")),
    ),
  }),
  v.check(
    (o) => o.rating !== undefined || o.comment !== undefined || o.images !== undefined,
    "ไม่มีข้อมูลที่จะแก้ไข",
  ),
);

// ReplyToReviewSchema — body ของ POST /api/orders/[token]/review/reply (feature 00041, BR-BOE-21)
// maxLength 1000: ร้านมักต้องอธิบายละเอียดกว่าความเห็นสั้น ๆ ของผู้ซื้อ (500) แต่ยังมีเพดานกันสแปม
export const ReplyToReviewSchema = v.object({
  comment: v.pipe(v.string(), v.trim(), v.minLength(1, "กรุณาพิมพ์คำตอบ"), v.maxLength(1000)),
});

// ---------------------------------------------------------------------------
// เมนูลัดใน LINE (feature 00045)
// ---------------------------------------------------------------------------

/**
 * action ที่รองรับ — **allow-list + fail-closed**
 *
 * 🛑 ชนิดที่ LINE มีแต่เรายังไม่เปิด (เช่น `richmenuswitch`, `camera`) ต้องตกที่นี่เป็น 400
 * ห้ามปล่อยผ่านไปให้ LINE ตัดสิน เพราะ error ของ LINE เป็นภาษาอังกฤษที่ผู้ขายอ่านไม่ออกและ
 * แก้ไม่ถูก และปุ่มที่เราไม่มีตัวรับ = ลูกค้ากดแล้วเงียบหาย (BR-RM-03)
 */
export const RichMenuActionSchema = v.variant("type", [
  v.object({
    type: v.literal("uri"),
    // https เท่านั้น (BR-RM-07) — LINE ปฏิเสธ http ทั้งเมนู ไม่ใช่แค่ปุ่มนั้น
    uri: v.pipe(v.string(), v.startsWith("https://"), v.maxLength(1000)),
  }),
  v.object({ type: v.literal("message"), text: v.pipe(v.string(), v.minLength(1), v.maxLength(300)) }),
  v.object({ type: v.literal("postback"), data: v.pipe(v.string(), v.minLength(1), v.maxLength(300)) }),
  v.object({ type: v.literal("location") }),
  v.object({
    type: v.literal("datetimepicker"),
    data: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
    mode: v.picklist(["date", "time", "datetime"]),
  }),
]);

export const RichMenuButtonSchema = v.object({
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60)),
  action: RichMenuActionSchema,
});

export const RichMenuDraftSchema = v.object({
  shopChannelId: v.pipe(v.string(), v.minLength(1)),
  templateKey: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
  /**
   * 🛑 นับเป็น **code point** ไม่ใช่ `String.length` — `v.maxLength()` ของ Valibot นับ UTF-16 unit
   * ซึ่งไม่ตรงกับที่ LINE นับ (อักขระนอก BMP นับเป็น 2) ถ้าใช้ maxLength ตรง ๆ ผู้ขายที่ใส่
   * อิโมจิจะถูกปฏิเสธทั้งที่ยังไม่เกินเพดานจริง — เกณฑ์เดียวกับ `countChatBarText()` ใน
   * lib/line/rich-menu.ts (HR16: นิยาม "ยาวเกินไป" ต้องมีชุดเดียวทั้งระบบ)
   */
  chatBarText: v.pipe(
    v.string(),
    v.trim(),
    v.check((s) => Array.from(s).length >= 1, "ต้องมีข้อความบนแถบเปิดเมนู"),
    v.check((s) => Array.from(s).length <= 14, "ข้อความบนแถบเปิดเมนูยาวได้ไม่เกิน 14 ตัวอักษร"),
  ),
  // เพดาน 20 = จำนวนพื้นที่กดได้สูงสุดต่อเมนูของ LINE (PRD §4.3)
  buttons: v.pipe(v.array(RichMenuButtonSchema), v.minLength(1), v.maxLength(20)),
  imageFileId: v.nullable(v.pipe(v.string(), v.minLength(1))),
});

export const RichMenuChannelRefSchema = v.object({
  shopChannelId: v.pipe(v.string(), v.minLength(1)),
});
