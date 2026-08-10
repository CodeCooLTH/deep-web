/**
 * จำนวนคลิปสูงสุดที่ร้านโชว์ได้บนหน้าร้านสาธารณะ
 *
 * 6 → 15 (user 2026-08-09): 6 ใบไม่พอกับร้านที่ทำคลิปสม่ำเสมอ
 * 15 ลงตัวกับกริดแท็บปักหมุดทั้งสอง breakpoint — มือถือ 3 คอลัมน์ = 5 แถวเต็ม เดสก์ท็อป
 * 5 คอลัมน์ = 3 แถวเต็ม จึงไม่มีแถวสุดท้ายที่เหลือใบโดด (ไทล์เป็นรูปปก iframe โหลดเมื่อกดเท่านั้น
 * เพดานนี้จึงไม่ได้แลกกับเวลาโหลดหน้า)
 *
 * 🛑 อยู่ในไฟล์นี้ ไม่ใช่ใน shop-video.service.ts เพราะหน้าเลือกคลิปฝั่ง seller เป็น client
 * component — import จาก service จะลาก prisma เข้า bundle ฝั่ง client ไปด้วย
 * (service re-export ค่านี้ต่อ เพื่อให้ผู้เรียกเดิมไม่ต้องแก้)
 */
export const MAX_SHOP_VIDEOS = 15

/**
 * แปลง URL คลิปที่ร้านวาง → ข้อมูลที่ปลอดภัยพอจะเอาไปฝังในหน้าร้านสาธารณะ
 *
 * ทำไมต้องเข้มเป็นพิเศษ: หน้าร้านสาธารณะคือหน้าที่ผู้ซื้อใช้ตัดสินใจว่าจะโอนเงินให้ร้านนี้ไหม
 * ถ้าปล่อยให้ร้านใส่ URL อะไรก็ได้แล้วเอาไปทำ iframe ตรง ๆ ช่องนี้จะกลายเป็นที่แปะลิงก์
 * หลอกลวงหรือหน้าเก็บข้อมูลปลอม บนหน้าที่ผู้ซื้อไว้ใจที่สุดพอดี
 *
 * หลักที่ใช้: ไม่เชื่อ URL ที่รับมาเลย — parse เอาเฉพาะรหัสคลิปออกมา แล้ว**ประกอบ URL ฝังขึ้นใหม่เอง**
 * จากรหัสนั้น ค่าที่เก็บลง DB จึงไม่มีทางเป็น URL ที่ผู้ใช้กำหนดเอง และรหัสถูกจำกัดชุดตัวอักษร
 * ไว้อีกชั้นกัน path traversal / query injection ที่จะทำให้ URL ฝังชี้ออกนอกโดเมนที่ตั้งใจ
 *
 * ไม่รองรับลิงก์ย่อที่ต้อง resolve ก่อน (เช่น vm.tiktok.com, youtu.be/... ที่เป็น redirect chain
 * ของบางเคส) เพราะการยิง request ตามลิงก์ที่ผู้ใช้กำหนดจากฝั่ง server คือ SSRF — ให้ผู้ใช้
 * เอา URL เต็มมาวางแทน ปลอดภัยกว่าและอธิบายให้เข้าใจได้
 */

export type VideoProvider = "YOUTUBE" | "TIKTOK" | "INSTAGRAM" | "FACEBOOK";

export type ParsedVideo = {
  provider: VideoProvider;
  /** รหัสคลิปที่สกัดได้ — ใช้ประกอบ URL ฝังเอง ไม่เก็บ URL ดิบของผู้ใช้ */
  videoId: string;
};

/** ชุดตัวอักษรที่ยอมให้เป็นรหัสคลิป — กันอักขระที่ทำให้หลุดออกนอก path ที่ตั้งใจ */
const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const TT_ID = /^[0-9]{5,30}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,30}$/;
const FB_ID = /^[0-9]{5,30}$/;

function hostOf(u: URL): string {
  return u.hostname.replace(/^www\./, "").toLowerCase();
}

/**
 * คืน null เมื่อไม่ใช่ลิงก์ของสามแพลตฟอร์มที่รองรับ หรือรูปแบบไม่ตรง
 * ห้าม throw — ผู้เรียกเอาไปแสดง error ให้ผู้ใช้เอง
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  // รับเฉพาะ https — http เปิดช่องให้ถูกดักแก้ระหว่างทาง
  if (u.protocol !== "https:") return null;

  const host = hostOf(u);
  const seg = u.pathname.split("/").filter(Boolean);

  // ── YouTube: /shorts/{id} · /watch?v={id} · youtu.be/{id} ──
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (seg[0] === "shorts" && seg[1] && YT_ID.test(seg[1])) {
      return { provider: "YOUTUBE", videoId: seg[1] };
    }
    if (seg[0] === "watch") {
      const v = u.searchParams.get("v");
      if (v && YT_ID.test(v)) return { provider: "YOUTUBE", videoId: v };
    }
    return null;
  }
  if (host === "youtu.be") {
    return seg[0] && YT_ID.test(seg[0]) ? { provider: "YOUTUBE", videoId: seg[0] } : null;
  }

  // ── TikTok: /@user/video/{id} ──
  // ไม่รับ vm.tiktok.com / vt.tiktok.com เพราะเป็นลิงก์ย่อที่ต้องยิง request ตามไปถึงจะรู้
  // ปลายทาง ซึ่งเป็น SSRF ถ้าทำจากฝั่ง server
  if (host === "tiktok.com") {
    const i = seg.indexOf("video");
    const id = i >= 0 ? seg[i + 1] : undefined;
    return id && TT_ID.test(id) ? { provider: "TIKTOK", videoId: id } : null;
  }

  // ── Facebook: /reel/{id} · /{page}/videos/{id} · /watch?v={id} ──
  // ไม่รับ /share/r/{code} เพราะเป็นลิงก์ย่อที่ต้องยิงตามไปถึงจะรู้ปลายทาง (SSRF เหมือน vm.tiktok.com)
  // ในทางปฏิบัติร้านไม่ต้องวางลิงก์อยู่แล้ว — ระบบดึงรายการ reels ของเพจมาให้เลือกโดยตรง
  if (host === "facebook.com" || host === "m.facebook.com" || host === "fb.watch") {
    if (seg[0] === "reel" && seg[1] && FB_ID.test(seg[1])) {
      return { provider: "FACEBOOK", videoId: seg[1] };
    }
    const vi = seg.indexOf("videos");
    if (vi >= 0 && seg[vi + 1] && FB_ID.test(seg[vi + 1])) {
      return { provider: "FACEBOOK", videoId: seg[vi + 1] };
    }
    if (seg[0] === "watch") {
      const vid = u.searchParams.get("v");
      if (vid && FB_ID.test(vid)) return { provider: "FACEBOOK", videoId: vid };
    }
    return null;
  }

  // ── Instagram: /reel/{code} · /reels/{code} · /p/{code} ──
  if (host === "instagram.com") {
    const kind = seg[0];
    const code = seg[1];
    if ((kind === "reel" || kind === "reels" || kind === "p") && code && IG_CODE.test(code)) {
      return { provider: "INSTAGRAM", videoId: code };
    }
    return null;
  }

  return null;
}

/**
 * ประกอบ URL สำหรับ iframe จากรหัสที่ผ่านการตรวจแล้ว
 *
 * รับ ParsedVideo (ไม่ใช่ string ดิบ) โดยตั้งใจ — บังคับให้ทุกจุดที่จะฝังต้องผ่าน parse ก่อน
 * ไม่มีทางเรียกด้วยค่าที่ผู้ใช้พิมพ์มาตรง ๆ
 */
export function buildEmbedUrl(v: ParsedVideo): string {
  switch (v.provider) {
    case "YOUTUBE":
      // youtube-nocookie: ไม่ตั้ง cookie ติดตามจนกว่าผู้ชมจะกดเล่นจริง
      return `https://www.youtube-nocookie.com/embed/${v.videoId}`;
    case "TIKTOK":
      return `https://www.tiktok.com/embed/v2/${v.videoId}`;
    case "INSTAGRAM":
      return `https://www.instagram.com/reel/${v.videoId}/embed`;
    case "FACEBOOK":
      // ปลั๊กอินวิดีโอของ Facebook รับ href เป็น URL หน้าคลิป — ประกอบจาก id ที่ตรวจแล้วเท่านั้น
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        `https://www.facebook.com/reel/${v.videoId}`,
      )}&show_text=false`;
  }
}

/** URL หน้าคลิปจริง — ใช้เป็นทางออกให้ผู้ชมกดไปดูบนแพลตฟอร์มเมื่อ iframe โหลดไม่ได้ */
export function buildWatchUrl(v: ParsedVideo): string {
  switch (v.provider) {
    case "YOUTUBE":
      return `https://www.youtube.com/shorts/${v.videoId}`;
    case "TIKTOK":
      return `https://www.tiktok.com/video/${v.videoId}`;
    case "INSTAGRAM":
      return `https://www.instagram.com/reel/${v.videoId}/`;
    case "FACEBOOK":
      return `https://www.facebook.com/reel/${v.videoId}`;
  }
}

export const VIDEO_PROVIDER_LABEL: Record<VideoProvider, string> = {
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
};
