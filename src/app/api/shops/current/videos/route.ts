// คลิปที่ร้านเลือกโชว์บนหน้าร้านสาธารณะ (2026-07-26)
//
// GET  — คืนคลิปที่ร้านเลือกไว้ + รายการคลิปจากบัญชีที่เชื่อมไว้ให้เลือก
// PUT  — บันทึกชุดที่เลือกทั้งชุด (ไม่ใช่เพิ่มทีละอัน ดู replaceShopVideos ว่าทำไม)
//
// จุดที่การันตีความเป็นเจ้าของ: PUT ไม่รับ URL หรือ videoId อิสระจาก client แต่จะเทียบกับ
// รายการคลิปที่ดึงจากบัญชีที่ร้านเชื่อมไว้จริงก่อนเสมอ ถ้า id ไหนไม่อยู่ในรายการนั้นจะถูกทิ้ง
// มิฉะนั้นร้านยิง request ตรงใส่ API แล้วใส่ id คลิปของคนอื่นได้ ซึ่งทำลายเหตุผลทั้งหมด
// ของฟีเจอร์นี้ (UI ที่ให้เลือกอย่างเดียวไม่ใช่การป้องกัน — เป็นแค่ความสะดวก)
//
// mutation ใต้ /api/shops/** → guardApi() ใน proxy.ts คุม CSRF/rate-limit ให้แล้ว
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as v from "valibot";

import { authOptions } from "@/lib/auth";
import { requireActiveShop } from "@/lib/shop-context";
import {
  listPickableVideos,
  getShopVideos,
  replaceShopVideos,
  MAX_SHOP_VIDEOS,
} from "@/services/shop-video.service";

const Body = v.object({
  items: v.array(
    v.object({
      provider: v.picklist(["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"]),
      videoId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
    }),
  ),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active?.shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const [selected, pickable] = await Promise.all([
    getShopVideos(active.shop.id),
    listPickableVideos(active.shop.id),
  ]);

  return NextResponse.json({
    selected,
    available: pickable.items,
    // บอก UI ว่ารายการที่เห็นอาจไม่ครบเพราะถามแพลตฟอร์มไม่สำเร็จ ไม่ใช่เพราะร้านไม่มีคลิป
    partial: pickable.failed,
    max: MAX_SHOP_VIDEOS,
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const active = await requireActiveShop(session as unknown as { user: { id: string; activeShopId?: string | null } });
  if (!active?.shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

  const parsed = v.safeParse(Body, await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  // ── ยืนยันความเป็นเจ้าของ: id ที่ส่งมาต้องอยู่ในคลิปของบัญชีที่ร้านเชื่อมไว้จริง ──
  const owned = await listPickableVideos(active.shop.id);

  // ตรวจไม่สำเร็จ ไม่เท่ากับ ไม่ใช่เจ้าของ — ถ้าเหมารวมกันจะขึ้นข้อความว่าคลิปไม่ใช่ของร้าน
  // ทั้งที่ความจริงคือเราถามแพลตฟอร์มไม่สำเร็จ ซึ่งทำให้ร้านงงและคิดว่าตัวเองทำผิด
  if (owned.failed) {
    return NextResponse.json(
      { error: "ตรวจสอบกับแพลตฟอร์มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", code: "VERIFY_UNAVAILABLE" },
      { status: 503 },
    );
  }
  // key ด้วย provider+id — คลิปคนละแพลตฟอร์มมี id ชนกันได้ในทางทฤษฎี
  const ownedByKey = new Map(owned.items.map((m) => [`${m.provider}:${m.videoId}`, m]));

  const verified = parsed.output.items.filter((it) => ownedByKey.has(`${it.provider}:${it.videoId}`));

  if (verified.length !== parsed.output.items.length) {
    return NextResponse.json(
      { error: "มีคลิปที่ไม่ได้อยู่ในบัญชีที่เชื่อมไว้", code: "NOT_OWNED" },
      { status: 403 },
    );
  }

  await replaceShopVideos(
    active.shop.id,
    verified.map((it) => {
      const m = ownedByKey.get(`${it.provider}:${it.videoId}`)!;
      return {
        provider: it.provider,
        videoId: it.videoId,
        caption: m.caption,
        thumbnailUrl: m.thumbnailUrl,
        accountName: m.accountName,
        likeCount: m.likeCount,
        commentCount: m.commentCount,
        viewCount: m.viewCount,
      };
    }),
  );

  return NextResponse.json({ ok: true, count: verified.length });
}
