import { NextRequest, NextResponse } from "next/server";
import * as v from "valibot";

import { prisma } from "@/lib/prisma";
import { AuthFlowStartSchema } from "@/lib/validations";
import { recordOrderEvent } from "@/services/order-event.service";

/**
 * POST /api/orders/[token]/auth-flow/start — บันทึกว่าผู้ซื้อเริ่มเข้าสู่ระบบจากลิงก์ออเดอร์
 * feature 00041 (SRS TFR-013) — ครึ่งแรกของ Login Completion Rate
 *
 * 🛑 endpoint นี้ **เปิดให้ guest เรียกได้โดยไม่ต้องล็อกอินโดยตั้งใจ** — ต่างจากทุก endpoint
 * อื่นใต้ /api/orders/[token]/ ที่ต้องมี session. เหตุผล: สิ่งที่วัดคือ "คนที่ยังไม่ล็อกอิน
 * กดปุ่มล็อกอิน" ถ้าบังคับ session ก่อน จะวัดได้เฉพาะคนที่ผ่านด่านไปแล้ว = ตัวส่วนหายไปทั้งก้อน
 * และเราจะไม่มีวันรู้ว่ามีคนเลิกกลางคันเท่าไร ซึ่งคือคำถามที่ทั้งฟีเจอร์นี้ตั้งขึ้นมาเพื่อตอบ
 *
 * คืน 204 เสมอไม่ว่าอะไรเกิดขึ้น:
 *   - token ไม่มีจริง → 204 (ไม่บอกว่ามีหรือไม่มี — uniform response กัน enumeration)
 *   - body พัง/ไม่มี → 204 (บันทึก event โดยไม่มี method)
 *   - เขียนฐานล้ม → 204 (instrumentation ต้องไม่ทำให้ผู้ใช้เจอ error ระหว่างจะล็อกอิน)
 * ⇒ ฝั่ง client ยิงแบบ fire-and-forget ได้โดยไม่ต้องรอผลหรือจัดการ error
 *
 * ไม่ dedupe โดยตั้งใจ: กดปุ่มล็อกอิน 3 ครั้งแล้วเลิก 3 ครั้ง คือข้อมูลที่เราอยากเห็น
 * (ตัวหารของ Login Completion Rate ใช้ DISTINCT orderId อยู่แล้ว — ดู scripts/metrics)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!order) return new NextResponse(null, { status: 204 });

    const body = await request.json().catch(() => null);
    const parsed = v.safeParse(AuthFlowStartSchema, body);
    const method = parsed.success ? parsed.output.method : undefined;

    await recordOrderEvent(prisma, {
      orderId: order.id,
      type: "AUTH_FLOW_STARTED",
      // guest ยังไม่มีตัวตนในระบบ — null คือค่าที่ถูกต้อง ไม่ใช่ข้อมูลขาด
      actorUserId: null,
      ...(method ? { meta: { method } as never } : {}),
    });
  } catch (e) {
    // ห้าม 500 หลุดไปหา guest ที่กำลังจะกดล็อกอิน — instrumentation ล้มเงียบดีกว่าขวางทาง
    console.error("[auth-flow/start] บันทึก instrumentation ล้ม", { token }, e);
  }

  return new NextResponse(null, { status: 204 });
}
