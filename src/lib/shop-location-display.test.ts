import { describe, expect, it } from "vitest";
import { resolveDisplayedPin } from "./shop-location-display";

/**
 * ปักหมุดบั๊กที่ `/impeccable critique` จับได้ 2026-08-14: การ์ด "ตำแหน่งร้าน" บันทึกหมุดแรกสำเร็จ
 * แล้วเด้งกลับไปเป็นสถานะ "ยังไม่มีหมุด" ชั่วขณะ เพราะอ่านค่าจาก props ซึ่งยังไม่อัปเดตจนกว่า
 * `router.refresh()` จะกลับมา — พร้อมกับ toast เขียวที่บอกว่าสำเร็จ
 *
 * mutation ที่เทสชุดนี้ต้องจับได้ (พิสูจน์แล้วทีละข้อ):
 *   1. กลับลำดับเป็น `fromServer.lat ?? draft.lat` (ค่าจาก server ชนะ)
 *   2. เปลี่ยน `hasPin` เป็นเช็คแค่ `lat != null` (ไม่บังคับครบคู่)
 */

describe("resolveDisplayedPin", () => {
  it("[blocker] เพิ่งบันทึกหมุดแรก แต่ props ยังเป็น null → ต้องยังเห็นว่า 'มีหมุดแล้ว'", () => {
    const r = resolveDisplayedPin({ lat: 13.7563, lng: 100.5018 }, { lat: null, lng: null });
    expect(r.hasPin).toBe(true);
    expect(r.lat).toBe(13.7563);
    expect(r.lng).toBe(100.5018);
  });

  it("[blocker] ค่าที่ผู้ใช้เพิ่งย้าย ต้องชนะค่าเก่าที่ยังค้างมาทาง props", () => {
    const r = resolveDisplayedPin({ lat: 18.7883, lng: 98.9853 }, { lat: 13.7563, lng: 100.5018 });
    expect(r.lat).toBe(18.7883);
    expect(r.lng).toBe(98.9853);
  });

  it("[blocker] ต้องครบคู่ถึงจะนับว่ามีหมุด — ครึ่งเดียวประกอบลิงก์แผนที่ไม่ได้", () => {
    expect(resolveDisplayedPin({ lat: 13.75, lng: null }, { lat: null, lng: null }).hasPin).toBe(false);
    expect(resolveDisplayedPin({ lat: null, lng: 100.5 }, { lat: null, lng: null }).hasPin).toBe(false);
  });

  it("ยังไม่เคยปักหมุดและยังไม่ได้แตะอะไร → ไม่มีหมุด", () => {
    const r = resolveDisplayedPin({ lat: null, lng: null }, { lat: null, lng: null });
    expect(r.hasPin).toBe(false);
    expect(r.lat).toBeNull();
    expect(r.lng).toBeNull();
  });

  it("ร้านที่มีหมุดอยู่แล้วและยังไม่ได้แตะอะไร → ใช้ค่าจาก server", () => {
    const r = resolveDisplayedPin({ lat: null, lng: null }, { lat: 7.8804, lng: 98.3923 });
    expect(r.hasPin).toBe(true);
    expect(r.lat).toBe(7.8804);
    expect(r.lng).toBe(98.3923);
  });

  it("พิกัด 0 ไม่ใช่ 'ไม่มีค่า' — ต้องไม่ถูก ?? กลืน (0 เป็น falsy แต่ไม่ใช่ null)", () => {
    const r = resolveDisplayedPin({ lat: 0, lng: 0 }, { lat: 13.75, lng: 100.5 });
    expect(r.lat).toBe(0);
    expect(r.lng).toBe(0);
    expect(r.hasPin).toBe(true);
  });
});
