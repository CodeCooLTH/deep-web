import 'server-only'
import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * getCachedSession — `getServerSession(authOptions)` ที่ dedupe ภายในการ render รอบเดียว
 *
 * ## ทำไมต้องมี
 * `session` callback ใน `lib/auth.ts` **ยิง DB ได้ถึง 5 รอบต่อการเรียกหนึ่งครั้ง**:
 *   1. `user.findUnique` + relation `shops` (Prisma แยก query ให้ relation = 2 รอบ)
 *   2. `shopMember.findFirst` — เมื่อ active เป็นร้าน BUSINESS
 *   3. `shopMember.count` — **ทุกครั้ง**
 *   4. `shop.findUnique` — เมื่อ active เป็นร้าน BUSINESS
 *
 * และหน้าเธรดแชทหนึ่งหน้าเรียก `getServerSession` **สองครั้ง** — ที่ `(chat)/layout.tsx`
 * และที่ `inbox/[conversationId]/page.tsx` ⇒ งานชุดนั้นทำซ้ำสองเที่ยวต่อการเปิดหน้าเดียว
 *
 * วัดบน prod 2026-08-16 ด้วย `?debug=timing`: เฟส `auth` ของหน้าเธรด = **148–195ms**
 * เป็นเฟสที่ใหญ่ที่สุดที่เหลือ และมันโผล่ใน **ทุกหน้า/ทุก API ทั้งระบบ** ไม่ใช่แค่หน้านี้
 *
 * ## ขอบเขตที่ใช้ได้จริง (อย่าเข้าใจผิด)
 * 🛑 `cache()` ของ React dedupe ได้เฉพาะ **ภายใน render pass เดียวกันของ Server Component**
 * — layout กับ page ของคำขอเดียวกันอยู่ใน pass เดียวกัน จึงได้ผล
 * **แต่ Route Handler (`src/app/api/**`) ไม่ได้อยู่ใน render pass** เรียกจากที่นั่นจะไม่ dedupe
 * (ไม่พังนะ — แค่ไม่ได้อะไรเพิ่ม) ⇒ อย่าไปไล่แทนที่ 253 ไฟล์ทั้งหมดโดยคิดว่าได้ผลเท่ากันทุกที่
 *
 * 🛑 `import 'server-only'` บังคับไว้ — ไฟล์นี้ลาก `authOptions` ซึ่งมี secret/adapter ติดมาด้วย
 * เผลอ import จาก client component เมื่อไหร่ต้องพังตอน build ไม่ใช่หลุดไปถึง bundle
 *
 * ## กติกา
 * ผลลัพธ์เหมือน `getServerSession(authOptions)` ทุกประการ — เป็น pure memoization ไม่เปลี่ยน
 * พฤติกรรม/สิทธิ์/รูปร่างข้อมูลใด ๆ ทั้งสิ้น การ re-verify membership ทุกคำขอ (เจตนาเดิมของ
 * session callback ที่คอมเมนต์ไว้ว่า "ไม่ trust JWT เพียงอย่างเดียว") **ยังทำงานเหมือนเดิม**
 * เพราะ cache มีอายุแค่คำขอเดียว ไม่ได้ข้ามคำขอ
 */
export const getCachedSession = cache(() => getServerSession(authOptions))
