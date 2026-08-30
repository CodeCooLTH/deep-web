/**
 * 00061 — ตัวแกะข้อความสรุปคำสั่งซื้อที่ร้านพิมพ์เอง (SRS TFR-005, TFR-006, TFR-007)
 *
 * pure ทั้งไฟล์ — ไม่มี I/O ไม่ import prisma
 *
 * 🛑 ไฟล์นี้ **ไม่แยกที่อยู่เอง** — ส่ง block ของหัวข้อ `ที่อยู่:` ต่อให้ `parseOrderMessage()`
 * (`parse-order-message.ts`) ซึ่งถือรายชื่อ 77 จังหวัดที่สะกดตรงกับชุดข้อมูล iShip
 * คอมเมนต์ในไฟล์นั้นเขียนเตือนไว้เองว่า "ห้ามแก้การสะกดให้ต่างจากชุดข้อมูลนั้น: ค่าที่ได้ตรงนี้
 * ถูกส่งต่อไปเปิดพัสดุจริง" ⇒ เขียนตัวแยกที่อยู่ใหม่ = สร้าง SSOT ที่สองที่สะกดจังหวัดต่างกันได้
 * (คลาสบั๊กที่รีโปนี้เคยเจอจริง — ตำบล/อำเภอสลับ 23 ออเดอร์บน prod เมื่อ 2026-08-07)
 */
import { parseOrderMessage } from "@/lib/parse-order-message";
import { normalizeTriggerPhrase } from "@/lib/auto-order-normalize";

export type ParsedAutoOrderItem = {
  rawName: string;
  qty: number;
  /** 🛑 `null` = ร้านไม่ได้พิมพ์ราคา — ห้ามแทนด้วย 0 เด็ดขาด (TFR-007) */
  price: number | null;
};

export type ParsedAutoOrderMessage = {
  customerName: string | null;
  phone: string | null;
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postcode: string | null;
  items: ParsedAutoOrderItem[];
  discount: number | null;
  statedTotal: number | null;
  note: string | null;
  paymentMethod: string | null;
};

type ScalarField =
  | "customerName"
  | "phone"
  | "address"
  | "discount"
  | "statedTotal"
  | "note"
  | "paymentMethod";

type FieldSlot = ScalarField | "ITEMS";

/**
 * หัวข้อ + คำพ้องที่รองรับ (BR-ACO-11)
 * เทียบแบบ **ตรงเป๊ะกับข้อความหน้า `:`** (หลัง normalize) ไม่ใช่ prefix match
 * ⇒ `ที่อยู่จัดส่ง` กับ `ที่อยู่` แยกกันได้เองโดยไม่ต้องเรียงลำดับความยาว
 */
const HEADER_ALIASES: Record<string, FieldSlot> = {
  ชื่อ: "customerName",
  ชื่อผู้รับ: "customerName",
  ผู้รับ: "customerName",

  เบอร์: "phone",
  เบอร์โทร: "phone",
  โทร: "phone",
  เบอร์ติดต่อ: "phone",
  tel: "phone",

  ที่อยู่: "address",
  ที่อยู่จัดส่ง: "address",
  ที่อยู่จัดส่งสินค้า: "address",

  รายการ: "ITEMS",
  รายการสินค้า: "ITEMS",
  สินค้า: "ITEMS",

  ส่วนลด: "discount",
  discount: "discount",

  ยอดรวม: "statedTotal",
  ยอด: "statedTotal",
  รวม: "statedTotal",
  total: "statedTotal",

  หมายเหตุ: "note",
  note: "note",

  ชำระโดย: "paymentMethod",
  ชำระ: "paymentMethod",
  วิธีชำระ: "paymentMethod",
  payment: "paymentMethod",
};

/** ตัดคอมมาออกแล้วแปลงเป็นตัวเลข — คืน null ถ้าไม่ใช่ตัวเลขล้วน */
function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * แกะบรรทัดรายการสินค้า `- ชื่อ xN @ราคา` (TFR-007)
 *
 * แกะเป็นขั้นจากท้ายมาหน้า ไม่ใช้ regex ก้อนเดียว — เพราะ regex ที่มีกลุ่ม optional ต่อกันหลายชั้น
 * ตีความกำกวมได้เมื่อชื่อสินค้ามีตัวอักษร `x` หรือ `@` อยู่ในตัว และ debug ยากมากเมื่อพลาด
 */
export function parseItemLine(line: string): ParsedAutoOrderItem | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("-")) return null;

  let rest = trimmed.slice(1).trim();
  if (!rest) return null;

  // ขั้น 1 — ราคา: `@` ตัวสุดท้ายที่ตามด้วยตัวเลขจนจบบรรทัดเท่านั้น
  let price: number | null = null;
  const priceMatch = rest.match(/\s*@\s*([\d,]+(?:\.\d+)?)\s*$/);
  if (priceMatch) {
    price = toNumber(priceMatch[1]);
    rest = rest.slice(0, priceMatch.index).trim();
  }

  // ขั้น 2 — จำนวน: `xN` ท้ายส่วนที่เหลือ (ต้องมีช่องว่างนำหน้า กันชื่อสินค้าที่ลงท้ายด้วย x เช่น "iPhone x")
  let qty = 1;
  const qtyMatch = rest.match(/\s+[xX]\s*(\d+)\s*$/);
  if (qtyMatch) {
    const parsed = Number(qtyMatch[1]);
    if (parsed > 0) {
      qty = parsed;
      rest = rest.slice(0, qtyMatch.index).trim();
    }
  }

  const rawName = rest.trim();
  if (!rawName) return null;
  return { rawName, qty, price };
}

/** ถ้าบรรทัดนี้เป็นหัวข้อ คืน slot ที่มันเปิด + ข้อความหลัง `:` */
function matchHeader(line: string): { slot: FieldSlot; value: string } | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const key = normalizeTriggerPhrase(line.slice(0, idx));
  const slot = HEADER_ALIASES[key];
  if (!slot) return null;
  return { slot, value: line.slice(idx + 1).trim() };
}

/**
 * matchesTriggerPhrase — เทียบ **ข้อความดิบ** กับวลีที่ normalize แล้ว
 * (normalize ทั้งสองฝั่งด้วย `normalizeTriggerPhrase` ตัวเดียวกัน แล้วเช็ค substring)
 */
export function matchesTriggerPhrase(
  rawBody: string,
  phrases: string[],
): string | null {
  const haystack = normalizeTriggerPhrase(rawBody);
  for (const raw of phrases) {
    // normalize ฝั่งวลีด้วยเสมอ แม้ผู้เรียกควรส่งค่าที่ normalize มาแล้วจาก
    // `AutoOrderAgentPhrase.normalizedPhrase` — ฟังก์ชันเป็น idempotent จึงไม่มีต้นทุน
    // และทำให้ผลลัพธ์ไม่ขึ้นกับว่าผู้เรียกจำได้ไหมว่าต้อง normalize ก่อน
    const phrase = normalizeTriggerPhrase(raw);
    if (phrase && haystack.includes(phrase)) return phrase;
  }
  return null;
}

export function parseAutoOrderMessage(rawBody: string): ParsedAutoOrderMessage {
  const scalars: Record<ScalarField, string | null> = {
    customerName: null,
    phone: null,
    address: null,
    discount: null,
    statedTotal: null,
    note: null,
    paymentMethod: null,
  };
  const items: ParsedAutoOrderItem[] = [];
  let current: FieldSlot | null = null;

  for (const line of rawBody.split(/\r?\n/)) {
    const header = matchHeader(line);

    if (header) {
      current = header.slot;
      if (header.slot !== "ITEMS") {
        // 🛑 หัวข้อสเกลาร์ซ้ำ = ค่าหลังสุดชนะ (TFR-006)
        // ร้านพิมพ์แก้ต่อท้ายในข้อความเดียวกันเป็นพฤติกรรมจริง — ค่าล่าสุดคือเจตนาจริง
        scalars[header.slot] = header.value || null;
      }
      continue;
    }

    if (current === "ITEMS") {
      // 🛑 `รายการ:` ซ้ำ = สะสมต่อกัน (append) **ต่างจากสเกลาร์โดยตั้งใจ** (TFR-006)
      // overwrite = ทำสินค้าที่พิมพ์ไว้ก่อนหน้าหายเงียบ ซึ่งขัด BR-ACO-19 ตรงกว่าความเสี่ยงนับซ้ำ
      // (ถ้านับซ้ำจริงจะโผล่เป็นยอดไม่ตรงแล้วตกร่างอยู่ดี — ส่งเสียง ไม่เงียบ)
      const item = parseItemLine(line);
      if (item) items.push(item);
      // บรรทัดที่ไม่ขึ้นต้นด้วย `-` ในโหมดรายการ → ข้ามเฉย ๆ ไม่นับเป็น field ต่อเนื่อง
      continue;
    }

    if (current && line.trim()) {
      // ต่อบรรทัดให้ field สเกลาร์ที่เปิดอยู่ (ที่อยู่/หมายเหตุยาวหลายบรรทัดได้)
      scalars[current] = scalars[current]
        ? `${scalars[current]}\n${line.trim()}`
        : line.trim();
    }
    // current === null → ยังไม่เจอหัวข้อแรก มักเป็นตัววลีจุดชนวนเอง → ทิ้ง
  }

  const addressBlock = scalars.address;
  const addr = addressBlock ? parseOrderMessage(addressBlock) : {};

  return {
    customerName: scalars.customerName,
    phone: scalars.phone,
    addressLine: addr.addressLine ?? (addressBlock || null),
    subdistrict: addr.subdistrict ?? null,
    district: addr.district ?? null,
    province: addr.province ?? null,
    postcode: addr.postcode ?? null,
    items,
    discount: scalars.discount ? toNumber(scalars.discount) : null,
    statedTotal: scalars.statedTotal ? toNumber(scalars.statedTotal) : null,
    note: scalars.note,
    paymentMethod: scalars.paymentMethod,
  };
}
