// order-progress.ts — ลำดับขั้นของคำสั่งซื้อสำหรับแถบสถานะแนวนอน (seller order detail)
//
// [สำคัญ] เหตุผลที่ต้องมีไฟล์นี้: ของเดิม (ShippingActivity.tsx) ฮาร์ดโค้ดลำดับเป็นเส้นเดียว
// `สั่งซื้อ → ชำระเงิน → จัดส่ง → รับของ` ทุกกรณี ซึ่ง **ผิดสำหรับเก็บเงินปลายทาง (COD)**
// เพราะเงินเป็นสิ่งสุดท้ายที่เกิด ไม่ใช่สิ่งที่สอง อาการที่ตามมามี 2 ข้อและทั้งคู่คือการโกหก:
//
//   1. status='SHIPPED' ทำให้ขั้น "ชำระเงิน" ถูกนับเป็น done → ออเดอร์ COD ขึ้นว่า
//      "ชำระเงินแล้ว — ผู้ซื้อชำระเงินเรียบร้อย" ตั้งแต่วินาทีที่ร้านกดแจ้งเลขพัสดุ
//      ทั้งที่เงินยังไม่ออกจากมือผู้ซื้อ และป้ายบนหัวการ์ดจอเดียวกันยังเขียนว่า "รอเก็บปลายทาง"
//   2. status='PENDING' + COD ขึ้นว่า "รอผู้ซื้อชำระเงิน" ทั้งที่ COD ไม่มีการชำระล่วงหน้าเลย
//
// ตรรกะจึงต้องแตกเป็น 2 เส้นทางตามวิธีชำระเงิน ไม่ใช่เส้นเดียวที่เปลี่ยนแค่คำ
//
// [ข้อจำกัด] ของข้อมูลที่ต้องยอมรับ: `Order` **ไม่มี `paidAt`/`paymentStatus`** ขั้น "ชำระเงิน"
// ทุกรูปแบบเป็นค่าที่ derive ขึ้นมาทั้งหมด สิ่งที่พิสูจน์ได้จริงมีแค่ `slipFileId` (โอนเงิน)
// และ `carrierStatus==='delivered'` (COD ผ่าน iShip = ขนส่งส่งถึงมือแล้ว จึงเก็บเงินแล้ว)
// เพราะฉะนั้น **ห้ามเขียนคำว่า "เงินเข้าร้านแล้ว"** ที่ไหนก็ตามในไฟล์นี้ — เรารู้แค่ว่า
// "ขนส่งเก็บให้แล้ว" ส่วนเงินจะโอนเข้าร้านตามรอบของขนส่งซึ่งระบบมองไม่เห็น (user เคาะ 2026-08-04)

import { isCODPayment } from "./order-display";

export type ProgressStepKey =
  | "PLACED"
  | "PAYMENT"
  | "SHIPPED"
  | "CONFIRMED"
  | "COD_MONEY"
  | "CANCELLED";

/**
 * done      = เกิดขึ้นแล้วจริง (เขียว)
 * current   = ขั้นที่กำลังรออยู่ตอนนี้ (สีตามสถานะจริงของออเดอร์)
 * upcoming  = ยังไม่ถึง (เทาจาง)
 * cancelled = ขั้นยกเลิก (แดง) — ไม่ใช่ done เพราะไม่ใช่ความสำเร็จ
 */
export type ProgressState = "done" | "current" | "upcoming" | "cancelled";

export type ProgressStep = {
  key: ProgressStepKey;
  label: string;
  /** บรรทัดรองใต้ชื่อขั้น — เวลา หรือคำอธิบายที่จำเป็นต่อความถูกต้อง (เช่นเงื่อนไข COD) */
  note?: string;
  icon: string;
  state: ProgressState;
};

export type OrderProgressInput = {
  status: string;
  fulfillmentMode: string;
  paymentMethod: string | null | undefined;
  /** มีสลิปแนบแล้วไหม — แยก "รอชำระ" ออกจาก "แนบสลิปแล้ว รอตรวจสอบ" (โอน/พร้อมเพย์) */
  slipFileId: string | null | undefined;
  totalAmount: number;
  /** สถานะฝั่งขนส่ง iShip — 'delivered' = ถึงมือผู้ซื้อแล้ว (ใช้กับ COD เท่านั้น) */
  carrierStatus: string | null | undefined;
  /** เวลาที่แสดงใต้ขั้นแรก */
  createdAtLabel: string;
  /** เวลาที่แสดงใต้ขั้นที่ตรงกับสถานะปัจจุบัน — ใกล้เคียงที่สุดที่ schema มี (ไม่มี per-event) */
  updatedAtLabel: string;
};

const ICON: Record<ProgressStepKey, string> = {
  PLACED: "file-plus",
  PAYMENT: "credit-card",
  SHIPPED: "truck",
  CONFIRMED: "circle-check-filled",
  // user เคาะ 2026-08-04: ใช้ tabler-coin ตัวเดียวกับที่ฝั่งผู้ซื้อ (OrderDetailMobile.tsx)
  // ใช้แทน COD อยู่แล้ว — ผู้ซื้อกับร้านเห็นสัญลักษณ์เดียวกันสำหรับเรื่องเดียวกัน
  COD_MONEY: "coin",
  CANCELLED: "circle-x",
};

/** จำนวนเงินแบบไทย — ไม่มีทศนิยมเพราะเป็นบรรทัดรอง ไม่ใช่ยอดที่ต้องกระทบยอด */
function baht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * getOrderProgress — คืนลำดับขั้นพร้อมสถานะของแต่ละขั้น
 *
 * เส้นทาง COD (เงินท้ายสุด):  สั่งซื้อ → [จัดส่ง] → ผู้ซื้อรับของ → เก็บเงินปลายทาง
 * เส้นทางโอน/พร้อมเพย์:       สั่งซื้อ → ชำระเงิน → [จัดส่ง] → ผู้ซื้อรับของ
 * ยกเลิก:                     สั่งซื้อ → ยกเลิกแล้ว   (ไม่ลากขั้นที่ไม่มีวันเกิดมาโชว์เทา ๆ)
 *
 * `[จัดส่ง]` มีเฉพาะ fulfillmentMode==='SHIPPED' — ของดิจิทัล/บริการ/รับเอง ไม่มีขั้นนี้
 *
 * วิธีชำระที่ไม่รู้จัก (ร้านพิมพ์เอง เช่น "พร้อมเพย์ 081-xxx") ตกเข้าเส้นทางโอน โดยตั้งใจ:
 * เส้นทาง COD ต้องพิสูจน์ได้ว่าเป็น COD จริงก่อนถึงจะย้ายเงินไปท้าย (allow-list ไม่ใช่ deny-list)
 */
export function getOrderProgress(input: OrderProgressInput): ProgressStep[] {
  const {
    status,
    fulfillmentMode,
    paymentMethod,
    slipFileId,
    totalAmount,
    carrierStatus,
    createdAtLabel,
    updatedAtLabel,
  } = input;

  const hasShipping = fulfillmentMode === "SHIPPED";
  const isCOD = isCODPayment(paymentMethod);

  const placedDone: ProgressStep = {
    key: "PLACED",
    label: "สั่งซื้อแล้ว",
    note: createdAtLabel,
    icon: ICON.PLACED,
    state: "done",
  };

  // ── ยกเลิก ────────────────────────────────────────────────────────────────
  // แสดง 2 ขั้นพอ: สิ่งที่เกิดจริง (สั่งซื้อ) + สิ่งที่จบเรื่อง (ยกเลิก)
  // ไม่ลากขั้นที่เหลือมาโชว์เป็นเทา ๆ เพราะมันไม่มีวันเกิดขึ้นแล้ว — เป็นแค่สัญญาณรบกวน
  if (status === "CANCELLED") {
    return [
      placedDone,
      {
        key: "CANCELLED",
        label: "ยกเลิกแล้ว",
        note: updatedAtLabel,
        icon: ICON.CANCELLED,
        state: "cancelled",
      },
    ];
  }

  const isConfirmed = status === "CONFIRMED";
  const isShipped = status === "SHIPPED";
  // ขนส่งส่งถึงมือผู้ซื้อแล้ว = เก็บเงินปลายทางไปแล้วแน่นอน แม้ผู้ซื้อยังไม่กดยืนยันรับของ
  const delivered = carrierStatus === "delivered";

  const shipStep = (state: ProgressState): ProgressStep => ({
    key: "SHIPPED",
    label: state === "done" ? "จัดส่งแล้ว" : "รอจัดส่ง",
    note: state === "done" && isShipped ? updatedAtLabel : undefined,
    icon: ICON.SHIPPED,
    state,
  });

  const confirmStep = (state: ProgressState): ProgressStep => ({
    key: "CONFIRMED",
    label: state === "done" ? "ผู้ซื้อรับของแล้ว" : "รอผู้ซื้อยืนยันรับของ",
    note: state === "done" ? updatedAtLabel : undefined,
    icon: ICON.CONFIRMED,
    state,
  });

  // ── เส้นทาง COD ───────────────────────────────────────────────────────────
  //
  // ลำดับ: สั่งซื้อ → [จัดส่ง] → เก็บเงินปลายทาง → ผู้ซื้อยืนยันรับของ
  //
  // ทำไมเงินอยู่ "ก่อน" ผู้ซื้อยืนยัน ทั้งที่ COD คือได้เงินทีหลัง: เพราะเงินถูกเก็บตอนขนส่ง
  // เอาของไปส่งถึงหน้าบ้าน ซึ่งเกิดก่อนที่ผู้ซื้อจะมากดยืนยันในแอปเสมอ (บางคนไม่กดเลยด้วยซ้ำ)
  // รอบแรกวางเงินไว้ท้ายสุดแล้วเจอของจริง: ใบที่ขนส่งส่งถึงแล้วแต่ผู้ซื้อยังไม่กด จะขึ้น
  // "เก็บเงินปลายทางแล้ว" เป็นเขียวข้ามหัวขั้น "รอผู้ซื้อยืนยันรับของ" ที่ยังไม่เสร็จ —
  // แถบขั้นตอนที่มีขั้นหลังเสร็จก่อนขั้นหน้า อ่านแล้วขัดกันเองทันที (user เห็นแล้วทักทันที)
  // ลำดับนี้เดินหน้าเรียงเสมอในทุกสถานะ ไม่มีทางเกิดเขียวข้ามขั้นอีก
  if (isCOD) {
    const moneyDone = isConfirmed || delivered;
    const steps: ProgressStep[] = [placedDone];

    if (hasShipping) {
      steps.push(shipStep(isShipped || isConfirmed ? "done" : "current"));
    }

    steps.push({
      key: "COD_MONEY",
      label: moneyDone ? "เก็บเงินปลายทางแล้ว" : "รอเก็บเงินปลายทาง",
      // [สำคัญ] ข้อความ done ต้องไม่พูดว่าเงินเข้าร้านแล้ว — เรารู้แค่ว่าขนส่งเก็บให้แล้ว
      //    รอบการโอนเงินคืนร้านเป็นเรื่องของขนส่ง ระบบไม่มีข้อมูลนั้นเลย
      note: moneyDone
        ? "ขนส่งเก็บเงินให้แล้ว · รอโอนเข้าร้านตามรอบของขนส่ง"
        : `${baht(totalAmount)} · เก็บตอนส่งถึง`,
      icon: ICON.COD_MONEY,
      // ยังไม่ถึงคิวเก็บเงินจนกว่าของจะออกจากร้าน (หรือถึงขั้นส่งมอบ ถ้าไม่มีการจัดส่ง)
      state: moneyDone ? "done" : hasShipping ? (isShipped ? "current" : "upcoming") : "current",
    });

    steps.push(confirmStep(isConfirmed ? "done" : moneyDone ? "current" : "upcoming"));

    return steps;
  }

  // ── เส้นทางโอน/พร้อมเพย์ (และวิธีที่ไม่รู้จัก) — เงินมาก่อนของออก ────────
  const paymentDone = isShipped || isConfirmed;
  const steps: ProgressStep[] = [
    placedDone,
    {
      key: "PAYMENT",
      label: paymentDone
        ? "ชำระเงินแล้ว"
        : slipFileId
          ? "แนบสลิปแล้ว"
          : "รอผู้ซื้อชำระเงิน",
      // มีสลิปแต่ยังไม่ยืนยัน = ยังไม่ถือว่าจ่ายแล้ว (Verified-Means-Green) — บอกให้ชัดว่ารออะไร
      note: paymentDone ? undefined : slipFileId ? "รอตรวจสอบสลิป" : undefined,
      icon: ICON.PAYMENT,
      state: paymentDone ? "done" : "current",
    },
  ];

  if (hasShipping) {
    // status='SHIPPED' แปลว่าของออกจากร้านไปแล้ว = ขั้นจัดส่งจบแล้ว (done ไม่ใช่ current)
    // ขั้นที่ "กำลังรอ" ตอนนั้นคือให้ผู้ซื้อกดยืนยันรับของต่างหาก
    steps.push(shipStep(isShipped || isConfirmed ? "done" : "upcoming"));
  }

  steps.push(
    confirmStep(
      isConfirmed
        ? "done"
        : // ไม่มีขั้นจัดส่ง (ดิจิทัล/บริการ/รับเอง): พอจ่ายแล้วก็เหลือรอผู้ซื้อยืนยันเลย
          hasShipping
          ? isShipped
            ? "current"
            : "upcoming"
          : paymentDone
            ? "current"
            : "upcoming",
    ),
  );

  return steps;
}
