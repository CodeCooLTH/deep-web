// feature 00089 — รายการเหตุการณ์ที่ร้านเลือกส่งได้ (PRD 3.2) · ชื่อ Meta = standard event ของ Business Messaging

export type CapiEventKey =
  | "PURCHASE" | "ORDER_CREATED" | "INITIATE_CHECKOUT" | "ADD_PAYMENT_INFO"
  | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELED" | "ORDER_RETURNED"
  | "VIEW_CONTENT" | "CART_ABANDONED" | "LEAD_SUBMITTED" | "QUALIFIED_LEAD";

export interface CapiEventDef {
  key: CapiEventKey;
  metaName: string;
  label: string;
  /** มียอด → ร้านเลือกวิธีคิดยอด/แนบสินค้าได้ */
  hasValue: boolean;
  /** SYSTEM = ระบบจุดเอง · TAG_RULE = จุดจากกฎแท็กเท่านั้น */
  source: "SYSTEM" | "TAG_RULE";
}

export const CAPI_EVENTS: readonly CapiEventDef[] = [
  { key: "PURCHASE", metaName: "Purchase", label: "ซื้อ", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_CREATED", metaName: "OrderCreated", label: "สร้างคำสั่งซื้อ", hasValue: true, source: "SYSTEM" },
  { key: "INITIATE_CHECKOUT", metaName: "InitiateCheckout", label: "ส่งลิงก์สั่งซื้อ", hasValue: false, source: "SYSTEM" },
  { key: "ADD_PAYMENT_INFO", metaName: "AddPaymentInfo", label: "แนบสลิป", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_SHIPPED", metaName: "OrderShipped", label: "จัดส่งแล้ว", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_DELIVERED", metaName: "OrderDelivered", label: "ส่งถึงแล้ว", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_CANCELED", metaName: "OrderCanceled", label: "ยกเลิก", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_RETURNED", metaName: "OrderReturned", label: "คืนสินค้า", hasValue: true, source: "SYSTEM" },
  { key: "VIEW_CONTENT", metaName: "ViewContent", label: "ส่งการ์ดสินค้า", hasValue: true, source: "SYSTEM" },
  { key: "CART_ABANDONED", metaName: "CartAbandoned", label: "ทิ้งตะกร้า", hasValue: true, source: "SYSTEM" },
  { key: "LEAD_SUBMITTED", metaName: "LeadSubmitted", label: "ผู้สนใจ", hasValue: true, source: "TAG_RULE" },
  { key: "QUALIFIED_LEAD", metaName: "QualifiedLead", label: "ผู้สนใจที่มีคุณภาพ", hasValue: true, source: "TAG_RULE" },
];

// PaymentSlipAttached ไม่มีจุดเกิดแยก — รวมใน AddPaymentInfo (PRD Q2) จึงไม่อยู่ในรายการเลย
export const SELECTABLE_EVENTS = CAPI_EVENTS;
