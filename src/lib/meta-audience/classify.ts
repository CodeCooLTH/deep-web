// feature 00092 — ตัดสินผลเรียก Marketing API · ฐานเดียวกับ classifySendResult ของ 00089 (รหัส STOP/RETRY ชุดเดียวกัน)
import { classifySendResult } from "@/lib/meta-capi/classify";

/** TERMS = ยังไม่ยอมรับข้อตกลง Custom Audience · GONE = audience ถูกลบใน Ads Manager */
export type AudienceOutcome = "OK" | "RETRY" | "STOP" | "FAIL" | "TERMS" | "GONE";

type ErrBody = { error?: { code?: number; error_subcode?: number; message?: string } };

export function classifyAudienceResult(httpStatus: number, body: unknown): AudienceOutcome {
  if (httpStatus >= 200 && httpStatus < 300) return "OK";
  const e = ((body ?? {}) as ErrBody).error;
  const msg = e?.message ?? "";
  // shortcut: subcode 1870090 จำมาจากเอกสาร ยังไม่ได้ยิงจริง — ข้อความ "Terms Not Accepted" เป็นตัวสำรอง · แก้เมื่อทดสอบจริง
  if (e?.error_subcode === 1870090 || /custom audience terms/i.test(msg) || /terms not accepted/i.test(msg)) return "TERMS";
  if (e?.code === 803 || (e?.code === 100 && (e.error_subcode === 33 || /does not exist/i.test(msg)))) return "GONE";
  return classifySendResult(httpStatus, body);
}

export const termsUrl = (adAccountId: string) =>
  `https://business.facebook.com/ads/manage/customaudiences/tos/?act=${adAccountId}`;

export const adsManagerUrl = (adAccountId: string, audienceId: string) =>
  `https://business.facebook.com/adsmanager/audiences?act=${adAccountId}&selected_audience_ids=${audienceId}`;

export const audienceName = (shopName: string) => `Deep · ลูกค้าที่ซื้อแล้ว · ${shopName}`;
