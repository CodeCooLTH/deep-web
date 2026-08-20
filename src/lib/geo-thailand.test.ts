import { describe, expect, it } from "vitest";
import { isThaiCoordinate, parseCoordinateInput } from "./geo-thailand";

/**
 * `parseCoordinateInput` คือเส้นทางเดียวที่ผู้ใช้คีย์บอร์ด/screen reader ปักหมุดได้ (canvas ของ
 * Leaflet ไม่มีปุ่มไหนวาง marker ได้) — พังเมื่อไรคือกลุ่มนั้นทำงานไม่ได้เลย ไม่ใช่ "ทำได้ยากขึ้น"
 *
 * mutation ที่ชุดนี้ต้องจับได้ (พิสูจน์แล้วทีละข้อ):
 *   1. ถอดด่านลิงก์ย่อ (ยุบรวมกับ UNPARSEABLE)
 *   2. ถอด anchor `^...$` ของรูปตัวเลขเปล่า
 *   3. สลับลำดับ: ลองรูปตัวเลขเปล่าก่อนรูป @lat,lng ของ URL
 *   4. ถอดด่าน isThaiCoordinate
 */

describe("parseCoordinateInput", () => {
  it("[blocker] ตัวเลขคู่คั่น comma — รูปที่คนพิมพ์เองบ่อยที่สุด", () => {
    expect(parseCoordinateInput("13.7563, 100.5018")).toEqual({
      ok: true,
      lat: 13.7563,
      lng: 100.5018,
    });
  });

  it("ตัวเลขคู่คั่นช่องว่างล้วนก็ได้", () => {
    expect(parseCoordinateInput("13.7563 100.5018")).toEqual({
      ok: true,
      lat: 13.7563,
      lng: 100.5018,
    });
  });

  it("[blocker] ลิงก์ Google Maps แบบเต็มที่มี @lat,lng,zoom", () => {
    const r = parseCoordinateInput(
      "https://www.google.com/maps/place/Bangkok/@13.7563,100.5018,17z/data=!3m1",
    );
    expect(r).toEqual({ ok: true, lat: 13.7563, lng: 100.5018 });
  });

  it("[blocker] ลิงก์รูป ?q=lat,lng รวมถึงที่ถูก encode เป็น %2C", () => {
    expect(parseCoordinateInput("https://maps.google.com/?q=13.7563,100.5018")).toEqual({
      ok: true,
      lat: 13.7563,
      lng: 100.5018,
    });
    expect(parseCoordinateInput("https://maps.google.com/?q=13.7563%2C100.5018")).toEqual({
      ok: true,
      lat: 13.7563,
      lng: 100.5018,
    });
  });

  it("[blocker] ลิงก์ย่อต้องได้ reason ของตัวเอง — คนละคำแนะนำกับ 'แกะไม่ออก'", () => {
    expect(parseCoordinateInput("https://maps.app.goo.gl/AbCdEf123")).toEqual({
      ok: false,
      reason: "SHORT_LINK",
    });
    expect(parseCoordinateInput("https://goo.gl/maps/xyz")).toEqual({
      ok: false,
      reason: "SHORT_LINK",
    });
  });

  it("[blocker] พิกัดนอกกรอบไทยต้องไม่ผ่าน แม้รูปแบบถูก", () => {
    // ปารีส — รูปแบบถูกทุกประการ แต่ไม่ใช่ที่ตั้งร้านไทย
    expect(parseCoordinateInput("48.8566, 2.3522")).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
    // 0,0 — ค่าตั้งต้นของตัวแปรที่ลืมเซ็ต
    expect(parseCoordinateInput("0, 0")).toEqual({ ok: false, reason: "OUT_OF_RANGE" });
  });

  it("[blocker] lat/lng สลับกันต้องไม่ผ่าน (100.5, 13.75 = นอกกรอบทั้งคู่)", () => {
    expect(parseCoordinateInput("100.5018, 13.7563")).toEqual({
      ok: false,
      reason: "OUT_OF_RANGE",
    });
  });

  it("[blocker] ข้อความยาวที่บังเอิญมีตัวเลข 2 ตัว ต้องไม่ถูกตีเป็นพิกัด", () => {
    expect(parseCoordinateInput("บ้านเลขที่ 13 ซอย 100")).toEqual({
      ok: false,
      reason: "UNPARSEABLE",
    });
    expect(parseCoordinateInput("โทร 081 234 5678")).toEqual({ ok: false, reason: "UNPARSEABLE" });
  });

  it("ช่องว่างเปล่า → EMPTY (คนละเรื่องกับกรอกผิด — ยังไม่ต้องขึ้น error สีแดงใส่เขา)", () => {
    expect(parseCoordinateInput("")).toEqual({ ok: false, reason: "EMPTY" });
    expect(parseCoordinateInput("   ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("ตัดช่องว่างหัวท้ายก่อนแกะ", () => {
    expect(parseCoordinateInput("  13.7563,100.5018  ")).toEqual({
      ok: true,
      lat: 13.7563,
      lng: 100.5018,
    });
  });
});

describe("isThaiCoordinate", () => {
  it("[blocker] 0,0 ไม่ผ่าน — เป็นค่าตั้งต้นที่ผ่านด่าน `!= null` ไปเขียนลงฐานได้", () => {
    expect(isThaiCoordinate(0, 0)).toBe(false);
  });

  it("มุมทั้ง 4 ของกรอบต้องผ่าน (inclusive)", () => {
    expect(isThaiCoordinate(5, 97)).toBe(true);
    expect(isThaiCoordinate(21, 106)).toBe(true);
  });

  it("NaN/Infinity/ไม่ใช่ตัวเลข ไม่ผ่าน", () => {
    expect(isThaiCoordinate(NaN, 100)).toBe(false);
    expect(isThaiCoordinate(13, Infinity)).toBe(false);
    expect(isThaiCoordinate("13", "100")).toBe(false);
    expect(isThaiCoordinate(null, null)).toBe(false);
  });
});
