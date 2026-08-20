import { describe, expect, it } from "vitest";
import { findProvinceCentroid } from "./province-centroid";
import geo from "../../public/data/thailand-provinces.json";
import { isThaiCoordinate } from "./geo-thailand";

/**
 * เทสชุดนี้ยิงกับ **ไฟล์ข้อมูลจริง** ไม่ใช่ fixture ที่แต่งเอง — เพราะสิ่งที่ต้องพิสูจน์คือ
 * "ชื่อจังหวัดสองชุดในโปรเจกต์นี้เข้ากันได้จริงไหม" ซึ่ง fixture ตอบแทนไม่ได้
 * (บทเรียนซ้ำจาก iShip 2026-08-07: เทสที่แต่งค่าเองตามข้อสันนิษฐานของโค้ด ยืนยันได้แค่ว่า
 * "โค้ดทำตามที่คนเขียนคิด" ไม่ใช่ว่า "คนเขียนคิดถูก")
 *
 * mutation ที่ต้องจับได้ (พิสูจน์แล้ว):
 *   1. ถอด canonicalProvince ออก (เทียบสตริงตรง ๆ) → กรุงเทพฯ พัง
 *   2. เปลี่ยนจาก "วงที่จุดเยอะสุด" เป็น "วงแรก"
 */

const collection = geo as unknown as Parameters<typeof findProvinceCentroid>[0];

describe("findProvinceCentroid", () => {
  it("[blocker] กรุงเทพมหานคร (สะกดแบบ thai-address-database) ต้องหาเจอ", () => {
    // geojson เขียน "กรุงเทพ" ส่วน dataset ที่ ThaiAddressSearch คืนมาเขียน "กรุงเทพมหานคร"
    // นี่คือจังหวัดเดียวใน 77 ที่สองชุดสะกดไม่ตรงกัน และเป็นจังหวัดที่มีร้านมากที่สุด
    const c = findProvinceCentroid(collection, "กรุงเทพมหานคร");
    expect(c).not.toBeNull();
    expect(isThaiCoordinate(c!.lat, c!.lng)).toBe(true);
  });

  it("[blocker] ทุกจังหวัดใน geojson ต้องได้ centroid ที่อยู่ในกรอบประเทศไทย", () => {
    const failed: string[] = [];
    for (const f of collection!.features) {
      const name = f.properties?.name;
      if (!name) continue;
      const c = findProvinceCentroid(collection, name);
      if (!c || !isThaiCoordinate(c.lat, c.lng)) failed.push(name);
    }
    expect(failed).toEqual([]);
  });

  /**
   * 🛑 จังหวัดที่ต้องใช้ในเทสนี้ **เลือกจากข้อมูลจริง ไม่ใช่จากสัญชาตญาณ** — สแกนทั้งไฟล์แล้วพบว่า
   * มี 7 จังหวัดที่ "วงแรก" กับ "วงที่จุดเยอะที่สุด" ให้คนละคำตอบ: สตูล 87 กม. · สุราษฎร์ธานี 87 ·
   * พังงา 80 · ตราด 67 · กระบี่ 67 · ระนอง 37 · ตรัง 34
   *
   * ดราฟต์แรกของเทสนี้ใช้ **ภูเก็ต** ซึ่งฟังดูเข้าท่าที่สุด (เกาะทั้งจังหวัด) แต่ภูเก็ตบังเอิญเรียง
   * วงหลักมาเป็นวงแรกอยู่แล้ว ⇒ เทสเขียวทั้งที่ตรรกะถูกถอดออก = เทสที่ไม่ได้พิสูจน์อะไรเลย
   * (คลาสเดียวกับที่ retro เคยบันทึกว่า "เทสที่แต่งค่าเองตามข้อสันนิษฐานของโค้ด")
   */
  it("[blocker] สตูล — วงแรกในไฟล์เป็นเกาะ ห่างจากตัวจังหวัดจริง 87 กม.", () => {
    const satun = findProvinceCentroid(collection, "สตูล");
    expect(satun).not.toBeNull();
    // ค่าที่ถูก (วงใหญ่สุด) ≈ 6.83, 99.96 · ค่าที่ผิด (วงแรก) ≈ 6.56, 99.21
    expect(satun!.lng).toBeGreaterThan(99.6);
  });

  it("[blocker] สุราษฎร์ธานี — วงแรกคือเกาะสมุย ไม่ใช่แผ่นดินใหญ่", () => {
    const surat = findProvinceCentroid(collection, "สุราษฎร์ธานี");
    expect(surat).not.toBeNull();
    // ค่าที่ถูก (วงใหญ่สุด) ≈ 9.04, 99.07 · ค่าที่ผิด (วงแรก) ≈ 9.52, 99.69
    expect(surat!.lng).toBeLessThan(99.4);
  });

  it("เชียงใหม่อยู่เหนือกรุงเทพฯ — กันเคส lat/lng สลับกันทั้งไฟล์", () => {
    const cm = findProvinceCentroid(collection, "เชียงใหม่");
    const bkk = findProvinceCentroid(collection, "กรุงเทพ");
    expect(cm!.lat).toBeGreaterThan(bkk!.lat);
  });

  it("ชื่อที่ไม่มีในไฟล์ → null (ให้ผู้เรียก degrade ไปขั้นถัดไป ไม่ใช่ throw)", () => {
    expect(findProvinceCentroid(collection, "จังหวัดที่ไม่มีอยู่จริง")).toBeNull();
  });

  it("ค่าว่าง/null → null ไม่ throw", () => {
    expect(findProvinceCentroid(collection, "")).toBeNull();
    expect(findProvinceCentroid(collection, null)).toBeNull();
    expect(findProvinceCentroid(null, "กรุงเทพ")).toBeNull();
  });
});
