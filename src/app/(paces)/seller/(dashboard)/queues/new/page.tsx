/**
 * redirect ถาวร — หน้าสร้างประเภทงานย้ายไป `/settings/job-types/new` แล้ว (2026-08-12)
 *
 * 🛑 ต้องเป็นไฟล์ page ไม่ใช่ `redirects` ใน next.config: คอนโซลผู้ขายวิ่งบน subdomain
 * และ `src/proxy.ts` rewrite `seller.deepthailand.app/queues/new` → `/seller/queues/new`
 * ก่อน — กติกาใน next.config จะ match กับพาธ *ก่อน* rewrite ซึ่งไม่ใช่พาธที่ผู้ใช้เห็น
 * ส่วน redirect ในชั้น app router ทำงานหลัง rewrite จึงถูกเสมอ
 *
 * เก็บไว้เพราะร้านอาจ bookmark ไว้ และลิงก์เก่าใน E2E/เอกสารยังชี้มาที่นี่
 */
import { redirect } from 'next/navigation'

export default function LegacyNewQueuePage() {
  redirect('/settings/job-types/new')
}
