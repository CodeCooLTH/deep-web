import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { listIceBreakers, saveIceBreakers } from "@/services/channel-chat.service";
import { canAccessShop } from "@/lib/shop-context";
import { prisma } from "@/lib/prisma";

/**
 * Ice Breakers ต่อช่องทาง — คำถามยอดฮิตที่ Meta แสดงก่อนเริ่มแชทครั้งแรก
 *
 * GET  → รายการปัจจุบัน (เรียงตามที่ลูกค้าเห็น)
 * PUT  → แทนที่ทั้งชุด + ยิงไปตั้งที่ Meta · ส่ง [] = ลบทั้งชุด
 *
 * 🛑 ไม่มี POST/DELETE รายข้อโดยตั้งใจ — Meta ไม่มี partial update (ส่ง `ice_breakers` ไปคือ
 * แทนที่ทั้งก้อน) ถ้าเปิด API รายข้อ สถานะสองฝั่งจะเพี้ยนกันทันทีที่ผู้ขายลบข้อกลาง ๆ ออก
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  // authz อยู่ที่ saveIceBreakers อยู่แล้วสำหรับ PUT — GET ต้องเช็คเองที่นี่
  const channel = await prisma.shopChannel.findUnique({
    where: { id: channelId },
    select: { shopId: true },
  });
  if (!channel) return NextResponse.json({ error: "ไม่พบช่องทางนี้" }, { status: 404 });
  if (!(await canAccessShop(channel.shopId, userId))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงช่องทางนี้" }, { status: 403 });
  }

  return NextResponse.json({ items: await listIceBreakers(channelId) });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const body = (await request.json().catch(() => null)) as { items?: unknown } | null;
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw) return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });

  // แปลงเป็นรูปที่ service รับ — ตัวตรวจจริง (จำนวน/ความยาว/ซ้ำ) อยู่ที่ validateIceBreakers
  // ซึ่งเป็น SSOT เดียวกับที่ UI ใช้ ห้ามเขียนกฎซ้ำที่นี่
  const drafts = raw.map((r) => {
    const o = (r ?? {}) as { question?: unknown; answer?: unknown };
    return {
      question: typeof o.question === "string" ? o.question : "",
      answer: typeof o.answer === "string" ? o.answer : "",
    };
  });

  try {
    const result = await saveIceBreakers({ shopChannelId: channelId, actorUserId: userId, drafts });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    // ข้อความจาก validateIceBreakers บอกผู้ขายได้ตรง ๆ ว่าต้องแก้อะไร — ส่งต่อทั้งประโยค
    if (msg.startsWith("INVALID:")) {
      return NextResponse.json({ error: msg.slice("INVALID:".length) }, { status: 400 });
    }
    if (msg === "CHANNEL_NOT_FOUND") {
      return NextResponse.json({ error: "ไม่พบช่องทางนี้" }, { status: 404 });
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงช่องทางนี้" }, { status: 403 });
    }
    if (msg === "CHANNEL_NOT_SUPPORTED") {
      return NextResponse.json({ error: "ช่องทางนี้ไม่รองรับคำถามยอดฮิต" }, { status: 400 });
    }
    if (msg === "CHANNEL_INACTIVE") {
      return NextResponse.json(
        { error: "การเชื่อมต่อกับช่องทางนี้หมดอายุ — เชื่อมเพจใหม่อีกครั้ง" },
        { status: 409 },
      );
    }
    // ที่เหลือคือ Meta ปฏิเสธ — ส่งข้อความดิบไปให้เห็น ดีกว่าบอกแค่ "ผิดพลาด"
    console.error("[ice-breakers]", msg || e);
    return NextResponse.json(
      { error: `บันทึกไปที่ Meta ไม่สำเร็จ${msg ? ` — ${msg}` : ""}` },
      { status: 502 },
    );
  }
}
