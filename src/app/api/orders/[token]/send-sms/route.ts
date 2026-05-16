import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { SendSmsSchema } from "@/lib/validations";
import { getShopByUserId } from "@/services/shop.service";
import { getOrderForShop } from "@/services/order.service";
import { getMaxVerificationLevel } from "@/services/verification.service";
import { issueSmsCode, markSmsCodeDelivery } from "@/services/sms-code.service";
import { deductCredit, creditWallet, getOrCreateWallet } from "@/services/wallet.service";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// RC-4: daily SMS cap ต่อ shop ~200 SMS/วัน (DB-layer — นับ WalletTransaction DEDUCT วันนี้)
// spec กำหนด: DB-layer count ที่แยกจาก in-memory hourly burst; ceiling cost-exposure
const DAILY_SMS_CAP = 200;

// SMS cost ฿1 ต่อ 1 segment ตาม spec §Goal
const SMS_COST_BAHT = 1;

// RC-4: นับ WalletTransaction DEDUCT ของ shop นี้วันนี้
// ทำไม: in-memory rate-limit กัน burst, DB-layer cap กัน cost-exposure ระยะยาว
// ทั้งสองเป็น independent layer ตาม spec RC-4
async function getDailySmsCount(shopId: string): Promise<number> {
  // หา walletId ของ shop ก่อน (SellerWallet 1:1 Shop)
  const wallet = await prisma.sellerWallet.findUnique({
    where: { shopId },
    select: { id: true },
  });
  if (!wallet) return 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.walletTransaction.count({
    where: {
      walletId: wallet.id,
      type: "DEDUCT",
      createdAt: { gte: startOfDay },
    },
  });
}

// POST /api/orders/[token]/send-sms
//
// Flow:
// 1. session check → 401 ถ้าไม่มี session
// 2. DAL ownership: resolve shop จาก session.user.id → load order scoped ด้วย shopId ใน WHERE (S-C7)
// 3. RC-4 / D3: verification gate L2+ (DOCUMENT APPROVED) — ห้าม test-account exception (RC-5 spec)
// 4. RC-4: daily SMS cap DB-layer
// 5. body parse ด้วย SendSmsSchema (v.object({}) — RC-6/RC-8: ไม่รับ phone จาก client)
// 6. RC-6: buyerContact จาก DB เท่านั้น
// 7. issue smsCode (hash-at-rest, 72h expiry)
// 8. RC-5: deduct ฿1 ก่อน; ถ้า INSUFFICIENT_CREDIT → 402 ไม่ส่ง
// 9. sendSms → ถ้า fail: compensate creditWallet + mark FAILED (NFR-ATOM)
// 10. mark SENT → 200 {ok:true} (RC-8: ไม่ return rawCode/phone)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // Next.js 16 — params เป็น Promise ต้อง await ก่อนใช้
  const { token } = await params;

  // ── Step 1: Session ────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  // ── Step 2: DAL ownership (S-C7) ─────────────────────────────────────────
  // resolve shop จาก session userId — ห้าม findUnique order ก่อนแล้วตรวจ owner ทีหลัง
  // (เหตุผล: fetch-then-check leak order data เข้า RSC flight แม้จะ 403 ทีหลัง)
  const shop = await getShopByUserId(userId);
  if (!shop) {
    return NextResponse.json(
      { error: "ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน" },
      { status: 404 },
    );
  }

  // order ต้องเป็นของ shop นี้ — scope shopId ใน WHERE (S-C7 DAL pattern)
  const order = await getOrderForShop(token, shop.id);
  if (!order) {
    return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  }

  // ── Step 3: RC-4 / D3 Verification gate L2+ ──────────────────────────────
  // D3: seller ต้องมี verification ระดับ DOCUMENT (L2) APPROVED ขึ้นไป
  // RC-5 mandate: ไม่มี test-account exception ทุกกรณี — query จริงเสมอ
  const maxLevel = await getMaxVerificationLevel(userId);
  if (maxLevel < 2) {
    return NextResponse.json(
      {
        error:
          "ต้องยืนยันตัวตนระดับ L2 (เอกสารบัตรประชาชน+เซลฟี่) ขึ้นไปก่อนส่ง SMS",
      },
      { status: 403 },
    );
  }

  // ── Step 4: RC-4 daily SMS cap (DB-layer) ────────────────────────────────
  // นับ WalletTransaction DEDUCT วันนี้ของ shop นี้ — แยกจาก in-memory hourly burst
  // ceiling: 200 SMS/วัน ต่อ shop (กัน cost-exposure จาก loop/abuse)
  const dailyCount = await getDailySmsCount(shop.id);
  if (dailyCount >= DAILY_SMS_CAP) {
    return NextResponse.json(
      { error: `ส่ง SMS ได้สูงสุด ${DAILY_SMS_CAP} ครั้งต่อวัน กรุณาลองใหม่พรุ่งนี้` },
      { status: 429 },
    );
  }

  // ── Step 5: Body parse (SendSmsSchema — empty object โดยตั้งใจ) ──────────
  // RC-6/RC-8: ไม่รับ phone จาก client — buyerPhone มาจาก DB เท่านั้น
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // body ว่าง หรือ JSON invalid — ยอมรับ {} (empty body = valid สำหรับ schema นี้)
    body = {};
  }
  const parsed = v.safeParse(SendSmsSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // ── Step 6: RC-6 buyer phone จาก server (DB) เท่านั้น ───────────────────
  // order.buyerContact ต้องเป็นเบอร์ (ถ้าเป็น email หรือ null → 422)
  // ทำไม: RC-6 ห้ามรับ phone จาก client; ห้าม override buyerContact ที่มีอยู่แล้ว
  const buyerPhone = order.buyerContact;
  if (!buyerPhone || !/^0[0-9]{9}$/.test(buyerPhone)) {
    return NextResponse.json(
      {
        error:
          "คำสั่งซื้อนี้ยังไม่มีเบอร์ผู้ซื้อ กรุณาระบุเบอร์โทรผู้ซื้อในคำสั่งซื้อก่อนส่ง SMS",
      },
      { status: 422 },
    );
  }

  // ── Step 7: Issue SmsCode (hash-at-rest, 72h expiry, deliveryStatus=PENDING) ─
  // issueSmsCode คืน rawCode + smsCodeId — rawCode ใส่ใน SMS text แล้วทิ้ง (ห้าม log/persist)
  let rawCode: string;
  let smsCodeId: string;
  try {
    ({ rawCode, smsCodeId } = await issueSmsCode(order.id, buyerPhone));
  } catch {
    // DB error: ไม่ leak stack ออกนอก (RC-8)
    console.error("[send-sms] issueSmsCode failed: DB error");
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }

  // ── Step 8: RC-5 deduct credit ฿1 ก่อน SMS ──────────────────────────────
  // ลำดับที่ปลอดภัย: deduct ก่อน → ถ้า INSUFFICIENT_CREDIT throw → 402 ไม่ส่ง SMS
  // ใช้ getOrCreateWallet เพื่อ ensure wallet row มีอยู่ก่อน deduct (pattern จาก wallet.service)
  await getOrCreateWallet(shop.id);
  try {
    await deductCredit(
      shop.id,
      SMS_COST_BAHT,
      order.id, // refId = orderId เพื่อ audit trail
      `ส่ง SMS คำสั่งซื้อ ${token.slice(0, 8)}...`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "เครดิตไม่พอ กรุณาเติมเครดิตก่อนส่ง SMS" },
        { status: 402 },
      );
    }
    // error อื่น: generic (ไม่ leak stack)
    console.error("[send-sms] deductCredit failed:", message);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }

  // ── Step 9: D1 สร้าง SMS text + sendSms ──────────────────────────────────
  // D1: short-code path /o/{rawCode} (ไม่ใช่ UUID token)
  // domain: NEXT_PUBLIC_BUYER_URL (buyer subdomain) หรือ NEXTAUTH_URL fallback
  // ข้อความไทยสั้น 1 segment Unicode (≤70 ตัว)
  const baseUrl =
    process.env.NEXT_PUBLIC_BUYER_URL ||
    process.env.NEXTAUTH_URL ||
    "https://deepthailand.app";
  const orderLink = `${baseUrl}/o/${rawCode}`;
  const smsText = `Deep: ลิงก์คำสั่งซื้อของคุณ ${orderLink}`;

  // RC-8: ห้าม log rawCode, smsText, buyerPhone — log เฉพาะ status/id generic
  try {
    await sendSms(buyerPhone, smsText);
  } catch {
    // NFR-ATOM: SMS fail → ต้องชดเชยเครดิตคืน (ไม่หักเงินถ้า SMS ไม่ออก)
    // AR-1: ถ้า compensate เองก็ crash → seller เสีย ฿1 + code orphan (accepted risk MVP)
    // mark code FAILED ก่อนเพื่อ reconcile ได้ (RC-3 deliveryStatus)
    await markSmsCodeDelivery(smsCodeId, "FAILED").catch(() => {
      // ถ้า mark FAILED เองก็ fail → log generic ไม่ block compensate
      console.error("[send-sms] markSmsCodeDelivery FAILED: update error");
    });

    // compensate: คืนเครดิต ฿1 ที่หักไปแล้ว
    await creditWallet(
      shop.id,
      SMS_COST_BAHT,
      order.id,
      `คืนเครดิต SMS ล้มเหลว คำสั่งซื้อ ${token.slice(0, 8)}...`,
    ).catch(() => {
      // ถ้า compensate fail → log สำหรับ manual reconcile (AR-1 accepted risk)
      console.error("[send-sms] creditWallet compensate failed: manual reconcile needed");
    });

    return NextResponse.json(
      { error: "ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 502 },
    );
  }

  // ── Step 10: mark SENT + return 200 ──────────────────────────────────────
  // RC-8: response ไม่คืน rawCode, buyerPhone หรือ PII ใด ๆ
  await markSmsCodeDelivery(smsCodeId, "SENT").catch(() => {
    // mark SENT fail ไม่ block response — SMS ออกแล้ว (RC-3: reconcile ด้วย deliveryStatus)
    console.error("[send-sms] markSmsCodeDelivery SENT: update error (SMS delivered)");
  });

  return NextResponse.json({ ok: true });
}
