# public/sounds/

เสียงแจ้งเตือนข้อความแชทใหม่ — วางไฟล์ `sound-new-chat-msg.m4a` ที่นี่ (feature 00018,
user สั่ง 2026-07-24). อ้างถึงจาก src/lib/chat-sound.ts (SOUND_SRC = '/sounds/sound-new-chat-msg.m4a')
ถ้าไฟล์ไม่มี play() จะ reject เงียบ ๆ ไม่ throw (แค่ไม่มีเสียง)

2026-10-13: ลูกค้าแจ้งเสียงแตก — ไฟล์เดิม (ElevenLabs 16 kHz/16 kbps, peak -0.2 dBFS เกือบชนเพดาน) ถูกแทนด้วยตัวที่
แปลงใหม่: 44.1 kHz/128 kbps · ตัดทุ้ม <150 Hz · ลด noise · เติมย่านแหลมเบา ๆ · -13.5 LUFS · peak -1.4 dBFS (ความดังเท่าเดิม)
ชื่อไฟล์คงเดิม (โค้ดไม่ต้องแก้) · แอปผู้ขายแปลงจากไฟล์นี้ด้วย deep-seller-app/scripts/make-chat-sound.sh (ต้อง build ใหม่)

2026-10-14: ต้นฉบับ 16 kHz ทุกตัวที่ผ่านมาถูก **LINE บีบ** (ส่งไฟล์เป็นข้อความเสียง) — ElevenLabs ส่งออกได้ 44.1 kHz ปกติ
⇒ เปลี่ยนเป็นเสียงที่สร้างใหม่ (ElevenLabs · Sandra · "ตอบแชทจ้า" · ~1.5 วิ) โหลดเป็น MP3 44.1 kHz/128 kbps ส่งผ่าน Google Drive
user เลือกแบบ B: ลดความดังให้เท่าตัวก่อนหน้าอย่างเดียว ไม่ตัด/เติม/แต่งเสียง ⇒ m4a AAC 44.1 kHz/192 kbps · -13.5 LUFS · peak -1.8 dBFS
🛑 ส่งไฟล์เสียงต้นฉบับผ่าน Drive/อีเมล/AirDrop เท่านั้น ห้ามผ่าน LINE (โดนบีบเหลือ 16 kHz)
