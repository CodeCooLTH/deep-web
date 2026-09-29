import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  fu: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  convFindFirst: vi.fn(),
  convFindMany: vi.fn(),
  shopFindMany: vi.fn(),
  userFindMany: vi.fn(),
  expandClusters: vi.fn(),
  clusterKeysOf: vi.fn(),
  conversationsByClusterKeys: vi.fn(),
  openRowsByAnchor: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    customerFollowUp: m.fu,
    conversation: { findFirst: m.convFindFirst, findMany: m.convFindMany },
    shop: { findMany: m.shopFindMany },
    user: { findMany: m.userFindMany },
  },
}))
vi.mock('../follow-up-scope', () => ({
  expandClusters: m.expandClusters,
  clusterKeysOf: m.clusterKeysOf,
  conversationsByClusterKeys: m.conversationsByClusterKeys,
  openRowsByAnchor: m.openRowsByAnchor,
  conversationIdsByClusterTags: vi.fn(),
}))

import {
  AssigneeNotMemberError,
  FollowUpDueError,
  FollowUpNotFoundError,
  FollowUpStateError,
  completeFollowUp,
  setFollowUpOutcome,
  countsForConversations,
  conversationIdsByFollowUpState,
  createFollowUp,
  deleteFollowUp,
  followUpStateCounts,
  listCalendarMonth,
  listForConversation,
  reopenFollowUp,
  snoozeFollowUp,
  tallyBoard,
  updateFollowUp,
} from '../customer-follow-up.service'

// 2026-09-30 10:00 ไทย = 03:00Z
const NOW = new Date('2026-09-30T03:00:00.000Z')
const SHOP = 's1'
const ME = 'u-me'

const row = (o: Record<string, unknown> = {}) => ({
  id: 'f1',
  shopId: SHOP,
  conversationId: 'c1',
  type: 'FOLLOW_UP',
  title: 't',
  note: null,
  dueAt: new Date('2026-10-05T03:00:00.000Z'),
  allDay: false,
  assigneeUserId: ME,
  status: 'OPEN',
  outcome: null,
  doneAt: null,
  doneByUserId: null,
  snoozeCount: 0,
  createdByUserId: ME,
  remindedFor: null,
  remindedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...o,
})

function shops(kind: 'PERSONAL' | 'BUSINESS', members: string[] = []) {
  m.shopFindMany.mockResolvedValue([
    { id: SHOP, shopName: 'ร้าน', kind, userId: ME, members: members.map((userId) => ({ userId })) },
  ])
}

beforeEach(() => {
  vi.resetAllMocks()
  m.userFindMany.mockResolvedValue([])
  m.convFindMany.mockResolvedValue([])
  shops('BUSINESS', ['u-staff'])
  m.fu.findFirst.mockResolvedValue(row())
})

describe('createFollowUp', () => {
  it('ห้องไม่ใช่ของร้านนี้ → NotFound และไม่เขียน', async () => {
    m.convFindFirst.mockResolvedValue(null)
    await expect(
      createFollowUp(ME, SHOP, 'c-other', { title: 'x', date: '2026-10-01', time: '10:00' }, NOW),
    ).rejects.toBeInstanceOf(FollowUpNotFoundError)
    expect(m.fu.create).not.toHaveBeenCalled()
    expect(m.convFindFirst.mock.calls[0][0].where).toMatchObject({ id: 'c-other', shopId: SHOP })
  })
  it('ผู้รับไม่ใช่สมาชิก → AssigneeNotMember ก่อนเขียน', async () => {
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    await expect(
      createFollowUp(ME, SHOP, 'c1', { title: 'x', date: '2026-10-01', time: '10:00', assigneeUserId: 'stranger' }, NOW),
    ).rejects.toBeInstanceOf(AssigneeNotMemberError)
    expect(m.fu.create).not.toHaveBeenCalled()
  })
  it('ร้าน PERSONAL: สมาชิกใน ShopMember ก็ไม่ผ่าน มีแต่เจ้าของ', async () => {
    shops('PERSONAL', ['u-staff']) // ข้อมูลผิดปกติ: มีแถวสมาชิกในร้านส่วนตัว — ต้องไม่นับ
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    await expect(
      createFollowUp(ME, SHOP, 'c1', { title: 'x', date: '2026-10-01', time: null, assigneeUserId: 'u-staff' }, NOW),
    ).rejects.toBeInstanceOf(AssigneeNotMemberError)
  })
  it('ไม่เลือกผู้รับ = ผู้สร้าง · เวลาในอนาคต → remindedFor null · ใส่ shopId ในข้อมูล', async () => {
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    m.fu.create.mockResolvedValue(row())
    await createFollowUp(ME, SHOP, 'c1', { title: ' x ', date: '2026-10-01', time: '10:00' }, NOW)
    const data = m.fu.create.mock.calls[0][0].data
    expect(data).toMatchObject({ shopId: SHOP, assigneeUserId: ME, createdByUserId: ME, title: 'x', remindedFor: null })
  })
  it('ตั้งเวลาย้อนหลัง → remindedFor = fireAt (กัน push ทันที)', async () => {
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    m.fu.create.mockResolvedValue(row())
    // 09:00 ไทยวันนี้ = 02:00Z ผ่านแล้ว (NOW = 10:00 ไทย)
    await createFollowUp(ME, SHOP, 'c1', { title: 'x', date: '2026-09-30', time: '09:00' }, NOW)
    expect(m.fu.create.mock.calls[0][0].data.remindedFor).toEqual(new Date('2026-09-30T02:00:00.000Z'))
  })
  it('วันไม่มีจริง → FollowUpDueError', async () => {
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    await expect(
      createFollowUp(ME, SHOP, 'c1', { title: 'x', date: '2026-02-30', time: null }, NOW),
    ).rejects.toBeInstanceOf(FollowUpDueError)
  })
  it('FK พัง (P2003) → AssigneeNotMember', async () => {
    m.convFindFirst.mockResolvedValue({ id: 'c1' })
    m.fu.create.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }))
    await expect(
      createFollowUp(ME, SHOP, 'c1', { title: 'x', date: '2026-10-01', time: null }, NOW),
    ).rejects.toBeInstanceOf(AssigneeNotMemberError)
  })
})

describe('completeFollowUp', () => {
  it('เขียนเฉพาะแถว OPEN ใน where (ซ้ำไม่ทับผู้ปิด) และ scope ร้าน', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    m.fu.findFirst.mockResolvedValue(row({ status: 'DONE' }))
    await completeFollowUp('u-2', [SHOP], 'f1', 'REACHED', NOW)
    const arg = m.fu.updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'f1', shopId: { in: [SHOP] }, status: 'OPEN' })
    expect(arg.data).toMatchObject({ status: 'DONE', outcome: 'REACHED', doneByUserId: 'u-2', doneAt: NOW })
  })
  it('count=0 และแถวเป็น DONE แล้ว → คืนแถวเดิม ไม่ throw', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 0 })
    m.fu.findFirst.mockResolvedValue(row({ status: 'DONE', doneByUserId: 'first' }))
    const dto = await completeFollowUp('u-2', [SHOP], 'f1', null, NOW)
    expect(dto.status).toBe('DONE')
  })
  it('ไม่มีแถว/ร้านอื่น → NotFound', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 0 })
    m.fu.findFirst.mockResolvedValue(null)
    await expect(completeFollowUp('u', [SHOP], 'x', null, NOW)).rejects.toBeInstanceOf(FollowUpNotFoundError)
  })
})

describe('setFollowUpOutcome', () => {
  it('[blocker] เขียนเฉพาะ outcome บนแถว DONE ใน scope ร้าน — ไม่แตะ doneAt/doneByUserId', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    m.fu.findFirst.mockResolvedValue(row({ status: 'DONE', outcome: 'REACHED' }))
    await setFollowUpOutcome([SHOP], 'f1', 'REACHED', NOW)
    const a = m.fu.updateMany.mock.calls[0][0]
    expect(a.where).toEqual({ id: 'f1', shopId: { in: [SHOP] }, status: 'DONE' })
    expect(a.data).toEqual({ outcome: 'REACHED' })
  })
  it('รายการยังเปิดอยู่ → StateError (ห้ามผลโผล่บนรายการ OPEN)', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 0 })
    m.fu.findFirst.mockResolvedValue({ status: 'OPEN' })
    await expect(setFollowUpOutcome([SHOP], 'f1', 'REACHED', NOW)).rejects.toBeInstanceOf(FollowUpStateError)
  })
  it('ไม่มีแถว/ร้านอื่น → NotFound', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 0 })
    m.fu.findFirst.mockResolvedValue(null)
    await expect(setFollowUpOutcome([SHOP], 'x', 'REACHED', NOW)).rejects.toBeInstanceOf(FollowUpNotFoundError)
  })
})

describe('reopen / snooze / delete', () => {
  it('reopen ล้างผลปิดทั้งชุด + จำกัดที่ status DONE', async () => {
    m.fu.findFirst.mockResolvedValue(row({ status: 'DONE', doneAt: NOW, outcome: 'REACHED', doneByUserId: 'u' }))
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    await reopenFollowUp([SHOP], 'f1', NOW)
    const a = m.fu.updateMany.mock.calls[0][0]
    expect(a.where.status).toBe('DONE')
    expect(a.data).toMatchObject({ status: 'OPEN', outcome: null, doneAt: null, doneByUserId: null })
  })
  it('reopen แถวที่เปิดอยู่แล้ว → ไม่เขียน', async () => {
    await reopenFollowUp([SHOP], 'f1', NOW)
    expect(m.fu.updateMany).not.toHaveBeenCalled()
  })
  it('snooze เฉพาะ OPEN · เพิ่ม snoozeCount · re-arm remindedFor', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    await snoozeFollowUp([SHOP], 'f1', { preset: 'IN_3_DAYS' }, NOW)
    const a = m.fu.updateMany.mock.calls[0][0]
    expect(a.where).toEqual({ id: 'f1', shopId: { in: [SHOP] }, status: 'OPEN' })
    expect(a.data.snoozeCount).toEqual({ increment: 1 })
    expect(a.data.remindedFor).toBeNull()
  })
  it('snooze ตอน DONE → StateError · ไม่มีแถว → NotFound', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 0 })
    m.fu.findFirst.mockResolvedValueOnce({ status: 'DONE' })
    await expect(snoozeFollowUp([SHOP], 'f1', { preset: 'NEXT_WEEK' }, NOW)).rejects.toBeInstanceOf(FollowUpStateError)
    m.fu.findFirst.mockResolvedValueOnce(null)
    await expect(snoozeFollowUp([SHOP], 'f1', { preset: 'NEXT_WEEK' }, NOW)).rejects.toBeInstanceOf(FollowUpNotFoundError)
  })
  it('delete: count=0 → NotFound · where มี shopId', async () => {
    m.fu.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deleteFollowUp([SHOP], 'f1')).rejects.toBeInstanceOf(FollowUpNotFoundError)
    expect(m.fu.deleteMany.mock.calls[0][0].where).toEqual({ id: 'f1', shopId: { in: [SHOP] } })
  })
})

describe('updateFollowUp', () => {
  it('ปิดแล้วแก้ชนิด/เวลา/ผู้รับ → StateError · แก้หัวข้อ/โน้ตได้', async () => {
    m.fu.findFirst.mockResolvedValue(row({ status: 'DONE' }))
    await expect(updateFollowUp([SHOP], 'f1', { type: 'OTHER' }, NOW)).rejects.toBeInstanceOf(FollowUpStateError)
    await expect(updateFollowUp([SHOP], 'f1', { date: '2026-10-02', time: null }, NOW)).rejects.toBeInstanceOf(FollowUpStateError)
    await expect(updateFollowUp([SHOP], 'f1', { assigneeUserId: 'u-staff' }, NOW)).rejects.toBeInstanceOf(FollowUpStateError)
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    await updateFollowUp([SHOP], 'f1', { title: 'ใหม่', note: null }, NOW)
    expect(m.fu.updateMany.mock.calls[0][0].data).toEqual({ title: 'ใหม่', note: null })
  })
  it('แก้เวลา → คำนวณใหม่ + reset remindedFor · ไม่แตะ snoozeCount', async () => {
    m.fu.updateMany.mockResolvedValue({ count: 1 })
    await updateFollowUp([SHOP], 'f1', { date: '2026-10-09', time: '15:30' }, NOW)
    const d = m.fu.updateMany.mock.calls[0][0].data
    expect(d.dueAt).toEqual(new Date('2026-10-09T08:30:00.000Z'))
    expect(d.allDay).toBe(false)
    expect(d.remindedFor).toBeNull()
    expect(d).not.toHaveProperty('snoozeCount')
  })
  it('time โดยไม่มี date → DueError', async () => {
    await expect(updateFollowUp([SHOP], 'f1', { time: '10:00' }, NOW)).rejects.toBeInstanceOf(FollowUpDueError)
  })
  it('ผู้รับใหม่ต้องเป็นสมาชิก', async () => {
    await expect(updateFollowUp([SHOP], 'f1', { assigneeUserId: 'stranger' }, NOW)).rejects.toBeInstanceOf(AssigneeNotMemberError)
    expect(m.fu.updateMany).not.toHaveBeenCalled()
  })
  it('ไม่พบแถวใน scope → NotFound', async () => {
    m.fu.findFirst.mockResolvedValue(null)
    await expect(updateFollowUp([SHOP], 'f1', { title: 'x' }, NOW)).rejects.toBeInstanceOf(FollowUpNotFoundError)
  })
})

describe('listForConversation', () => {
  it('ห้องไม่อยู่ในร้าน (expand ว่าง) → NotFound', async () => {
    m.expandClusters.mockResolvedValue(new Map())
    await expect(listForConversation('c-x', SHOP, NOW)).rejects.toBeInstanceOf(FollowUpNotFoundError)
  })
  it('query รายการมี shopId + conversationId ของ cluster · ห้องอื่นได้ room label', async () => {
    m.expandClusters.mockResolvedValue(new Map([['c1', ['c1', 'c2']]]))
    m.fu.findMany.mockResolvedValueOnce([row(), row({ id: 'f2', conversationId: 'c2' })]).mockResolvedValueOnce([])
    m.convFindMany.mockResolvedValue([
      { id: 'c1', channel: 'MESSENGER', alias: 'พี่เอ', buyer: null, externalContact: null, shopChannel: { name: 'เพจ A' } },
      { id: 'c2', channel: 'LINE', alias: null, buyer: null, externalContact: { name: 'x', avatarUrl: null }, shopChannel: { name: 'OA B' } },
    ])
    const r = await listForConversation('c1', SHOP, NOW)
    expect(m.fu.findMany.mock.calls[0][0].where).toMatchObject({ shopId: SHOP, conversationId: { in: ['c1', 'c2'] }, status: 'OPEN' })
    expect(r.open[0].room).toBeNull()
    expect(r.open[1].room).toMatchObject({ id: 'c2', label: 'OA B' })
    expect(r.openCount).toBe(2)
  })
})

describe('ตัวนับ', () => {
  it('countsForConversations: ทุก id ได้ค่า (ไม่มีรายการ = 0/0) และนับ late ด้วย isOverdue', async () => {
    m.openRowsByAnchor.mockResolvedValue([
      { anchor: 'a', status: 'OPEN', dueAt: new Date('2026-09-29T03:00:00.000Z'), allDay: false }, // เลย
      { anchor: 'a', status: 'OPEN', dueAt: new Date('2026-10-05T03:00:00.000Z'), allDay: false },
    ])
    const r = await countsForConversations(['a', 'b'], [SHOP], NOW)
    expect(r.get('a')).toEqual({ open: 2, late: 1 })
    expect(r.get('b')).toEqual({ open: 0, late: 0 })
  })
  it('conversationIdsByFollowUpState + followUpStateCounts: cluster เป็นตัวตัดสิน', async () => {
    // k1: มี OPEN เลยกำหนด → late · k2: OPEN ยังไม่เลย → upcoming · k3: DONE อย่างเดียว → done
    m.fu.findMany
      .mockResolvedValueOnce([
        { conversationId: 'c1', status: 'OPEN', dueAt: new Date('2026-09-29T03:00:00.000Z'), allDay: false },
        { conversationId: 'c2', status: 'OPEN', dueAt: new Date('2026-10-05T03:00:00.000Z'), allDay: false },
      ])
      .mockResolvedValueOnce([{ conversationId: 'c3' }])
    m.clusterKeysOf.mockResolvedValue(new Map([['c1', 'k1'], ['c2', 'k2'], ['c3', 'k3']]))
    m.conversationsByClusterKeys.mockImplementation(async (keys: string[]) =>
      keys.flatMap((k) => (k === 'k1' ? [{ id: 'c1', k }, { id: 'c1b', k }] : [{ id: 'c-' + k, k }])),
    )
    const ids = await conversationIdsByFollowUpState([SHOP], ['late'], NOW)
    expect(m.conversationsByClusterKeys.mock.calls[0][0]).toEqual(['k1'])
    expect(ids).toEqual(['c1', 'c1b'])

    m.fu.findMany
      .mockResolvedValueOnce([
        { conversationId: 'c1', status: 'OPEN', dueAt: new Date('2026-09-29T03:00:00.000Z'), allDay: false },
        { conversationId: 'c2', status: 'OPEN', dueAt: new Date('2026-10-05T03:00:00.000Z'), allDay: false },
      ])
      .mockResolvedValueOnce([{ conversationId: 'c3' }])
    expect(await followUpStateCounts([SHOP], NOW)).toEqual({ late: 2, upcoming: 1, done: 1 })
  })
  it('tallyBoard: ผู้รับที่ถูกถอดถือเป็น "ยังไม่มีคนรับ" ไม่นับเข้า byUser', () => {
    const shopsMap = new Map([[SHOP, { id: SHOP, name: '', kind: 'BUSINESS', ownerId: ME, memberIds: new Set([ME]) }]])
    const rows = [row(), row({ id: 'f2', assigneeUserId: 'removed' }), row({ id: 'f3', assigneeUserId: null })]
    const c = tallyBoard(rows as never, 4, shopsMap, NOW)
    expect(c.byUser).toEqual({ [ME]: 1 })
    expect(c.unassigned).toBe(2)
    expect(c.done7d).toBe(4)
    expect(c.week).toBe(3)
  })
})

describe('listCalendarMonth — ตัวกรองอยู่ใน where (เพดานตัดหลังกรอง)', () => {
  const base = { shopIds: [SHOP], userId: ME, month: '2026-10' }
  it('mine/assignee → assigneeUserId ใน where ไม่ใช่กรองหลังดึง', async () => {
    m.fu.findMany.mockResolvedValue([])
    await listCalendarMonth({ ...base, mine: true }, NOW)
    const w = m.fu.findMany.mock.calls[0][0].where
    expect(w).toMatchObject({ shopId: { in: [SHOP] }, assigneeUserId: ME })
    expect(m.fu.findMany.mock.calls[0][0].take).toBe(1001)
  })
  it('unassigned → OR ต่อร้าน: null หรือไม่อยู่ในสมาชิกปัจจุบัน', async () => {
    m.fu.findMany.mockResolvedValue([])
    await listCalendarMonth({ ...base, assignee: 'unassigned' }, NOW)
    const w = m.fu.findMany.mock.calls[0][0].where
    expect(w.OR).toEqual([
      { shopId: SHOP, OR: [{ assigneeUserId: null }, { assigneeUserId: { notIn: [ME, 'u-staff'] } }] },
    ])
  })
  it('เกินเพดาน → คืน 1000 + truncated', async () => {
    m.fu.findMany.mockResolvedValue(Array.from({ length: 1001 }, (_, i) => row({ id: 'f' + i })))
    const r = await listCalendarMonth({ ...base }, NOW)
    expect(r.items).toHaveLength(1000)
    expect(r.truncated).toBe(true)
  })
})
