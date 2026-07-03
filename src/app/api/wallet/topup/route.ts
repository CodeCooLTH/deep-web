import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { safeParse } from "valibot";
import { authOptions } from "@/lib/auth";
import { createTopUpRequest } from "@/services/topup.service";
import { CreateTopUpRequestSchema } from "@/lib/validations";
import { requireActiveShop } from "@/lib/shop-context";

/**
 * POST /api/wallet/topup — seller ส่งคำขอเติมเครดิต SMS พร้อม slip
 *
 * ทำไม shop derive จาก session เท่านั้น (ไม่รับ shopId จาก body):
 * DAL ownership S-C7 — ถ้ารับ shopId จาก client, seller A อาจส่ง shopId ของ
 * seller B เพื่อ top-up credit ให้คนอื่น (หรือดึง audit trail ข้าม shop ได้).
 * session.user.id เป็น single source of truth สำหรับ identity.
 *
 * ทำไม slipFileId ไม่ validate file-existence หรือ file-ownership:
 * schema.prisma:249 — `slipFileId String` ไม่มี @relation/FK ไปยัง model ใด
 * และไม่มี model UploadedFile ในโปรเจกต์ → ไม่มีทาง query file-ownership ได้
 * (Prisma P2003 จะ NOT throw เพราะไม่มี FK constraint จริงใน DB).
 *
 * slip integrity อาศัย: admin ตรวจรูปด้วยตาเมื่อ review TopUpRequest (D2 moderation
 * flow) ก่อน approve — route นี้ไม่ได้ check file ownership และ accepted ภายใต้
 * D2 admin moderation + AR-3 (accepted-risk MVP, spec 2026-05-16-sms-order-link-wallet.md).
 * ถ้าต้องการ file-ownership จริงในอนาคต ต้องเพิ่ม UploadedFile model ใน schema ก่อน.
 *
 * ทำไมไม่ log slipFileId (RC-8):
 * slip เป็นไฟล์ที่ผูกกับ payment information — RC-8 ห้าม log slip content/PII.
 * error log ใช้แค่ shopId (non-PII internal ref) ไม่มี slipFileId/amount.
 */
export async function POST(request: Request) {
  // 1. auth gate — session ต้องมีก่อน (ไม่มี = 401)
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  // 2. DAL: shop derive จาก active shop context ของ session เท่านั้น — ห้ามรับ shopId จาก client (S-C7)
  // ไม่ gate locked — เติมเครดิตเข้า business ที่ locked ได้ (ใช้เพื่อ reactivate)
  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active) {
    // seller ยังไม่มีร้าน = ไม่สามารถเติมเครดิตได้ (TopUpRequest.shopId ต้องมีจริง)
    return NextResponse.json(
      { error: "ต้องมีร้านก่อนเติมเครดิต" },
      { status: 403 },
    );
  }
  const shop = active.shop;

  // 3. parse + validate body ด้วย Valibot (CreateTopUpRequestSchema)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = safeParse(CreateTopUpRequestSchema, body);
  if (!parsed.success) {
    // ไม่ leak Valibot issues detail ออก client (อาจมี internal path/type info)
    return NextResponse.json(
      { error: "ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง (จำนวนเงิน 100–100,000 บาท, กรุณาแนบ slip)" },
      { status: 400 },
    );
  }

  const { amount, slipFileId } = parsed.output;

  // 4. เรียก service — business logic + DB อยู่ใน createTopUpRequest
  //    slipFileId ไม่ log (RC-8); error log ใช้ shopId เท่านั้น (non-PII)
  try {
    const topUpRequest = await createTopUpRequest(shop.id, amount, slipFileId);

    // 5. สำเร็จ → 201 พร้อม id เท่านั้น (ไม่ leak ข้อมูล shop อื่น หรือ amount/slip)
    return NextResponse.json({ ok: true, id: topUpRequest.id }, { status: 201 });
  } catch (e: unknown) {
    // service throw INVALID_AMOUNT = เลี่ยม Valibot (เช่น caller อื่น pass ค่าผิด)
    // — treat เหมือน validation error (400), ไม่ใช่ server fault
    if (e instanceof Error && e.message === "INVALID_AMOUNT") {
      return NextResponse.json(
        { error: "จำนวนเงินต้องเป็นจำนวนเต็มและมากกว่า 0" },
        { status: 400 },
      );
    }

    // DB error อื่น (connection drop / Prisma FK / timeout) — log shopId ไม่มี PII
    // ไม่ log slipFileId หรือ amount (RC-8 + convention ไม่ leak payment detail)
    console.error("[POST /api/wallet/topup] DB error shopId:", shop.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
