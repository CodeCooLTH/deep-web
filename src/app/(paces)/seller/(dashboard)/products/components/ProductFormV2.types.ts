/**
 * Domain types — ไม่มี 1:1 Paces theme equivalent
 *   ProductFormV2Values เป็น SafePay-specific form schema types
 *   ที่ map กับ Product model ใน Prisma schema + capability flags จาก product-types registry
 *   ใช้ร่วมระหว่าง ProductFormV2.tsx และ V2 card components ทั้งหมด
 */
import type {
  ProductTypeId,
  FulfillmentMode,
  BillingMode,
  BillingPeriod,
} from "@/lib/product-types/registry";

// ลบ ProductTypeV2 ที่ hardcoded — ใช้ ProductTypeId จาก registry แทน
export type ProductTypeV2 = ProductTypeId;

export type ProductFormV2Values = {
  name: string;
  shortDescription: string;
  description: string;
  price: number;
  type: ProductTypeV2;
  images: string[];
  tags: string[];
  attributes: Record<string, string>;
  // capability flags (P2)
  fulfillmentMode: FulfillmentMode;
  billingMode: BillingMode;
  // null ใน RHF state แทน undefined เพื่อให้ Yup nullable() ทำงานตรง
  billingPeriod: BillingPeriod | null;
  billingPeriodDays: number | null;
};
