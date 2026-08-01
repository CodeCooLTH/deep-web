// feature 00022 (ส่วนขยาย) — unit test ของการแกะพัสดุที่มีอยู่แล้วบน iShip
//
// เทสชุด "ตำบล/อำเภอ ขาเข้า" เป็น blocker เหมือนฝั่งขาออก (BR-ISHIP-32) และ
// ทุกเคสในชุดนั้นต้องใช้ค่าตำบลกับอำเภอ "ต่างกัน" เสมอ — ตัวอย่างในเอกสารของ iShip
// เองใส่ค่าเดียวกันไว้ทั้งสองช่อง ซึ่งเป็นรูปแบบที่จับคู่กลับหัวแล้วยังเขียวอยู่ดี

import { describe, expect, it } from "vitest";
import {
  diffReceiverAddress,
  hasAddressConflict,
  matchesQuery,
  parseParcelRow,
  parseParcelRows,
  type IShipParcel,
} from "./unlinked";

/** แถวจริงจากเอกสาร iShip แต่แก้ตำบล/อำเภอให้ "ต่างกัน" เพื่อให้เทสมีความหมาย */
const rawRow = {
  id: 3480,
  weight: null,
  length: 0,
  width: 0,
  height: 0,
  category_id: 3,
  ref_code: "REFUAT1166409025355CI",
  custom_order_id: null,
  courier_code: "FlashExpress",
  track_no: "TH01479JWN5B",
  dst_name: "Diew",
  dst_phone: "0891082095",
  dst_address: " 91/83 ถ.สายไหม",
  dst_district: "ออเงิน", // ตำบล/แขวง
  dst_area: "สายไหม", // อำเภอ/เขต
  dst_province: "กรุงเทพ",
  dst_zipcode: "10220",
  cod_amount: "100.00",
  status: 1,
  status_name: "รอเข้ารับพัสดุ",
  cancel_at: null,
  logo: "https://app.iship.cloud/express/flash-express.png",
  created: "2022-09-25 14:17:34",
};

describe("parseParcelRow — คู่ตำบล/อำเภอ ขาเข้า (blocker)", () => {
  it("dst_district เข้าช่องตำบล และ dst_area เข้าช่องอำเภอ ไม่สลับกัน", () => {
    const p = parseParcelRow(rawRow)!;
    expect(p.receiver.subdistrict).toBe("ออเงิน");
    expect(p.receiver.district).toBe("สายไหม");
  });

  it("ถ้า iShip ส่ง dst_amphure มาด้วย ให้ชนะ dst_area (ชื่อเดียวกับฝั่งขาออก)", () => {
    const p = parseParcelRow({
      ...rawRow,
      dst_amphure: "บางเขน",
      dst_area: "สายไหม",
    })!;
    expect(p.receiver.subdistrict).toBe("ออเงิน");
    expect(p.receiver.district).toBe("บางเขน");
  });
});

describe("parseParcelRow — ทนต่อชื่อฟิลด์ที่สะกดไม่ตรงเอกสาร", () => {
  it("อ่านเวลาได้ทั้ง created และ created_at", () => {
    expect(parseParcelRow(rawRow)!.createdAtRaw).toBe("2022-09-25 14:17:34");
    const alt = { ...rawRow, created: undefined, created_at: "2026-08-01 09:00:00" };
    expect(parseParcelRow(alt)!.createdAtRaw).toBe("2026-08-01 09:00:00");
  });

  it("cod_amount ที่มาเป็นสตริงต้องกลายเป็นตัวเลข", () => {
    expect(parseParcelRow(rawRow)!.codAmount).toBe(100);
  });

  it("ไม่มี cod_amount = 0 ไม่ใช่ null (ยอดเก็บปลายทางต้องเป็นตัวเลขเสมอ)", () => {
    const { cod_amount: _omit, ...noCod } = rawRow;
    expect(parseParcelRow(noCod)!.codAmount).toBe(0);
  });

  it("แถวที่ไม่มีเลขติดตามถูกทิ้ง — ผูกกับคำสั่งซื้อไม่ได้อยู่แล้ว", () => {
    const { track_no: _omit, ...noTrack } = rawRow;
    expect(parseParcelRow(noTrack)).toBeNull();
  });

  it("แถวเสีย 1 แถวต้องไม่ทำให้ทั้งชุดหาย", () => {
    expect(parseParcelRows([rawRow, null, { junk: true }, rawRow])).toHaveLength(2);
  });
});

describe("diffReceiverAddress", () => {
  const parcel = parseParcelRow(rawRow)!.receiver;

  it("ที่อยู่เดียวกันที่เขียนคนละแบบต้องไม่ถูกฟ้องว่าต่าง", () => {
    const rows = diffReceiverAddress(
      {
        name: "Diew",
        phone: "089-108-2095",
        address: {
          line1: "91/83 ถ.สายไหม",
          subdistrict: "แขวงออเงิน",
          district: "เขตสายไหม",
          province: "กรุงเทพมหานคร",
          postcode: "10220",
        },
      },
      parcel,
    );
    expect(hasAddressConflict(rows)).toBe(false);
  });

  it("เบอร์คนละเบอร์ต้องถูกจับได้ และชี้เฉพาะแถวที่ต่างจริง", () => {
    const rows = diffReceiverAddress(
      {
        name: "Diew",
        phone: "0812345678",
        address: {
          line1: "91/83 ถ.สายไหม",
          subdistrict: "ออเงิน",
          district: "สายไหม",
          province: "กรุงเทพ",
          postcode: "10220",
        },
      },
      parcel,
    );
    expect(hasAddressConflict(rows)).toBe(true);
    expect(rows.filter((r) => !r.same).map((r) => r.field)).toEqual(["phone"]);
  });

  it("ตำบลกับอำเภอสลับที่กันต้องถูกฟ้อง ไม่ใช่ผ่านเพราะค่าครบ", () => {
    const rows = diffReceiverAddress(
      {
        name: "Diew",
        phone: "0891082095",
        address: {
          line1: "91/83 ถ.สายไหม",
          subdistrict: "สายไหม", // สลับ
          district: "ออเงิน", // สลับ
          province: "กรุงเทพ",
          postcode: "10220",
        },
      },
      parcel,
    );
    expect(rows.filter((r) => !r.same).map((r) => r.field)).toEqual([
      "subdistrict",
      "district",
    ]);
  });

  it("คำสั่งซื้อที่ยังไม่มีที่อยู่เลยต้องเทียบได้ ไม่ใช่พัง", () => {
    const rows = diffReceiverAddress({ name: null, phone: null, address: null }, parcel);
    expect(rows).toHaveLength(7);
    expect(hasAddressConflict(rows)).toBe(true);
  });
});

describe("matchesQuery", () => {
  const p: IShipParcel = parseParcelRow(rawRow)!;

  it("ค้นด้วยเลขติดตามบางส่วน (ไม่สนตัวพิมพ์)", () => {
    expect(matchesQuery(p, "th01479")).toBe(true);
  });

  it("ค้นด้วยเบอร์ที่พิมพ์มีขีดคั่น", () => {
    expect(matchesQuery(p, "089-108")).toBe(true);
  });

  it("ค้นด้วยชื่อผู้รับ", () => {
    expect(matchesQuery(p, "diew")).toBe(true);
  });

  it("ค้นไม่เจอ = false", () => {
    expect(matchesQuery(p, "สมชาย")).toBe(false);
  });

  it("ช่องว่าง = ผ่านทุกแถว", () => {
    expect(matchesQuery(p, "  ")).toBe(true);
  });
});
