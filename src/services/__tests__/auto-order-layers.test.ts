import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { AUTO_ORDER_RESULT_TYPE } from '@/lib/auto-order-message-type'

/**
 * 00061 — **3 ชั้นที่ห้ามยุบรวมกัน** (PRD §6.3 · TFR-020/021/022)
 *
 *   ชั้นเขียน  — การ์ดไม่เดินผ่าน `sendMessage()` (ครอบใน auto-order-architecture.test.ts)
 *   ชั้นอ่าน   — endpoint ที่ client เรียกต้องกรองตามบทบาทผู้เรียก
 *   ชั้นตัวนับ — 3 จุดที่ query `ChatMessage` ตรง ๆ ไม่ได้อยู่บนเส้นทางเขียนเลย
 *
 * 🛑 ชั้นตัวนับเป็น **ด่านอิสระ ไม่ใช่ผลพลอยได้จากชั้นเขียน** — BRD เคยเขียนผิดว่าเป็น
 * "ผลจาก AC-58" แล้วแก้ทีหลัง. การไม่เรียก `sendMessage()` ไม่ช่วยอะไรกับ query ที่อ่าน
 * ตารางตรง ๆ เลยแม้แต่นิดเดียว
 */

const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const read = (f: string) => stripComments(readFileSync(f, 'utf8'))

describe('ชั้นอ่าน: getMessages กรองตามบทบาทผู้เรียก (TFR-022 · AC-63/64)', () => {
  const CODE = read('src/services/chat.service.ts')

  it('[blocker] บทบาทต้อง derive จากแถวที่ assertParticipant ยืนยันมา ไม่ใช่รับเป็นพารามิเตอร์', () => {
    // 🛑 พารามิเตอร์คือสิ่งที่ผู้เรียกส่งผิดได้ และ endpoint ฝั่งผู้ซื้อกับฝั่งร้านใช้ฟังก์ชันนี้
    // ตัวเดียวกัน — ที่ไหนสักแห่งส่ง 'SHOP' ผิด = ข้อมูลภายในหลุดไปหาลูกค้าโดยไม่มีอะไรฟ้อง
    const at = CODE.indexOf('export async function getMessages(')
    expect(at).toBeGreaterThan(-1)
    const body = CODE.slice(at, at + 2500)
    expect(body).toContain('const conversation = await assertParticipant(')
    expect(body).toMatch(/viewerIsBuyer\s*=\s*conversation\.buyerUserId\s*===\s*actorUserId/)
    expect(body).toContain('AUTO_ORDER_RESULT_TYPE')
    // ตัวกรองต้องถูก "ใช้" จริงใน where ไม่ใช่ประกาศทิ้งไว้
    expect(body).toContain('...internalMessageFilter,')
  })

  it('[blocker] ตัวกรองต้องผูกกับ viewerIsBuyer — ไม่ใช่กรองทิ้งทุกคนหรือไม่กรองใครเลย', () => {
    const at = CODE.indexOf('const internalMessageFilter')
    expect(at).toBeGreaterThan(-1)
    const line = CODE.slice(at, CODE.indexOf('\n', at))
    expect(line).toContain('viewerIsBuyer ?')
    // ฝั่งร้านต้องได้ `{}` (เห็นครบ) — ถ้ากลับด้าน ผู้ขายจะไม่เห็นการ์ดของตัวเองเลย
    expect(line).toMatch(/:\s*\{\}/)
  })
})

describe('ชั้นตัวนับ: 3 จุดที่ query ChatMessage ตรง (TFR-022 · AC-60)', () => {
  const COUNTER_SITES = [
    'src/services/chat-metrics.service.ts',
    'src/services/auto-reply.service.ts',
    'src/app/api/chat/conversations/[id]/ai-suggest/route.ts',
  ]

  it.each(COUNTER_SITES)('[blocker] %s ต้องกรองการ์ดผลลัพธ์ออก', (file) => {
    const code = read(file)
    expect(code).toContain('AUTO_ORDER_RESULT_TYPE')
    expect(code).toMatch(/type:\s*\{\s*not:\s*AUTO_ORDER_RESULT_TYPE\s*\}/)
    // ต้อง import ค่าคงที่ ไม่ใช่พิมพ์สตริงเอง (typo-drift ที่ไม่มี gate ไหนจับได้)
    expect(code).not.toContain(`'${AUTO_ORDER_RESULT_TYPE}'`)
    expect(code).not.toContain(`"${AUTO_ORDER_RESULT_TYPE}"`)
  })
})

describe('จุดเข้า 2 จุด เรียกฟังก์ชันเดียวกันด้วย input รูปเดียวกัน (TFR-005)', () => {
  it('[blocker] จุดเข้าที่ 1 อยู่ในสาขา SHOP ของ sendMessage และไม่ await', () => {
    const CODE = read('src/services/chat.service.ts')
    const at = CODE.indexOf("if (params.senderRole === 'SHOP')")
    expect(at).toBeGreaterThan(-1)
    const block = CODE.slice(at, at + 700)
    expect(block).toContain('detectAutoOrderTrigger(sent.id)')
    // 🛑 ห้าม await — ผู้ขายต้องไม่รอตัวแกะ (2 query + createOrder) ก่อนเห็นข้อความตัวเองขึ้นจอ
    expect(block).not.toMatch(/await\s+detectAutoOrderTrigger/)
    expect(block).toContain('runAfterResponse(')
  })

  it('[blocker] จุดเข้าที่ 2 คัด senderRole==="SHOP" (ตรงข้ามกับ push/auto-reply ในไฟล์เดียวกัน)', () => {
    const CODE = read('src/app/api/channels/facebook/webhook/route.ts')
    // 🛑 `lastIndexOf` ไม่ใช่ `indexOf` — ตัวแรกคือบรรทัด `import` ซึ่งไม่มีเงื่อนไขอะไรอยู่รอบ ๆ
    // (ด่านที่ไปเจอบรรทัด import แล้วสรุปว่าไม่ผ่าน = false negative ที่หลอกให้ไปแก้โค้ดที่ถูกอยู่แล้ว)
    const at = CODE.lastIndexOf('detectAutoOrderTrigger')
    expect(at).toBeGreaterThan(-1)
    const block = CODE.slice(Math.max(0, at - 500), at + 300)
    expect(block).toContain("ingested.senderRole === 'SHOP'")
    expect(block).toContain("ingested.status === 'STORED'")
    expect(block).toContain('!standby')
    // ต้องอยู่ใน after() — Meta วัด latency ของ webhook แล้ว retry ทั้ง batch ถ้าช้า
    expect(block).toMatch(/after\(\(\)\s*=>/)
  })

  it('[blocker] ทั้ง 2 จุดส่งแค่ chatMessageId — ห้ามส่ง payload ดิบ', () => {
    // ถ้าจุดหนึ่งส่ง body มาเอง อีกจุดโหลดจาก DB ผลการแกะจะต่างกันได้โดยที่ tsc เขียว
    // (ทั้งสองฝั่งส่ง type ถูกทั้งคู่ ต่างกันแค่ *เนื้อใน*)
    for (const f of [
      'src/services/chat.service.ts',
      'src/app/api/channels/facebook/webhook/route.ts',
    ]) {
      const code = read(f)
      const calls = code.match(/detectAutoOrderTrigger\([^)]*\)/g) ?? []
      expect(calls.length).toBeGreaterThan(0)
      for (const c of calls) {
        // อาร์กิวเมนต์เดียว ไม่มีคอมมา
        expect(c, `${f}: ${c}`).not.toContain(',')
      }
    }
  })
})
