import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// ทำไม: three/R3F หนัก (~หลายร้อย KB) — ต้องอยู่ใน chunk ของฉากเท่านั้น (SDS TD-11 · S-7 "ไม่มี chunk three ใน route อื่น")
// import แบบ static จากนอก components/scene/** ทำให้ลาม bundle ของ route อื่น
const ROOT = join(process.cwd(), 'src')
const SCENE_DIR = 'app/(paces)/seller/(dashboard)/chat-desk/components/scene/'
const CANVAS = join(ROOT, 'app/(paces)/seller/(dashboard)/chat-desk/components/DeskCanvas.tsx')

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name)
    return e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(p)) : /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })

const files = walk(ROOT).filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
const rel = (f: string) => relative(ROOT, f).split('\\').join('/')
const THREE = /from\s+['"](three|three\/[^'"]*|@react-three\/[^'"]*)['"]|import\(\s*['"](three|@react-three\/[^'"]*)['"]\s*\)/
const SCENE_STATIC = /from\s+['"][^'"]*\/scene\/[^'"]*['"]/

describe('three / @react-three อยู่เฉพาะใต้ chat-desk/components/scene/**', () => {
  it('มีไฟล์ในฉากจริง (กันเทสว่างเปล่า)', () => {
    expect(files.some((f) => rel(f).startsWith(SCENE_DIR))).toBe(true)
  })
  it('ไฟล์นอก scene/** ไม่ import three', () => {
    const bad = files.filter((f) => !rel(f).startsWith(SCENE_DIR) && THREE.test(readFileSync(f, 'utf8'))).map(rel)
    expect(bad).toEqual([])
  })
  it('ไฟล์นอก scene/** ไม่ import ไฟล์ในฉากแบบ static (ต้องผ่าน dynamic ใน DeskCanvas)', () => {
    const bad = files.filter((f) => !rel(f).startsWith(SCENE_DIR) && SCENE_STATIC.test(readFileSync(f, 'utf8'))).map(rel)
    expect(bad).toEqual([])
  })
  it('DeskCanvas โหลดฉากด้วย next/dynamic ssr:false', () => {
    const s = readFileSync(CANVAS, 'utf8')
    expect(s).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(['"]\.\/scene\/DeskScene['"]\)/)
    expect(s).toMatch(/ssr:\s*false/)
  })
})
