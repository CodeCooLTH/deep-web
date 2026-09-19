import { describe, it, expect, vi, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

beforeAll(() => {
  process.env.FB_CHAT_APP_ID = '1570859340799126'
})

import { GET } from '@/app/api/channels/facebook/connect/route'
import { getServerSession } from 'next-auth'
import { CONNECT_CONFIG_ID, PENDING_REVIEW_SCOPES } from '@/lib/facebook/constants'

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
    expect(loc.searchParams.get('config_id')).toBe(CONNECT_CONFIG_ID)
    expect(loc.searchParams.get('state')).toBeTruthy()
    // state ต้องถูกผูกไว้ใน cookie httpOnly เพื่อเทียบตอน callback
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
  })

  // [blocker] แอปแชทเป็น Facebook Login for Business — คนนอก role ต้องเข้าผ่าน config_id ห้ามส่ง scope
  // (ส่ง scope = Facebook ขึ้น "ฟีเจอร์ไม่พร้อมใช้งาน" · 2026-09-19)
  it('[blocker] ผู้ใช้ทั่วไปได้ config_id ไม่มี scope · คนใน FB_CHAT_ROLE_USER_IDS ได้ scope ครบ', async () => {
    process.env.FB_CHAT_ROLE_USER_IDS = ' role1 ,role2'
    const paramsFor = async (id: string) => {
      ;(getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id } })
      return new URL((await GET(req())).headers.get('location')!).searchParams
    }
    const customer = await paramsFor('u1')
    expect(customer.get('config_id')).toBe(CONNECT_CONFIG_ID)
    expect(customer.has('scope')).toBe(false)
    const role = await paramsFor('role1')
    expect(role.has('config_id')).toBe(false)
    const scopes = role.get('scope')!.split(',')
    for (const s of PENDING_REVIEW_SCOPES.split(',')) expect(scopes).toContain(s)
    delete process.env.FB_CHAT_ROLE_USER_IDS
  })
})
