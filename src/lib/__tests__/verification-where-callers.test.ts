import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * [blocker] ห้ามเขียน `where` ของ VerificationRecord เองที่ call site
 *
 * ทำไมต้องเป็นเทสที่สแกนซอร์ส ไม่ใช่เทสพฤติกรรม: คลาสนี้กัดสองทิศ **ในวันเดียวกัน** (2026-08-11)
 * และทั้งสองครั้ง where ที่เขียนไว้ "ถูก" ตามชนิดทุกตัวอักษร ไม่มี tsc/build/detector ตัวไหนฟ้อง
 *   - นับน้อยไป: business กรอง `{ shopId }` ล้วน ⇒ ร้าน BUSINESS ทุกร้านขึ้น Level 0 ตลอดกาล
 *                (L1 เขียน `shopId=null` เสมอทุกทางเข้า) + เสียคะแนน trust 10 + เหรียญเป็นไปไม่ได้
 *   - นับเกินไป: หน้า `/o/[token]`, `/u/[username]`, `getOrderSummaryForSignIn` กรอง `{ userId }`
 *                ลอย ๆ ⇒ เอกสารของร้าน **อื่น** ที่เจ้าของคนเดียวกันถืออยู่ไหลมานับเป็นของร้านนี้
 *
 * ทิศที่สองอันตรายกว่า เพราะมันอ้างความน่าเชื่อถือที่ยังไม่จริงบนหน้าที่ผู้ซื้อใช้ตัดสินใจโอนเงิน
 * และ **ยังไม่เคยระเบิดเพราะฐานยังไม่มีแถว L2/L3 เลยสักแถว** ไม่ใช่เพราะโค้ดถูก
 *
 * เทสนี้จึงบังคับว่า query ทุกตัวต้องผ่าน SSOT ใน `src/lib/verification-scope.ts` — ไม่ hardcode
 * รายชื่อไฟล์ที่ "ถูกแล้ว" ไว้ ไฟล์ใหม่ที่เขียน where เองจะโดนจับทันทีโดยไม่ต้องมีใครมาอัปเดตเทส
 */

const SRC = join(process.cwd(), 'src')

/** ไฟล์ที่ query VerificationRecord ด้วยเกณฑ์ที่ "ไม่ใช่ระดับยืนยันของ scope" — คนละคำถามกัน */
const ALLOWED: { file: string; why: string }[] = [
  {
    file: 'src/app/(paces)/admin/(dashboard)/verifications/page.tsx',
    why: 'คิวงานแอดมิน — กรองด้วย status ทั้งระบบ ไม่ได้ถามว่า "ร้านนี้ยืนยันถึงระดับไหน"',
  },
  {
    file: 'src/app/api/files/[...fileId]/route.ts',
    why: 'ด่านสิทธิ์เปิดไฟล์ KYC — ถามว่า "ไฟล์นี้อยู่ในเอกสารของใคร" ไม่ใช่ระดับของร้าน',
  },
  {
    file: 'src/services/verification.service.ts',
    why: 'ตัว SSOT เอง (resolveReadScope + ผู้เรียกภายใน)',
  },
  {
    file: 'src/services/app-shop.service.ts',
    why: 'batch verified ของการ์ดร้าน personal — ปักหมุด shopId:null ตรง ๆ อยู่แล้ว (00008 P5-1)',
  },
  {
    file: 'src/app/(paces)/admin/(dashboard)/verifications/[id]/page.tsx',
    why: 'หน้ารายละเอียดของแอดมิน — findUnique ด้วย record id ใบเดียว ไม่ได้ถามระดับของ scope ไหน',
  },
  {
    file: 'src/lib/auth.ts',
    why:
      'ด่านกันสร้างซ้ำตอน login (findFirst หา L1 PHONE_OTP ของ user นั้น) — เป็นคำถามฝั่ง *เขียน* ' +
      'ว่า "แถวนี้มีหรือยัง" ไม่ใช่ฝั่งอ่านว่า "ร้านนี้ยืนยันถึงระดับไหน" ' +
      'ห้ามเปลี่ยนตัวนี้ให้ผ่าน SSOT เด็ดขาด — scope ของ SSOT จะทำให้เจอแถวของร้าน BUSINESS ด้วย ' +
      'แล้วผู้ใช้ที่ยังไม่มี L1 ของตัวเองจะไม่ถูกสร้างให้ = บั๊กเดิมกลับมาทางประตูหลัง',
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('[blocker] ผู้เรียก VerificationRecord ต้องผ่าน SSOT ของ verification-scope', () => {
  const files = walk(SRC)

  it('ไม่มีไฟล์ไหนเขียน where ของ VerificationRecord เองนอกรายการที่อนุญาต', () => {
    const allowed = new Set(ALLOWED.map((a) => a.file))
    const offenders: string[] = []

    for (const full of files) {
      const rel = full.slice(process.cwd().length + 1)
      const body = readFileSync(full, 'utf8')
      if (!body.includes('prisma.verificationRecord.find')) continue
      if (allowed.has(rel)) continue
      // ผ่านได้ต่อเมื่อ where มาจาก SSOT
      const usesSsot =
        body.includes('approvedVerificationWhere(') || body.includes('verificationRecordWhere(')
      if (!usesSsot) offenders.push(rel)
    }

    expect(
      offenders,
      `ไฟล์เหล่านี้ query VerificationRecord โดยไม่ผ่าน src/lib/verification-scope.ts — ` +
        `ใช้ approvedVerificationWhere()/verificationRecordWhere() แทน หรือถ้าเป็นคำถามคนละชนิดจริง ` +
        `ให้เพิ่มลง ALLOWED พร้อมเหตุผล:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('รายการที่อนุญาตยังชี้ไฟล์ที่มีอยู่จริง (กัน allow-list เน่าเงียบ ๆ)', () => {
    const missing = ALLOWED.filter((a) => {
      try {
        readFileSync(join(process.cwd(), a.file), 'utf8')
        return false
      } catch {
        return true
      }
    }).map((a) => a.file)

    // ไฟล์ถูกลบ/ย้ายแล้วแต่ยังค้างใน allow-list = ช่องที่เปิดทิ้งไว้ให้ไฟล์ชื่อเดิมในอนาคตลอดผ่าน
    expect(missing).toEqual([])
  })
})
