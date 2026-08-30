import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { shouldShowOrderOrigin } from '@/lib/order-display'

/**
 * [blocker] ที่มาของออเดอร์ ("ใบนี้คุยกันที่เพจไหน") ต้องมีที่ยืนที่เดียว ไม่ใช่พิมพ์ชื่อซ้ำ
 *
 * 🛑 **2026-08-30 เปลี่ยนกติกา** — คำตอบย้ายไปเป็นป้าย "คุยกันที่นี่" บน **แถวเพจนั้นเอง**
 * ในแถบช่องทาง ส่วนบรรทัด "จากการคุยที่ …" เหลือเป็น *ทางสำรอง* สำหรับเพจที่แถบแสดงไม่ได้
 *
 * อาการเดิม (หัวหน้าเห็นบนจอจริง — ร้านเดียวชื่อเดียวโผล่ 4 รอบในการ์ดเดียว):
 *
 *     ธนภัทร์ อะไหล่มอเตอร์ไซค์               ← ชื่อร้าน
 *     ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง (Instagram)  ← แถบช่องทาง
 *     ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง (Facebook)   ← แถบช่องทาง
 *     จากการคุยที่ ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง  ← บรรทัดสำรอง
 *
 * ตัวกันเดิมผูกกับ **จำนวน** (`length === 1`) จึงปล่อยผ่านทันทีที่ร้านมี 2 เพจ
 * แม้ทั้งสองใบชื่อเดียวกัน — เกณฑ์ที่ผูกกับจำนวนพังทุกครั้งที่จำนวนเปลี่ยนโดยความหมายไม่เปลี่ยน
 *
 * 🛑 แดง = ห้าม merge
 */
const FB = (name: string) => ({ provider: 'MESSENGER', name })
const IG = (name: string) => ({ provider: 'INSTAGRAM', name })

describe('[blocker] shouldShowOrderOrigin', () => {
  it('ร้านมีเพจเดียวและเป็นเพจเดียวกัน → ต้องซ่อน (ป้ายไปเกาะแถวนั้นแล้ว)', () => {
    const n = 'BT Premium Auto Xenon คลอง4 ธนบุรี'
    expect(shouldShowOrderOrigin(FB(n), [FB(n)])).toBe(false)
  })

  it('🛑 ร้านมีหลายเพจ และเพจต้นทางอยู่ในลิสต์ → ต้อง **ซ่อน**', () => {
    /* กลับด้านจากกติกาเดิมโดยตั้งใจ — เดิมคืน true เพราะบรรทัดนี้เป็นที่เดียวที่บอกได้ว่า
       "ใบนี้เกิดที่เพจไหน" ตอนนี้แถวเพจบอกเองด้วยป้าย ⇒ บรรทัดนี้กลายเป็นค่าซ้ำทันที */
    expect(shouldShowOrderOrigin(FB('เพจ ก'), [FB('เพจ ก'), FB('เพจ ข')])).toBe(false)
  })

  it('🛑 สองเพจชื่อเดียวกัน (IG + Facebook) → ต้องซ่อน — เคสที่กติกาเดิมปล่อยผ่าน', () => {
    const n = 'ธนภัทร์ อะไหล่มอเตอร์ไซค์ สายซิ่ง'
    expect(shouldShowOrderOrigin(FB(n), [IG(n), FB(n)])).toBe(false)
  })

  it('🛑 ชื่อตรงแต่คนละช่องทาง → ต้องแสดง — ป้ายไปเกาะแถวนั้นไม่ได้', () => {
    /* เกณฑ์ของตัวกันนี้ต้องเท่ากับเกณฑ์ของตัวติดป้ายเป๊ะ ๆ ไม่งั้น "ไม่มีป้าย + ไม่มีบรรทัด"
       = ที่มาของออเดอร์หายไปเงียบ ๆ ทั้งใบ */
    expect(shouldShowOrderOrigin({ provider: 'LINE', name: 'เพจ ก' }, [FB('เพจ ก')])).toBe(true)
  })

  it('เพจต้นทางไม่ได้อยู่ในลิสต์ → ต้องแสดง', () => {
    expect(shouldShowOrderOrigin(FB('เพจ ค'), [FB('เพจ ก')])).toBe(true)
  })

  it('ร้านไม่มีเพจผูกเลย → ต้องแสดง', () => {
    expect(shouldShowOrderOrigin(FB('เพจ ก'), [])).toBe(true)
  })

  it('ไม่รู้ชื่อเพจ → ต้องแสดงเสมอ — ตัวเรนเดอร์ขึ้นชื่อ *ช่องทาง* ซึ่งจับคู่กับแถวไหนไม่ได้', () => {
    expect(shouldShowOrderOrigin({ provider: 'MESSENGER', name: null }, [FB('เพจ ก')])).toBe(true)
    expect(shouldShowOrderOrigin(null, [FB('เพจ ก')])).toBe(true)
    expect(shouldShowOrderOrigin(undefined, [FB('เพจ ก')])).toBe(true)
  })

  it('ชื่อต่างกันแค่ช่องว่าง → ยังถือว่าไม่ซ้ำ (เทียบตรงตัวเท่านั้น)', () => {
    /* จงใจไม่ normalize — ชื่อเพจที่ต่างกันจริงมักต่างแค่หางสาขา */
    expect(shouldShowOrderOrigin(FB('เพจ ก'), [FB('เพจ  ก')])).toBe(true)
  })
})

const strip = (raw: string) =>
  raw
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/.*$/gm, (m) => ' '.repeat(m.length))

const read = (rel: string) => strip(readFileSync(join(process.cwd(), rel), 'utf8'))
const ODM = () => read('src/app/(marketing)/o/[token]/OrderDetailMobile.tsx')

/**
 * [blocker] ป้าย "คุยกันที่นี่" — คำตอบหลักของ "ใบนี้คุยกันที่เพจไหน"
 *
 * 🛑 บรรทัดสำรองถูกซ่อนทันทีที่จับคู่ได้ ⇒ **ถ้าป้ายไม่ขึ้น ที่มาหายทั้งคู่**
 */
describe('[blocker] แถบช่องทางต้องติดป้ายเพจต้นทางได้จริง', () => {
  const strip_ = read('src/views/pages/user-profile/v2/OfficialChannels.tsx')
  const evidence = read('src/app/(marketing)/o/[token]/ShopEvidence.tsx')

  it('ป้ายต้องผูกกับเพจต้นทาง และเทียบทั้ง provider และ name', () => {
    expect(strip_, 'ต้องมีคำบนป้าย').toContain('คุยกันที่นี่')
    /* 🛑 เทียบแค่ชื่อไม่พอ — ร้านตั้งชื่อเพจ IG กับ Facebook เหมือนกันเป๊ะได้ แล้วป้ายจะขึ้น
       **ทั้งสองแถว** (เจอจริงตอนเปิดหน้าหลังเขียนโค้ดเสร็จ · เทสสแกนซอร์สจับไม่ได้เลย
       เพราะโค้ดถูกทุกบรรทัด สิ่งที่ผิดคือเกณฑ์) */
    expect(strip_, 'เกณฑ์ต้องเทียบทั้ง provider และ name').toMatch(
      /c\.provider === originChannel\.provider && c\.name === originChannel\.name/,
    )
    /**
     * 🛑 **ทุกจุดที่พูดว่า "คุยกันที่นี่" ต้องอยู่ใต้เงื่อนไข `isOrigin`** — ไม่ผูกกับ *ท่าเขียน*
     * ท่าใดท่าหนึ่ง · โหมด `strip`/`rows` เขียนเป็น `{isOrigin && (…)}` ส่วนโหมด `logos`
     * เขียนเป็นเทอร์นารีในสตริงของ tooltip (`${isOrigin ? 'คุยกันที่นี่ — ' : ''}`)
     * ถูกทั้งคู่ · ร่างเดิมบังคับ `{isOrigin && (` แล้วแดงทันทีที่เพิ่มโหมดที่สาม
     *
     * วิธีที่ทน: ไล่ย้อนไปหา `isOrigin` ที่ใกล้ที่สุด แล้วพิสูจน์ว่ามัน **ยังไม่ถูกปิด**
     * ก่อนถึงข้อความ (ไม่มี `)}` คั่นกลาง) ⇒ ข้อความอยู่ในขอบเขตของเงื่อนไขนั้นจริง
     */
    const marks = [...strip_.matchAll(/คุยกันที่นี่/g)]
    expect(marks.length, 'ต้องมีป้ายอย่างน้อยหนึ่งจุด').toBeGreaterThan(0)
    for (const m of marks) {
      const g = strip_.lastIndexOf('isOrigin', m.index)
      expect(g, 'ต้องมีเงื่อนไข isOrigin ก่อนป้าย').toBeGreaterThan(-1)
      expect(strip_.slice(g, m.index), 'เงื่อนไขต้องยังไม่ถูกปิดก่อนถึงป้าย').not.toContain(')}')
    }
  })

  it('🛑 เพจต้นทางต้องถูกยกขึ้นก่อนตัด VISIBLE — ไม่งั้นร้าน 3 เพจขึ้นไปเสียที่มาทั้งใบ', () => {
    const sortAt = strip_.indexOf('Number(isOriginRow(b))')
    const sliceAt = strip_.indexOf('.slice(0, VISIBLE)')
    expect(sortAt, 'ต้องมีการยกเพจต้นทางขึ้นก่อน').toBeGreaterThan(-1)
    expect(sliceAt, 'ต้องมีการตัดที่ VISIBLE').toBeGreaterThan(sortAt)
    /* 🛑 ห้ามใช้หน้าต่างความยาวคงที่ — ต้องเช็ค **ตัวแปรที่ติดกับ `.slice`** ไม่ใช่
       "มีคำนี้อยู่แถว ๆ นั้นไหม" (mutation `ordered`→`channels` เคยลอดด่านแบบหน้าต่างมาแล้ว
       เพราะ 40 ตัวอักษรก่อนหน้าคลุม `expanded ? ordered : channels` พอดี) */
    expect(strip_.slice(sliceAt - 'ordered'.length, sliceAt), 'ต้องตัดจากลิสต์ที่เรียงแล้ว').toBe(
      'ordered',
    )
  })

  it('ทั้งสองจอต้องส่งเพจต้นทางให้แถบช่องทาง — ไม่ใช่จอเดียว', () => {
    /* จอ guest คือจอที่ผู้ซื้อเห็นก่อน และเป็นจอที่คำถามนี้ถูกถามจริง */
    /* 🛑 `ShopChannels` มี 2 ทางเรียกแล้ว (โหมด `strip` กับ `rows`) — ด่านต้องบังคับว่า
       **ทุกทาง** ส่ง `originChannel` ต่อ ไม่ใช่เจาะจงบรรทัดเดียว (ผูกกับท่าเขียนแล้วแดง
       ตอน refactor ทั้งที่ของยังครบ — เกิดมาแล้วหลายรอบในงานนี้) */
    const calls = [...evidence.matchAll(/<ChannelStrip[^>]*>/g)].map((m) => m[0])
    expect(calls.length, 'ต้องมีการเรียก ChannelStrip').toBeGreaterThan(0)
    for (const c of calls) {
      expect(c, `ทุกทางเรียกต้องส่ง originChannel: ${c}`).toMatch(/originChannel=\{originChannel\}/)
    }
    for (const f of ['OrderDetailMobile.tsx', 'GuestOrderView.tsx']) {
      expect(read(`src/app/(marketing)/o/[token]/${f}`), `${f} ต้องส่ง originChannel`).toMatch(
        /originChannel=\{/,
      )
    }
  })
})

/**
 * [blocker] โครงหน้าตามม็อกอัพ v5 (`deep-order-pure-html-responsive-v5.html`)
 *
 * ด่านชุดนี้กัน **การหายไปเงียบ ๆ** ของบล็อกที่ v5 เพิ่มเข้ามา — ทุกตัวเป็นของที่ผู้ซื้อ
 * ใช้จริง ไม่ใช่ของประดับ และไม่มี type ไหนบังคับให้มันอยู่
 */
describe('[blocker] โครงหน้าออเดอร์ตามม็อกอัพ v5', () => {
  it('ปุ่มบนปก (ช่วยเหลือ + แชร์) ต้องมีทั้งสองจอ', () => {
    for (const f of ['OrderDetailMobile.tsx', 'GuestOrderView.tsx']) {
      expect(read(`src/app/(marketing)/o/[token]/${f}`), `${f} ต้องส่ง actions ให้ ShopCover`).toMatch(
        /actions=\{<CoverActions/,
      )
    }
  })

  it('🛑 ลิงก์ศูนย์ช่วยเหลือต้องมีนิยามเดียว — โผล่ 2 ที่บนจอเดียวกันแล้ว', () => {
    /* พิลบนปก + แถวลิงก์ท้ายหน้า (ใช้ร่วม 4 หน้าสาธารณะ) · ต่างคนต่างพิมพ์ URL
       วันที่ปลายทางย้ายจะย้ายไม่ครบ แล้วผู้ใช้เจอ 404 จาก "ปุ่มเดียวกัน" คนละที่ (HR16) */
    /* 🛑 เช็ค **สิ่งที่ `href` ผูกอยู่** ไม่ใช่ "มีคำนี้อยู่ในไฟล์ไหม" — ร่างแรกเช็คแบบหลัง
       แล้ว mutation `href={HELP_CENTER_HREF}` → `href='/support'` **ยังเขียว** เพราะบรรทัด
       `import` ก็มีคำนั้น (คลาสเดียวกับ grep gate ของ HR9 ที่แดงค้างจากคอมเมนต์ตัวเอง
       — ด่านที่จับ "คำ" แทน "การใช้งาน" ผิดได้ทั้งสองทาง) */
    expect(read('src/app/(marketing)/o/[token]/CoverActions.tsx'), 'พิลบนปกต้องผูกกับ SSOT').toMatch(
      /href=\{HELP_CENTER_HREF\}/,
    )
    expect(
      read('src/views/pages/user-profile/v2/PublicProfileFooter.tsx'),
      'ลิงก์ท้ายหน้าต้องผูกกับ SSOT',
    ).toMatch(/\{ href: HELP_CENTER_HREF, label: 'ศูนย์ช่วยเหลือ' \}/)
  })

  it('🛑 ทุกทางเข้าของการยกเลิกต้องผ่าน dialog ยืนยัน — ห้ามยิงตรง', () => {
    /**
     * 🛑 **กติกาเปลี่ยน 2026-08-30** — เดิมด่านนี้บังคับว่า "ต้องมีที่เดียว" ตามที่ผมตัดสินเอง
     * (การกระทำที่ย้อนไม่ได้ไม่ควรมี 2 ทางเข้า) แต่ **หัวหน้าเคาะให้มีทั้งสองที่**
     * ("bottombar ต้องมียกเลิกด้วยปะนะ") ซึ่งตรงกับม็อกอัพ v5 ที่วางไว้ทั้งคู่ตั้งแต่แรก
     *
     * กฎที่ยังต้องบังคับจริง ๆ ไม่ใช่ *จำนวนทางเข้า* แต่คือ **ทุกทางเข้าต้องมีด่านยืนยัน** —
     * ผูกกับจำนวนแล้วจะแดงทุกครั้งที่ใครเพิ่มทางเข้าที่ปลอดภัย และไม่จับทางเข้าที่อันตราย
     */
    const odm = ODM()
    const opens = [...odm.matchAll(/setCancelDialogOpen\(true\)/g)]
    expect(opens.length, 'ต้องมีทางเข้าการยกเลิกอย่างน้อยหนึ่งทาง').toBeGreaterThan(0)

    /* ห้ามมีจุดไหนเรียกตัวยกเลิกจริงโดยไม่ผ่าน dialog — `handleCancel` ต้องถูกเรียก
       จากใน dialog เท่านั้น (ปุ่มบนหน้าเปิด dialog ได้อย่างเดียว) */
    for (const m of odm.matchAll(/onClick=\{\(\) => handleCancel/g)) {
      expect(m, 'ห้ามผูก handleCancel เข้ากับปุ่มบนหน้าโดยตรง').toBeUndefined()
    }

    /**
     * 🛑 **บ้านเดียว: แถบล่าง** (หัวหน้าเคาะรอบสุดท้าย 2026-08-30 — "เอา ยกเลิกออกสิ
     * เพราะเรามี bottombar แล้ว") · กล่อง "ต้องการยกเลิกคำสั่งซื้อ?" ในการ์ดช่วยเหลือ
     * ถูกถอดออกแล้ว ⇒ ห้ามกลับมา ไม่งั้นกลายเป็นทางเข้าที่สองของการกระทำที่ย้อนไม่ได้
     */
    expect(odm, 'ห้ามมีกล่องยกเลิกในการ์ดช่วยเหลือ').not.toContain('ต้องการยกเลิกคำสั่งซื้อ?')
    const bar = odm.indexOf('onClick={() => setConfirmDialogOpen(true)}')
    expect(bar, 'ต้องมีปุ่มยืนยันในแถบล่าง').toBeGreaterThan(-1)
    const barCancel = odm.indexOf('setCancelDialogOpen(true)', bar)
    expect(barCancel, 'แถบล่างต้องมีปุ่มยกเลิกต่อจากปุ่มยืนยัน').toBeGreaterThan(bar)
    /* 🛑 ต้องเช็ค **ตัวกั้น** ด้วย ไม่ใช่แค่ "สตริงอยู่ตรงนั้นไหม" — mutation ที่เปลี่ยน
       `{showCancel && (` เป็น `{false && (` ปุ่มหายจากจอจริงแต่สตริงยังอยู่ครบ
       ⇒ ด่านเขียวทั้งที่ปุ่มที่หัวหน้าสั่งให้มีนั้นหายไปแล้ว (พิสูจน์ด้วย mutation) */
    expect(odm.slice(bar, barCancel), 'ปุ่มยกเลิกในแถบล่างต้องกั้นด้วย showCancel').toContain(
      '{showCancel && (',
    )
  })

  it('แถบล่างต้องแสดงยอดเงินคู่กับปุ่มยืนยัน (v5 `.sticky-total`)', () => {
    const odm = ODM()
    const cta = odm.indexOf('onClick={() => setConfirmDialogOpen(true)}')
    expect(cta).toBeGreaterThan(-1)
    /* ยอดต้องอยู่ **ก่อน** ปุ่มในแถบเดียวกัน — ตัวเลขที่ผู้ซื้อต้องเห็นตอนนิ้วอยู่บนปุ่ม */
    const total = odm.lastIndexOf('{formatBaht(order.totalAmount)}', cta)
    expect(total, 'ต้องมียอดเงินอยู่เหนือปุ่มยืนยันในแถบล่าง').toBeGreaterThan(-1)
    expect(cta - total, 'ยอดกับปุ่มต้องอยู่ในแถบเดียวกัน ไม่ใช่คนละบล็อก').toBeLessThan(1200)
  })

  it('🛑 การ์ด "ซื้อผ่าน Deep มั่นใจได้" ต้องไม่มีคำรับรองที่ตรวจสอบไม่ได้', () => {
    /* คำในม็อกอัพ ("ข้อมูลของคุณปลอดภัย" ฯลฯ) เป็นคำโปรยที่พิสูจน์ไม่ได้ —
       `OfficialChannels` เขียนกฎไว้เองว่าบนหน้าที่มีไว้พิสูจน์ความน่าเชื่อถือ
       คำรับรองที่ตรวจสอบไม่ได้มีค่าเท่ากับโฆษณา */
    const odm = ODM()
    expect(odm, 'ต้องมีการ์ดนี้').toContain('ซื้อผ่าน Deep มั่นใจได้')
    for (const banned of ['ข้อมูลของคุณปลอดภัย', 'มีทีมงานช่วยเหลือเสมอ', 'ติดตามสถานะได้ตลอด']) {
      expect(odm, `ห้ามใช้คำโปรยที่ตรวจสอบไม่ได้: ${banned}`).not.toContain(banned)
    }
  })

  it('ประโยค "อัปเดตตามการดำเนินงานจริง" ต้องมีที่เดียว', () => {
    /**
     * 🛑 v5 ยกประโยคนี้ไปไว้ในกล่อง `.order-info` แล้วเราเก็บบรรทัดเดิมไว้บนมือถือด้วย
     * = ค่าเดียวกันสองที่ที่ต้องพึ่ง media query กั้น · **กล่องนั้นถูกถอดทั้งใบแล้ว**
     * (หัวหน้าสั่ง 2026-08-30 "เอา card ออกเลย") ⇒ เหลือบรรทัดเดียวที่แสดงทุกจอ
     * ซึ่งเป็นรูปที่แข็งกว่า: ไม่ต้องมีใครจำว่ากั้นไว้ตรงไหน
     */
    const odm = ODM()
    const hits = [...odm.matchAll(/อัปเดตตามการดำเนินงานจริง/g)]
    expect(hits, 'ต้องมีจุดเดียว').toHaveLength(1)
    expect(odm, 'กล่อง .order-info ต้องไม่กลับมา').not.toContain('จากการยืนยันของร้านโดยตรง')
  })
})
