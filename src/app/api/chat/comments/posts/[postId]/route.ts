import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  backfillPostComments,
  getPostComments,
  refreshPostStats,
} from "@/services/page-comment.service";
import { sessionUserId } from "@/lib/session-user";

/**
 * GET /api/chat/comments/posts/[postId] — โพสต์ + คอมเมนต์ทั้งหมด (เก่า→ใหม่)
 *
 * 🛑 **งานคุยกับ Graph ต้องอยู่ใน `after()` เสมอ ห้ามย้ายกลับเข้าเส้นทางที่ผู้ใช้รอ**
 * (มีเทส [blocker] กันไว้)
 *
 * user รายงาน 2026-08-20 ว่ากดเข้าเธรดคอมเมนต์แล้วรอเกิน 1 วินาที — ต้นเหตุคือ `getPostComments()`
 * `await` งาน 2 ตัวนี้เรียงกันก่อนตอบอะไรกลับไปเลย ทั้งที่คอมเมนต์ที่จะแสดงอยู่ในฐานเราครบแล้ว:
 *   1. `backfillPostComments()` — เดินทางไป-กลับเซิร์ฟเวอร์ของ Meta 1 รอบ **และตั้งแต่ 98f5c531
 *      ยังดาวน์โหลด/เขียนไฟล์แนบทีละใบแบบ sequential สูงสุด 30 ใบ**
 *   2. `refreshPostStats()` — เดินทางไปหา Meta อีกรอบ + mirror รูปปกโพสต์
 * ทั้งคู่ throttle 5 นาทีต่อโพสต์ ⇒ ช้าเฉพาะครั้งแรกที่กดเข้าโพสต์นั้น ซึ่งตรงกับอาการที่รายงานเป๊ะ
 *
 * `after()` ยิงหลังตอบ 200 ไปแล้ว — ของที่ backfill ได้เพิ่มจะโผล่เองในรอบ poll/realtime ถัดไป
 * แพตเทิร์นเดียวกับที่ `comments/page.tsx` ใช้กับ `backfillPagePosts` อยู่แล้วพร้อมคอมเมนต์ว่า
 * "รันใน after() = หลังส่ง HTML ให้ผู้ใช้แล้ว — ไม่ถ่วงเวลาเปิดหน้าเลย"
 *
 * ⚠️ ลำดับสำคัญ: ต้องลงทะเบียน `after()` **หลัง** `getPostComments()` สำเร็จเท่านั้น เพราะด่านสิทธิ์
 * (`canAccessShop` → throw FORBIDDEN) อยู่ในนั้น — ลงทะเบียนก่อนแปลว่าคนที่ไม่มีสิทธิ์ก็สั่งให้เรา
 * ยิง Graph แทนเขาได้
 */
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = sessionUserId(session);
  if (!session?.user || !userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { postId } = await params;

  try {
    const data = await getPostComments({ postId, actorUserId: userId, skipBackfill: true });

    // ผ่านด่านสิทธิ์มาแล้ว (getPostComments throw FORBIDDEN เอง) จึงลงทะเบียนงานเบื้องหลังได้
    after(async () => {
      try {
        await backfillPostComments(postId);
        await refreshPostStats(postId);
      } catch (e) {
        // งานเบื้องหลังพังต้องไม่กระทบคำตอบที่ส่งไปแล้ว — แต่ต้องไม่เงียบสนิท
        console.error("[comments/posts] งานเบื้องหลังล้ม", postId, e instanceof Error ? e.message : e);
      }
    });

    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "POST_NOT_FOUND") return NextResponse.json({ error: "ไม่พบโพสต์นี้" }, { status: 404 });
    if (msg === "FORBIDDEN") return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงโพสต์นี้" }, { status: 403 });
    console.error("[GET /api/chat/comments/posts/[postId]]", msg || e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
