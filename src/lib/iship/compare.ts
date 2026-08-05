// ส่วนขยาย feature 00022 — รวมผล check-price หลายขนส่งเป็นรายการเปรียบเทียบ
//
// pure function แยกจาก service เพื่อเทสได้โดยไม่ต้อง mock prisma/client
// (pattern เดียวกับ unlinked.ts) — service เป็นแค่ orchestration บาง ๆ

import type { IShipCourier, IShipPrice } from "./client";

export interface CompareRow {
  courierCode: string;
  courierName: string;
  /** ราคารวมที่ขนส่งประเมิน (บาท) — field เดียวที่บังคับมี ไม่มี = ตกไป failed */
  totalPrice: number;
  /** ค่าส่งพื้นฐาน (ช่อง price) — null = ขนส่งไม่แจกแจง หน้าจอแสดง "—" */
  basePrice: number | null;
  fuelFee: number | null;
  /** ค่าเพิ่มพื้นที่ห่างไกล — null เมื่อ 0/ไม่ส่ง (ไม่ต้องโชว์ ฿0) */
  remoteFee: number | null;
  estimateDays: number | null;
}

export interface CompareResult {
  /** เรียง totalPrice น้อย→มาก แล้ว — แถวแรกคือถูกที่สุด client ไม่ต้องเรียงซ้ำ */
  rows: CompareRow[];
  /** ขนส่งที่ประเมินไม่ได้ — หน้าจอต้องสรุปชื่อไว้ท้ายรายการ ไม่ปล่อยหายเงียบ */
  failed: { courierCode: string; courierName: string }[];
}

/** ตัวเลขบวกจาก field ที่ iShip ส่งมาเป็นได้ทั้ง number/string — 0 หรือเพี้ยน = null */
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * assembleCompareResult — จับคู่ผล allSettled กับรายชื่อขนส่ง (index ตรงกัน)
 * แล้วเรียงราคารวมถูก→แพง
 *
 * ตัวที่ reject หรือราคารวมไม่ใช่เลข = failed ไม่ใช่ error ทั้งชุด — check-price
 * ของขนส่งเจ้าเดียวล่มไม่ควรทำให้ร้านเทียบเจ้าที่เหลือไม่ได้
 */
export function assembleCompareResult(
  couriers: IShipCourier[],
  settled: PromiseSettledResult<IShipPrice>[],
): CompareResult {
  const rows: CompareRow[] = [];
  const failed: CompareResult["failed"] = [];

  couriers.forEach((c, i) => {
    const s = settled[i];
    const total = s?.status === "fulfilled" ? Number(s.value.total_price) : Number.NaN;
    if (s?.status !== "fulfilled" || !Number.isFinite(total)) {
      failed.push({ courierCode: c.code, courierName: c.name });
      return;
    }
    rows.push({
      courierCode: c.code,
      courierName: c.name,
      totalPrice: total,
      basePrice: num(s.value.price),
      fuelFee: num(s.value.fuel_surcharge_fee),
      remoteFee: num(s.value.remote_area),
      estimateDays: num(s.value.estimate_shipping_date),
    });
  });

  rows.sort((a, b) => a.totalPrice - b.totalPrice); // Array.sort เป็น stable ตามสเปก ES2019
  return { rows, failed };
}
