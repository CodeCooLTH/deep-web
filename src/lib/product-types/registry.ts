// Single source of truth สำหรับ product types + capability presets.
// Frontend form, backend validation, type picker, future filter UI ใช้ตัวนี้ทั้งหมด.
// เพิ่ม type ใหม่ = เพิ่ม entry ใน PRODUCT_TYPES (registry pickup auto)

export type FulfillmentMode = "SHIPPED" | "NO_SHIPPING";
export type BillingMode = "ONE_TIME" | "RECURRING";
export type BillingPeriod = "MONTHLY" | "YEARLY" | "CUSTOM";

export type ProductTypeMeta = {
  id: string;
  emoji: string;
  label: string;
  ariaLabel: string;
  description: string;
  defaults: {
    fulfillmentMode: FulfillmentMode;
    billingMode: BillingMode;
    billingPeriod?: BillingPeriod;
  };
  baseOverrides?: Partial<{
    name: { label?: string; placeholder?: string; help?: string };
    price: { label?: string; placeholder?: string; help?: string; unit?: string };
    description: { label?: string; placeholder?: string };
    images: { label?: string; help?: string; required?: boolean };
  }>;
};

export const PRODUCT_TYPES = {
  PHYSICAL: {
    id: "PHYSICAL",
    emoji: "📦",
    label: "ของจริง",
    ariaLabel: "สินค้าต้องจัดส่ง",
    description: "ส่งของจริงให้ลูกค้า",
    defaults: { fulfillmentMode: "SHIPPED", billingMode: "ONE_TIME" },
  },
  DIGITAL: {
    id: "DIGITAL",
    emoji: "💻",
    label: "ดิจิทัล",
    ariaLabel: "สินค้าดิจิทัล",
    description: "ส่งเป็นไฟล์ ลิงก์ หรือโค้ด",
    defaults: { fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME" },
  },
  SERVICE: {
    id: "SERVICE",
    emoji: "🛠️",
    label: "บริการ",
    ariaLabel: "การให้บริการ",
    description: "งานบริการ ทำให้ลูกค้าครั้งเดียว",
    defaults: { fulfillmentMode: "NO_SHIPPING", billingMode: "ONE_TIME" },
  },
  SUBSCRIPTION: {
    id: "SUBSCRIPTION",
    emoji: "🔁",
    label: "สมาชิก/รอบ",
    ariaLabel: "บริการเป็นรอบหรือสมาชิก",
    description: "เก็บเงินเป็นรอบ — ประกัน, สมาชิก, ค่าบริการรายเดือน",
    defaults: {
      fulfillmentMode: "NO_SHIPPING",
      billingMode: "RECURRING",
      billingPeriod: "MONTHLY",
    },
    baseOverrides: {
      price: {
        label: "ค่าบริการต่อรอบ",
        unit: "บาท",
        help: "จะเปลี่ยนเป็น บาท/เดือน หรือ บาท/ปี ตามรอบที่เลือก",
      },
    },
  },
} as const satisfies Record<string, ProductTypeMeta>;

export type ProductTypeId = keyof typeof PRODUCT_TYPES;
// ลำดับของ array = ลำดับที่แสดงใน type picker UI — เปลี่ยน order ใน PRODUCT_TYPES เพื่อเรียง
export const PRODUCT_TYPE_IDS = Object.keys(PRODUCT_TYPES) as ProductTypeId[];

export const FULFILLMENT_MODES = ["SHIPPED", "NO_SHIPPING"] as const;
export const BILLING_MODES = ["ONE_TIME", "RECURRING"] as const;
export const BILLING_PERIODS = ["MONTHLY", "YEARLY", "CUSTOM"] as const;

/**
 * deriveCapabilityDefaults — คืน capability flags default ของ type ที่ระบุ.
 * ใช้ใน form ตอน user เลือก type → set fulfillmentMode/billingMode auto.
 */
export function deriveCapabilityDefaults(typeId: ProductTypeId): {
  fulfillmentMode: FulfillmentMode;
  billingMode: BillingMode;
  billingPeriod: BillingPeriod | null;
} {
  const meta: ProductTypeMeta = PRODUCT_TYPES[typeId];
  return {
    fulfillmentMode: meta.defaults.fulfillmentMode,
    billingMode: meta.defaults.billingMode,
    billingPeriod: meta.defaults.billingPeriod ?? null,
  };
}
