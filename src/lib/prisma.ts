import { PrismaClient } from "@prisma/client";

// ต้อง derive ชนิดจากตัว factory ไม่ใช่เขียน `PrismaClient` เปล่า ๆ — client ที่มี `omit`
// เป็นคนละชนิดกับ client ธรรมดาในสายตา TS (generic ของ omit ติดไปกับชนิด)
const createPrismaClient = () =>
  new PrismaClient({
    omit: {
      chatMessage: {
        rawMessage: true,
      },
    },
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

/**
 * global omit — คอลัมน์ที่ "ต้องไม่ติดมากับ query ปกติ"
 *
 * ChatMessage.rawMessage เก็บ payload ดิบจาก Facebook/IG ไว้สืบย้อนหลัง (2026-08-03, user สั่ง)
 * แต่ห้ามให้มันไหลออกไปกับทุก request — `getMessages()` (chat.service) ใช้ `findMany` แบบไม่มี
 * `select` เลย จึงคืน "ทุกคอลัมน์" ของตารางที่ใหญ่ที่สุดในระบบ ถ้าไม่กันไว้ payload ดิบจะติดไป
 * ทุกครั้งที่มีคนเปิดห้องแชท (ทั้งช้าและเปลือง bandwidth ฟรี ๆ)
 *
 * กันที่นี่จุดเดียว แทนการไล่ใส่ `select` ทีละ call site — call site ใหม่ที่เขียนทีหลังจะปลอดภัย
 * โดยอัตโนมัติ ไม่ต้องพึ่งความจำของคนเขียน
 *
 * ต้องการอ่านจริง (ตอน investigate) ให้ขอตรง ๆ ต่อ query:
 *   prisma.chatMessage.findUnique({ where: { id }, omit: { rawMessage: false } })
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
