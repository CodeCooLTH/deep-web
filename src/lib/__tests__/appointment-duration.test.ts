/**
 * เทสของ "เลือกเวลาด้วยระยะเวลา" (2026-08-09) — feature 00024 ขั้นเลือกเวลา
 *
 * ทำไมต้องมี: บั๊กที่ user รายงานเป็นบั๊กของ **สถานะตั้งต้นตอนเปิดชีต** ไม่ใช่ของการเรนเดอร์
 * (`endTouched` ถูกตั้งเป็น true ตอนเปิดถ้าฟอร์มเคยมี endTime แล้ว auto-fill ตายทั้งชีต)
 * ตรรกะชุดนั้นจึงถูกยกออกมาเป็นฟังก์ชันบริสุทธิ์ใน src/lib/appointments.ts เพื่อให้มีที่ให้
 * เทสจับ — ก่อนหน้านี้มันฝังอยู่ใน useEffect ของ component ซึ่งไม่มีเทสไหนเอื้อมถึงเลย
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPOINTMENT_DURATION_MIN,
  addMinutesToTime,
  formatDurationTH,
  minutesBetweenTimes,
  resolveInitialDuration,
} from "@/lib/appointments";

/** ชุดชิปเดียวกับที่ AppointmentDateSheet ประกอบ (BASE_DURATION_CHOICES) */
const CHOICES = [30, 60, 90, 120];

describe("minutesBetweenTimes", () => {
  it("คืนจำนวนนาทีเมื่อปลายทางอยู่หลังต้นทาง", () => {
    expect(minutesBetweenTimes("13:00", "14:00")).toBe(60);
    expect(minutesBetweenTimes("09:15", "10:00")).toBe(45);
  });

  it("คืน null เมื่อปลายทางไม่ได้อยู่หลังต้นทาง — รวมกรณีเท่ากันพอดี", () => {
    expect(minutesBetweenTimes("13:00", "12:25")).toBeNull();
    expect(minutesBetweenTimes("13:00", "13:00")).toBeNull();
  });

  it("คืน null เมื่ออ่านค่าไม่ได้ ไม่ใช่ NaN ที่ไหลต่อไปเงียบ ๆ", () => {
    expect(minutesBetweenTimes("", "14:00")).toBeNull();
    expect(minutesBetweenTimes("13:00", "ไม่ใช่เวลา")).toBeNull();
  });

  it("เป็นทิศกลับของ addMinutesToTime ในวันเดียวกัน", () => {
    for (const min of CHOICES) {
      expect(minutesBetweenTimes("08:00", addMinutesToTime("08:00", min))).toBe(min);
    }
  });
});

describe("formatDurationTH", () => {
  it("ต่ำกว่า 1 ชม. พูดเป็นนาที", () => {
    expect(formatDurationTH(30)).toBe("30 นาที");
    expect(formatDurationTH(45)).toBe("45 นาที");
  });

  it("ชั่วโมงลงตัวไม่ต้องมีเศษนาที", () => {
    expect(formatDurationTH(60)).toBe("1 ชม.");
    expect(formatDurationTH(120)).toBe("2 ชม.");
  });

  it("มีเศษ = พูดทั้งชั่วโมงและนาที ไม่ใช่ทศนิยม", () => {
    // "1.5 ชม." อ่านง่ายเฉพาะ 90 — พอเป็น 135 จะกลายเป็น "2.25 ชม." ซึ่งไม่มีใครพูด
    expect(formatDurationTH(90)).toBe("1 ชม. 30 นาที");
    expect(formatDurationTH(135)).toBe("2 ชม. 15 นาที");
  });

  it("ค่าที่ไม่มีความหมายคืนสตริงว่าง ไม่ใช่ '0 นาที'", () => {
    expect(formatDurationTH(0)).toBe("");
    expect(formatDurationTH(-30)).toBe("");
    expect(formatDurationTH(Number.NaN)).toBe("");
  });
});

describe("resolveInitialDuration", () => {
  it("[blocker] ค่าเสียที่ค้างมาจากฟอร์มต้องไม่ถูกพาเข้ามาต่อ", () => {
    /**
     * เคสจริงจากภาพที่ user ส่ง 2026-08-09: ฟอร์มถือ start=13:00 / end=12:25 อยู่
     * (end เป็นเวลาปัจจุบันที่ native picker เติมให้ตอนผู้ใช้แตะช่องแล้วกดตกลง)
     * ของเดิมพาคู่นี้เข้ามาตรง ๆ แล้วตั้ง endTouched=true → จอเปิดมาพร้อม error สีแดง
     * ตั้งแต่ paint แรก และกดชิปเวลาใหม่กี่ครั้งก็แก้ไม่หาย
     *
     * แดงเมื่อไหร่ห้าม merge — นี่คือบั๊กที่ทั้งรอบนี้ทำมาเพื่อปิด
     */
    expect(resolveInitialDuration("13:00", "12:25", CHOICES, null)).toEqual({
      durationMin: DEFAULT_APPOINTMENT_DURATION_MIN,
      customEnd: "",
    });
  });

  it("[blocker] ช่วงที่ไม่ตรงชิปไหนเลยต้องเก็บค่าเดิมไว้เป๊ะ ห้าม snap", () => {
    /**
     * เปิดออเดอร์เดิมที่เคยกรอกมือไว้ 13:00–16:45 (225 นาที ไม่มีในชุดชิป)
     * ถ้า snap ไป 120 หรือ 240 = ระบบแก้เวลานัดของลูกค้าเองโดยไม่มีใครสั่ง
     * แล้วผู้ขายจะไม่มีทางรู้ เพราะจอดูเหมือนแค่ "เปิดมาดู" เฉย ๆ
     */
    expect(resolveInitialDuration("13:00", "16:45", CHOICES, 60)).toEqual({
      durationMin: null,
      customEnd: "16:45",
    });
  });

  it("ช่วงที่ตรงชิปพอดี → เลือกชิปนั้น ไม่ตกไปโหมดกำหนดเอง", () => {
    expect(resolveInitialDuration("13:00", "14:30", CHOICES, 60)).toEqual({
      durationMin: 90,
      customEnd: "",
    });
  });

  it("ระยะเวลามาตรฐานของคิวงานที่ไม่อยู่ในชุดพื้นฐาน ก็ยังถูกจำได้ เมื่อมันถูกแทรกเข้าชุดแล้ว", () => {
    // AppointmentDateSheet แทรก resourceDurationMinutes เข้าชุดชิปเสมอ (durationChoices)
    const withResource = [30, 45, 60, 90, 120];
    expect(resolveInitialDuration("09:00", "09:45", withResource, 45)).toEqual({
      durationMin: 45,
      customEnd: "",
    });
  });

  it("ยังไม่เคยตั้งเวลา → ใช้ระยะเวลามาตรฐานของคิวงาน", () => {
    expect(resolveInitialDuration(undefined, undefined, CHOICES, 90)).toEqual({
      durationMin: 90,
      customEnd: "",
    });
  });

  it("[blocker] คิวงานที่ไม่ได้ตั้งระยะเวลา (null) ต้องยังได้ค่าตั้งต้น ไม่ใช่ค้างว่าง", () => {
    /**
     * นี่คือคิวงานในภาพที่ user ส่งมา (durationMinutes = null) — ของเดิมชิปเวลาจึงเซ็ตให้
     * แค่เวลาเริ่ม ทางลัดที่โฆษณาว่า "กดครั้งเดียวได้ทั้งเริ่มและจบ" ไม่เคยทำงานกับร้านกลุ่มนี้เลย
     */
    for (const empty of [null, undefined, 0]) {
      expect(resolveInitialDuration(undefined, undefined, CHOICES, empty)).toEqual({
        durationMin: DEFAULT_APPOINTMENT_DURATION_MIN,
        customEnd: "",
      });
    }
  });

  it("มีแต่เวลาเริ่ม ไม่มีเวลาสิ้นสุด → ใช้ระยะเวลามาตรฐาน", () => {
    expect(resolveInitialDuration("13:00", undefined, CHOICES, 30)).toEqual({
      durationMin: 30,
      customEnd: "",
    });
  });

  it("ผลลัพธ์ที่ได้ ประกอบกลับเป็นเวลาสิ้นสุดเดิมได้เสมอ (ไม่มีข้อมูลหายระหว่างทาง)", () => {
    for (const [start, end] of [
      ["08:00", "08:30"],
      ["13:00", "14:00"],
      ["13:00", "14:30"],
      ["10:00", "12:00"],
      ["13:00", "16:45"], // โหมดกำหนดเอง
    ]) {
      const r = resolveInitialDuration(start, end, CHOICES, null);
      const rebuilt = r.durationMin == null ? r.customEnd : addMinutesToTime(start, r.durationMin);
      expect(rebuilt).toBe(end);
    }
  });
});
