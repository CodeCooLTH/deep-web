import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ทำไม: proxy.ts rewrite ทุก path ตาม subdomain ยกเว้นนามสกุลใน allow-list — ไฟล์ใต้ public/chat-desk
// ที่นามสกุลหลุด list จะ 404 เฉพาะบน seller.* (docs/conventions/root-served-assets-and-proxy.md)
const src = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')
const m = src.match(/if \((\/\\\.\(\?:[^)]*\)\$\/i)\.test\(pathname\)\)/)

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

describe('public/chat-desk ผ่าน allow-list ของ proxy', () => {
  it('อ่าน regex จาก proxy.ts ได้', () => {
    expect(m).not.toBeNull()
  })

  it('ทุกไฟล์มีนามสกุลที่ proxy ปล่อยผ่าน', () => {
    const re = new Function(`return ${m![1]}`)() as RegExp
    const files = walk(join(process.cwd(), 'public/chat-desk'))
    expect(files.length).toBeGreaterThan(0)
    const bad = files.filter(f => !re.test(`/chat-desk/x${extname(f)}`))
    expect(bad).toEqual([])
  })
})
