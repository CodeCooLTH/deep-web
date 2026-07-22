// ยิง webhook ปลอมที่เซ็นลายเซ็นจริง — ทดสอบ handler ได้โดยไม่ต้องพึ่ง Meta และไม่ต้องเปิด ngrok
// (feature 00018 Facebook Chat Integration)
//
// รัน (โหลด env แบบเดียวกับ script อื่นของโปรเจกต์ — ดู package.json seed:supabase):
//   npx dotenv -e .env.local -- npx tsx scripts/fake-fb-webhook.ts --page PAGE_ID --psid PSID --text "สนใจครับ"
//   npx dotenv -e .env.local -- npx tsx scripts/fake-fb-webhook.ts --page PAGE_ID --psid PSID --text "ตอบแล้ว" --echo
//   npx dotenv -e .env.local -- npx tsx scripts/fake-fb-webhook.ts --page IG_ID --psid IGSID --text "hi" --object instagram
//
// ตรึง mid เพื่อทดสอบ idempotency (ยิงซ้ำ 2 ครั้งต้องได้ ChatMessage แถวเดียว):
//   ... --mid mid.fixed.1
//
// ต้องมี FB_CHAT_APP_SECRET ใน env และ dev server รันอยู่ (ค่า default ชี้ port 4000)

import { createHmac } from "crypto";

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`ต้องระบุ --${name}`);
  }
  return value;
}

const pageId = arg("page");
const psid = arg("psid");
const text = arg("text", "ข้อความทดสอบ");
const object = arg("object", "page");
const mid = arg("mid", `mid.fake.${Date.now()}`);
const isEcho = process.argv.includes("--echo");
const url = arg("url", "http://seller.deepth.local:4000/api/channels/facebook/webhook");

const body = JSON.stringify({
  object,
  entry: [
    {
      id: pageId,
      time: Date.now(),
      messaging: [
        {
          // echo = ข้อความฝั่งเพจ → ผู้ติดต่ออยู่ที่ recipient ไม่ใช่ sender
          // (สลับสองค่านี้ให้ตรงกับที่ Meta ส่งจริง ไม่งั้น handler จะสร้าง contact ปลอมเป็น Page ID)
          sender: { id: isEcho ? pageId : psid },
          recipient: { id: isEcho ? psid : pageId },
          timestamp: Date.now(),
          message: {
            mid,
            text,
            ...(isEcho ? { is_echo: true } : {}),
          },
        },
      ],
    },
  ],
});

// ห่อด้วย main() แทน top-level await — tsx ในโปรเจกต์นี้คอมไพล์เป็น cjs ซึ่งยังไม่รองรับ
// top-level await; การเช็ค env ก็อยู่ในนี้ด้วยเพื่อให้ error ออกทาง catch เป็นข้อความอ่านรู้เรื่อง
// แทน stack trace ดิบ
async function main() {
  const secret = process.env.FB_CHAT_APP_SECRET;
  if (!secret) {
    throw new Error(
      "ไม่พบ FB_CHAT_APP_SECRET — รันผ่าน `npx dotenv -e .env.local -- npx tsx scripts/fake-fb-webhook.ts ...`",
    );
  }

  // ลายเซ็นคำนวณจาก raw body byte ต่อ byte — ต้องเซ็นสตริงตัวเดียวกับที่ส่งออกไปเป๊ะ ๆ
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body,
  });

  console.log(`HTTP ${res.status}`, await res.text());
  console.log(`mid ที่ใช้: ${mid}${isEcho ? " (echo)" : ""}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
