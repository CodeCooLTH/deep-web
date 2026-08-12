/**
 * GET /api/orders/[token]/appointment-summary — ทุกอย่างที่ชีต "ส่งสรุปนัด" ต้องใช้
 * (ส่วนขยาย 00024, 2026-08-11)
 *
 * คืน 3 อย่างในคำขอเดียว: ร้านเจ้าของออเดอร์ · ข้อมูลนัดสำหรับประกอบสรุป · ห้องแชทที่ส่งได้
 *
 * 🛑 **ทำไมชีตต้อง fetch แทนที่จะรับเป็น prop**: สรุปนัดมี **เบอร์โทรลูกค้า** อยู่ในนั้น และหน้า
 * seller ทุกหน้าอยู่ใต้ client layout ⇒ prop ที่ส่งข้าม RSC boundary จะถูก serialize ลง flight
 * payload ของทุกหน้าที่มีปุ่มนี้ ไม่ว่าผู้ขายจะกดเปิดชีตหรือไม่ (บทเรียน S-C1 2026-08-06 —
 * `memory/feedback_rsc_pii_neutralize_at_source`) การให้ชีตขอเอาตอนเปิดจึงไม่ใช่แค่สะดวก
 * แต่เป็นการไม่เอา PII ไปวางไว้ในที่ที่ไม่มีใครขอ
 *
 * ผลพลอยได้: จุดเรียกทั้ง 4 จุดส่งแค่ `orderToken` — ไม่ต้องไล่ต่อ prop ผ่าน component คนละทรง
 * 4 แบบ (ซึ่งเป็นจุดที่คนเพิ่มทีหลังจะลืมส่งแล้วตกกลับไปค่าตั้งต้นเงียบ ๆ)
 *
 * 🛑 ห้อง DEEP กับช่องทางนอกผูก Customer คนละทาง — ดู comment ที่ `where` ด้านล่าง
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canAccessShop } from "@/lib/shop-context";
import { sessionUserId } from "@/lib/session-user";
import { prisma } from "@/lib/prisma";
import { formatBaht } from "@/lib/format-money";
import { canUseAppointments, isTerminalAppointmentStatus } from "@/lib/appointments";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getServerSession(authOptions);
  // "มี session" ≠ "รู้ว่าเป็นใคร" — ตรวจ id ที่จะเอาไปใช้จริง ไม่ใช่กล่องที่ห่อมันอยู่
  // (docs/conventions/session-exists-is-not-identity.md; cast แบบเดิมปล่อย undefined ไหลเข้า
  //  prisma แล้วกลายเป็น 500 ทั้ง route โดยไม่มี gate ไหนเห็น)
  const userId = sessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { token } = await params;

  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: {
      shopId: true,
      customerId: true,
      // ห้องแชทต้นทางของออเดอร์ใบนี้ (main เพิ่มคอลัมน์ 2026-08-12) — ดู §"ลำดับห้อง" ด้านล่าง
      conversationId: true,
      serviceStart: true,
      serviceEnd: true,
      appointmentStatus: true,
      buyerName: true,
      buyerContact: true,
      totalAmount: true,
      depositAmount: true,
      items: { select: { name: true }, take: 1 },
      serviceResource: { select: { name: true } },
      shop: { select: { kind: true, vertical: true } },
      // customer.userId: ห้องแชท DEEP ผูกด้วย `buyerUserId` ไม่ได้ผูก Customer โดยตรง —
      // ไม่ดึงค่านี้ ลูกค้าที่คุยผ่านแอปผู้ซื้อจะกลายเป็น "ไม่มีห้องแชท" ทั้งที่มี
      customer: { select: { userId: true } },
    },
  });
  // ไม่พบ = 404 ไม่ใช่ 403 — 403 ยืนยันว่าทรัพยากรนั้นมีอยู่จริง (กติกาขอบเขต SRS §7.14)
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessShop(order.shopId, userId))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // ด่านชุดเดียวกับตอนส่งจริง — ถ้าปล่อยผ่านที่นี่ ผู้ขายจะเปิดชีตได้แล้วไปโดนปฏิเสธตอนกดส่ง
  // ซึ่งอ่านเหมือนระบบพัง (ตัวจริงที่บังคับยังเป็น route ส่งข้อความเสมอ ที่นี่คือชั้นบอกล่วงหน้า)
  if (!canUseAppointments(order.shop)) {
    return NextResponse.json({ error: "ร้านนี้ไม่ได้ใช้ระบบประเภทงาน" }, { status: 403 });
  }
  if (!order.serviceStart) {
    return NextResponse.json({ error: "คำสั่งซื้อนี้ไม่มีนัดหมาย" }, { status: 400 });
  }
  if (isTerminalAppointmentStatus(order.appointmentStatus)) {
    return NextResponse.json({ error: "นัดนี้จบแล้ว ส่งสรุปไม่ได้" }, { status: 400 });
  }

  /**
   * 🛑 **ห้องต้นทางมาก่อนเสมอ ถ้ารู้** — `Order.conversationId` คือเธรดที่ผู้ขายกดสร้างออเดอร์ใบนี้จริง
   *
   * คอลัมน์นี้ถูกเพิ่มเมื่อ 2026-08-12 พร้อมคอมเมนต์ที่ schema ว่า *"หาเธรดต้นทางของออเดอร์นี้
   * ตรง ๆ (แทนการเดาจาก Customer)"* — ซึ่งอธิบายโค้ดเดิมของไฟล์นี้พอดี. การเรียงด้วย
   * `lastMessageAt` อย่างเดียวจะเลือกผิดห้องทันทีที่ลูกค้าคนเดียวกันทักมาสองเพจ แล้วเพจที่คุยล่าสุด
   * ไม่ใช่เพจที่นัดเกิดขึ้น
   *
   * ยังคืนห้องอื่นมาด้วย (ไม่ตัดทิ้ง) — ผู้ขายอาจตั้งใจส่งไปอีกช่องทาง แต่ **ค่าตั้งต้นต้องเป็นห้องต้นทาง**
   *
   * ลูกค้าคนเดียวกันมีห้องแชทได้ 2 แบบที่ผูกกันคนละทาง — ต้องรับทั้งคู่:
   *   - ช่องทางนอก (Messenger/IG/LINE) → `ExternalContact.customerId`
   *   - แชทในแอปผู้ซื้อ (DEEP)        → `Conversation.buyerUserId` (ผ่าน `Customer.userId`)
   *
   * 🛑 `shopId` ต้องอยู่ใน `WHERE` เสมอ — `Customer` เป็นตารางระดับทั้งระบบ (`phone @unique`)
   * ลูกค้าคนเดียวมีห้องแชทกับหลายร้านได้ ถ้า query ด้วย `customerId` เปล่า ๆ ร้านจะส่งข้อมูลนัด
   * ของตัวเองเข้าห้องแชทของร้านอื่น (กติกาเดียวกับ `DISTINCT ON` ใน SRS §7.14)
   *
   * เขียนเป็น OR ที่ระดับ query ไม่ใช่ยิงสองรอบแล้วรวมเอง — ไม่งั้นการเรียงตาม `lastMessageAt`
   * จะเพี้ยนข้ามชุด แล้วค่าตั้งต้น "ห้องที่คุยล่าสุด" จะเลือกผิดห้อง
   */
  const conversations = (order.customerId || order.conversationId)
    ? await prisma.conversation.findMany({
        where: {
          // ownership อยู่ใน WHERE เสมอ — ครอบทั้งห้องต้นทางและห้องที่ derive จากลูกค้า
          shopId: order.shopId,
          OR: [
            ...(order.conversationId ? [{ id: order.conversationId }] : []),
            ...(order.customerId
              ? [{ externalContact: { customerId: order.customerId } }]
              : []),
            ...(order.customer?.userId ? [{ buyerUserId: order.customer.userId }] : []),
          ],
        },
        orderBy: { lastMessageAt: "desc" },
        take: 10,
        select: {
          id: true,
          channel: true,
          externalContact: { select: { name: true } },
          shopChannel: { select: { name: true } },
        },
      })
    : // ออเดอร์ที่ไม่มีเบอร์ไม่ถูกผูก Customer → ไม่มีทางรู้ว่าเป็นลูกค้าคนไหน
      // คืนรายการว่าง **ไม่ใช่ error** — หน้าจอต้องแยก "ยังไม่มีห้องแชท" ออกจาก "ระบบพัง"
      [];

  const deposit = Number(order.depositAmount ?? 0);

  return NextResponse.json({
    shopId: order.shopId,
    data: {
      serviceStart: order.serviceStart.toISOString(),
      serviceEnd: order.serviceEnd ? order.serviceEnd.toISOString() : null,
      serviceName: order.items[0]?.name ?? null,
      resourceName: order.serviceResource?.name ?? null,
      customerName: order.buyerName,
      phone: order.buyerContact,
      // ฟอร์แมตเงินด้วยสูตรกลางของระบบเสมอ — ถ้าฝั่ง client ฟอร์แมตเอง ยอดบนพรีวิวจะเพี้ยน
      // จากยอดบนการ์ดที่ส่งจริงได้โดยไม่มีอะไรฟ้อง (HR16)
      totalText: formatBaht(Number(order.totalAmount)),
      depositText: deposit > 0 ? formatBaht(deposit) : null,
    },
    targets: [...conversations]
      // ห้องต้นทางขึ้นก่อนเสมอ — ที่เหลือคงลำดับ `lastMessageAt` เดิม
      .sort((a, b) =>
        a.id === order.conversationId ? -1 : b.id === order.conversationId ? 1 : 0,
      )
      .map((c) => ({
      id: c.id,
      channel: c.channel,
      // ชื่อที่ผู้ขายใช้แยกห้อง — ชื่อลูกค้าก่อน ถ้าไม่มีค่อยใช้ชื่อเพจ (คนเดียวกันคนละเพจ)
      contactName: c.externalContact?.name ?? null,
      pageName: c.shopChannel?.name ?? null,
      /** ห้องที่ออเดอร์ใบนี้เกิดขึ้นจริง — หน้าจอใช้ติดป้ายให้ผู้ขายมั่นใจว่าค่าตั้งต้นถูกห้อง */
      isOrigin: c.id === order.conversationId,
    })),
  });
}
