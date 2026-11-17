/**
 * ข้อความโฆษณาของเธรด Instagram (user report 2026-11-17 "ของอินตราแกรมเอาชื่อ ads มาแสดง")
 * เดิมยิง `{igAccountId}_{postId}` ⇒ 400 ⇒ แบนเนอร์ตกไปโชว์ ad_title (ชื่อภายใน Ads Manager)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAdPostContent } from '../graph'

const IG = '17841400000000001'
const PAGE = '100200300400500'
const POST = '987654321'

type Route = (url: string) => { status: number; body: unknown }
function mockFetch(route: Route) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const r = route(url)
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchAdPostContent — Instagram', () => {
  it('หา Page id จาก token แล้วดึงโพสต์เพจ (ไม่ยิง {igId}_{postId})', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/me?fields=id')) return { status: 200, body: { id: PAGE } }
      if (url.includes(`/${PAGE}_${POST}?`)) return { status: 200, body: { message: ' โช๊คหลัง 590 ', full_picture: 'https://x/p.jpg', permalink_url: 'https://fb/p' } }
      return { status: 400, body: {} }
    })
    const r = await fetchAdPostContent(IG, POST, 'tok', { provider: 'INSTAGRAM' })
    expect(r).toEqual({ message: 'โช๊คหลัง 590', fullPicture: 'https://x/p.jpg', permalink: 'https://fb/p' })
    expect(calls.some((u) => u.includes(`${IG}_${POST}`))).toBe(false)
  })

  it('โพสต์เพจไม่มี ⇒ ลอง IG media (caption · วิดีโอใช้ thumbnail)', async () => {
    mockFetch((url) => {
      if (url.includes('/me?fields=id')) return { status: 200, body: { id: PAGE } }
      if (url.includes(`/${POST}?fields=caption`)) return { status: 200, body: { caption: 'แคปชั่น IG', media_type: 'VIDEO', media_url: 'https://v.mp4', thumbnail_url: 'https://t.jpg', permalink: 'https://ig/p' } }
      return { status: 400, body: {} }
    })
    const r = await fetchAdPostContent(IG, POST, 'tok', { provider: 'INSTAGRAM' })
    expect(r).toEqual({ message: 'แคปชั่น IG', fullPicture: 'https://t.jpg', permalink: 'https://ig/p' })
  })

  it('ดึงไม่ได้สักทาง ⇒ ว่างทุกช่อง ไม่ throw', async () => {
    mockFetch(() => ({ status: 400, body: {} }))
    await expect(fetchAdPostContent(IG, POST, 'tok', { provider: 'INSTAGRAM' })).resolves.toEqual({ message: null, fullPicture: null, permalink: null })
  })

  it('Messenger ยังยิง {pageId}_{postId} ตรงเหมือนเดิม (ไม่ถาม /me)', async () => {
    const calls = mockFetch((url) =>
      url.includes(`/${PAGE}_${POST}?`) ? { status: 200, body: { message: 'ข้อความ' } } : { status: 400, body: {} },
    )
    const r = await fetchAdPostContent(PAGE, POST, 'tok')
    expect(r.message).toBe('ข้อความ')
    expect(calls).toHaveLength(1)
  })
})
