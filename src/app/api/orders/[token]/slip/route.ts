import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUpload, saveFile, deleteFile } from "@/lib/storage";
import { attachSlip } from "@/services/order.service";

// POST /api/orders/[token]/slip
//
// feature 00015 (Order Claim & Forced Login) TD-004 — เลิกใช้ SMS-unlock
// cookie / contact-parity ทั้งคู่ เหลือ path เดียว: session + ownership
// (session.user.id === order.buyerUserId, ที่ guarantee มาก่อนแล้วโดย
// Access Gate ของหน้า /o/[token])
//
// multipart/form-data fields:
//   file — รูปสลิปโอนเงิน (File)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });
  }
  const sessionUserId = (session.user as { id: string }).id;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { buyerUserId: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.buyerUserId !== sessionUserId) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์แนบสลิปคำสั่งซื้อนี้" }, { status: 403 });
  }

  // ── parse multipart ──────────────────────────────────────────────────────────
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
