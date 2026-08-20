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
 * ผูกเข้า `vercel.json` เพื่อให้ **กดปุ่ม Run จาก Vercel Dashboard ได้** — `CRON_SECRET` เป็น
 * sensitive env ที่อ่านค่ากลับไม่ได้ทุกทาง (`vercel env pull` คืน `[SENSITIVE]`) จึงเรียกจาก
 * เครื่อง dev ไม่ได้เลย แต่ Vercel ใส่ Authorization ให้เองตอนยิง cron ⇒ นี่คือทางเดียวที่เรียกได้จริง
 *
 * ตั้งวันละครั้งที่ `0 17 * * *` (17:00 UTC = เที่ยงคืนเวลาไทย) — ช่องเวลาที่ยังว่าง ไม่ชนกับ cron
 * ตัวอื่น 🛑 **ถ้าผลรอบแรกบอกว่าสิทธิ์ไม่พอ ให้ถอดออกจาก `vercel.json` ทันที** ไม่ปล่อยให้ยิง
 * Graph เปล่า ๆ วันละ 25 ครั้งตลอดไป — ของชั่วคราวที่ไม่มีใครถอดคือหนี้ที่โปรเจกต์นี้เพิ่งจ่ายไป
 * เมื่อเช้า (probe log ค้าง 17 วัน)
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
    /**
     * log ต้อง **วินิจฉัยได้จากตัวมันเองล้วน ๆ** — Vercel plan นี้ query runtime log ย้อนหลังไม่ได้
     * และวิธีเรียก route นี้ที่ใช้ได้จริงคือกดปุ่ม Run ใน Vercel Dashboard (Vercel ใส่ Authorization
     * ให้เอง) ซึ่งผู้เรียกจะ **ไม่เห็น response body** เห็นแต่ log ⇒ ถ้าตัดข้อความ error ทิ้งที่นี่
     * คำตอบทั้งหมดของการทดสอบนี้จะหายไปพร้อมกัน
     *
     * ตัดที่ 200 ตัวอักษรและเอาแค่ 3 ใบแรก — พอแยก "สิทธิ์ไม่พอ" ออกจาก "คอมเมนต์ถูกลบ" ได้
     * โดยไม่เทเนื้อหาของลูกค้าลง log (error ของ Meta ไม่มี PII อยู่แล้ว แต่กันไว้)
     */
    console.log("[comment-attachment-repair] เสร็จรอบ", {
      scanned: result.scanned,
      repaired: result.repaired,
      noAttachmentFromGraph: result.noAttachmentFromGraph,
      mirrorFailed: result.mirrorFailed,
      types: result.types,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 3).map((e) => ({
        code: e.code,
        subcode: e.subcode,
        message: e.message.slice(0, 200),
      })),
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[comment-attachment-repair] ล้มทั้งรอบ", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
