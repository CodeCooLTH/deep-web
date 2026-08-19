/**
 * backfill รูปปกโพสต์ในกล่องแชทความคิดเห็น (feature 00029/00038 ส่วนขยาย 2026-08-09)
 *
 * ที่มา (user report พร้อมภาพหน้าจอ): รูปปกในรายการซ้ายของ `/inbox/comments` ทยอยกลายเป็น
 * **กล่องขาวเปล่า** โดยโพสต์อายุ 4 วันยังมีรูป ส่วนใบ 5 วันหายหมด — `FacebookPost.thumbnailUrl`
 * เก็บ URL ของ fbcdn ดิบซึ่งหมดอายุ ~4 วัน (คลาสเดียวกับ `ShopVideo` และการ์ด carousel ในแชท
 * ที่ปิดไปแล้วคนละรอบ หน้านี้เป็นที่สุดท้ายที่ยังเก็บ URL ดิบ)
 *
 * โค้ดฝั่ง ingest ถูกแก้ให้ mirror ตั้งแต่ตอนสร้างแถวแล้ว — สคริปต์นี้มีไว้เก็บ **ของเก่า**
 * ที่ URL หมดอายุไปแล้ว ซึ่ง mirror จากค่าที่เก็บไว้ไม่ได้ (มันตอบ 403) จึงต้อง
 * **ขอ URL ใหม่จาก Graph ก่อนทุกใบ** แล้วค่อย mirror
 *
 * เดินซ้ำเส้นทางเดียวกับ ingest จริง (`fetchPostMeta` + `mirrorRemoteImage` ตัวจริงจาก repo
 * ไม่ใช่โค้ดเลียนแบบ) — ถ้าวันหน้าเส้นทางจริงเปลี่ยน สคริปต์นี้จะเปลี่ยนตาม
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: เขียนเฉพาะ `mirroredFileId`/`mirroredAt`/`thumbnailUrl` ของ FacebookPost เท่านั้น
 *    ไม่แตะ message/permalink/ยอด engagement (ค่าพวกนั้นมีเส้นทางอัปเดตของตัวเองอยู่แล้ว)
 * สำคัญ: ข้ามแถวที่มี `mirroredFileId` แล้วเสมอ — idempotent รันซ้ำได้ไม่เปลืองโควตา Graph
 *    และไม่ทับสำเนาที่ 00035 (ปุ่ม "เพิ่มลงหน้าร้าน") เคยเขียนไว้
 *
 * ใช้:
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-post-thumbnails.ts
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-post-thumbnails.ts --apply
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-post-thumbnails.ts --apply --limit 50
 */
import { PrismaClient } from '@prisma/client'
import { fetchPostMeta } from '../src/lib/facebook/graph'
import { decryptToken } from '../src/lib/token-crypto'
import { mirrorRemoteImage } from '../src/services/channel-chat.service'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
/** ยิงทีละน้อยกัน rate limit ของ Graph — เส้นทางปกติยิงทีละโพสต์อยู่แล้ว สคริปต์ไม่ควรแรงกว่า */
const BATCH = 4

async function main() {
  const posts = await prisma.facebookPost.findMany({
    // ยังไม่มีสำเนา = ตัวที่เสี่ยงจะกลายเป็นกล่องเปล่า ไม่ว่าตอนนี้ URL จะยังใช้ได้อยู่หรือไม่
    where: { mirroredFileId: null },
    orderBy: { lastCommentAt: 'desc' },
    select: {
      id: true,
      externalPostId: true,
      thumbnailUrl: true,
      createdTime: true,
      channel: { select: { name: true, accessTokenEnc: true, status: true, shopId: true } },
    },
  })

  const targets = posts.slice(0, LIMIT === Infinity ? undefined : LIMIT)
  console.log(
    `[backfill-post-thumbnails] โพสต์ที่ยังไม่มีสำเนา ${posts.length} ใบ · จะทำรอบนี้ ${targets.length} ใบ · ${
      APPLY ? 'APPLY (เขียนจริง)' : 'DRY-RUN (ไม่เขียน)'
    }`,
  )

  let mirrored = 0
  let noPicture = 0
  let failed = 0
  let skippedChannel = 0

  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (post) => {
        if (post.channel.status !== 'ACTIVE') {
          skippedChannel += 1
          return
        }
        let token: string
        try {
          token = decryptToken(post.channel.accessTokenEnc)
        } catch {
          skippedChannel += 1
          return
        }

        // 🛑 ต้องขอ URL ใหม่เสมอ ห้าม mirror จาก post.thumbnailUrl ที่เก็บไว้ — ใบที่สคริปต์นี้
        // มีไว้แก้ คือใบที่ URL เดิมหมดอายุไปแล้วพอดี (mirror จะได้ 403 แล้วคืน null เงียบ ๆ)
        const meta = await fetchPostMeta(post.externalPostId, token)
        if (!meta?.picture) {
          noPicture += 1
          console.log(`  - ${post.externalPostId} : ไม่มีรูปให้ดึง (โพสต์ข้อความล้วน/ถูกลบ/สิทธิ์ไม่พอ)`)
          return
        }

        if (!APPLY) {
          console.log(`  ~ ${post.externalPostId} : จะ mirror จาก ${meta.picture.slice(0, 80)}…`)
          mirrored += 1
          return
        }

        // feature 00051 (S-6): signature เปลี่ยนเป็น options-object บังคับ shopId — ใช้ shopId ของ
        // เจ้าของโพสต์ (post.channel.shopId) ตัวเดียวกับที่ ingest จริงใช้ ไม่ใช่เดา/ผูกร้านอื่น
        const fileId = await mirrorRemoteImage(meta.picture, { shopId: post.channel.shopId })
        if (!fileId) {
          failed += 1
          console.log(`  ! ${post.externalPostId} : mirror ไม่สำเร็จ (ดึงรูปไม่ได้/ไฟล์ใหญ่เกิน)`)
          return
        }
        await prisma.facebookPost.update({
          where: { id: post.id },
          // อัปเดต thumbnailUrl ด้วย เพราะค่าที่เพิ่งได้จาก Graph สดกว่าของเดิมเสมอ — เป็นกิ่ง
          // fallback ให้ resolvePostThumbnail ใช้ถ้าไฟล์ใน storage มีปัญหาภายหลัง
          data: { mirroredFileId: fileId, mirroredAt: new Date(), thumbnailUrl: meta.picture },
        })
        mirrored += 1
        console.log(`  ✓ ${post.externalPostId} : ${fileId}`)
      }),
    )
  }

  console.log(
    `\n[backfill-post-thumbnails] สรุป — mirror ${APPLY ? 'สำเร็จ' : '(จะทำ)'} ${mirrored} · ` +
      `ไม่มีรูป ${noPicture} · ล้มเหลว ${failed} · ข้ามเพราะ channel ใช้ไม่ได้ ${skippedChannel}`,
  )
  if (!APPLY) console.log('ยังไม่ได้เขียนอะไรลงฐาน — ใส่ --apply เมื่อพร้อม')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
