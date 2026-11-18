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
  { key: "PURCHASE", metaName: "Purchase", label: "Purchase", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_CREATED", metaName: "OrderCreated", label: "OrderCreated", hasValue: true, source: "SYSTEM" },
  { key: "INITIATE_CHECKOUT", metaName: "InitiateCheckout", label: "InitiateCheckout", hasValue: false, source: "SYSTEM" },
  { key: "ADD_PAYMENT_INFO", metaName: "AddPaymentInfo", label: "AddPaymentInfo", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_SHIPPED", metaName: "OrderShipped", label: "OrderShipped", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_DELIVERED", metaName: "OrderDelivered", label: "OrderDelivered", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_CANCELED", metaName: "OrderCanceled", label: "OrderCanceled", hasValue: true, source: "SYSTEM" },
  { key: "ORDER_RETURNED", metaName: "OrderReturned", label: "OrderReturned", hasValue: true, source: "SYSTEM" },
  { key: "VIEW_CONTENT", metaName: "ViewContent", label: "ViewContent", hasValue: true, source: "SYSTEM" },
  { key: "CART_ABANDONED", metaName: "CartAbandoned", label: "CartAbandoned", hasValue: true, source: "SYSTEM" },
  { key: "LEAD_SUBMITTED", metaName: "LeadSubmitted", label: "LeadSubmitted", hasValue: true, source: "TAG_RULE" },
  { key: "QUALIFIED_LEAD", metaName: "QualifiedLead", label: "QualifiedLead", hasValue: true, source: "TAG_RULE" },
];

// PaymentSlipAttached ไม่มีจุดเกิดแยก — รวมใน AddPaymentInfo (PRD Q2) จึงไม่อยู่ในรายการเลย
export const SELECTABLE_EVENTS = CAPI_EVENTS;
