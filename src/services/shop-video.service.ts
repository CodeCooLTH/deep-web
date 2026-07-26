/**
 * คลิปที่ร้านเลือกโชว์บนหน้าร้านสาธารณะ (2026-07-26)
 *
 * หลักของฟีเจอร์นี้: ร้านไม่ได้วาง URL เอง แต่เชื่อมบัญชีแล้วเลือกจากคลิป "ของตัวเอง" ที่ระบบ
 * ดึงผ่าน API ของแพลตฟอร์มมาให้ จึงการันตีความเป็นเจ้าของโดยอัตโนมัติ — เลือกได้เฉพาะคลิป
 * ในบัญชีที่ผ่าน OAuth มาแล้วเท่านั้น ถ้าเปิดให้วาง URL อิสระ ร้านจะเอาคลิปคนอื่นมาอ้างได้
 * ซึ่งทำลายเหตุผลทั้งหมดที่เอาคลิปมาโชว์บนหน้าที่ใช้ตัดสินใจโอนเงิน
 *
 * เฟสแรกรองรับ Instagram ก่อน เพราะ scope `instagram_basic` ถูกขอไว้แล้วตอนเชื่อมช่องทางแชท
 * (src/lib/facebook/constants.ts CONNECT_SCOPES) จึงใช้ token เดิมได้ทันทีโดยไม่ต้องขออนุมัติใหม่
 * TikTok/YouTube เสียบเพิ่มภายหลังได้โดยไม่ต้องแก้ตาราง
 */
import { prisma } from "@/lib/prisma";
import { decryptToken } from "@/lib/token-crypto";
import { GRAPH_BASE } from "@/lib/facebook/constants";

/** จำนวนคลิปสูงสุดที่ร้านโชว์ได้ — กันหน้าร้านยาวจนเนื้อหาสำคัญตกจอ และกันโหลด iframe เกินจำเป็น */
export const MAX_SHOP_VIDEOS = 6;

export type IgMediaItem = {
  videoId: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string;
};

/**
 * ดึงคลิปของบัญชี Instagram ที่ร้านนี้เชื่อมไว้ (สำหรับให้ร้านเลือก ไม่ใช่สำหรับแสดงสาธารณะ)
 *
 * คืน [] เมื่อร้านยังไม่ได้เชื่อม IG — ผู้เรียกเอาไปแสดงสถานะ "ยังไม่ได้เชื่อมบัญชี" เอง
 * ไม่ throw เพราะการที่ร้านยังไม่เชื่อมไม่ใช่ error
 */
export async function listInstagramVideos(shopId: string): Promise<IgMediaItem[]> {
  const channel = await prisma.shopChannel.findFirst({
    where: { shopId, provider: "INSTAGRAM", status: "ACTIVE" },
    select: { externalId: true, accessTokenEnc: true },
  });
  if (!channel) return [];

  const token = decryptToken(channel.accessTokenEnc);
  const url =
    `${GRAPH_BASE}/${channel.externalId}/media` +
    `?fields=id,media_type,media_product_type,caption,thumbnail_url,media_url,permalink` +
    `&limit=50&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // token หมดอายุ/สิทธิ์ถูกถอน — ไม่ให้ล้มทั้งหน้า ให้ผู้เรียกแสดงว่ายังไม่มีคลิปให้เลือก
    console.error("[shop-video] ดึงคลิป Instagram ไม่สำเร็จ", { shopId, status: res.status });
    return [];
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      media_type?: string;
      media_product_type?: string;
      caption?: string;
      thumbnail_url?: string;
      media_url?: string;
      permalink?: string;
    }>;
  };

  return (json.data ?? [])
    // เอาเฉพาะวิดีโอ/Reels — รูปนิ่งไม่ใช่สิ่งที่ฟีเจอร์นี้ต้องการ
    .filter((m) => m.media_type === "VIDEO" || m.media_product_type === "REELS")
    .map((m) => ({
      videoId: m.id,
      caption: m.caption ?? null,
      // วิดีโอบน IG ให้ thumbnail_url มา ส่วน media_url เป็นไฟล์วิดีโอจริง
      thumbnailUrl: m.thumbnail_url ?? null,
      permalink: m.permalink ?? "",
    }));
}

/** คลิปที่ร้านเลือกไว้แล้ว — ใช้ทั้งหน้าตั้งค่าและหน้าร้านสาธารณะ */
export async function getShopVideos(shopId: string) {
  return prisma.shopVideo.findMany({
    where: { shopId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      provider: true,
      videoId: true,
      caption: true,
      thumbnailUrl: true,
      sortOrder: true,
    },
  });
}

/**
 * บันทึกชุดคลิปที่ร้านเลือก — แทนที่ของเดิมทั้งชุด (ไม่ใช่เพิ่มทีละอัน)
 *
 * ทำไมแทนทั้งชุด: หน้าตั้งค่าให้ติ๊กเลือกและจัดลำดับพร้อมกัน การส่งทั้งชุดมาทีเดียวทำให้
 * ลำดับกับสมาชิกในชุดตรงกันเสมอ ไม่ต้องมี endpoint ย่อยสำหรับเพิ่ม/ลบ/สลับที่ ซึ่งแต่ละตัว
 * มีโอกาสหลุด sync กันเอง
 *
 * ตัดที่ MAX_SHOP_VIDEOS ที่ชั้นนี้ด้วย ไม่พึ่ง UI อย่างเดียว
 */
export async function replaceShopVideos(
  shopId: string,
  items: Array<{ provider: string; videoId: string; caption?: string | null; thumbnailUrl?: string | null }>,
) {
  const capped = items.slice(0, MAX_SHOP_VIDEOS);

  await prisma.$transaction(async (tx) => {
    await tx.shopVideo.deleteMany({ where: { shopId } });
    if (capped.length === 0) return;
    await tx.shopVideo.createMany({
      data: capped.map((it, i) => ({
        shopId,
        provider: it.provider,
        videoId: it.videoId,
        caption: it.caption ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        sortOrder: i,
      })),
    });
  });
}
