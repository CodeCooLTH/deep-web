// feature 00022 — พฤติกรรมของ client ที่ "แปลคำตอบจริงของ iShip" ไม่ใช่ที่เราเดาเอง
//
// ทุกเคสในไฟล์นี้เป็น payload ที่ยิงจริงกับ prod แล้วบันทึกไว้ (2026-07-29, ร้าน token …II85)
// ห้ามแก้ค่าที่คาดหวังโดยไม่ยิงจริงซ้ำ — บทเรียน feedback_spike_must_match_production_path

import { afterEach, describe, expect, it, vi } from "vitest";
import { getTraces } from "./client";
import { IShipError } from "./errors";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getTraces — แยก 'ยังไม่มีข้อมูล' ออกจาก 'ระบบมีปัญหา'", () => {
  it("พัสดุที่ขนส่งยังไม่สแกน (500 + message ว่าง) คืนลิสต์ว่าง ไม่ใช่ error", async () => {
    // คำตอบจริงของ track TH0205901RX26E0 ตอนเพิ่งเปิดพัสดุ
    mockFetch(500, { status: false, message: "", data: [] });
    await expect(getTraces("tok", "TH0205901RX26E0")).resolves.toEqual([]);
  });

  it("เลขพัสดุไม่มีจริง (404 + มีข้อความ) ยังเป็น error — ห้ามกลืนเงียบ", async () => {
    mockFetch(404, { status: false, message: "ไม่พบข้อมูลพัสดุ", data: [] });
    await expect(getTraces("tok", "ZZZZNOTREAL999")).rejects.toBeInstanceOf(
      IShipError,
    );
  });

  it("ไม่ได้ส่งเลขพัสดุ (422 + มีข้อความ) ยังเป็น error", async () => {
    mockFetch(422, { status: false, message: "โปรดระบุเลขพัสดุ track_no", data: [] });
    await expect(getTraces("tok", "")).rejects.toBeInstanceOf(IShipError);
  });

  it("token เสีย (401) ต้องเป็น TOKEN_INVALID ไม่ใช่ลิสต์ว่าง", async () => {
    mockFetch(401, {
      status: false,
      code: 9999,
      message: "Unauthenticated",
      data: null,
    });
    await expect(getTraces("tok", "TH1")).rejects.toMatchObject({
      code: "TOKEN_INVALID",
    });
  });

  it("สำเร็จปกติ คืน trace_routes ตามที่ได้มา", async () => {
    mockFetch(200, {
      status: true,
      code: "0000",
      msg: "success",
      data: {
        trace_routes: [
          {
            status: "picked_up",
            status_text: "พัสดุเข้าระบบ",
            timestamp: "2026-07-29 10:00:00",
          },
        ],
      },
    });
    const r = await getTraces("tok", "TH1");
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe("picked_up");
  });

  it("สำเร็จแต่ไม่มี trace_routes ในคำตอบ คืนลิสต์ว่าง", async () => {
    mockFetch(200, { status: true, code: "0000", data: {} });
    await expect(getTraces("tok", "TH1")).resolves.toEqual([]);
  });
});
