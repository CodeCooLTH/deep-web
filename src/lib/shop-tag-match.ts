/**
 * 00083 — ตัวเทียบคำของ "ติดแท็กอัตโนมัติตามคำ" (SRS TFR-006) — pure
 *
 * 🛑 ห้ามถูก import จาก client component (ลาก node:crypto ผ่าน auto-order-normalize)
 * 🛑 ห้ามใช้ normalizeMessage() ของ auto-reply — มันแทน "/" ด้วยช่องว่าง ทำให้ `/go` ชน `go`
 */
import { normalizeTriggerPhrase } from "@/lib/auto-order-normalize";
import { matchesTriggerPhrase } from "@/lib/auto-order-parser";

// ที่มาเดียวของเพดาน — หน้า server ส่งเป็น prop ให้ client (TD-011)
export const SHOP_TAG_LIMITS = {
  maxTags: 50,
  maxKeywordTags: 20,
  maxKeywords: 10,
  nameMax: 30,
  keywordMin: 2,
  keywordMax: 50,
} as const;

/** นับเป็น code point ให้ตรง char_length ของ DB (emoji astral = 1) */
export const charLen = (s: string): number => Array.from(s).length;

/** "tag เดียวกัน" ตัดสินที่นี่ที่เดียว (TD-001) */
export const tagNameKey = (s: string): string =>
  s.normalize("NFC").toLowerCase().trim();

export const cleanTagName = (s: string): string => s.normalize("NFC").trim();

export const cleanKeyword = (s: string): string =>
  s.normalize("NFC").replace(/\s+/g, " ").trim();

/** รวมคำซ้ำด้วย key เดียวกับตัวเทียบ เก็บสะกดตัวแรก คงลำดับ */
export function dedupeKeywords(raws: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of raws) {
    const key = normalizeTriggerPhrase(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

/** สตริงใน tags ของห้องที่ถือเป็น tag เดียวกับ nameKey */
export const variantsIn = (tags: string[], nameKey: string): string[] =>
  tags.filter((t) => tagNameKey(t) === nameKey);

export function matchTagKeywords(
  rawBody: string,
  tags: { name: string; keywords: string[] }[],
): { name: string; keyword: string }[] {
  const out: { name: string; keyword: string }[] = [];
  for (const tag of tags) {
    if (tag.keywords.length === 0) continue;
    const keyword = matchesTriggerPhrase(rawBody, tag.keywords);
    if (keyword) out.push({ name: tag.name, keyword });
  }
  return out;
}
