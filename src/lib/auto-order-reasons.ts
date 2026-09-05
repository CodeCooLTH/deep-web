/**
 * 00061 — ชั้นตัดสิน "ข้อความนี้ครบพอสร้างออเดอร์จริงไหม" (SRS TFR-010, TFR-014)
 *
 * pure ทั้งไฟล์ — ไม่มี I/O ไม่ import prisma **โดยตั้งใจ**
 * ตรรกะที่ซับซ้อนที่สุดของฟีเจอร์อยู่ที่นี่ ⇒ ต้องพิสูจน์ด้วย mutation ได้โดยไม่ต้องแตะ DB
 * (ส่วนที่ต้อง query — จับคู่สินค้า — อยู่ที่ `auto-order-validate.service.ts` ซึ่งห่อไฟล์นี้อีกที)
 */
import { MOBILE_PHONE_RE } from "@/lib/phone";
import { isOrderDateInWindow } from "@/lib/order-date-window";
import { round2 } from "@/lib/round2";

export type DraftReasonCode =
  | "NO_PHONE"
  | "INVALID_PHONE"
  | "ADDRESS_INCOMPLETE"
  | "DATE_OUT_OF_WINDOW"
  | "NO_ITEMS"
  | "ITEM_PRICE_MISSING"
  | "ITEM_NOT_MATCHED"
  | "TOTAL_MISMATCH"
  /**
   * 🛑 เหตุผล "ระดับระบบ" — ประมวลผลไม่สำเร็จ (timeout/crash)
   * ค่านี้ **ไม่เคยถูกผลิตโดย `deriveDraftReasons()` เลยสักกิ่ง** — เขียนได้จากที่เดียวคือ
   * `writeProcessingFailedDraft()` ของ watchdog ซึ่งไม่มีช่องรับ `reasons` จากใคร
   * ⇒ ไม่มีจุดใดในโค้ดที่ค่านี้ปนกับเหตุผลเชิงเนื้อหาได้ (DB CHECK เป็นด่านสุดท้ายที่ไม่ควรถูกชน)
   */
  | "PROCESSING_FAILED";

export type DraftReasonInput = {
  phone: string | null;
  shipsGoods: boolean;
  address: {
    line1: string | null;
    province: string | null;
    postcode: string | null;
  } | null;
  items: {
    rawName: string;
    matchedProductId: string | null;
    qty: number;
    price: number | null;
  }[];
  /** ส่วนลดที่ร้านพิมพ์ (`ส่วนลด:`) — `null` = ไม่ได้พิมพ์ ⇒ นับเป็น 0 ตอนคำนวณ */
  discount: number | null;
  statedTotal: number | null;
  messageAtMs: number;
  nowMs: number;
};

/**
 * ลำดับการแสดงผล — ตรงกับลำดับ "ช่องจริง" ใน `QuickForm.tsx`
 * (ลูกค้า → ช่องทาง/ชำระ → **วันที่** → รายการ → สรุปยอด)
 * 🛑 วันที่อยู่ตำแหน่งที่ 3 ไม่ใช่ท้ายสุด — ยืนยันจากฟอร์มจริง ไม่ใช่จากสัญชาตญาณ
 *
 * แยกจาก `deriveDraftReasons()` เพื่อให้การเปลี่ยน **ลำดับแสดงผล (เรื่อง UX)**
 * ไม่ต้องแตะ **ตรรกะตัดสินใจ (เรื่อง business logic)**
 */
const DISPLAY_ORDER: DraftReasonCode[] = [
  "NO_PHONE",
  "INVALID_PHONE",
  "ADDRESS_INCOMPLETE",
  "DATE_OUT_OF_WINDOW",
  "NO_ITEMS",
  "ITEM_PRICE_MISSING",
  "ITEM_NOT_MATCHED",
  "TOTAL_MISMATCH",
  "PROCESSING_FAILED",
];

export function sortDraftReasons(reasons: DraftReasonCode[]): DraftReasonCode[] {
  return [...reasons].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a) - DISPLAY_ORDER.indexOf(b),
  );
}

/**
 * ยอดที่ระบบคำนวณได้จากรายการที่ร้านพิมพ์ — ใช้ทั้งตอนเทียบ `TOTAL_MISMATCH`
 * และตอนแสดง "คำนวณได้ ฿X" บนการ์ด **ต้องเป็นตัวเดียวกัน**
 *
 * 🛑 ต้องหักส่วนลดด้วยเสมอ — นิยาม "ยอดรวม" ของทั้งระบบคือ `subtotal − discount + vat`
 * (`order.service.ts:332-334`) **ไม่ใช่ `subtotal` เปล่า ๆ**
 *
 * 📝 SRS TFR-010 ข้อ 5 / TFR-012 ฉบับแรกเขียนว่าเทียบ `sum(qty*price)` เฉย ๆ (ลืมส่วนลด)
 * จับได้ตอน implement: เทมเพลตตัวอย่างของฟีเจอร์เอง (`2×250 + @390` · `ส่วนลด: 50` · `ยอดรวม: 840`)
 * จะได้ `TOTAL_MISMATCH` ทุกครั้ง เพราะ 890 ≠ 840 ⇒ **happy path ของตัวเองไม่มีวันผ่าน**
 * SRS ถูกแก้ให้ตรงแล้ว — นี่คือ HR16 (ศัพท์ธุรกิจต้องมีนิยามเดียวทั้งระบบ)
 *
 * ยังไม่รองรับ VAT เพราะเทมเพลตไม่มีหัวข้อภาษี — 🛑 วันที่เพิ่มหัวข้อนั้น **ต้องมาเติมที่นี่ด้วย**
 */
export function computeItemsTotal(input: {
  items: { qty: number; price: number | null }[];
  discount: number | null;
}): number {
  const subtotal = round2(
    input.items.reduce((sum, i) => sum + i.qty * (i.price ?? 0), 0),
  );
  return round2(subtotal - (input.discount ?? 0));
}

/**
 * 🛑 สะสมทุกเหตุผล ห้าม short-circuit เด็ดขาด (BR-ACO-20)
 * ร้านต้องเห็นทุกอย่างที่ต้องแก้ในรอบเดียว ไม่ใช่แก้ทีละข้อแล้วเจอข้อถัดไป
 */
export function deriveDraftReasons(input: DraftReasonInput): DraftReasonCode[] {
  const reasons: DraftReasonCode[] = [];

  // 1) เบอร์ — "ไม่มี" กับ "มีแต่ผิดรูป" เป็นคนละเหตุผล ไม่ปนกัน (AC-32/33)
  if (input.phone === null || input.phone.trim() === "") {
    reasons.push("NO_PHONE");
  } else if (!MOBILE_PHONE_RE.test(input.phone.trim())) {
    reasons.push("INVALID_PHONE");
  }

  // 2) ที่อยู่ — บังคับเฉพาะร้านที่ส่งของจริง
  if (input.shipsGoods) {
    const a = input.address;
    if (!a?.line1?.trim() || !a?.province?.trim() || !a?.postcode?.trim()) {
      reasons.push("ADDRESS_INCOMPLETE");
    }
  }

  // 3) วันที่ — ใช้เพดานเดิมของระบบ (90 วันย้อนหลัง / 7 วันล่วงหน้า) ไม่ประกาศเลขใหม่
  if (!isOrderDateInWindow(input.messageAtMs, input.nowMs)) {
    reasons.push("DATE_OUT_OF_WINDOW");
  }

  // 4) รายการสินค้า
  const hasItems = input.items.length > 0;
  if (!hasItems) {
    reasons.push("NO_ITEMS");
  } else {
    // ครั้งเดียวไม่ว่ากี่รายการที่ขาด — ร้านต้องไล่ดูทั้งบล็อกอยู่ดี
    if (input.items.some((i) => i.price === null)) {
      reasons.push("ITEM_PRICE_MISSING");
    }
    if (input.items.some((i) => i.matchedProductId === null)) {
      reasons.push("ITEM_NOT_MATCHED");
    }
  }

  // 5) ยอดรวม — 🛑 เช็คเฉพาะเมื่อรายการผ่านครบข้อ 4 แล้วเท่านั้น
  // ยอดที่คำนวณจากรายการที่ยังขาดราคา/ยังจับคู่สินค้าไม่ได้ **ไม่มีความหมาย**
  // เทียบแล้วจะได้ TOTAL_MISMATCH ปลอมที่ซ้ำเติมสิ่งที่ผู้ขายต้องแก้อยู่แล้วโดยไม่ให้ข้อมูลใหม่
  const itemsClean =
    hasItems &&
    !reasons.includes("ITEM_PRICE_MISSING") &&
    !reasons.includes("ITEM_NOT_MATCHED");
  if (itemsClean && input.statedTotal !== null) {
    if (round2(input.statedTotal) !== computeItemsTotal(input)) {
      reasons.push("TOTAL_MISMATCH");
    }
  }

  return sortDraftReasons(reasons);
}
