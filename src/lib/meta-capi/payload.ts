// feature 00089 — สร้าง body ของ Conversions API for Business Messaging (BR-CAPI-04 · FR-007)

import { round2 } from "@/lib/round2";

export type ValueMode = "NET" | "NO_VAT";

const MAX_CONTENTS = 100;

type Money = string | number | { toString(): string } | null | undefined;

/** ยอดที่ส่ง — `totalAmount` คือตัวเดียวกับหน้าคำสั่งซื้อ (= subtotal − discount + VAT) ห้ามคิดใหม่ (HR16) */
export function orderValue(o: { totalAmount: Money; vatAmount: Money }, mode: ValueMode): number {
  const total = Number(o.totalAmount ?? 0);
  const vat = mode === "NO_VAT" ? Number(o.vatAmount ?? 0) : 0;
  return round2(Math.max(0, total - vat));
}

export interface CapiItem {
  id: string;
  quantity: number;
  price: number;
}

export interface CapiEventInput {
  eventName: string;
  eventTime: Date;
  pageId: string;
  psid: string;
  value?: number;
  orderId?: string;
  items?: CapiItem[];
  testEventCode?: string | null;
  /** กันนับซ้ำเมื่อส่งสำเร็จแต่บันทึกผลไม่ทัน (ระบบล่มกลางทาง) แล้วถูกส่งอีกรอบ */
  eventId?: string;
}

interface CustomData {
  currency: "THB";
  value: number;
  order_id?: string;
  num_items?: number;
  contents?: { id: string; quantity: number; item_price: number }[];
}

export interface CapiBody {
  data: {
    event_name: string;
    event_time: number;
    event_id?: string;
    action_source: "business_messaging";
    messaging_channel: "messenger";
    user_data: { page_id: string; page_scoped_user_id: string };
    custom_data?: CustomData;
  }[];
  test_event_code?: string;
}

/** ตัวตนลูกค้า = page_id + PSID เท่านั้น ไม่ส่งเบอร์/อีเมล/ชื่อ (PRD 4.1) */
export function buildCapiBody(e: CapiEventInput): CapiBody {
  let custom: CustomData | undefined;
  if (e.value !== undefined) {
    custom = { currency: "THB", value: round2(e.value) };
    if (e.orderId) custom.order_id = e.orderId;
    if (e.items) {
      custom.num_items = e.items.reduce((s, i) => s + i.quantity, 0);
      if (e.items.length <= MAX_CONTENTS)
        custom.contents = e.items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: round2(i.price) }));
    }
  }
  return {
    data: [
      {
        event_name: e.eventName,
        event_time: Math.floor(e.eventTime.getTime() / 1000),
        ...(e.eventId ? { event_id: e.eventId } : {}),
        action_source: "business_messaging",
        messaging_channel: "messenger",
        user_data: { page_id: e.pageId, page_scoped_user_id: e.psid },
        ...(custom ? { custom_data: custom } : {}),
      },
    ],
    ...(e.testEventCode ? { test_event_code: e.testEventCode } : {}),
  };
}
