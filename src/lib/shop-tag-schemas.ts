// 00083 — 🛑 ห้ามถูก import จาก client component (ลาก node:crypto ผ่าน shop-tag-match → auto-order-normalize)
import * as v from "valibot";
import { normalizeTriggerPhrase } from "@/lib/auto-order-normalize";
import {
  SHOP_TAG_LIMITS as L,
  charLen,
  cleanKeyword,
  cleanTagName,
  dedupeKeywords,
} from "@/lib/shop-tag-match";

const NameSchema = v.pipe(
  v.string("ชื่อแท็กไม่ถูกต้อง"),
  v.transform(cleanTagName),
  v.check(
    (s) => charLen(s) >= 1 && charLen(s) <= L.nameMax,
    `ชื่อแท็กต้องยาว 1-${L.nameMax} ตัวอักษร`,
  ),
);

const KeywordSchema = v.pipe(
  v.string("คำไม่ถูกต้อง"),
  v.transform(cleanKeyword),
  v.check(
    (s) => charLen(s) >= L.keywordMin && charLen(s) <= L.keywordMax,
    `คำต้องยาว ${L.keywordMin}-${L.keywordMax} ตัวอักษร`,
  ),
  // กันคำที่เหลือแต่ช่องว่างไร้ความกว้าง (ZWSP) — normalize แล้วว่าง
  v.check(
    (s) => normalizeTriggerPhrase(s).length >= L.keywordMin,
    `คำต้องมีตัวอักษรจริงอย่างน้อย ${L.keywordMin} ตัว`,
  ),
);

// นับก่อน dedupe (maxLength อยู่หน้า transform)
const KeywordsSchema = v.pipe(
  v.array(KeywordSchema, "คำของแท็กไม่ถูกต้อง"),
  v.maxLength(L.maxKeywords, `ใส่คำได้ไม่เกิน ${L.maxKeywords} คำต่อแท็ก`),
  v.transform(dedupeKeywords),
);

export const ShopTagCreateSchema = v.strictObject({
  name: NameSchema,
  keywords: v.optional(KeywordsSchema, []),
  removeOnOrderCreate: v.optional(v.boolean(), false),
});

export const ShopTagPatchSchema = v.pipe(
  v.strictObject({
    name: v.optional(NameSchema),
    keywords: v.optional(KeywordsSchema),
    removeOnOrderCreate: v.optional(v.boolean()),
  }),
  v.check(
    (o) => Object.values(o).some((x) => x !== undefined),
    "ต้องแก้อย่างน้อย 1 ค่าของแท็ก",
  ),
);

export const ShopTagIdSchema = v.pipe(v.string(), v.uuid());
