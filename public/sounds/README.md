# public/sounds/

เสียงแจ้งเตือนข้อความแชทใหม่ — วางไฟล์ `sound-new-chat-msg.m4a` ที่นี่ (feature 00018,
user สั่ง 2026-07-24). อ้างถึงจาก src/lib/chat-sound.ts (SOUND_SRC = '/sounds/sound-new-chat-msg.m4a')
ถ้าไฟล์ไม่มี play() จะ reject เงียบ ๆ ไม่ throw (แค่ไม่มีเสียง)
