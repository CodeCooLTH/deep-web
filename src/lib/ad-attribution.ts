/**
 * 00091 — เลือก "แอดที่ลูกค้าคลิกล่าสุดก่อนสร้างคำสั่งซื้อ" (pure — ไม่แตะ DB)
 * BR-ATT-01: source = ADS เท่านั้น (SHORTLINK ไม่นับ) · receivedAt ≤ เวลาอ้างอิง · ไม่จำกัดระยะเวลา
 */
export interface AdReferralRow {
  source: string | null;
  adId: string | null;
  adTitle: string | null;
  photoFileId: string | null;
  receivedAt: Date;
}

export interface OrderAdAttribution {
  adId: string;
  adTitle: string | null;
  adClickedAt: Date;
  adPhotoFileId: string | null;
}

/** รูปที่ส่งข้ามเส้น server→client ได้ (serializable) — ใช้ทุกจุดแสดงผลของ 00091 */
export interface OrderAdView {
  adId: string;
  adTitle: string | null;
  adPhotoFileId: string | null;
  adClickedAtISO: string | null;
}

/** null = ใบนี้ไม่ได้มาจากแอด → ทุกจุดต้องไม่ render อะไรเลย */
export function toOrderAdView(o: {
  adId?: string | null;
  adTitle?: string | null;
  adPhotoFileId?: string | null;
  adClickedAt?: Date | string | null;
}): OrderAdView | null {
  if (!o.adId) return null;
  return {
    adId: o.adId,
    adTitle: o.adTitle ?? null,
    adPhotoFileId: o.adPhotoFileId ?? null,
    adClickedAtISO: o.adClickedAt ? new Date(o.adClickedAt).toISOString() : null,
  };
}

/**
 * เวลาอ้างอิงจากตัวเลือกเวลาแบบนาที (วินาที+มิลลิวินาที = 0) แปลว่า "ทั้งนาทีนั้น" — คลิกที่ 09:23:19
 * ต้องนับกับใบที่เวลา 09:23:00 · เวลาที่มีวินาทีจริง (เช่น ตอนกดยืนยัน) ไม่เปลี่ยน
 * เลือกปลายนาทีแทนใช้เวลาบันทึกจริง เพราะเวลาบันทึกไม่ถูกเก็บแยกและใบย้อนหลังต้องไม่ดึงคลิกหลังนาทีนั้นมา
 */
export function effectiveReferenceTime(referenceTime: Date): Date {
  const t = referenceTime.getTime();
  return t % 60_000 === 0 ? new Date(t + 59_999) : referenceTime;
}

export function pickAdAttribution(rows: AdReferralRow[], referenceTime: Date): OrderAdAttribution | null {
  referenceTime = effectiveReferenceTime(referenceTime);
  let best: AdReferralRow | null = null;
  for (const r of rows) {
    // ไม่มี adId = ไม่รู้ว่าแอดไหน จึงไม่มีอะไรให้บันทึก
    if (r.source !== "ADS" || !r.adId) continue;
    if (r.receivedAt.getTime() > referenceTime.getTime()) continue;
    if (!best || r.receivedAt.getTime() > best.receivedAt.getTime()) best = r;
  }
  if (!best || !best.adId) return null;
  return { adId: best.adId, adTitle: best.adTitle, adClickedAt: best.receivedAt, adPhotoFileId: best.photoFileId };
}

/**
 * ชื่อที่แสดงบนจอ — ชื่อแอด · ไม่มีชื่อแต่มีรหัส = ข้อความ "รหัสโฆษณา {adId}" · ไม่มีทั้งคู่ = null (ไม่ render อะไรเลย)
 * @param idFallbackTemplate คีย์ i18n `inbox.contextBar.adIdFallback` (มี `{adId}`) — ส่งเข้ามาเพื่อให้ไฟล์นี้ยัง pure
 */
export function adDisplayName(
  adTitle: string | null | undefined,
  adId: string | null | undefined,
  idFallbackTemplate: string,
): string | null {
  const title = adTitle?.trim();
  if (title) return title;
  return adId ? idFallbackTemplate.replace("{adId}", adId) : null;
}

/**
 * 🛑 neutralize ที่ต้นทาง (PII ต้อง mask ที่ source): ชื่อ/รหัส/รูปแคมเปญเป็นของร้าน ผู้ซื้อต้องไม่ได้คีย์เหล่านี้เลย
 * ใช้กับทุก payload การ์ดคำสั่งซื้อในแชทที่ผู้ซื้อเรียกร่วมได้ (chat-thread-messages) — ไม่ใช่แค่ซ่อนใน component
 */
export function orderAdFieldsForViewer(
  o: { adId?: string | null; adTitle?: string | null; adPhotoFileId?: string | null },
  viewerIsBuyer: boolean,
): { adId?: string | null; adTitle?: string | null; adPhotoFileId?: string | null } {
  if (viewerIsBuyer) return {};
  return { adId: o.adId ?? null, adTitle: o.adTitle ?? null, adPhotoFileId: o.adPhotoFileId ?? null };
}
