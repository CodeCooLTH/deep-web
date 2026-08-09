// shop-video.service.test.ts — ล็อกกติกาของ "รูปปกคลิปต้องไม่หายไปเอง"
//
// ทำไมต้องมีเทส: ทุกความล้มเหลวในไฟล์นี้เป็นความล้มเหลว **เงียบ** ทั้งหมด
//   - mirror ซ้ำทุกครั้งที่กดบันทึก → ไฟล์ขยะกองในสตอเรจ ไม่มี error ไม่มีใครเห็น
//   - ลืม resolve mirroredFileId → หน้าจอกลับไปอ่าน URL ของ Meta ที่หมดอายุใน ~4 วัน แล้ว
//     กริดคลิปกลายเป็นช่องเทาเปล่า โดย tsc/build/หน้าจอตอนเดฟ ผ่านหมด (URL ยังไม่หมดอายุ)
//   - mirror ล้มแล้ว throw → ร้านบันทึกคลิปไม่ได้เลย ทั้งที่แค่ CDN ตอบช้า
//
// [blocker] แดงเมื่อไหร่ห้าม merge — ไม่มีชั้นอื่นในระบบที่จับสามข้อนี้ได้

import { describe, expect, it, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
const deleteMany = vi.fn()
const createMany = vi.fn()
const mirrorRemoteImage = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    shopVideo: {
      findMany: (...a: unknown[]) => findMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
      createMany: (...a: unknown[]) => createMany(...a),
    },
    // replaceShopVideos ห่อ delete+create ไว้ในทรานแซกชัน — ให้ callback ได้ client ตัวเดียวกัน
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({ shopVideo: { deleteMany, createMany } }),
  },
}))

vi.mock('@/services/channel-chat.service', () => ({
  mirrorRemoteImage: (...a: unknown[]) => mirrorRemoteImage(...a),
}))

const { replaceShopVideos, getShopVideos } = await import('./shop-video.service')

const SHOP = 'shop-1'
const clip = (videoId: string, thumbnailUrl: string | null = 'https://scontent.fbcdn.net/a.jpg') => ({
  provider: 'FACEBOOK',
  videoId,
  thumbnailUrl,
})

beforeEach(() => {
  findMany.mockReset()
  deleteMany.mockReset()
  createMany.mockReset()
  mirrorRemoteImage.mockReset()
})

describe('replaceShopVideos', () => {
  it('[blocker] คลิปที่เคย mirror แล้ว ต้องไม่ mirror ซ้ำตอนกดบันทึกอีกรอบ', async () => {
    const mirroredAt = new Date('2026-08-01T00:00:00Z')
    findMany.mockResolvedValue([
      { provider: 'FACEBOOK', videoId: 'v1', mirroredFileId: 'file-1', mirroredAt },
    ])

    await replaceShopVideos(SHOP, [clip('v1')])

    expect(mirrorRemoteImage).not.toHaveBeenCalled()
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      videoId: 'v1',
      mirroredFileId: 'file-1',
      mirroredAt,
    })
  })

  it('[blocker] คลิปใหม่ต้องถูก mirror และเก็บ fileId ลงแถว', async () => {
    findMany.mockResolvedValue([])
    mirrorRemoteImage.mockResolvedValue('file-new')

    await replaceShopVideos(SHOP, [clip('v2')])

    expect(mirrorRemoteImage).toHaveBeenCalledWith('https://scontent.fbcdn.net/a.jpg')
    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      videoId: 'v2',
      mirroredFileId: 'file-new',
    })
  })

  it('[blocker] mirror ล้ม ต้องยังบันทึกได้ โดยเหลือ thumbnailUrl ของ Meta เป็น fallback', async () => {
    findMany.mockResolvedValue([])
    mirrorRemoteImage.mockResolvedValue(null)

    await expect(replaceShopVideos(SHOP, [clip('v3')])).resolves.toBeUndefined()

    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      videoId: 'v3',
      mirroredFileId: null,
      thumbnailUrl: 'https://scontent.fbcdn.net/a.jpg',
    })
  })

  it('คลิปที่ไม่มีรูปปกเลย ไม่ต้องยิง mirror', async () => {
    findMany.mockResolvedValue([])

    await replaceShopVideos(SHOP, [clip('v4', null)])

    expect(mirrorRemoteImage).not.toHaveBeenCalled()
  })
})

describe('getShopVideos', () => {
  it('[blocker] mirroredFileId ต้องชนะ URL ของ Meta เสมอ', async () => {
    findMany.mockResolvedValue([
      {
        id: 'r1',
        provider: 'FACEBOOK',
        videoId: 'v1',
        caption: null,
        thumbnailUrl: 'https://scontent.fbcdn.net/expired.jpg',
        mirroredFileId: '2026/08/09/abc.jpg',
        accountName: null,
        likeCount: null,
        commentCount: null,
        viewCount: null,
        sortOrder: 0,
      },
    ])

    const [row] = await getShopVideos(SHOP)
    expect(row.thumbnailUrl).toBe('/api/files/2026/08/09/abc.jpg')
    // ไม่รั่ว storage key ดิบข้าม RSC boundary ไปให้ client เดา fallback เองซ้ำ
    expect(row).not.toHaveProperty('mirroredFileId')
  })

  it('ยังไม่ได้ mirror → ใช้ URL ของ Meta ต่อไป (แถวเก่าก่อน migration)', async () => {
    findMany.mockResolvedValue([
      {
        id: 'r2',
        provider: 'FACEBOOK',
        videoId: 'v2',
        caption: null,
        thumbnailUrl: 'https://scontent.fbcdn.net/still-alive.jpg',
        mirroredFileId: null,
        accountName: null,
        likeCount: null,
        commentCount: null,
        viewCount: null,
        sortOrder: 0,
      },
    ])

    const [row] = await getShopVideos(SHOP)
    expect(row.thumbnailUrl).toBe('https://scontent.fbcdn.net/still-alive.jpg')
  })
})
