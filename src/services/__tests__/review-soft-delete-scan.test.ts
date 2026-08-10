/**
 * [blocker] ทุก query ที่อ่านรีวิวต้องกรอง `deletedAt` — feature 00041 (SRS §8)
 *
 * soft delete มีข้อเสียที่รู้กันดี: มันย้ายภาระไปที่ "ทุกคนต้องจำกรอง" ซึ่งคนลืมเสมอ
 * ในรีโปนี้มีจุดที่อ่าน `prisma.review` **22 จุดกระจาย 12 ไฟล์** — ลืมจุดเดียวผลไม่ใช่แค่
 * รีวิวโผล่กลับมาบนหน้าจอ แต่รีวิวที่ผู้ซื้อลบไปแล้วจะยังดัน **Trust Score** และ
 * **เกณฑ์ปลดล็อกเหรียญตรา** ต่อไปโดยไม่มีอะไรฟ้องเลย
 *
 * เทสนี้สแกนซอร์สจริง ไม่ hardcode รายชื่อไฟล์ — จุดใหม่ที่เพิ่มทีหลังถูกจับทันที
 * (แพตเทิร์นเดียวกับ upload-no-multipart-callers.test.ts)
 *
 * 🛑 แดง = ห้าม merge
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** เมธอดที่ "อ่าน" รีวิวออกมาแสดง/นับ/คำนวณ — ทุกตัวต้องกรอง soft-deleted ทิ้ง */
const READ_METHODS = ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy']

/**
 * จุดที่ต้อง **ไม่** กรองโดยตั้งใจ — ต้องมีเหตุผลเฉพาะตัวเสมอ
 *
 * 🛑 ห้ามเพิ่มเข้ารายการนี้เพียงเพราะเทสแดงแล้วอยากให้ผ่าน
 */
const INTENTIONALLY_UNFILTERED: Array<{ file: string; why: string }> = [
  {
    file: 'services/review.service.ts',
    why:
      'createReview() ใช้ order.review แบบ raw โดยตั้งใจ — แถว tombstone ต้องทำให้ guard throw ' +
      'ไม่งั้นลบแล้วสร้างใหม่ได้ → createdAt รีเซ็ต → หน้าต่างแก้ไข 24 ชม. ยืดได้ไม่จำกัด',
  },
  {
    file: 'services/user.service.ts',
    why:
      'linkBuyerHistory() เป็น updateMany ที่ "ผูกความเป็นเจ้าของ" ไม่ใช่การอ่านมาแสดง/นับ — ' +
      'รีวิวที่ถูกลบแล้วผูกกับบัญชีที่เพิ่งสมัครก็ไม่กระทบอะไร เพราะไม่ถูกอ่านที่ไหนอยู่แล้ว',
  },
]

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

/** ตัดก้อน `{...}` ที่เป็นอาร์กิวเมนต์ของ call ออกมา (นับวงเล็บปีกกาให้สมดุล) */
function argBlock(src: string, from: number): string {
  const open = src.indexOf('{', from)
  if (open === -1) return ''
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return src.slice(open)
}

describe('soft delete ของรีวิว', () => {
  it('ทุกจุดที่อ่าน prisma.review ต้องมี deletedAt ในเงื่อนไข', () => {
    const offenders: string[] = []
    const allowedFiles = new Set(INTENTIONALLY_UNFILTERED.map((x) => x.file))

    for (const file of walk(SRC)) {
      const rel = relative(SRC, file).split('\\').join('/')
      if (rel.includes('__tests__') || rel.endsWith('.test.ts')) continue
      if (allowedFiles.has(rel)) continue

      const src = readFileSync(file, 'utf8')
      for (const method of READ_METHODS) {
        const needle = `prisma.review.${method}(`
        let idx = src.indexOf(needle)
        while (idx !== -1) {
          const block = argBlock(src, idx)
          if (!block.includes('deletedAt')) {
            const line = src.slice(0, idx).split('\n').length
            offenders.push(`${rel}:${line}  prisma.review.${method}()`)
          }
          idx = src.indexOf(needle, idx + needle.length)
        }
      }
    }

    expect(
      offenders,
      `อ่านรีวิวโดยไม่กรอง deletedAt — รีวิวที่ลบแล้วจะโผล่กลับ และไปดัน Trust Score/เหรียญ:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('จุดที่ยกเว้นยังคงไม่กรองจริง (กันคนมา "sync" ผิดทิศ)', () => {
    // ถ้าใครไปเติม deletedAt: null ใน createReview guard ช่องโหว่จะกลับมาทันที
    // — เทสนี้จับทิศตรงข้ามกับเทสข้างบนโดยตั้งใจ
    const reviewSvc = readFileSync(join(SRC, 'services/review.service.ts'), 'utf8')
    const createBlock = reviewSvc
      .slice(
        reviewSvc.indexOf('export async function createReview'),
        reviewSvc.indexOf('export async function getReviewsByBuyer'),
      )
      // 🛑 ตัดคอมเมนต์ออกก่อนตรวจ — บล็อกนี้มีคอมเมนต์ที่ "อธิบายกฎ" ซึ่งพูดถึง deletedAt อยู่
      // ถ้าไม่ตัด เทสจะแดงเพราะคำอธิบายของตัวเอง (บทเรียนเดียวกับ grep gate ของ HR9 ที่แดง
      // ตลอดกาลเพราะไฟล์ที่ทำถูกกฎมักอ้างชื่อกฎไว้ในคอมเมนต์)
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')

    expect(createBlock).toContain('include: { review: true, shop: true }')
    expect(createBlock).not.toContain('deletedAt')
  })
})
