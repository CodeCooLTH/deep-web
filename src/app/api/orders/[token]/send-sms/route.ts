import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { SendSmsSchema } from "@/lib/validations";
import { getOrderForShop } from "@/services/order.service";
import { requireActiveShop } from "@/lib/shop-context";
import { issueSmsCode, markSmsCodeDelivery } from "@/services/sms-code.service";
import { deductCredit, creditWallet } from "@/services/wallet.service";
import { prisma } from "@/lib/prisma";
import { sendSms, consumeSmsQuota } from "@/lib/sms";
import { WALLET_REASON } from "@/lib/inventory-addon";

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

  // NTH-5: ใช้ ICT boundary แทน server-local midnight
  // UTC+7 = offset 7h → วันใหม่ ICT เริ่มเวลา 17:00 UTC ของวันก่อน (= 00:00 ICT)
  // setUTCHours(17,0,0,0) แล้วถ้า UTC hour ปัจจุบัน < 17 ต้องถอย 1 วัน
  // วิธีง่าย: หา "ต้นวัน ICT" = floor(Date.now() / 86400000 วัน UTC+7)
  //   startOfDayICT = now - ((now + 7*3600*1000) % 86400000 - 0 workaround)
  //   ใช้ Date.UTC trick: ต้นวัน UTC+7 = Date.UTC(y,m,d,0,0,0) + 7h offset → แปลงกลับ
  // ใช้วิธีชัดที่สุด: แปลง "เวลาตอนนี้" เป็น ISO ที่ offset +07:00 → ตัด T แล้วเอาแค่วัน
  // → สร้าง Date 00:00:00 ICT → แปลงเป็น UTC
  const nowMs = Date.now();
  // ICT = UTC + 7h: หา วัน/เดือน/ปี ตาม ICT โดยเลื่อน epoch +7h ก่อน getUTC*
  const ictNow = new Date(nowMs + 7 * 3_600_000);
  const startOfDayICT = new Date(
    Date.UTC(ictNow.getUTCFullYear(), ictNow.getUTCMonth(), ictNow.getUTCDate(), 0, 0, 0, 0)
    - 7 * 3_600_000, // ถอย 7h กลับเป็น UTC ที่ตรงกับ 00:00 ICT
  );

  return prisma.walletTransaction.count({
    where: {
      walletId: wallet.id,
      type: "DEDUCT",
      createdAt: { gte: startOfDayICT },
    },
  });
}

// POST /api/orders/[token]/send-sms
//
// Flow (ลำดับแก้ไขตาม RC-5 + OQ-5 MUST-FIX):
// 1. session check → 401 ถ้าไม่มี session
// 2. DAL ownership: resolve shop จาก session.user.id → load order scoped ด้วย shopId ใน WHERE (S-C7)
// 3. [ถูกตัด] L2 verification gate (D3/RC-5) ถูกตัดตาม product decision 2026-05-17 — credit-only
//    (มีเครดิตก็ส่งได้). anti-abuse เหลือ: ฿1/SMS + OQ-5 20/ชม + RC-4 daily-cap + RC-1.
//    ดู retro 2026-05-17 + spec note
// 4. RC-4: daily SMS cap DB-layer (200/วัน ICT boundary)
// 5. OQ-5: in-memory hourly rate-limit (20/ชม./shop, globalThis) → 429 เกิน
// 6. body parse ด้วย SendSmsSchema (v.object({}) — RC-6/RC-8: ไม่รับ phone จาก client)
// 7. RC-6: buyerContact จาก DB เท่านั้น; null/invalid → 422
// 8. ATOMIC TRANSACTION (RC-5 ordering fix):
//      8a. deductCredit (tx) — INSUFFICIENT_CREDIT → rollback → 402; ไม่มี orphan code
//      8b. issueSmsCode (tx) — hash-at-rest, 72h expiry, PENDING
//      8c. set order.buyerContact = buyerPhone ถ้ายังเป็น null (RC-6 lock)
// 9. sendSms (หลัง tx commit) → ถ้า fail: compensate creditWallet + mark FAILED (NFR-ATOM, AR-1)
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
  // ── Step 2: DAL ownership (S-C7) ─────────────────────────────────────────
  // resolve shop จาก active shop context ของ session — ห้าม findUnique order ก่อนแล้วตรวจ owner ทีหลัง
  // (เหตุผล: fetch-then-check leak order data เข้า RSC flight แม้จะ 403 ทีหลัง)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    return NextResponse.json(
      { error: "ไม่พบร้านค้า กรุณาเปิดร้านก่อนใช้งาน" },
      { status: 404 },
    );
  }
  if (active.locked) {
    return NextResponse.json({ error: "SHOP_LOCKED" }, { status: 403 });
  }
  const shop = active.shop;

  // order ต้องเป็นของ shop นี้ — scope shopId ใน WHERE (S-C7 DAL pattern)
  const order = await getOrderForShop(token, shop.id);
  if (!order) {
    return NextResponse.json({ error: "ไม่พบคำสั่งซื้อ" }, { status: 404 });
  }

  // ── Step 3: [ถูกตัด] L2 verification gate (D3/RC-5) ──────────────────────
  // L2 verification gate (D3/RC-5) ถูกตัดตาม product decision 2026-05-17 — credit-only
  // (มีเครดิตก็ส่งได้). anti-abuse เหลือ: ฿1/SMS + OQ-5 20/ชม + RC-4 daily-cap + RC-1.
  // ดู retro 2026-05-17 + spec note

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

  // ── Step 5: OQ-5 in-memory hourly rate-limit (per shop, globalThis) ──────
  // 20 SMS/ชม. ต่อ shop — กัน burst attack (attacker ส่ง 200 SMS ใน 1 วินาที ไม่ได้)
  // ทำก่อน DB ops ทุกตัวเพื่อตัดสั้น (ไม่ต้องเปิด transaction ก่อน check)
  // AR-2: per-instance in-memory (Phase 2 → Redis) — accepted risk ตาม spec
  if (!consumeSmsQuota(shop.id)) {
    return NextResponse.json(
      { error: "ส่ง SMS บ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429 },
    );
  }

  // ── Step 6: Body parse (SendSmsSchema — empty object โดยตั้งใจ) ──────────
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

  // ── Step 7: RC-6 buyer phone จาก server (DB) เท่านั้น ───────────────────
  // order.buyerContact ต้องเป็นเบอร์ (ถ้าเป็น email หรือ null → 422)
  // ทำไม: RC-6 ห้ามรับ phone จาก client; buyerPhone จาก DB ใช้ lock ใน transaction
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

  // ── Step 8: ATOMIC TRANSACTION — deduct + issue + lock buyerContact ──────
  //
  // RC-5 ordering fix: issueSmsCode รันก่อน deductCredit ในโค้ดเดิมทำให้
  // INSUFFICIENT_CREDIT throw หลัง orphan SmsCode ถูกสร้างแล้ว (code ค้าง PENDING ไม่มี SMS)
  //
  // ลำดับใหม่ที่ถูกต้อง (ทั้งสามอยู่ใน prisma.$transaction เดียว):
  //   (a) deductCredit(tx) — ถ้า INSUFFICIENT_CREDIT → rollback ทั้งหมด → ไม่มี orphan code
  //   (b) issueSmsCode(tx) — สร้าง SmsCode row ใน tx เดียวกัน
  //   (c) order.buyerContact lock (RC-6) — set buyerContact = buyerPhone ถ้ายัง null
  //       ปิด race ที่คนอื่น claim order ด้วยเบอร์อื่นผ่าน UUID link (ขณะ buyerContact ยัง null)
  //
  // sendSms เรียก หลัง transaction commit (ห้ามอยู่ใน tx เพราะ external call ยาว)
  // ถ้า sendSms fail → compensate creditWallet + mark FAILED (NFR-ATOM, AR-1)

  let rawCode: string;
  let smsCodeId: string;
  try {
    ({ rawCode, smsCodeId } = await prisma.$transaction(async (tx) => {
      // (a) deduct ก่อน — ถ้า INSUFFICIENT_CREDIT throw → rollback → ไม่มี orphan
      // NTH-4: ไม่ต้องเรียก getOrCreateWallet แยก (deductCredit ทำ upsert ใน tx เองแล้ว)
      await deductCredit(
        shop.id,
        SMS_COST_BAHT,
        order.id, // refId = orderId เพื่อ audit trail
        `ส่ง SMS คำสั่งซื้อ ${token.slice(0, 8)}...`,
        WALLET_REASON.SMS_ORDER_LINK,
        tx,
      );

      // (b) issue code ใน tx เดียวกัน (rc-5: ไม่มี orphan ถ้า deduct fail)
      const issued = await issueSmsCode(order.id, buyerPhone, tx);

      // (c) RC-6: lock buyerContact ถ้ายัง null
      // ทำไม: buyerContact ที่ยัง null ทำให้ UUID link + เบอร์ใดก็ได้ unlock order ได้
      // ตรง consumeSmsCode ก็ทำ RC-6 อยู่แล้ว แต่ lock ฝั่ง issue ด้วยเพื่อปิดช่องตั้งแต่ต้น
      if (!order.buyerContact) {
        await tx.order.update({
          where: { id: order.id },
          data: { buyerContact: buyerPhone },
        });
      }
      // ถ้า order.buyerContact มีอยู่แล้ว (= buyerPhone แน่นอน เพราะ step 7 ดึงมาจาก order)
      // ไม่ต้อง update ซ้ำ

      return issued;
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { error: "เครดิตไม่พอ กรุณาเติมเครดิตก่อนส่ง SMS" },
        { status: 402 },
      );
    }
    // error อื่น (DB/constraint): generic (ไม่ leak stack, ไม่ leak code/phone)
    console.error("[send-sms] atomic transaction failed: DB error");
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 },
    );
  }

  // ── Step 9: D1 สร้าง SMS text + sendSms (หลัง transaction commit) ────────
  // D1: short-code path /o/{rawCode} (ไม่ใช่ UUID token)
  // domain: NEXT_PUBLIC_BUYER_URL (buyer subdomain) หรือ NEXTAUTH_URL fallback
  // ข้อความไทยสั้น 1 segment Unicode (≤70 ตัว)
  // .trim() กัน env ที่มี trailing newline/space (เคยทำ SMS ขึ้นบรรทัดใหม่กลาง URL
  // — prod NEXT_PUBLIC_BUYER_URL เคยมี "\n" ต่อท้าย); replace ตัด trailing slash ซ้ำ
  const baseUrl = (
    process.env.NEXT_PUBLIC_BUYER_URL ||
    process.env.NEXTAUTH_URL ||
    "https://deepthailand.app"
  )
    .trim()
    .replace(/\/+$/, "");
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
