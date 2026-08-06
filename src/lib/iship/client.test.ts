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

// ─── ส่วนขยาย 00022: check-price ตอบ payload เปล่า ไม่มี envelope ─────────────
//
// payload จริงจาก prod (user curl 2026-08-05): check-price คืน object ตรง ๆ
// {courier_code, weight, weight_unit, remote_area, price, total_price} — ไม่มี
// status/success/data เลย. unwrap เดิมตีความ "ไม่มี status" = ล้มเหลว ทำให้
// check-price ทุกครั้งกลายเป็น UPSTREAM_ERROR http=200 message ว่าง (เหตุ prod
// 2026-08-05: ปุ่มเทียบราคาพังทุกเจ้า และ quote รายตัวพังเงียบมาตลอด)
describe("checkPrice — คำตอบเป็น payload เปล่าไม่มี envelope", () => {
  it("object ที่ไม่มี status/success/data/message = สำเร็จ คืนทั้งก้อน", async () => {
    mockFetch(200, {
      courier_code: "FlashExpressA",
      weight: 1000,
      weight_unit: "g",
      remote_area: "50",
      price: 19,
      total_price: 69,
    });
    const { checkPrice } = await import("./client");
    const p = await checkPrice("tok", {
      courier_code: "FlashExpressA",
      src_zipcode: "10220",
      src_province: "กรุงเทพมหานคร",
      src_amphure: "สายไหม",
      src_district: "สายไหม",
      dst_zipcode: "58140",
      dst_province: "แม่ฮ่องสอน",
      dst_amphure: "ขุนยวม",
      dst_district: "ขุนยวม",
      weight: 1,
      width: 14,
      length: 20,
      height: 6,
    });
    expect(p.total_price).toBe(69);
    expect(p.price).toBe(19);
  });

  it("envelope ล้มเหลว (status:false + message) ยังเป็น error เหมือนเดิม", async () => {
    mockFetch(200, { status: false, message: "กรุณากรอก น้ำหนัก" });
    const { checkPrice } = await import("./client");
    await expect(
      checkPrice("tok", {
        courier_code: "X",
        src_zipcode: "",
        src_province: "",
        src_amphure: "",
        src_district: "",
        dst_zipcode: "",
        dst_province: "",
        dst_amphure: "",
        dst_district: "",
        weight: 1,
        width: 1,
        length: 1,
        height: 1,
      }),
    ).rejects.toBeInstanceOf(IShipError)
  });

  it("object มีแค่ message (error ไม่มี status) ยังเป็น error — ห้ามตีความเป็นราคา", async () => {
    mockFetch(200, { message: "unauthorized" });
    const { checkPrice } = await import("./client");
    await expect(
      checkPrice("tok", {
        courier_code: "X",
        src_zipcode: "",
        src_province: "",
        src_amphure: "",
        src_district: "",
        dst_zipcode: "",
        dst_province: "",
        dst_amphure: "",
        dst_district: "",
        weight: 1,
        width: 1,
        length: 1,
        height: 1,
      }),
    ).rejects.toBeInstanceOf(IShipError)
  });
});
