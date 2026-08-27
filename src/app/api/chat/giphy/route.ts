import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sessionUserId } from "@/lib/session-user";
import { checkApiRateLimit } from "@/lib/api-rate-limit";
import { searchGiphy, GiphyError, type GiphyKind } from "@/lib/giphy";

/**
 * GET /api/chat/giphy?kind=stickers|gifs&q=&offset= — คลังสติกเกอร์/GIF ของเธรด Instagram
 *
 * ทำไมต้องผ่าน route ของเราแทนที่จะให้ browser ยิง GIPHY ตรง ๆ:
 *  1. **คีย์ห้ามหลุดถึง client** — คีย์ GIPHY อยู่ใน env ฝั่ง server เท่านั้น
 *  2. บังคับ `rating=g` ได้จริง (ถ้า client ยิงเอง จะแก้พารามิเตอร์เป็นอะไรก็ได้)
 *  3. คุมโควตาของคีย์เองได้ — คีย์ที่ GIPHY ออกให้ตอนสมัครเป็น **beta/restricted** ต้องยื่นขอ
 *     อัปเกรดก่อนใช้ production จริง ⇒ ต้องกันไม่ให้แผงเดียวยิงรัวจนโดนตัด
 *
 * ต้องล็อกอิน — ไม่ใช่เพราะข้อมูลลับ แต่เพราะเป็นการใช้โควตาของเรา ไม่เปิดให้คนนอกยืมใช้ฟรี
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  // "มี session" ≠ "รู้ว่าเป็นใคร" — ดู src/lib/session-user.ts
  const userId = sessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // แผงพิมพ์ค้นหาแบบ debounce ยิงได้ถี่พอควร แต่ต้องมีเพดาน — คีย์ beta ของ GIPHY โควตาต่ำ
  if (!checkApiRateLimit(`giphy:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: "ค้นหาถี่เกินไป รอสักครู่แล้วลองใหม่" }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  // allow-list — ค่าที่ไม่รู้จักถอยไป stickers ไม่ใช่ส่งต่อเข้า URL ของ GIPHY ดิบ ๆ
  const kind: GiphyKind = sp.get("kind") === "gifs" ? "gifs" : "stickers";
  const q = sp.get("q") ?? "";
  const offset = Number.parseInt(sp.get("offset") ?? "0", 10) || 0;

  try {
    const items = await searchGiphy({ kind, q, offset, limit: 24, lang: "th" });
    // คืน [] ได้ปกติ = "ไม่พบผลลัพธ์" ซึ่งหน้าจอต้องแยกจาก "ระบบมีปัญหา" ให้ผู้ใช้
    return NextResponse.json({ items });
  } catch (e: unknown) {
    if (e instanceof GiphyError && e.message === "GIPHY_API_KEY_MISSING") {
      console.error("[giphy] ยังไม่ได้ตั้ง GIPHY_API_KEY");
      return NextResponse.json({ error: "ยังไม่ได้ตั้งค่าคลังสติกเกอร์" }, { status: 503 });
    }
    console.error("[giphy]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "โหลดสติกเกอร์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}
