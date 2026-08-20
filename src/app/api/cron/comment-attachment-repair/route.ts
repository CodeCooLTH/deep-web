import { NextResponse } from "next/server";

import { repairCommentAttachmentsFromGraph } from "@/services/page-comment.service";

// ยิง Graph 1 ครั้ง + ดาวน์โหลด/เขียนไฟล์ 1 ครั้งต่อคอมเมนต์ — 25 ใบต่อรอบเผื่อเวลาไว้พอ
export const maxDuration = 60;

/**
 * GET /api/cron/comment-attachment-repair — กู้ไฟล์แนบของคอมเมนต์ที่ URL เดิมหมดอายุไปแล้ว
 *
 * `PageComment.attachmentUrl` เก็บ URL ของ fbcdn ซึ่งมีวันหมดอายุฝังอยู่ในพารามิเตอร์ `oe=`
 * และนาฬิกาเริ่มเดินตอน **ออก URL** (คือตอนเรา ingest) ไม่ใช่ตอนลูกค้าคอมเมนต์
 * ณ 2026-08-20: จาก 222 แถวบน prod **หมดอายุไปแล้ว 167** — กลุ่มนี้กู้จาก URL เดิมไม่ได้เลย
 * ทางเดียวคือขอ URL ใหม่จาก Graph ซึ่งเป็นสิ่งที่ route นี้ทำ
 *
 * 🛑 **ตัวนี้เป็นทั้งตัวซ่อมและตัวตอบคำถามเรื่องสิทธิ์** — แอปมี `pages_read_user_content` เป็น
 * REJECTED · access `none` และไม่ได้อยู่ในใบที่ยื่น App Review รอบ 2 ด้วย จึงยังไม่มีใครรู้ว่า
 * Graph จะคืน `attachment` ให้หรือปฏิเสธ. ผลลัพธ์ที่ route นี้คืน (โดยเฉพาะ `errors[]` ที่มี
 * `code`/`subcode` ของ Meta) คือคำตอบ
 *
 * จงใจ **ไม่ทำเป็น probe ทิ้ง** — เช้าวันเดียวกันเพิ่งถอด probe log ที่ค้างมา 17 วันออกไป
 * (log ที่ประกาศเงื่อนไขปลดระวางไว้ในคอมเมนต์ ไม่มีอะไรบังคับให้ถอดตอนถึงเงื่อนไข)
 * ⇒ ของที่ต้องรันครั้งเดียวเพื่อตอบคำถาม ก็ควรมีคุณค่าถาวรด้วย: ถ้าสิทธิ์พอ route นี้คือกลไกซ่อม
 * ที่ใช้ต่อได้เรื่อย ๆ · ถ้าสิทธิ์ไม่พอ มันจะบอกเหตุผลชัด ๆ แล้วค่อยตัดสินใจว่าจะถอดหรือรอสิทธิ์
 *
 * ยังไม่ผูกเข้า `vercel.json` โดยตั้งใจ — รอบแรกต้องดูผลด้วยตาก่อน ไม่ปล่อยให้ยิง Graph
 * เป็นรอบ ๆ ทั้งที่ยังไม่รู้ว่ามันทำอะไรได้บ้าง
 *
 * Auth: Authorization: Bearer {CRON_SECRET} เท่านั้น — pattern เดียวกับ cron อีก 8 ตัวในโปรเจกต์
 * (proxy.ts ยกเว้น /api/cron/* จาก CSRF Origin-check อยู่แล้ว)
 */
export async function GET(request: Request) {
  // 🛑 env ว่าง = ปฏิเสธทันที ห้ามปล่อยให้ `Bearer undefined` ผ่านตอน deploy ลืมตั้ง env
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  // เทียบสตริงเต็ม ไม่ parse บางส่วน
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?take= ปรับขนาดรอบได้ — รอบสำรวจครั้งแรกอยากได้เล็ก ๆ ก่อนเพื่อดูว่า Graph ตอบอะไร
  const take = Number(new URL(request.url).searchParams.get("take") ?? "25");

  try {
    const result = await repairCommentAttachmentsFromGraph({
      take: Number.isFinite(take) && take > 0 ? Math.min(take, 100) : 25,
    });
    // log ไว้เสมอ — งานเบื้องหลังที่ไม่มีใครดูผลลัพธ์คืองานที่พังแล้วไม่มีใครรู้
    console.log("[comment-attachment-repair] เสร็จรอบ", {
      ...result,
      // ตัดข้อความ error ให้สั้นใน log (ตัวเต็มอยู่ใน response ที่ผู้เรียกได้รับ)
      errors: result.errors.slice(0, 3).map((e) => ({ code: e.code, subcode: e.subcode })),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[comment-attachment-repair] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
