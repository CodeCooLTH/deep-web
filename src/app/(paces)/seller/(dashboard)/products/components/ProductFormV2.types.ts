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
