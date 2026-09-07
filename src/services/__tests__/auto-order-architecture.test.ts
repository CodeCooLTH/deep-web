import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 00061 — ด่านเชิงสถาปัตยกรรม (TFR-020 · TFR-021 · TFR-023 · AC-42/58/59)
 *
 * ทุกข้อในไฟล์นี้กัน **คลาสที่ `tsc`/build/eslint มองไม่เห็น** เพราะโค้ดที่ละเมิดถูกทุกบรรทัด
 * สิ่งที่ผิดคือ *ใครเรียกใคร* และ *ค่าคงที่ถูกเขียนจากที่ไหน*
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 🛑 ต้องตัด **ทั้ง** คอมเมนต์บรรทัดเดียวและคอมเมนต์บล็อก
 *
 * ไฟล์ที่ทำถูกกฎคือไฟล์ที่เขียนคำอธิบายกฎนั้นไว้บนหัวไฟล์ (`sendMessage` · `lastMessageAt` ·
 * `detectAutoOrderTrigger` ล้วนถูกอ้างถึงในคอมเมนต์เพื่ออธิบายว่า *ทำไมถึงไม่มี*) —
 * ตัดแค่ `//` ด่านจะแดงค้างจากคำเตือนของตัวเอง ซึ่งเป็นรอยเดิมที่ HR9 grep gate เคยเจอมาแล้ว
 * เมื่อ 2026-08-02 (ถูกบันทึกเป็น "หนี้" อยู่ 1 วันทั้งที่ไม่มีการละเมิดเลย)
 */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n')

const ALL_FILES = walk('src')

describe('วงจรป้อนกลับ: ตัวดักจับมีจุดเข้าปิด (TFR-021)', () => {
  /**
   * 🛑 ทำไมต้องปิดเซตผู้เรียก: ตัวดักจับเขียน `ChatMessage` (การ์ดผลลัพธ์) และการ์ดนั้นมี
   * `senderRole='SHOP'` เหมือนข้อความที่ร้านพิมพ์เอง — ถ้ามีใครเรียกตัวดักจับจากจุดที่สาม
   * ที่อยู่บนเส้นทางเขียนข้อความ ระบบจะดักจับผลลัพธ์ของตัวเองเป็นวงไม่รู้จบ
   *
   * ชั้นแรกคือ "ไม่มีสายให้ตัด" (ตัวเขียนการ์ดไม่ import ตัวดักจับเลย) — เทสนี้คือชั้นสอง
   */
  const ALLOWED_CALLERS = new Set([
    /** เธรด DEEP เท่านั้น (ลูกค้าเป็นบัญชี buyer ในแอปเรา) */
    'src/services/chat.service.ts',
    /**
     * 🛑 จุดเข้าที่ 1b (เพิ่ม 2026-09-07) — **Messenger / Instagram / LINE ทั้งหมด**
     *
     * `messages/route.ts` แตกสาขา `conv.channel !== 'DEEP'` แล้ว return ก่อนถึง `sendMessage()`
     * เสมอ ⇒ ถ้าไม่มีจุดนี้ ฟีเจอร์ทำงานได้ทางเดียวคือผู้ขายพิมพ์ **นอกแอปเรา** ซึ่งตรงข้ามกับ
     * เคสหลักที่ทั้งฟีเจอร์ถูกสร้างมาเพื่อรองรับ (`value-fate-decided-at-write-site.md`)
     */
    'src/services/chat-outbox.service.ts',
    'src/app/api/channels/facebook/webhook/route.ts',
    // ตัวมันเอง + cron ที่เก็บกวาด (watchdog เรียก writeProcessingFailedDraft ไม่ใช่ตัวดักจับ)
    'src/services/auto-order-detect.service.ts',
  ])

  it('[blocker] มีเฉพาะไฟล์ในเซตที่ import detectAutoOrderTrigger ได้', () => {
    const callers = ALL_FILES.filter((f) => {
      if (/\.(test|spec)\.tsx?$/.test(f)) return false
      const code = stripComments(readFileSync(f, 'utf8'))
      return /import\s*\{[^}]*\bdetectAutoOrderTrigger\b/.test(code)
    })
    const unexpected = callers.filter((f) => !ALLOWED_CALLERS.has(f))
    expect(unexpected, `ไฟล์นอกเซตที่เรียกตัวดักจับ:\n${unexpected.join('\n')}`).toEqual([])
  })

  it('[blocker] ตัวเขียนการ์ดต้องไม่ import ตัวดักจับ (ไม่มีสายให้ตัด)', () => {
    const code = stripComments(
      readFileSync('src/services/auto-order-internal-message.service.ts', 'utf8'),
    )
    expect(code).not.toMatch(/detectAutoOrderTrigger/)
  })
})

describe('ชั้นเขียน: การ์ดภายในมีเส้นทางของตัวเอง (TFR-020 · AC-58/59)', () => {
  const SRC = readFileSync('src/services/auto-order-internal-message.service.ts', 'utf8')
  const CODE = stripComments(SRC)

  it('[blocker] ไม่ import sendMessage / sendOutboundMessage', () => {
    // ผลพลอยได้ที่ได้ฟรีจากข้อนี้: `pauseForHumanTakeover` (อยู่ *ข้างใน* สองฟังก์ชันนั้น)
    // ไม่มีทางถูกเรียก ⇒ บอทอัตโนมัติของห้องไม่ถูกสั่งหยุดเพราะการ์ดของเรา
    expect(CODE).not.toMatch(/import\s*\{[^}]*\b(sendMessage|sendOutboundMessage)\b/)
    expect(CODE).not.toMatch(/\bsendMessage\s*\(/)
    expect(CODE).not.toMatch(/\bsendOutboundMessage\s*\(/)
  })

  it('[blocker] ไม่แตะ Conversation เลย (AC-61 — ไม่ดันห้องขึ้นบนสุดของ inbox)', () => {
    expect(CODE).not.toMatch(/conversation\.update/)
    expect(CODE).not.toMatch(/lastMessageAt/)
    expect(CODE).not.toMatch(/lastSenderRole/)
  })

  it('[blocker] ค่าคงที่ type มาจากไฟล์เดียว ไม่พิมพ์สตริงซ้ำ', () => {
    expect(CODE).not.toMatch(/['"]AUTO_ORDER_RESULT['"]/)
    expect(CODE).toContain('AUTO_ORDER_RESULT_TYPE')
  })
})

describe('PROCESSING_FAILED เดี่ยวเสมอ — บังคับด้วยโครงสร้าง ไม่ใช่ if (AC-42)', () => {
  it('[blocker] deriveDraftReasons ไม่มีทางผลิต PROCESSING_FAILED เอง', () => {
    const code = stripComments(readFileSync('src/lib/auto-order-reasons.ts', 'utf8'))
    // ปรากฏได้เฉพาะใน type union / ลำดับแสดงผล — ห้ามอยู่ใน branch ที่ push
    expect(code).not.toMatch(/push\(\s*['"]PROCESSING_FAILED['"]/)
    expect(code).not.toMatch(/reasons\.push\([^)]*PROCESSING_FAILED/)
  })

  it('[blocker] writeProcessingFailedDraft ไม่มีช่องรับ reasons จากใครเลย', () => {
    const code = stripComments(readFileSync('src/services/auto-order-detect.service.ts', 'utf8'))
    const at = code.indexOf('export async function writeProcessingFailedDraft(')
    expect(at).toBeGreaterThan(-1)
    const signature = code.slice(at, code.indexOf(')', at) + 1)
    expect(signature).not.toContain('reasons')
    // ค่าที่เขียนต้องเป็นอาร์เรย์ค่าคงที่ตัวเดียว ไม่ใช่ตัวแปรที่มาจากที่อื่น
    expect(code).toContain("draftReasons: ['PROCESSING_FAILED']")
  })
})

describe('ตัวนับร่างมี SSOT เดียว (TFR-023 · AC-67)', () => {
  const ALLOWED_DRAFTED_QUERY = new Set([
    'src/services/auto-order-detect.service.ts',
    'src/lib/order-visibility.ts',
    // reaper กวาดร่างหมดอายุข้ามทุกร้าน — เป็น `updateMany` ที่เปลี่ยนสถานะ ไม่ใช่ตัวนับ
    // ที่จะไปโผล่บนหน้าจอ ⇒ ไม่อยู่ในคลาสที่กฎ "ตัวเลขต้องมาจาก symbol เดียว" กันอยู่
    'src/app/api/cron/auto-order-sweeper/route.ts',
  ])

  it('[blocker] ห้ามประกอบ query `status: DRAFTED` เองนอกไฟล์ที่กำหนด', () => {
    // คลาสที่กัน: "ตัวเลขเดียวกันโผล่ >1 ที่แล้วไม่ตรงกัน" — เกิดจริงกับ 00029 มาแล้ว
    // (จอเดียวโชว์ "ยังไม่ตอบ" 7 กับ 8)
    //
    // 🛑 ตัดสินเฉพาะที่อยู่ใน **บล็อก `where`** ไม่ใช่ทุกที่ที่มีสตริงนี้ — กฎนี้ห้าม
    // "ประกอบคิวรีเอง" ไม่ได้ห้ามพูดถึงค่าสถานะ (UI ที่ทับสถานะใน state ของตัวเองหลังกดปุ่ม
    // ก็เขียน `status: 'DRAFTED'` เหมือนกันทุกตัวอักษร แต่ไม่ได้แตะฐานเลย)
    // ⇒ ด่านที่กว้างเกินจะถูกปิดด้วย allow-list จนไม่เหลือความหมาย ซึ่งแย่กว่าไม่มีด่าน
    const offenders: string[] = []
    for (const f of ALL_FILES) {
      if (/\.(test|spec)\.tsx?$/.test(f)) continue
      if (ALLOWED_DRAFTED_QUERY.has(f)) continue
      const lines = stripComments(readFileSync(f, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        if (!/status:\s*['"]DRAFTED['"]/.test(line)) return
        const ctx = lines.slice(Math.max(0, i - 6), i + 1).join('\n')
        if (!/\bwhere\b/.test(ctx)) return
        offenders.push(`${f}:${i + 1}`)
      })
    }
    expect(offenders, `ไฟล์ที่ประกอบ query ร่างเอง:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('เส้นทางอัตโนมัติห้าม Quick-Create (TFR-008 · AC-22/23)', () => {
  const CODE = stripComments(readFileSync('src/services/order.service.ts', 'utf8'))

  it('[blocker] promoteDraftCore มีด่าน allowQuickCreate ที่ throw จริง ไม่ใช่แค่รับ flag', () => {
    expect(CODE).toMatch(
      /if\s*\(\s*!opts\.allowQuickCreate\s*&&\s*data\.items\.some\(\(i\)\s*=>\s*!i\.productId\)\s*\)\s*\{[\s\S]{0,120}?throw new ProductNotInShopError\(\)/,
    )
  })

  it('[blocker] ตัวห่อสองตัวส่งค่า allowQuickCreate ต่างกันจริง', () => {
    const human = CODE.slice(CODE.indexOf('export async function promoteDraftToOrder('))
    const auto = CODE.slice(CODE.indexOf('export async function promoteAutoOrderDraft('))
    expect(human.slice(0, 600)).toContain('allowQuickCreate: true')
    expect(auto.slice(0, 600)).toContain('allowQuickCreate: false')
  })
})

describe('ตัวนับร่างต่อห้อง (หน้า D) ต้องใช้เกณฑ์เดียวกับตัวนับต่อร้าน', () => {
  const CODE = stripComments(readFileSync('src/services/auto-order-detect.service.ts', 'utf8'))

  it('[blocker] ทั้ง 2 ฟังก์ชันอ่าน `DRAFT_COUNT_WHERE` symbol เดียวกัน ไม่ใช่เขียนเงื่อนไขซ้ำ', () => {
    // 🛑 คลาสที่กัน: "ตัวเลขเดียวกันโผล่ 2 จอแล้วไม่ตรงกัน" — เกิดจริงกับ 00029 (จอเดียวโชว์
    // "ยังไม่ตอบ" 7 กับ 8) เงื่อนไขที่ *ตั้งใจให้เหมือนกัน* แต่เขียนแยกกันจะ drift เสมอ
    expect(CODE).toMatch(/const DRAFT_COUNT_WHERE = \{[\s\S]*?isDryRun: false/)
    const uses = CODE.match(/\.\.\.DRAFT_COUNT_WHERE/g) ?? []
    expect(uses.length, 'ต้องมีผู้ใช้ 2 ราย (นับต่อร้าน + นับต่อห้อง)').toBe(2)
  })

  it('[blocker] ตัวนับต่อห้องต้อง scope ด้วย shopId — ห้ามนับข้ามร้าน', () => {
    const at = CODE.indexOf('export async function countDraftedOrdersByConversation(')
    expect(at).toBeGreaterThan(-1)
    const body = CODE.slice(at, at + 1200)
    expect(body).toContain('shopId: { in: shopIds }')
    expect(body).toContain('conversationId: { in: conversationIds }')
  })

  it('[blocker] badge ในรายการห้องแชท enrich ทั้ง RSC และ route ด้วยฟังก์ชันเดียวกัน', () => {
    // ทำทางเดียว = badge ไม่ขึ้นตอนโหลดหน้าแรกแล้วค่อยโผล่หลัง refetch ซึ่งดูเหมือนบั๊ก
    for (const f of [
      'src/app/(paces)/seller/(chat)/inbox/page.tsx',
      'src/app/api/chat/conversations/route.ts',
    ]) {
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `${f} ต้องเรียก countDraftedOrdersByConversation`).toContain(
        'countDraftedOrdersByConversation(',
      )
      expect(code, `${f} ต้องส่งค่าออกไปกับแถว`).toContain('draftOrderCount')
    }
  })
})

describe('ครบทุกเส้นทางที่ร้านพิมพ์ข้อความ (2026-09-07)', () => {
  /**
   * 🛑 บั๊กที่เทสชุดนี้ปิด: จุดเข้าที่ 1 เดิม (`chat.service::sendMessage`) **ไม่มีทางทำงาน
   * ได้เลยสักเคส** — เธรด DEEP ไม่มี `shopChannelId` จึงตกด่านของตัวดักจับ ส่วนเธรด
   * Messenger/IG/LINE ไม่เคยเดินผ่าน `sendMessage()` เลย (route แตกสาขาแล้ว return ก่อน)
   */
  it('[blocker] ทั้ง 2 ตัวเขียนแถวข้อความของร้านต้องเรียกตัวดักจับ', () => {
    // ถ้ามีเส้นทางเขียนที่สามเกิดขึ้นแล้วลืม hook ฟีเจอร์จะเงียบเฉพาะช่องทางนั้น
    // โดยที่ tsc/build/เทสอื่นเขียวหมด
    for (const f of ['src/services/chat.service.ts', 'src/services/chat-outbox.service.ts']) {
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `${f} ต้องเรียก detectAutoOrderTrigger`).toMatch(
        /detectAutoOrderTrigger\([^)]+\)/,
      )
      // ต้องไม่ await — ผู้ขายต้องไม่รอตัวแกะก่อนเห็นข้อความตัวเองขึ้นจอ
      expect(code).not.toMatch(/await\s+detectAutoOrderTrigger/)
    }
  })

  /**
   * 🛑 ทะเบียน "ใครเขียนแถวข้อความฝั่งร้านได้บ้าง" — **ไม่ใช่ allow-list ว่าปลอดภัย**
   * แต่คือ "จุดที่ผ่านการตัดสินใจแล้วพร้อมเหตุผลกำกับ" (SDS §3.5)
   *
   * ต่างจาก allow-list ธรรมดาตรงที่ **ไฟล์ที่ 6 ที่ยังไม่เกิดจะทำให้เทสแดงทันทีที่มันถูกเขียน**
   * ไม่ว่าจะปลอดภัยหรือไม่ ⇒ บังคับให้คนเขียนต้องมาเพิ่มแถวพร้อมเหตุผล (ผ่าน code review เห็นแน่)
   * แทนที่จะหลุดเงียบแบบที่จุดเข้าที่ 1 เคยหลุดมาแล้ว
   */
  const SHOP_MESSAGE_WRITERS: Record<string, 'HOOKED' | { skip: string }> = {
    'src/services/chat.service.ts': 'HOOKED',
    'src/services/chat-outbox.service.ts': 'HOOKED',
    'src/services/auto-order-internal-message.service.ts': {
      skip: 'การ์ดผลลัพธ์ของฟีเจอร์นี้เอง — เป็น *ผลลัพธ์* ไม่ใช่ *คำสั่ง* · hook = วนดักตัวเอง',
    },
    'src/services/channel-chat.service.ts': {
      skip:
        'sendOutboundMessage — ผู้เรียกทั้งหมดเป็น **บอท** (auto-reply-send · line-rich-menu-reply) ' +
        'ไม่ใช่คนพิมพ์ · ถึง hook ก็ถูกด่าน autoReplyKind ตัดอยู่ดี',
    },
    'src/services/comment-private-reply.service.ts': {
      skip: 'บอททักแชทจากคอมเมนต์ (00038) — ข้อความสำเร็จรูป ไม่ใช่คำสั่งที่คนพิมพ์',
    },
  }

  it('[blocker] ทุกไฟล์ที่เขียนแถวข้อความฝั่งร้านต้องอยู่ในทะเบียนพร้อมเหตุผล', () => {
    const writers = ALL_FILES.filter((f) => {
      if (/\.(test|spec)\.tsx?$/.test(f)) return false
      const code = stripComments(readFileSync(f, 'utf8'))
      if (!/(tx|prisma)\.chatMessage\.create\(/.test(code)) return false
      return /senderRole:\s*'SHOP'/.test(code)
    })
    const unregistered = writers.filter((f) => !(f in SHOP_MESSAGE_WRITERS))
    expect(
      unregistered,
      `เส้นทางเขียนข้อความฝั่งร้านตัวใหม่ที่ยังไม่มีใครตัดสิน:\n${unregistered.join('\n')}`,
    ).toEqual([])
  })

  it('[blocker] ทุกไฟล์ที่ทะเบียนบอกว่า HOOKED ต้องเรียกตัวดักจับจริง', () => {
    // ทะเบียนที่บอกว่า hook แล้วแต่ไม่ได้ hook = คำอ้างที่ไม่มีอะไรบังคับ (AC ที่เขียนไว้ ≠ AC ที่บังคับได้)
    for (const [f, verdict] of Object.entries(SHOP_MESSAGE_WRITERS)) {
      if (verdict !== 'HOOKED') continue
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `${f} ประกาศว่า HOOKED`).toMatch(/detectAutoOrderTrigger\([^)]+\)/)
      expect(code, `${f} ห้าม await`).not.toMatch(/await\s+detectAutoOrderTrigger/)
    }
  })

  it('[blocker] ด่าน "บอทเป็นผู้ส่ง" อยู่ในตัวดักจับ ไม่ใช่ไล่แปะทุกจุดเข้า', () => {
    // จุดเข้ามี 3 จุดแล้ว — ด่านที่อยู่ที่จุดตัดสินจะครอบจุดที่ 4 ในอนาคตให้ฟรี
    const code = stripComments(readFileSync('src/services/auto-order-detect.service.ts', 'utf8'))
    expect(code).toMatch(/if \(message\.autoReplyKind\) return/)
    // watchdog ไม่ได้เรียกตัวดักจับ (มันเขียนร่างเอง) จึงต้องกันซ้ำที่คิวรีของมันเอง
    const cron = stripComments(
      readFileSync('src/app/api/cron/auto-order-sweeper/route.ts', 'utf8'),
    )
    expect(cron).toMatch(/autoReplyKind: null/)
  })
})
