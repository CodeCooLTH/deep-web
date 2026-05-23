import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";
import { authOptions } from "@/lib/auth";
import { SetAccessUrlSchema } from "@/lib/validations";
import { setAccessUrl } from "@/services/order.service";

// POST /api/orders/[token]/access-url
//
// Seller-only endpoint — ตั้ง Order.accessUrl สำหรับ digital delivery
// ทำไม: owner ต้องมาจาก session เท่านั้น — ห้ามรับ userId จาก body (ป้องกัน spoofing)
// Guest/buyer ที่ไม่มี session หรือ session ที่ไม่ใช่ owner → 401/403 ทันที
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Auth guard — endpoint นี้ seller-only; ไม่มี guest path
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate request body — url ต้องเป็น http/https (กัน stored-XSS ผ่าน javascript:/data:)
  const body = await request.json().catch(() => null);
  const parsed = v.safeParse(SetAccessUrlSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ลิงก์ไม่ถูกต้อง (ต้องเป็น http หรือ https)" },
      { status: 400 },
    );
  }

  try {
    // setAccessUrl throw "Order not found" หรือ "Forbidden" ถ้า ownership ไม่ตรง
    const order = await setAccessUrl(token, parsed.output.url, userId);
    return NextResponse.json({ accessUrl: order.accessUrl });
  } catch (err: unknown) {
    console.error("[access-url]", err);
    const message = err instanceof Error ? err.message : "";
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "Order not found") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "บันทึกลิงก์ไม่สำเร็จ" }, { status: 400 });
  }
}
