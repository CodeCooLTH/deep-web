// feature 00084 — ค่าคงที่ของ Flash Express จุดเดียว (SRS TFR-FLASH-017/018/019)

export const FLASH_LIMITS = {
  carrierPriceMaxBaht: 10_000, // เกินนี้ถือว่า payload ผิด ไม่เขียนต้นทุนทั้งก้อน
  codFeeMaxBaht: 10_000,
  codItemsMax: 10,
  itemQuantityMax: 999,
  remarkMax: 200,
  outTradeNoMax: 64,
} as const;

/** องค์ประกอบที่รวมเป็น carrierPrice (สตางค์) — BR-FLASH-52; codFee แยก ไม่รวม */
export const FLASH_COST_COMPONENTS = [
  "freightPrice",
  "remoteAreaFee",
  "speedFee",
  "valueInsuranceFee",
  "opdInsureFee",
  "packagingFee",
  "labelFee",
] as const;

/** state ที่กระทบ milestone ต้องยืนยันด้วย routes ก่อนเสมอ (BR-FLASH-73) */
export const FLASH_VERIFY_STATES: readonly number[] = [4, 5, 6, 7, 8, 9];

export const FLASH_POLL = {
  throttleMs: 15 * 60_000,
  maxShopsPerRun: 40,
  pnoChunkChars: 500,
  fallbackRoutesPerShop: 8,
  podRepairPerShop: 5,
  lookbackDays: 45,
} as const;

/** P0-8: ยังไม่พิสูจน์ว่า returnedPno ถึง state 5 = ตีกลับถึงร้านแล้ว */
export const FLASH_RETURN_DELIVERED_MEANS_RETURNED = false;

/** P0-4: รูปสะกดจังหวัดที่ Flash รับ (ค่าชั่วคราว รอยืนยันกับ training) */
export const FLASH_PROVINCE_TABLE: Readonly<Record<string, string>> = {
  กรุงเทพมหานคร: "กรุงเทพ",
};
