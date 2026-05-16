import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { safeParse } from "valibot";
import { authOptions } from "@/lib/auth";
import { getShopByUserId } from "@/services/shop.service";
import { createTopUpRequest } from "@/services/topup.service";
import { CreateTopUpRequestSchema } from "@/lib/validations";

/**
 * POST /api/wallet/topup — seller ส่งคำขอเติมเครดิต SMS พร้อม slip
 *
 * ทำไม shop derive จาก session เท่านั้น (ไม่รับ shopId จาก body):
 * DAL ownership S-C7 — ถ้ารับ shopId จาก client, seller A อาจส่ง shopId ของ
 * seller B เพื่อ top-up credit ให้คนอื่น (หรือดึง audit trail ข้าม shop ได้).
 * session.user.id เป็น single source of truth สำหรับ identity.
 *
 * ทำไม slipFileId ไม่ validate ว่า fileId มีจริงใน DB:
 * spec/plan ไม่ระบุ file-existence check ณ route นี้ — DB FK (TopUpRequest.slipFileId)
 * จะ throw ถ้า fileId ไม่มีอยู่จริง (Prisma P2003). admin ยังต้องตรวจ slip ก่อน
 * approve อยู่ดี (B4) — เป็น AR-3 accepted risk.
 * FLAG สำหรับ reviewer: ถ้าต้องการ strict file-ownership check (fileId ต้อง
 * เป็นของ user นี้) ให้เพิ่ม query UploadedFile.userId===session.user.id ที่นี่.
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

  // cast เหมือน pattern ที่มีอยู่ใน src/app/api/wallet/route.ts:29
  const userId = (session.user as any).id as string;

  // 2. DAL: shop derive จาก session userId เท่านั้น — ห้ามรับ shopId จาก client (S-C7)
  const shop = await getShopByUserId(userId);
  if (!shop) {
    // seller ยังไม่มีร้าน = ไม่สามารถเติมเครดิตได้ (TopUpRequest.shopId ต้องมีจริง)
    return NextResponse.json(
      { error: "ต้องมีร้านก่อนเติมเครดิต" },
      { status: 403 },
    );
  }

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
