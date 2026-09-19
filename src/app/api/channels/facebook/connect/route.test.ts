import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

beforeAll(() => {
  process.env.FB_CHAT_APP_ID = '1570859340799126'
})

import { GET } from '@/app/api/channels/facebook/connect/route'
import { getServerSession } from 'next-auth'
import { PENDING_REVIEW_SCOPES } from '@/lib/facebook/constants'

const req = () => new NextRequest('https://seller.deepthailand.app/api/channels/facebook/connect')

describe('GET /api/channels/facebook/connect', () => {
  it('ไม่ได้ login → 401', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('login แล้ว → 302 ไป facebook.com พร้อม scope และ state', async () => {
    ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } })
    const res = await GET(req())

    expect(res.status).toBe(302)
    const loc = new URL(res.headers.get('location')!)
    expect(loc.hostname).toBe('www.facebook.com')
    expect(loc.searchParams.get('client_id')).toBe('1570859340799126')
    expect(loc.searchParams.get('scope')).toContain('pages_messaging')
    expect(loc.searchParams.get('state')).toBeTruthy()
    // state ต้องถูกผูกไว้ใน cookie httpOnly เพื่อเทียบตอน callback
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  // [blocker] ขอ scope ที่ยังไม่ผ่านรีวิวกับคนไม่มี role ⇒ Facebook ขึ้น "ฟีเจอร์ไม่พร้อมใช้งาน" (2026-09-19)
  it('[blocker] ผู้ใช้ทั่วไปได้เฉพาะ scope ที่ผ่านรีวิวแล้ว · คนใน FB_CHAT_ROLE_USER_IDS ได้ครบ', async () => {
    process.env.FB_CHAT_ROLE_USER_IDS = ' role1 ,role2'
    const scopeFor = async (id: string) => {
      ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id } })
      return new URL((await GET(req())).headers.get('location')!).searchParams.get('scope')!.split(',')
    }
    const pending = PENDING_REVIEW_SCOPES.split(',')
    const customer = await scopeFor('u1')
    for (const s of pending) expect(customer).not.toContain(s)
    expect(customer).toContain('pages_messaging')
    const role = await scopeFor('role1')
    for (const s of pending) expect(role).toContain(s)
    delete process.env.FB_CHAT_ROLE_USER_IDS
  })
})
