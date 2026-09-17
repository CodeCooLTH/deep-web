/**
 * [blocker] ล็อกอินสำเร็จแล้วต้องเข้าได้เลย ไม่ต้องรีเฟรชเอง (2026-09-17)
 *
 * ## อาการจริง
 *
 * ล็อกอิน `appreview` (username+password) บน iPhone → **ไม่พาเข้าไป ต้องรีเฟรชเอง**
 * รอบ #67 แก้ด้วย `router.refresh()` + `router.push()` แล้ว **ยังเป็นเหมือนเดิม**
 *
 * ## สองสาเหตุที่ต้องแก้พร้อมกัน
 *
 * 1. `signIn(..., { redirect: false })` คืน `ok: true` ตอน "เซิร์ฟเวอร์ยอมรับรหัสผ่าน"
 *    ไม่ใช่ตอน "เบราว์เซอร์เก็บคุกกี้แล้ว" ⇒ ต้องรอจนเห็น session ก่อน
 * 2. router ของ Next เสิร์ฟหน้าจาก Router Cache ⇒ ต้อง hard-navigate
 *    (รีโปนี้สรุปเรื่องนี้ไปแล้วตอนสลับร้าน — `useShopSwitcher.ts`)
 *
 * ## ทำไมต้องกวาดทั้งระบบ ไม่ใช่เทสเฉพาะหน้าที่หัวหน้าเจอ
 *
 * บั๊กนี้โผล่ซ้ำได้ทุกที่ที่มีคนเขียน `signIn(..., { redirect: false })` ใหม่ —
 * เทสนี้จึงไล่ **ทุกไฟล์ในระบบ** ไม่ใช่รายชื่อที่ฮาร์ดโค้ดไว้ ของใหม่ที่เพิ่มมาทีหลัง
 * จะถูกจับได้เองโดยไม่ต้องมีใครจำมาแก้เทส
 */
import fs from 'fs'
import path from 'path'

import { describe, expect, it, vi } from 'vitest'

import { goAfterLogin, type GoAfterLoginDeps } from '@/lib/go-after-login'

function makeDeps(seen = true) {
  return {
    waitForSession: vi.fn().mockResolvedValue(seen),
    getSession: vi.fn(),
    assign: vi.fn(),
    reload: vi.fn(),
  } as unknown as GoAfterLoginDeps & {
    waitForSession: ReturnType<typeof vi.fn>
    assign: ReturnType<typeof vi.fn>
    reload: ReturnType<typeof vi.fn>
  }
}

describe('[blocker] goAfterLogin', () => {
  it('🛑 ต้องรอจนเห็น session ก่อนพาไป ไม่ใช่ยิงไปเลย', async () => {
    const deps = makeDeps()
    const order: string[] = []
    deps.waitForSession.mockImplementation(async () => {
      order.push('wait')
      return true
    })
    deps.assign.mockImplementation(() => order.push('go'))

    await goAfterLogin('/dashboard', deps)

    expect(order, 'ไปก่อนรอ = คำขอแรกอาจไม่มีคุกกี้ ⇒ proxy เตะกลับ').toEqual(['wait', 'go'])
  })

  it('🛑 ต้อง hard-navigate ปลายทางที่สั่ง', async () => {
    const deps = makeDeps()
    await goAfterLogin('/inbox?tab=all', deps)
    expect(deps.assign).toHaveBeenCalledWith('/inbox?tab=all')
    expect(deps.reload, 'มีปลายทางแล้วยัง reload = ไม่ได้ไปไหน').not.toHaveBeenCalled()
  })

  it('ไม่ส่งปลายทาง = โหลดหน้าเดิมใหม่ (หน้ารับคำเชิญต้องอยู่ที่ลิงก์เดิม)', async () => {
    const deps = makeDeps()
    await goAfterLogin(undefined, deps)
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(deps.assign).not.toHaveBeenCalled()
  })

  it('🛑 ถามไม่เห็น session ก็ต้องไปต่อ ไม่ใช่ค้างคาหน้าเดิม', async () => {
    const deps = makeDeps(false)
    await goAfterLogin('/dashboard', deps)
    expect(deps.assign, 'ไม่ไปไหนเลย = ผู้ใช้กดปุ่มแล้วจอค้าง แย่กว่าโดนเตะกลับ').toHaveBeenCalledWith(
      '/dashboard',
    )
  })
})

/* ---------------------------------------------------------------- source sweep */

const SRC = 'src'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      walk(full, out)
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

/* ตัดคอมเมนต์ทิ้งก่อนเสมอ — ไม่งั้นคำว่า router.push ในคอมเมนต์อธิบายจะทำให้เทสฟ้องผิดตัว
   (และที่แย่กว่า: `goAfterLogin` ในคอมเมนต์จะทำให้โค้ดที่ยังไม่ได้แก้ผ่านเทส) */
function stripComments(code: string) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

interface Site {
  file: string
  block: string
}

/**
 * ตัดเอาเฉพาะ "เส้นทางที่ล็อกอินสำเร็จ" ของ signIn แต่ละจุด
 *
 * 🛑 ต้องตัดให้พอดีบล็อก ไม่ใช่หั่นตามจำนวนตัวอักษร — ไฟล์เดียวกันมี `router.push` ที่ถูกต้อง
 * อยู่ในกิ่งอื่น (เช่น mode=reset ไป /auth/new-pass ซึ่งไม่ได้เปลี่ยน session) การหั่นมั่ว ๆ
 * จะฟ้องผิดตัวจนคนแก้เชื่อถือเทสนี้ไม่ได้
 */
function blockAfter(code: string, from: number): string | null {
  const okAt = code.indexOf('.ok', from)
  if (okAt < 0) return null
  const braceAt = code.indexOf('{', okAt)
  /* `if (res?.ok) doSomething()` แบบบรรทัดเดียว — ไม่มีปีกกาให้จับคู่ */
  if (braceAt < 0 || braceAt - okAt > 15) return code.slice(okAt, okAt + 160)
  let depth = 0
  for (let i = braceAt; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) return code.slice(okAt, i + 1)
    }
  }
  return code.slice(okAt, okAt + 320)
}

/** ทุกจุดในระบบที่ `signIn(..., { redirect: false })` แล้วเช็กผลว่าสำเร็จ */
function findLoginSites(): Site[] {
  const sites: Site[] = []
  for (const file of walk(SRC)) {
    const raw = fs.readFileSync(file, 'utf8')
    if (!raw.includes('redirect: false')) continue
    const code = stripComments(raw)
    let at = code.indexOf('redirect: false')
    while (at >= 0) {
      const block = blockAfter(code, at)
      if (block) sites.push({ file, block })
      at = code.indexOf('redirect: false', at + 1)
    }
  }
  return sites
}

describe('[blocker] ทุกทางเข้าระบบต้องไปต่อด้วยท่าเดียวกัน', () => {
  const sites = findLoginSites()

  it('เจอทางเข้าระบบจริง — ไม่ใช่เทสที่กวาดแล้วว่างเปล่าแล้วผ่านฟรี', () => {
    /* 2026-09-17 มี 8 จุด: seller sign-in · seller otp ×2 · seller invite · admin ×2 · buyer ×2
       (+ mobile-enter ที่ hard-navigate อยู่แล้ว) — ตั้งเพดานล่างกัน regex พังเงียบ ๆ */
    expect(sites.length, 'กวาดไม่เจอสักจุด = regex พัง ไม่ใช่ระบบสะอาด').toBeGreaterThanOrEqual(8)
  })

  it.each(sites.map((s, i) => [`${s.file}#${i}`, s] as const))(
    '🛑 %s — ห้าม router.push/refresh หลังล็อกอินสำเร็จ',
    (_name, site) => {
      expect(
        site.block,
        `${site.file}: router.push หลังล็อกอิน = บั๊ก "ต้องรีเฟรชเอง" (พิสูจน์มาแล้วรอบ #67)`,
      ).not.toContain('router.push(')
      expect(
        site.block,
        `${site.file}: router.refresh ไม่พอ — useShopSwitcher เลิกใช้ไปแล้วด้วยเหตุผลเดียวกัน`,
      ).not.toContain('router.refresh()')
    },
  )

  it('🛑 ทุกจุดต้องผ่านตัวกลางตัวเดียว ไม่ใช่ต่างคนต่างเขียน', () => {
    const notUsingHelper = sites.filter(
      (s) => !s.block.includes('goAfterLogin(') && !s.block.includes('window.location.'),
    )
    expect(
      notUsingHelper.map((s) => s.file),
      'จุดที่ไม่ได้ทั้งเรียก goAfterLogin และไม่ได้ hard-navigate เอง',
    ).toEqual([])
  })

  it('🛑 ตัวกลางต้องทำครบทั้งสองอย่าง — รอ session แล้วค่อย hard-navigate', () => {
    const helper = stripComments(fs.readFileSync('src/lib/go-after-login.ts', 'utf8'))
    /* ต้องเช็ก "เรียกจริง" ไม่ใช่แค่ "มีคำนี้ในไฟล์" — import กับ realDeps ก็มีคำนี้ */
    expect(helper, 'ไม่รอ session = ไปทั้งที่ยังไม่รู้ว่าเห็นคุกกี้ไหม').toContain(
      'await deps.waitForSession(',
    )
    expect(helper, 'ต้อง hard-navigate').toContain('window.location.assign(')
    expect(helper).toContain('window.location.reload()')
    expect(helper, 'ตัวกลางเองห้ามใช้ router').not.toContain('useRouter')
  })
})

/* หน้ารับคำเชิญไม่ได้เรียก signIn (ผู้ใช้ล็อกอินอยู่แล้ว) แต่ `update({activeShopId})` เปลี่ยน
   "ร้านที่ active" ซึ่งเป็นการเปลี่ยนบริบทฝั่งเซิร์ฟเวอร์แบบเดียวกับสลับร้าน จึงต้อง hard-navigate
   เหมือนกัน — sweep ข้างบนจับไม่ได้เพราะไม่มี `redirect: false` ในไฟล์ */
describe('[blocker] รับคำเชิญแล้วต้อง hard-navigate เหมือนสลับร้าน', () => {
  it('🛑 InviteLandingClient ห้าม router.push หลัง update(activeShopId)', () => {
    const code = stripComments(
      fs.readFileSync('src/app/(paces)/seller/i/[slug]/components/InviteLandingClient.tsx', 'utf8'),
    )
    const at = code.indexOf('update({ activeShopId')
    expect(at, 'ไม่พบการเปลี่ยนร้าน active').toBeGreaterThan(-1)
    const block = code.slice(at, at + 200)
    expect(block).toContain('goAfterLogin(')
    expect(block, 'router.push = ร้านเปลี่ยนแล้วแต่หน้ายังเสิร์ฟจากแคชร้านเดิม').not.toContain(
      'router.push(',
    )
  })
})
