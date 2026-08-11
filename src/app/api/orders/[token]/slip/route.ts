import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as v from "valibot";
import { validateUpload, saveFile, deleteFile, getFileMeta } from "@/lib/storage";
import { AttachSlipSchema } from "@/lib/validations";
import { attachSlip } from "@/services/order.service";
import { sessionUserId } from "@/lib/session-user";

// POST /api/orders/[token]/slip
//
// feature 00015 (Order Claim & Forced Login) TD-004 — เลิกใช้ SMS-unlock
// cookie / contact-parity ทั้งคู่ เหลือ path เดียว: session + ownership
// (session.user.id === order.buyerUserId, ที่ guarantee มาก่อนแล้วโดย
// Access Gate ของหน้า /o/[token])
//
// รับ body ได้ 2 แบบ:
//   1. application/json  `{ fileId }`  ← **ทางหลัก** (direct upload ผ่าน @/lib/upload-client)
//   2. multipart/form-data field `file` ← legacy ที่เหลือผู้เรียกรายเดียวคือ OrderDetailMobile.tsx
//
// ทำไมต้องมีทางที่ 1: ตั้งแต่ `3a1650ae` ฝั่งผู้จอง (BookingGuestView) ย้ายไป `uploadFileId()`
// แล้วส่ง JSON มา แต่ route นี้เรียก `request.formData()` อย่างเดียว → throw ทุกครั้ง →
// **ผู้จองแนบสลิปไม่สำเร็จ 100%** โดยหน้าจอขึ้นแค่ "ลองอีกครั้ง"
// และทางที่ 2 เองก็ตันที่เพดาน request body 4.5MB ของ Vercel (ข้อความ "≤ 5MB" ในหน้าจอไม่มีผลจริง)
// — จะถอดทิ้งพร้อมกับตอนย้าย OrderDetailMobile ไป upload-client
// (allow-list ที่ `src/lib/__tests__/upload-no-multipart-callers.test.ts` ต้องถอดพร้อมกัน)
// ดู docs/conventions/upload-body-size-limit.md

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  const actorUserId = sessionUserId(session);
  if (!session?.user || !actorUserId) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { buyerUserId: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.buyerUserId !== actorUserId) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แนบสลิปคำสั่งซื้อนี้" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  // ── ทางหลัก: JSON { fileId } จาก direct upload ───────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    const parsed = v.safeParse(AttachSlipSchema, body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.issues[0]?.message ?? "กรุณาแนบไฟล์สลิป" },
        { status: 400 },
      );
    }
    const { fileId } = parsed.output;

    // ไฟล์ถูกตรวจชนิด/ขนาดไปแล้วที่ /api/uploads/commit (ด้วยขนาดจริงจาก HEAD ไม่ใช่ตัวเลขที่
    // client แจ้ง) — ที่นี่เหลือแค่กันไม่ให้ผูก fileId ที่ไม่มีไฟล์อยู่จริงเข้ากับออเดอร์
    // (สลิปที่ชี้ไปที่ว่างเปล่าจะกลายเป็นรูปเสียในหน้าผู้ขาย โดยไม่มีอะไรฟ้อง)
    const meta = await getFileMeta(fileId);
    if (!meta) {
      return NextResponse.json(
        { error: "ยังไม่พบไฟล์ที่อัปโหลด กรุณาลองแนบใหม่" },
        { status: 404 },
      );
    }

    try {
      const updated = await attachSlip(token, fileId);
      return NextResponse.json({ slipFileId: updated.slipFileId });
    } catch (err: unknown) {
      // attachSlip throw เมื่อ: order ไม่พบ / status ไม่ใช่ PENDING
      // **ไม่ลบไฟล์ทิ้ง** ต่างจากทางที่ 2 — ไฟล์นี้ไม่ได้เกิดจากคำขอนี้ ผู้ใช้อาจแนบไปที่อื่นแล้ว
      // RC-8 + F2: ห้าม log phone/cookie/fileId — ห้าม echo err.message (oracle leak)
      console.error("[slip]", err);
      return NextResponse.json(
        { error: "แนบสลิปไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
        { status: 400 },
      );
    }
  }

  // ── legacy: multipart/form-data ─────────────────────────────────────────────
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "กรุณาแนบไฟล์สลิป" },
      { status: 400 },
    );
  }

  // ── validate file type + size ────────────────────────────────────────────────
  try {
    validateUpload(file);
  } catch {
    // validateUpload throw เมื่อ type ไม่รองรับหรือ size เกิน 5MB
    // ไม่ echo err.message — ข้อความ generic ป้องกัน oracle leak
    return NextResponse.json(
      { error: "ไฟล์ไม่ถูกต้อง (รองรับรูปภาพ/PDF ≤ 5MB)" },
      { status: 400 },
    );
  }

  // ── save file → attach to order ──────────────────────────────────────────────
  const fileId = await saveFile(file);

  try {
    const updated = await attachSlip(token, fileId);
    return NextResponse.json({ slipFileId: updated.slipFileId });
  } catch (err: unknown) {
    // attachSlip throw เมื่อ: order ไม่พบ / status ไม่ใช่ PENDING
    // ลบไฟล์ที่ upload ไปแล้วเพื่อป้องกัน orphan file ค้างใน storage
    await deleteFile(fileId);
    // RC-8 + F2: ห้าม log phone/cookie/fileId — ห้าม echo err.message (oracle leak)
    console.error("[slip]", err);
    return NextResponse.json(
      { error: "แนบสลิปไม่สำเร็จ กรุณาตรวจสอบและลองใหม่" },
      { status: 400 },
    );
  }
}
