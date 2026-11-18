import { describe, expect, it } from "vitest";
import { clampCapiEventTime } from "../event-time";

const now = new Date("2026-11-18T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const H = 3_600_000;

describe("clampCapiEventTime", () => {
  it("ย้อน 1 ชม./3 วัน ใช้เวลาในออเดอร์", () => {
    expect(clampCapiEventTime(ago(H), now)).toEqual(ago(H));
    expect(clampCapiEventTime(ago(72 * H), now)).toEqual(ago(72 * H));
  });
  it("ย้อน 8 วัน (เกินเพดาน Meta) ใช้เวลาบันทึก", () => {
    expect(clampCapiEventTime(ago(8 * 24 * H), now)).toBe(now);
  });
  it("อนาคต ใช้เวลาบันทึก", () => {
    expect(clampCapiEventTime(new Date(now.getTime() + H), now)).toBe(now);
  });
});
