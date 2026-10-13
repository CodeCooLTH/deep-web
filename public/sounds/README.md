# public/sounds/

เสียงแจ้งเตือนข้อความแชทใหม่ — วางไฟล์ `sound-new-chat-msg.m4a` ที่นี่ (feature 00018,
user สั่ง 2026-07-24). อ้างถึงจาก src/lib/chat-sound.ts (SOUND_SRC = '/sounds/sound-new-chat-msg.m4a')
ถ้าไฟล์ไม่มี play() จะ reject เงียบ ๆ ไม่ throw (แค่ไม่มีเสียง)

2026-10-13: ลูกค้าแจ้งเสียงแตก — ไฟล์เดิม (ElevenLabs 16 kHz/16 kbps, peak -0.2 dBFS เกือบชนเพดาน) ถูกแทนด้วยตัวที่
แปลงใหม่: 44.1 kHz/128 kbps · ตัดทุ้ม <150 Hz · ลด noise · เติมย่านแหลมเบา ๆ · -13.5 LUFS · peak -1.4 dBFS (ความดังเท่าเดิม)
ชื่อไฟล์คงเดิม (โค้ดไม่ต้องแก้) · แอปผู้ขายแปลงจากไฟล์นี้ด้วย deep-seller-app/scripts/make-chat-sound.sh (ต้อง build ใหม่)
