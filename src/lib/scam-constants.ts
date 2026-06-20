// Client-safe constants สำหรับ Scam Report — ไม่มี crypto/secret (import ได้ทั้ง client + server)
// lib/scam-identifier.ts (มี HMAC) import type/labels จากที่นี่ เพื่อให้ SSOT เดียว

export type IdentifierType = "PHONE" | "NAME" | "NATIONAL_ID" | "BANK_ACCOUNT";

export const IDENTIFIER_TYPES: IdentifierType[] = [
  "PHONE",
  "NAME",
  "NATIONAL_ID",
  "BANK_ACCOUNT",
];

export const IDENTIFIER_LABELS: Record<IdentifierType, string> = {
  PHONE: "เบอร์โทรศัพท์",
  NAME: "ชื่อ-นามสกุล",
  NATIONAL_ID: "เลขบัตรประชาชน",
  BANK_ACCOUNT: "เลขบัญชีธนาคาร",
};

export const IDENTIFIER_PLACEHOLDERS: Record<IdentifierType, string> = {
  PHONE: "เช่น 0812345678",
  NAME: "เช่น สมชาย ใจดี",
  NATIONAL_ID: "เลขบัตร 13 หลัก",
  BANK_ACCOUNT: "เลขบัญชี (ตัวเลขล้วน)",
};

export const SCAM_TYPE_LABELS: Record<string, string> = {
  TRANSFER_NO_DELIVERY: "โอนแล้วไม่ส่งของ",
  ITEM_NOT_AS_DESCRIBED: "สินค้าไม่ตรงปก",
  FAKE_INVESTMENT: "หลอกลงทุน",
  OTHER: "อื่น ๆ",
};

export const SCAM_TYPE_OPTIONS = Object.entries(SCAM_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);
