/**
 * [blocker] กันการอัปโหลดไฟล์กลับไปวิ่งผ่าน body ของ Vercel function
 *
 * ที่มา 2026-08-10: ทุกหน้าที่อัปโหลดไฟล์ใช้แพตเทิร์น `new FormData()` → `fetch('/api/upload')`
 * ซึ่งตันที่เพดาน request body **4.5MB** ของ Vercel (413 FUNCTION_PAYLOAD_TOO_LARGE ตอบก่อน
 * ถึงโค้ดเรา ด้วย body ที่ไม่ใช่ JSON) → ผู้ใช้เห็นแค่ "อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"
 * ทั้งที่โค้ดเราเขียนเพดานไว้ 5/10/25MB ทุกจุด
 *
 * ทำไมต้องเป็นเทส: ไม่มี gate ใดของโปรเจกต์เห็นปัญหานี้ — `tsc`/build/detector/theme-guard
 * ผ่านหมดเพราะโค้ดถูกทุกบรรทัด (เพดานที่ประกาศไว้แค่ "ไม่มีผลจริง") และ **แพตเทิร์นเดิมยัง
 * ก็อปไปใช้ต่อได้ง่ายที่สุด** เพราะหน้าอื่นเขียนไว้อย่างนั้นมาตลอด (`sibling-surface-parity`
 * ทำให้คนถัดไปก็อปของที่พังมาโดยเจตนาดี)
 *
 * 🛑 แดง = มีหน้าใหม่กลับไปส่งไฟล์ผ่าน function ห้าม merge — ใช้ `uploadToStorage`/`uploadFileId`
 * จาก `@/lib/upload-client` แทน (ticket → PUT ตรงเข้า storage → commit)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC_ROOT = join(process.cwd(), 'src')

/** route ฝั่ง server ที่ยังรับ multipart ได้ตามเดิม (ไม่ใช่ client — ไม่ติดเพดาน body ฝั่งผู้ส่ง) */
const ALLOWED = new Set([
  'app/api/upload/route.ts', // legacy — ยังเปิดไว้ให้ของเก่าที่อาจยิงมา
  'app/api/chat/upload/route.ts', // legacy
  'app/api/app/upload/route.ts', // Buyer App (native) — เปลี่ยน contract ต้องปล่อยแอปใหม่
  'app/api/admin/badges/upload/route.ts',
  'app/api/orders/[token]/slip/route.ts',
  'lib/upload-client.ts', // คอมเมนต์อธิบายที่มา
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue
      walk(full, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
  return out
}

describe('ไม่มีฝั่ง client ที่อัปโหลดไฟล์ผ่าน body ของ function', () => {
  it('ไม่มีไฟล์ไหน fetch ไป /api/upload หรือ /api/chat/upload อีก', () => {
    const offenders: string[] = []
    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split('\\').join('/')
      if (ALLOWED.has(rel) || rel.includes('__tests__')) continue
      const src = readFileSync(file, 'utf8')
      // จับ "การเรียก" เท่านั้น (ตามด้วย , หรือ ) ) ไม่จับคอมเมนต์ที่พูดถึงชื่อ route —
      // บทเรียน HR9: gate ที่ match คำเปล่า ๆ จะแดงตลอดกาลเพราะไฟล์ที่ทำถูกกฎมักอ้างชื่อกฎในคอมเมนต์
      if (/fetch\(\s*['"`]\/api\/(chat\/)?upload['"`]\s*[,)]/.test(src)) offenders.push(rel)
      if (/fetch\(\s*[`]\/api\/chat\/upload\?/.test(src)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('client ที่แนบไฟล์ต้องเรียกผ่าน upload-client', () => {
    // ยืนยันว่าตัวแทนของแต่ละ surface ย้ายมาจริง (ถ้าไฟล์ถูกเปลี่ยนชื่อ เทสนี้จะแดงให้มาอัปเดต)
    const representatives = [
      'app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts',
      'app/(paces)/seller/(dashboard)/products/components/ProductImagesCardV2.tsx',
      'app/(paces)/seller/(dashboard)/verification/components/VerificationForm.tsx',
      'app/(paces)/seller/(dashboard)/wallet/components/TopUpRequestModal.tsx',
      'app/(marketing)/(buyer-app)/messages/[shopId]/ChatThread.tsx',
    ]
    for (const rel of representatives) {
      const src = readFileSync(join(SRC_ROOT, rel), 'utf8')
      expect(src, rel).toMatch(/from '@\/lib\/upload-client'/)
    }
  })
})
