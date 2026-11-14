import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { adDisplayName, orderAdFieldsForViewer, pickAdAttribution, type AdReferralRow } from "../ad-attribution";

const d = (s: string) => new Date(s);
const row = (o: Partial<AdReferralRow>): AdReferralRow => ({
  source: "ADS", adId: "A1", adTitle: "โปรล้อแม็ก", photoFileId: null, receivedAt: d("2026-11-01T00:00:00Z"), ...o,
});

describe("pickAdAttribution (00091)", () => {
  it("เลือกตัวล่าสุดที่เวลา ≤ เวลาอ้างอิง (ตัวอย่างใน PRD)", () => {
    const rows = [
      row({ adId: "A1", adTitle: "โปรล้อแม็ก", receivedAt: d("2026-11-01T03:00:00Z") }),
      row({ adId: "A2", adTitle: "ไฟหน้า LED", photoFileId: "f2", receivedAt: d("2026-11-05T03:00:00Z") }),
      row({ adId: "A3", adTitle: "ใหม่หลังสร้าง", receivedAt: d("2026-11-08T03:00:00Z") }),
    ];
    expect(pickAdAttribution(rows, d("2026-11-06T03:00:00Z"))).toEqual({
      adId: "A2", adTitle: "ไฟหน้า LED", adClickedAt: d("2026-11-05T03:00:00Z"), adPhotoFileId: "f2",
    });
  });
  it("คลิกเวลาเดียวกับเวลาอ้างอิงนับ (≤)", () => {
    const t = d("2026-11-06T03:00:00Z");
    expect(pickAdAttribution([row({ receivedAt: t })], t)?.adId).toBe("A1");
  });
  it("ไม่เลือก SHORTLINK แม้ใหม่กว่า", () => {
    const rows = [row({ adId: "A1", receivedAt: d("2026-11-01T00:00:00Z") }), row({ source: "SHORTLINK", adId: "S", receivedAt: d("2026-11-05T00:00:00Z") })];
    expect(pickAdAttribution(rows, d("2026-11-06T00:00:00Z"))?.adId).toBe("A1");
  });
  it("ไม่มีแถวที่ผ่านเงื่อนไข / ไม่มี adId = null", () => {
    expect(pickAdAttribution([], d("2026-11-06T00:00:00Z"))).toBeNull();
    expect(pickAdAttribution([row({ receivedAt: d("2026-11-07T00:00:00Z") })], d("2026-11-06T00:00:00Z"))).toBeNull();
    expect(pickAdAttribution([row({ adId: null })], d("2026-11-06T00:00:00Z"))).toBeNull();
    expect(pickAdAttribution([row({ source: null })], d("2026-11-06T00:00:00Z"))).toBeNull();
  });
  it("adDisplayName: ชื่อ > รหัส > null", () => {
    expect(adDisplayName("โปรล้อแม็ก", "A1", "รหัสโฆษณา {adId}")).toBe("โปรล้อแม็ก");
    expect(adDisplayName("  ", "A1", "รหัสโฆษณา {adId}")).toBe("รหัสโฆษณา A1");
    expect(adDisplayName(null, null, "รหัสโฆษณา {adId}")).toBeNull();
  });
  it("ชื่อ/รูปว่างได้ (คงเป็น null)", () => {
    expect(pickAdAttribution([row({ adTitle: null })], d("2026-11-06T00:00:00Z"))).toMatchObject({ adTitle: null, adPhotoFileId: null });
  });
});

describe("orderAdFieldsForViewer — ผู้ซื้อต้องไม่ได้ชื่อแคมเปญของร้าน (00091)", () => {
  const o = { adId: "A1", adTitle: "โปรล้อแม็ก", adPhotoFileId: "ph1" };
  it("ผู้ซื้อ = ไม่มีคีย์เลย (ไม่ใช่ null)", () => {
    const r = orderAdFieldsForViewer(o, true);
    expect(Object.keys(r)).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("โปรล้อแม็ก");
  });
  it("ฝั่งร้าน = ได้ครบ · ไม่มีแอด = null", () => {
    expect(orderAdFieldsForViewer(o, false)).toEqual(o);
    expect(orderAdFieldsForViewer({}, false)).toEqual({ adId: null, adTitle: null, adPhotoFileId: null });
  });
  it("[blocker] chat-thread-messages.service ประกอบ orderMap ผ่าน orderAdFieldsForViewer(…, viewerIsBuyer) เท่านั้น ไม่ใส่ ad* ดิบ", () => {
    const src = readFileSync("src/services/chat-thread-messages.service.ts", "utf8");
    expect(src).toMatch(/\.\.\.orderAdFieldsForViewer\(o, result\.viewerIsBuyer\)/);
    // ห้ามมี `adTitle: o.adTitle` / `adId: o.adId` ดิบในไฟล์นี้ (นอกจาก select `adTitle: true`)
    expect(src).not.toMatch(/adTitle:\s*o\.adTitle/);
    expect(src).not.toMatch(/adId:\s*o\.adId/);
  });
});
