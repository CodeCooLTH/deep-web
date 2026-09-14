import { describe, it, expect } from 'vitest'
import { shouldAskMetaForInboundWindow } from '@/lib/inbound-window-sync'

const long_ago = new Date(Date.now() - 40 * 60 * 60 * 1000)
const recent = new Date(Date.now() - 60 * 1000)

/**
 * [blocker] — Graph call ตัวนี้ median 680ms และบล็อกการวาดหน้าเธรด
 * ขยายเงื่อนไขกลับไปกว้างเหมือนเดิม = ผู้ใช้บ่นว่า "เข้าห้องต้องโหลดตลอด" อีกรอบ
 */
describe('[blocker] ถาม Meta หาเวลาที่ลูกค้าทักล่าสุด', () => {
  it('ถามเฉพาะตอนไม่มีข้อมูลเลย (null)', () => {
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: null })).toBe(true)
    expect(shouldAskMetaForInboundWindow({ channel: 'INSTAGRAM', lastInboundAt: null })).toBe(true)
  })

  /** 90.9% ของเธรดบน prod อยู่กลุ่มนี้ — ถามซ้ำได้คำตอบเดิมเสมอ */
  it('มีค่าแล้วไม่ถามซ้ำ ไม่ว่าจะเก่าแค่ไหน', () => {
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: long_ago })).toBe(false)
    expect(shouldAskMetaForInboundWindow({ channel: 'MESSENGER', lastInboundAt: recent })).toBe(false)
  })

  it('DEEP/LINE ไม่เข้าเส้นทางนี้เลย (คนละแนวคิดของหน้าต่างเวลา)', () => {
    for (const channel of ['DEEP', 'LINE']) {
      expect(shouldAskMetaForInboundWindow({ channel, lastInboundAt: null }), channel).toBe(false)
      expect(shouldAskMetaForInboundWindow({ channel, lastInboundAt: long_ago }), channel).toBe(false)
    }
  })

  it('หน้าเธรดเรียกฟังก์ชันนี้ ไม่ได้เขียนเงื่อนไขเอง', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(chat)/inbox/[conversationId]/page.tsx', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/shouldAskMetaForInboundWindow\(\{/)
    // ห้ามกลับไปใช้ "หน้าต่างดูปิด" เป็นเกณฑ์ยิง Meta อีก
    expect(code).not.toMatch(/!getWindowState\([^)]*\)\.open[\s\S]{0,80}syncInboundWindowFromMeta/)
    /**
     * 🛑 ห้าม await — Graph call นี้ median 680ms และเคยเป็นทั้งหมดของอาการ "เข้าห้องต้องโหลดตลอด"
     * ต้องยิงผ่าน `after()` ให้รันหลังส่ง response (แพตเทิร์นเดียวกับ messages/route.ts:291)
     */
    expect(code).toMatch(/after\(syncInboundWindowFromMeta\(/)
    expect(code).not.toMatch(/await syncInboundWindowFromMeta\(/)
  })
})

/**
 * [blocker] — ตัวจำตำแหน่งรายการแชทต้องผูกกับ prop ของตัวเอง ห้ามเดาจาก `railMode`
 *
 * 🛑 รอบแรก (2026-09-10) กันด้วย `!railMode` โดยเข้าใจว่ามันแปลว่า "รายการฝั่ง rail" — ผิด:
 * คอมเมนต์ที่ inbox/page.tsx เขียนไว้เองว่าความหมายเปลี่ยนเป็น "ค้นหาอยู่ที่ header" แล้ว
 * และหน้า /inbox ก็ส่ง `railMode` มาด้วย ⇒ **ตัวจำตำแหน่งไม่เคยทำงานเลยสักครั้ง** โดยไม่มี
 * อะไรฟ้อง (tsc/build/เทสผ่านหมด — มันแค่เงียบ) user ต้องเป็นคนบอกว่ายังเด้งกลับบนสุดเหมือนเดิม
 */
describe('[blocker] เงื่อนไขเปิดตัวจำตำแหน่งรายการแชท', () => {
  const strip = (src: string) =>
    src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')

  it('ใช้ persistScroll ไม่ใช่ railMode', async () => {
    const fs = await import('fs')
    const code = strip(
      fs.readFileSync('src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', 'utf8'),
    )
    expect(code).toMatch(/const restoreEnabled = persistScroll/)
    expect(code).not.toMatch(/const restoreEnabled = !railMode/)
  })

  it('หน้ารายการเต็มจอ (มือถือ) ส่ง persistScroll มาจริง', async () => {
    const fs = await import('fs')
    const code = strip(fs.readFileSync('src/app/(paces)/seller/(chat)/inbox/page.tsx', 'utf8'))
    expect(code).toMatch(/persistScroll/)
  })
})

/**
 * [blocker] — snapshot ของรายการแชทต้องเก็บ "ตำแหน่ง" เท่านั้น ห้ามเก็บ "ข้อมูล"
 *
 * 🛑 v1 เก็บ `items` ทั้งชุดเพื่อคืนความสูงให้เลื่อนกลับได้ แต่ `items` มี `lastMessagePreview`
 * ติดไปด้วย ⇒ ตอนคืนค่ามันเขียนทับข้อมูลสดที่ RSC เพิ่งส่งมา ด้วยของเก่าถึง 15 นาที
 * user ทักเอง ("ทำไม last message ไม่ล่าสุด") แล้วสั่งว่า **"ข้อมูลต้อง realtime"** (2026-09-10)
 *
 * บทเรียน: ตำแหน่งเก่าไม่เป็นไร แต่ข้อมูลเก่าคือการโกหกผู้ใช้ — ห้ามเอาความสะดวกของการคืน
 * ตำแหน่งไปแลกกับความถูกต้องของสิ่งที่แสดง
 */
describe('[blocker] snapshot รายการแชทเก็บได้แค่ตำแหน่ง', () => {
  it('ไฟล์ snapshot ไม่มีคำว่า items ในรูปข้อมูลที่เก็บ', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      'src/app/(paces)/seller/(chat)/inbox/components/inbox-scroll-restore.ts',
      'utf8',
    )
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n')
    // type Snapshot ต้องไม่มีฟิลด์ items/nextCursor (สองตัวนี้คือ "ข้อมูล" ไม่ใช่ "ตำแหน่ง")
    expect(code).not.toMatch(/items\s*:/)
    expect(code).not.toMatch(/nextCursor/)
    expect(code).toMatch(/loadedCount/)
  })

  it('InboxList ไม่เอา snapshot ไป setItems', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).not.toMatch(/setItems\(snap\./)
    // ต้องไล่โหลดสดกลับมาแทน
    expect(code).toMatch(/restoreTargetRef/)
  })

  it('TTL ของ snapshot ต้องไม่ยาวเกิน 5 นาที', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(
      'src/app/(paces)/seller/(chat)/inbox/components/inbox-scroll-restore.ts',
      'utf8',
    )
    const m = src.match(/const TTL_MS = (\d+) \* 60 \* 1000/)
    expect(m, 'หา TTL_MS ไม่เจอ').not.toBeNull()
    expect(Number(m![1])).toBeLessThanOrEqual(5)
  })
})

/**
 * [blocker] — ข้อความที่ติดมากับหน้า (prefetch) ต้องถูกเช็คซ้ำทันทีที่เปิดห้อง
 *
 * 🛑 user รายงาน 2026-09-10: "เห็นคำว่า เวฟ 110 ในรายการแล้ว พอกดเข้าไปไม่เห็นทันที มัน delay"
 * รายการแชทได้ข้อความใหม่ทาง realtime (ทันที) แต่หน้าเธรดถูก prefetch ไว้ล่วงหน้าและ router
 * cache เก็บได้ถึง 30 วินาที ⇒ ข้อความชุดแรกเป็นภาพ ณ ตอน prefetch ไม่ใช่ตอนกด
 * ถ้าไม่ยิงซ้ำตอน mount ต้องรอ poll รอบถัดไป (สูงสุด 6 วินาที)
 */
describe('[blocker] เปิดห้องแล้วต้อง reconcile ข้อความทันที', () => {
  it('hook ยิง refetchNewer ตอน mount เมื่อถูก seed มาจากเซิร์ฟเวอร์', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    // ต้องมี effect ที่ "ถ้าจอมีเนื้อหาแล้ว (initial จาก RSC หรือ cache ของ store) ให้ refetchNewer"
    // — ไม่ใช่แค่มีฟังก์ชันลอย ๆ · 2026-09-14: กิ่ง cache + บล็อก seed store (R14) คั่นกลางได้
    expect(code).toMatch(/if \(!initial && !cached\) return\n[\s\S]{0,800}?void refetchNewer\(\{ sync: true \}\)/)
  })

  /**
   * [blocker] R7 — การเปิดห้องเป็น delta แล้ว route จึง sync ก็ต่อเมื่อ hook ขอ `sync=1` เท่านั้น
   * ⇒ ขอครั้งเดียวตอนเปิดห้อง (ข้อความที่ webhook ไม่ส่งจะโผล่) · poll/realtime/กลับมาที่แท็บห้ามขอ
   * (ไม่งั้นยิง Graph ตามรอบ poll ทุก 12 วินาที)
   */
  it('[blocker] sync=1 เฉพาะ refetch ตอนเปิดห้อง ไม่ใช่ poll/realtime/visibility (R7)', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/if \(sync\) params\.set\('sync', '1'\)/)
    // ผู้ขอ sync มีที่เดียว (effect ตอนเปิดห้อง ตรวจข้างบน)
    expect(code.match(/refetchNewer\(\{ sync: true \}\)/g) ?? []).toHaveLength(1)
    // poll เรียกเปล่า ๆ
    expect(code).toMatch(/const tick = \(\) => \{\n\s*if \(document\.visibilityState === 'visible'\) refetchNewer\(\)\n\s*\}/)
  })
})

/**
 * [blocker] — คืนตำแหน่งต้อง "ทวงคืน" ไม่ใช่ตั้งครั้งเดียว
 *
 * 🛑 Next App Router พา scroll container ของหน้าใหม่ขึ้นบนสุดเองหลัง navigate ซึ่งเกิด **หลัง**
 * layout effect ที่คืนตำแหน่ง ⇒ ตั้งครั้งเดียวจะโดนเขียนทับทันที = อาการ "กดกลับมาแล้วเด้ง
 * ขึ้นบนสุด" ที่ user เจอซ้ำ 3 รอบ (2026-09-10)
 */
describe('[blocker] คืนตำแหน่งรายการต้องทวงคืนหลาย ๆ เฟรม', () => {
  it('ใช้ requestAnimationFrame ทวงคืน ไม่ใช่ตั้ง scrollTop ครั้งเดียวจบ', async () => {
    const fs = await import('fs')
    const code = fs
      .readFileSync('src/app/(paces)/seller/(chat)/inbox/components/InboxList.tsx', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toMatch(/requestAnimationFrame\(pin\)/)
    // ต้องเทียบกับค่าเป้าก่อนเขียนทับ (ไม่ใช่ยัด scrollTop รัวทุกเฟรมจนสู้กับนิ้วผู้ใช้)
    expect(code).toMatch(/Math\.abs\(node\.scrollTop - pinTo\)/)
  })
})

/**
 * [blocker] R15/R16 — การต่อสายใน hook ที่ tsc/เทสฟังก์ชันบริสุทธิ์มองไม่เห็น (รีโปไม่มี jsdom)
 */
describe('[blocker] ห้องแชท: watermark ตอน merge เปิดห้อง + delta ครบเพดาน', () => {
  const read = async () => {
    const fs = await import('fs')
    return fs
      .readFileSync('src/app/(paces)/seller/(dashboard)/_shared/useSellerChatThread.ts', 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
  }

  it('R15: กิ่ง merge ของ cache+initial เขียน store โดยไม่ส่ง fetched (watermark ของ cache ต้องคงอยู่)', async () => {
    // ส่ง fetched: initial.items = ยก watermark ข้ามการแก้ของแถว cache ที่เก่ากว่า initial ทั้งช่วง
    expect(await read()).toMatch(/saveThreadView\(conversationId, opening\.items, opening\.oldestCursor\)\n/)
  })

  it('R16: delta ครบเพดานต้องผ่าน shouldDeferFullDeltaReplace ก่อนแทนที่จอ', async () => {
    const code = await read()
    expect(code).toMatch(
      /data\.items\.length >= DELTA_TAKE\) \{\n\s*if \(!shouldDeferFullDeltaReplace\(\{ atBottom: atBottomRef\.current \}\)\) \{\n\s*await reloadFirstPage\(\)/,
    )
    // สองทางที่ทำการแทนที่ที่ถูกเลื่อนไว้: ลงมาถึงล่างสุด (scroll listener) และปุ่ม (clearUnseen)
    expect(code).toMatch(/setUnseenNewCount\(0\)\n\s*reloadIfStaleRef\.current\(\)/)
    expect(code).toMatch(/const clearUnseen = useCallback\(\(\) => \{\n\s*scrollToBottom\(\)\n\s*reloadIfStale\(\)/)
  })
})
