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
import { toFileUrl } from "@/lib/file-url";
// ห้ามเขียน mirror logic ใหม่ซ้ำ — ตัวนี้มี allow-list host ของ Meta CDN (กัน SSRF) + streaming
// size cap พร้อมอยู่แล้ว (feature 00018) มติเดียวกับที่ feature 00035 ยึดตอน mirror รูปโพสต์
import { mirrorRemoteImage } from "@/services/channel-chat.service";
import { decryptToken } from "@/lib/token-crypto";
import { GRAPH_BASE } from "@/lib/facebook/constants";
import { parseVideoUrl, MAX_SHOP_VIDEOS } from "@/lib/shop-video";

/** SSOT อยู่ที่ lib/shop-video.ts (client-safe) — re-export ให้ผู้เรียกเดิมไม่ต้องแก้ */
export { MAX_SHOP_VIDEOS };

/** รายการคลิปที่ให้ร้านเลือก — รูปเดียวกันทุกแพลตฟอร์ม ต่างกันแค่ที่มา */
export type PickableVideo = {
  provider: "INSTAGRAM" | "FACEBOOK";
  videoId: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  accountName: string | null;
  likeCount: number | null;
  commentCount: number | null;
  viewCount: number | null;
};

export type IgMediaItem = {
  videoId: string;
  /** media id ของ Graph — ใช้เรียก insights เท่านั้น ไม่ใช่ค่าที่เอาไปประกอบ URL ฝัง */
  mediaId: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  /** ชื่อบัญชีต้นทาง เช่น "oilssm" — บอกผู้ชมว่าคลิปมาจากช่องไหน ไม่ใช่แค่แพลตฟอร์มอะไร */
  accountName: string | null;
  likeCount: number | null;
  commentCount: number | null;
  viewCount: number | null;
};

/**
 * ดึงคลิปของบัญชี Instagram ที่ร้านนี้เชื่อมไว้ (สำหรับให้ร้านเลือก ไม่ใช่สำหรับแสดงสาธารณะ)
 *
 * คืน [] เมื่อร้านยังไม่ได้เชื่อม IG — ผู้เรียกเอาไปแสดงสถานะ "ยังไม่ได้เชื่อมบัญชี" เอง
 * ไม่ throw เพราะการที่ร้านยังไม่เชื่อมไม่ใช่ error
 */
export async function listInstagramVideos(
  shopId: string,
): Promise<{ items: IgMediaItem[]; failed: boolean }> {
  const channel = await prisma.shopChannel.findFirst({
    where: { shopId, provider: "INSTAGRAM", status: "ACTIVE" },
    select: { externalId: true, accessTokenEnc: true },
  });
  // ไม่ได้เชื่อม IG = ไม่ใช่ความล้มเหลว แค่ไม่มีคลิปจากช่องทางนี้
  if (!channel) return { items: [], failed: false };

  const token = decryptToken(channel.accessTokenEnc);
  const url =
    `${GRAPH_BASE}/${channel.externalId}/media` +
    // like_count/comments_count ใช้ได้กับ token ที่มีอยู่ (ทดสอบกับบัญชีจริงแล้ว)
    // ส่วนยอดวิวต้องเรียก insights ซึ่งต้องการ scope instagram_manage_insights ที่ยังไม่ได้ขอ
    `?fields=id,media_type,media_product_type,caption,thumbnail_url,media_url,permalink,like_count,comments_count` +
    `&limit=50&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // token หมดอายุ/สิทธิ์ถูกถอน — ไม่ให้ล้มทั้งหน้า ให้ผู้เรียกแสดงว่ายังไม่มีคลิปให้เลือก
    console.error("[shop-video] ดึงคลิป Instagram ไม่สำเร็จ", { shopId, status: res.status });
    // failed = true: ผู้เรียกต้องไม่ตีความว่า "ร้านไม่มีคลิป" เพราะเราแค่ถามไม่สำเร็จ
    return { items: [], failed: true };
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
      like_count?: number;
      comments_count?: number;
    }>;
  };

  // ชื่อบัญชีดึงครั้งเดียวต่อการเรียก ไม่ใช่ต่อคลิป
  const accountName = await fetchIgUsername(channel.externalId, token);

  const items = (
    (json.data ?? [])
      // เอาเฉพาะวิดีโอ/Reels — รูปนิ่งไม่ใช่สิ่งที่ฟีเจอร์นี้ต้องการ
      .filter((m) => m.media_type === "VIDEO" || m.media_product_type === "REELS")
      .map((m) => {
        // สำคัญ: videoId ต้องเป็น "shortcode" จาก permalink ไม่ใช่ m.id
        //
        // Graph API คืน id เป็นเลขยาว (เช่น 18094374814967865) ส่วน URL ฝังของ Instagram
        // ใช้ shortcode (เช่น DZEzXG8Sr_f) คนละค่ากันคนละรูปแบบ ถ้าเก็บ m.id ไปประกอบ URL
        // จะได้ instagram.com/reel/18094374814967865/embed ซึ่งขึ้นหน้าเปล่าทุกคลิป
        // (พบตอนยิง API จริงกับบัญชีที่เชื่อมไว้ — เอกสารไม่ได้เตือนเรื่องนี้)
        //
        // ใช้ parseVideoUrl แกะ permalink แทนการ split เอง เพราะได้ตรวจโดเมนไปในตัวด้วย
        const parsed = m.permalink ? parseVideoUrl(m.permalink) : null;
        if (!parsed || parsed.provider !== "INSTAGRAM") return null;

        return {
          videoId: parsed.videoId,
          mediaId: m.id,
          caption: m.caption ?? null,
          // วิดีโอบน IG ให้ thumbnail_url มา ส่วน media_url เป็นไฟล์วิดีโอจริง
          thumbnailUrl: m.thumbnail_url ?? null,
          permalink: m.permalink!,
          accountName,
          likeCount: m.like_count ?? null,
          commentCount: m.comments_count ?? null,
        };
      })
      .filter((x): x is IgMediaItem => x !== null)
  );

  // ยอดวิวของคลิป IG: ถอดออกแล้ว (2026-08-01, เตรียมยื่น Meta App Review)
  //
  // เดิมเรียก GET /{media-id}/insights?metric=views|plays แบบ best-effort ต่อคลิป ซึ่งต้องการ
  // scope `instagram_manage_insights` ที่เราขอไม่ได้ (ใส่ใน scope แล้วหน้า login ตีกลับว่า
  // "Invalid Scopes" เชื่อมเพจไม่ได้ทั้งกระบวนการ — ดู APP-REVIEW.md §4) call นี้จึงล้มเหลว
  // 100% ทุกครั้งมาตลอด ได้ผลเป็น null เสมอ แลกกับการยิง Graph เพิ่ม 2 ครั้งต่อคลิป และทิ้ง
  // ประวัติ error ไว้ให้ reviewer เห็นในบันทึกของแอป ขณะที่คำอธิบาย instagram_basic ที่เรายื่น
  // ประกาศว่าไม่อ่าน insights — เก็บไว้ก็มีแต่ทำให้เอกสารกับพฤติกรรมจริงขัดกัน
  //
  // จะเอากลับมาได้เมื่อได้ instagram_manage_insights จริง (ต้องผ่าน App Review ก่อน)
  return {
    items: items.map((it) => ({ ...it, viewCount: null })),
    failed: false,
  };
}

/**
 * ดึง reels ของ Facebook Page ที่ร้านเชื่อมไว้
 *
 * เป็นแพลตฟอร์มเดียวตอนนี้ที่ให้ "ยอดวิว" มาด้วย token ที่มีอยู่แล้ว — Instagram ต้องใช้ scope
 * instagram_manage_insights ที่ยังไม่ได้ขอ (ทดสอบจริงแล้วได้ error #10) ส่วน TikTok รออนุมัติ app
 *
 * ร้านเดียวมีได้หลายเพจ จึงรวมคลิปจากทุกเพจที่ ACTIVE
 */
export async function listFacebookVideos(
  shopId: string,
): Promise<{ items: PickableVideo[]; failed: boolean }> {
  const channels = await prisma.shopChannel.findMany({
    where: { shopId, provider: "MESSENGER", status: "ACTIVE" },
    select: { externalId: true, accessTokenEnc: true, name: true },
  });

  const perPage = await Promise.all(
    channels.map(async (ch) => {
      try {
        const token = decryptToken(ch.accessTokenEnc);
        const url =
          `${GRAPH_BASE}/${ch.externalId}/video_reels` +
          // thumbnails ให้ 1080x1920 ส่วน picture เป็นรูปย่อขนาดเล็กมาก ซึ่งเบลอเห็นได้ชัดบนจอใหญ่
          `?fields=id,description,permalink_url,picture,thumbnails{uri,is_preferred},views,likes.summary(true),comments.summary(true)` +
          `&limit=25&access_token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          console.error("[shop-video] ดึง reels ของเพจไม่สำเร็จ", { shopId, status: res.status });
          return null; // null = ถามไม่สำเร็จ ต่างจาก [] ที่แปลว่าเพจนี้ไม่มีคลิป
        }

        const json = (await res.json()) as {
          data?: Array<{
            id: string;
            description?: string;
            permalink_url?: string;
            picture?: string;
            thumbnails?: { data?: Array<{ uri?: string; is_preferred?: boolean }> };
            views?: number;
            likes?: { summary?: { total_count?: number } };
            comments?: { summary?: { total_count?: number } };
          }>;
        };

        return (json.data ?? [])
          .filter((v) => /^[0-9]{5,30}$/.test(v.id))
          .map<PickableVideo>((v) => ({
            provider: "FACEBOOK",
            // Graph คืน id ของ reel ตรง ๆ ซึ่งใช้ประกอบ URL ฝังได้เลย (ต่างจาก Instagram ที่
            // ต้องแกะ shortcode จาก permalink)
            videoId: v.id,
            caption: v.description ?? null,
            // เลือกตัวที่ Meta ทำเครื่องหมายว่าเหมาะสุดก่อน แล้วค่อยไล่ลงมา — picture ไว้ท้ายสุด
            thumbnailUrl:
              v.thumbnails?.data?.find((t) => t.is_preferred)?.uri ??
              v.thumbnails?.data?.[0]?.uri ??
              v.picture ??
              null,
            permalink: `https://www.facebook.com/reel/${v.id}`,
            accountName: ch.name,
            likeCount: v.likes?.summary?.total_count ?? null,
            commentCount: v.comments?.summary?.total_count ?? null,
            viewCount: v.views ?? null,
          }));
      } catch {
        return null;
      }
    }),
  );

  return {
    items: perPage.filter((x): x is PickableVideo[] => x !== null).flat(),
    failed: perPage.some((x) => x === null),
  };
}

/** คลิปทั้งหมดที่ร้านเลือกได้ จากทุกช่องทางที่เชื่อมไว้ */
export async function listPickableVideos(
  shopId: string,
): Promise<{ items: PickableVideo[]; failed: boolean }> {
  const [ig, fb] = await Promise.all([listInstagramVideos(shopId), listFacebookVideos(shopId)]);
  const items = [
    ...fb.items,
    ...ig.items.map<PickableVideo>((m) => ({
      provider: "INSTAGRAM",
      videoId: m.videoId,
      caption: m.caption,
      thumbnailUrl: m.thumbnailUrl,
      permalink: m.permalink,
      accountName: m.accountName,
      likeCount: m.likeCount,
      commentCount: m.commentCount,
      // ตอนนี้เป็น null เสมอ — ต้องใช้ scope instagram_manage_insights ซึ่งยัง "ขอไม่ได้"
      // (ใส่ใน scope แล้ว Meta ตีกลับจนเชื่อมเพจไม่ได้ทั้งกระบวนการ ต้องผ่าน App Review ก่อน
      // ดู comment ใน lib/facebook/constants.ts) UI ซ่อนช่องนี้เมื่อไม่มีค่า ไม่แสดง 0
      viewCount: m.viewCount,
    })),
  ];
  return { items, failed: ig.failed || fb.failed };
}

/** ชื่อบัญชี IG — แยกฟังก์ชันเพราะเรียกครั้งเดียวต่อการดึงคลิปทั้งชุด ไม่ใช่ต่อคลิป */
async function fetchIgUsername(igUserId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=username&access_token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { username?: string };
    return j.username ?? null;
  } catch {
    return null;
  }
}

/**
 * คลิปที่ร้านเลือกไว้แล้ว — ใช้ทั้งหน้าตั้งค่าและหน้าร้านสาธารณะ
 *
 * 🛑 `thumbnailUrl` ที่คืนออกไปคือค่าที่ resolve แล้ว (mirroredFileId ชนะ URL ของ Meta เสมอ) —
 * ผู้เรียกห้ามคิด fallback เองซ้ำ กติกาเดียวกับ listShopPageBlocks ที่ทำไว้ให้บล็อกโพสต์ FB
 * URL ดิบของ fbcdn/cdninstagram มีอายุจำกัด ถ้าปล่อยให้ UI อ่านตรง ๆ วันหนึ่งกริดจะว่างเงียบ ๆ
 */
export async function getShopVideos(shopId: string) {
  const rows = await prisma.shopVideo.findMany({
    where: { shopId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      provider: true,
      videoId: true,
      caption: true,
      thumbnailUrl: true,
      mirroredFileId: true,
      accountName: true,
      likeCount: true,
      commentCount: true,
      viewCount: true,
      sortOrder: true,
    },
  });

  return rows.map(({ mirroredFileId, ...v }) => ({
    ...v,
    thumbnailUrl: toFileUrl(mirroredFileId) ?? v.thumbnailUrl,
  }));
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
  items: Array<{
    provider: string;
    videoId: string;
    caption?: string | null;
    thumbnailUrl?: string | null;
    accountName?: string | null;
    likeCount?: number | null;
    commentCount?: number | null;
    viewCount?: number | null;
  }>,
) {
  const capped = items.slice(0, MAX_SHOP_VIDEOS);

  // สำเนาที่เคย mirror ไว้แล้วของชุดเดิม — คีย์ด้วย provider+videoId ตัวเดียวกับ @@unique ของตาราง
  // ฟังก์ชันนี้ลบทั้งชุดแล้วสร้างใหม่ ถ้าไม่หิ้วค่านี้ข้ามไป คลิปใบเดิมจะถูก mirror ซ้ำทุกครั้งที่ร้าน
  // กดบันทึก (แค่สลับลำดับก็นับ) = ไฟล์ขยะในสตอเรจกองใหม่ทุกรอบ
  const existing = await prisma.shopVideo.findMany({
    where: { shopId },
    select: { provider: true, videoId: true, mirroredFileId: true, mirroredAt: true },
  });
  const mirroredByKey = new Map(
    existing
      .filter((v) => v.mirroredFileId)
      .map((v) => [`${v.provider}:${v.videoId}`, v] as const),
  );

  // 🛑 mirror อยู่ "นอก" ทรานแซกชันโดยตั้งใจ — แต่ละใบยิง fetch ออกไปที่ CDN ของ Meta ซึ่งรอได้
  // ถึง 10 วินาที (MIRROR_FETCH_TIMEOUT_MS) เอาไปไว้ในทรานแซกชันคือถือ connection ค้างไว้
  // ตลอดเวลานั้นคูณจำนวนคลิป
  //
  // mirror ล้มไม่ block การบันทึก (แนวเดียวกับ mirrorFacebookPostForBuilder TD-004) — แถวยังถูก
  // สร้างพร้อม thumbnailUrl ของ Meta เป็น fallback ชั่วคราว แต่ต้องมีร่องรอยใน log เสมอ
  // ไม่งั้นจะกลายเป็นความล้มเหลวเงียบซ้อนความล้มเหลวเงียบ
  const prepared = await Promise.all(
    capped.map(async (it) => {
      const prev = mirroredByKey.get(`${it.provider}:${it.videoId}`);
      if (prev?.mirroredFileId) {
        return { ...it, mirroredFileId: prev.mirroredFileId, mirroredAt: prev.mirroredAt };
      }
      if (!it.thumbnailUrl) return { ...it, mirroredFileId: null, mirroredAt: null };

      const fileId = await mirrorRemoteImage(it.thumbnailUrl);
      if (!fileId) {
        console.error("[shop-video] mirror รูปปกคลิปไม่สำเร็จ", {
          shopId,
          provider: it.provider,
          videoId: it.videoId,
        });
        return { ...it, mirroredFileId: null, mirroredAt: null };
      }
      return { ...it, mirroredFileId: fileId, mirroredAt: new Date() };
    }),
  );

  await prisma.$transaction(async (tx) => {
    await tx.shopVideo.deleteMany({ where: { shopId } });
    if (prepared.length === 0) return;
    await tx.shopVideo.createMany({
      data: prepared.map((it, i) => ({
        shopId,
        provider: it.provider,
        videoId: it.videoId,
        caption: it.caption ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        mirroredFileId: it.mirroredFileId,
        mirroredAt: it.mirroredAt,
        accountName: it.accountName ?? null,
        likeCount: it.likeCount ?? null,
        commentCount: it.commentCount ?? null,
        viewCount: it.viewCount ?? null,
        sortOrder: i,
      })),
    });
  });
}
