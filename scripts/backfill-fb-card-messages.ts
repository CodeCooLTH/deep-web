/**
 * backfill ข้อความที่เคยถูกบันทึกเป็น placeholder เพราะบั๊ก `attachments{type}` (2026-08-07)
 *
 * ที่มา: `fetchThreadMessages` เคยขอฟิลด์ที่ไม่มีอยู่จริง Graph จึงตัด `attachments` ทิ้งเงียบ ๆ
 * แล้วคืน HTTP 200 → การ์ด/ไฟล์แนบทุกใบที่มาทาง backfill กลายเป็น
 * "[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]" (542 แถวบน prod)
 * ดู `docs/conventions/external-payload-schema.md` ข้อ 3
 *
 * สคริปต์นี้ยิง Graph ถามข้อความ "รายใบ" ด้วย mid ที่เก็บไว้ (`fetchMessageContent` — โค้ดตัวจริง
 * จาก repo ไม่ใช่ที่เขียนเลียนแบบ) แล้วเขียนเนื้อหาจริงกลับลงแถวเดิม
 *
 * สำคัญ: dry-run เป็นค่าตั้งต้น — ต้องใส่ `--apply` ถึงจะเขียนจริง
 * สำคัญ: ขอบเขตแคบเสมอ: อัปเดตเฉพาะแถวที่ body ตรงกับ placeholder เป๊ะ ๆ และ rawMessage.source
 *    เป็น 'graph-backfill' เท่านั้น — ไม่แตะข้อความที่คนพิมพ์
 * สำคัญ: รอบนี้ **ไม่ mirror ไฟล์** (ไม่เขียน storage) แถวที่เป็นสื่อจะถูกรายงานไว้ให้ตัดสินแยก
 *
 * ใช้:
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-fb-card-messages.ts
 *   npx dotenv -e <env> -- npx tsx scripts/backfill-fb-card-messages.ts --apply
 */
import { PrismaClient } from '@prisma/client'
import { fetchMessageContent } from '../src/lib/facebook/graph'
import { decryptToken } from '../src/lib/token-crypto'
import { isCallCard, mirrorRemoteImage, CARD_PREFIX } from '../src/services/channel-chat.service'

const PLACEHOLDER = '[ข้อความจากระบบของ Facebook — เปิดดูใน Messenger]'
const BATCH = 4

/**
 * แถวเก่าที่ Meta ส่งการ์ดมาก่อนวันที่เปิดคอลัมน์ `rawMessage` (2026-08-03) — ประกอบใหม่จากฐาน
 * เราไม่ได้เพราะไม่มี payload เก็บไว้ ต้องยิง Graph ถามด้วย mid เอา
 * ค่าพวกนี้มาจากการ query prod จริง ไม่ได้เดา (ดู EXTENSIONS-2026-08-07 E3.1)
 */
const LEGACY_TITLES = ['Audio call', 'Missed call', 'Call request sent', 'Transfer requested', 'ส่งคำขอโทรแล้ว']
// ยังไม่เสร็จ: `--legacy` ยัง **ทำไม่เสร็จ** (user สั่งพักงาน 2026-08-07 แล้วเปลี่ยนไปงานอื่น) — dry-run ดูได้
// แต่ยังขาด 2 อย่างที่ตกลงกันไว้: (1) เลื่อนสายจริงเป็น type='CALL' ด้วย isCallCard()
// (2) mirror รูป 64 ใบเข้า storage. ปิดทาง --apply ไว้ก่อน ไม่งั้นจะเขียนครึ่ง ๆ กลาง ๆ ลง prod
// แล้วรอบต่อไปแยกไม่ออกว่าแถวไหนผ่านมือแล้ว
const LEGACY = process.argv.includes('--legacy')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

/** ล้อ cardText() ใน channel-chat.service.ts — บรรทัดเดียว มีคำนำหน้าเสมอ */
function cardText(a: { title: string | null; subtitle: string | null }): string | null {
  const parts = [a.title, a.subtitle]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.replace(/\s+/g, ' ').trim())
  return parts.length > 0 ? `${CARD_PREFIX} ${parts.join(' — ')}` : null
}

type Outcome = 'card' | 'text' | 'media' | 'still-empty' | 'graph-null' | 'no-token'

/** โหมดสำรวจสื่อ: ไม่เขียนอะไรทั้งสิ้น แค่รายงานว่าถ้าจะ mirror ต้องโหลดอะไรบ้าง */
const MEDIA_SURVEY = process.argv.includes('--media')

// ล้อ allow-list ของ mirrorRemoteImage (S-1) — โฮสต์นอกรายการนี้ mirror ไม่ได้อยู่แล้ว
const ALLOWED_EXACT = new Set(['graph.facebook.com', 'fbcdn.net', 'cdninstagram.com', 'fbsbx.com'])
const ALLOWED_SUFFIX = ['.fbcdn.net', '.cdninstagram.com', '.fbsbx.com']
function hostAllowed(u: string): boolean {
  try {
    const h = new URL(u)
    if (h.protocol !== 'https:') return false
    const n = h.hostname.toLowerCase()
    return ALLOWED_EXACT.has(n) || ALLOWED_SUFFIX.some((s) => n.endsWith(s))
  } catch {
    return false
  }
}

/** เช็คว่า URL ยังโหลดได้จริงไหม โดย**ไม่ดาวน์โหลดทั้งไฟล์** — ขอ byte เดียว */
async function probeUrl(u: string): Promise<{ ok: boolean; status: number; bytes: number | null }> {
  try {
    const res = await fetch(u, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000) })
    const cr = res.headers.get('content-range') // "bytes 0-0/184288"
    const total = cr?.split('/')[1]
    return {
      ok: res.ok,
      status: res.status,
      bytes: total && /^\d+$/.test(total) ? Number(total) : Number(res.headers.get('content-length') ?? '') || null,
    }
  } catch {
    return { ok: false, status: 0, bytes: null }
  }
}

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

async function main() {
  const rows = await prisma.chatMessage.findMany({
    where: {
      externalMessageId: { not: null },
      ...(LEGACY
        ? // แถวที่การ์ดถูกเก็บเป็น "ข้อความดิบ" (title ของ Meta) — ต่างจาก placeholder ตรงที่
          // มันไม่ได้ว่าง แต่ก็ไม่ได้บอกว่ามาจากการ์ด จึงขึ้นเป็นบับเบิลเหมือนคนพิมพ์เอง
          { OR: [{ body: { startsWith: '฿' } }, { body: { in: LEGACY_TITLES } }] }
        : { body: PLACEHOLDER }),
    },
    select: {
      id: true,
      externalMessageId: true,
      createdAt: true,
      body: true,
      type: true,
      conversation: {
        select: { id: true, shopChannel: { select: { accessTokenEnc: true, status: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`พบแถวที่เป็น placeholder ${rows.length} แถว · โหมด ${APPLY ? 'APPLY (เขียนจริง)' : 'DRY-RUN'}\n`)

  const tally: Record<Outcome, number> = {
    card: 0, text: 0, media: 0, 'still-empty': 0, 'graph-null': 0, 'no-token': 0,
  }
  const samples: string[] = []
  const updates: Array<{ id: string; body: string | null; type?: string; imageUrl?: string; name?: string | null; size?: number | null }> = []
  const mediaRows: Array<{
    kind: string
    mime: string | null
    host: string
    allowed: boolean
    reachable: boolean
    status: number
    bytes: number | null
  }> = []

  for (let i = 0; i < rows.length; i += BATCH) {
    await Promise.all(
      rows.slice(i, i + BATCH).map(async (r) => {
        const enc = r.conversation.shopChannel?.accessTokenEnc
        if (!enc || r.conversation.shopChannel?.status !== 'ACTIVE') {
          tally['no-token']++
          return
        }
        const got = await fetchMessageContent(r.externalMessageId!, decryptToken(enc))
        if (!got) {
          tally['graph-null']++
          return
        }

        const media = got.attachments.find((a) => a.kind !== 'template' && !!a.mediaUrl)
        if (media) {
          // รอบนี้ไม่แตะ storage — รายงานไว้ให้ตัดสินแยก
          tally.media++
          if (MEDIA_SURVEY) {
            const allowed = hostAllowed(media.mediaUrl!)
            const probe = allowed ? await probeUrl(media.mediaUrl!) : { ok: false, status: -1, bytes: null }
            mediaRows.push({
              kind: media.kind,
              mime: media.mimeType,
              host: new URL(media.mediaUrl!).hostname,
              allowed,
              reachable: probe.ok,
              status: probe.status,
              bytes: probe.bytes ?? media.size,
            })
          } else if (samples.length < 25) {
            samples.push(`  [สื่อ]  ${media.kind} ${media.mimeType ?? ''}`)
          }
          return
        }

        const body = got.text ?? got.attachments.map(cardText).find((t): t is string => !!t) ?? null
        if (!body) {
          tally['still-empty']++
          return
        }

        tally[got.text ? 'text' : 'card']++
        updates.push({ id: r.id, body })
        if (samples.length < 25) samples.push(`  [${got.text ? 'ข้อความ' : 'การ์ด'}] ${body.slice(0, 90)}`)
      }),
    )
    if ((i / BATCH) % 10 === 0) console.log(`  …ตรวจแล้ว ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  if (MEDIA_SURVEY) {
    const byKind = new Map<string, { n: number; bytes: number }>()
    let unknownSize = 0
    for (const m of mediaRows) {
      const k = `${m.kind} / ${m.mime ?? 'ไม่ระบุ'}`
      const cur = byKind.get(k) ?? { n: 0, bytes: 0 }
      cur.n++
      if (m.bytes) cur.bytes += m.bytes
      else unknownSize++
      byKind.set(k, cur)
    }
    console.log(`\nสำรวจสื่อ ${mediaRows.length} แถว (ไม่ได้ดาวน์โหลดไฟล์ — ขอแค่ byte แรกเพื่อดูขนาด)\n`)
    console.log('แยกตามชนิด:')
    ;[...byKind.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .forEach(([k, v]) => console.log(`  ${String(v.n).padStart(3)} × ${k.padEnd(24)} รวม ${mb(v.bytes)}`))

    const total = mediaRows.reduce((s, m) => s + (m.bytes ?? 0), 0)
    const biggest = Math.max(0, ...mediaRows.map((m) => m.bytes ?? 0))
    console.log('\nสถานะการโหลด:')
    console.log(`  โฮสต์อยู่ใน allow-list   ${mediaRows.filter((m) => m.allowed).length}/${mediaRows.length}`)
    console.log(`  ยังโหลดได้จริง (200/206) ${mediaRows.filter((m) => m.reachable).length}/${mediaRows.length}`)
    console.log(`  โฮสต์ที่เจอ              ${[...new Set(mediaRows.map((m) => m.host))].join(', ')}`)
    const bad = mediaRows.filter((m) => !m.reachable)
    if (bad.length) console.log(`  โหลดไม่ได้: ${bad.map((m) => `HTTP ${m.status}`).join(', ')}`)
    console.log(`\n  ขนาดรวมที่จะเขียนลง storage  ${mb(total)}`)
    console.log(`  ไฟล์ใหญ่สุด                 ${mb(biggest)}${biggest > 25 * 1024 * 1024 ? '  (เกินเพดาน 25MB → จะถูกข้าม)' : ''}`)
    if (unknownSize) console.log(`  ไม่รู้ขนาด ${unknownSize} ไฟล์`)
    console.log('\nโหมดสำรวจ — ไม่มีอะไรถูกเขียนทั้งฐานและ storage')
    return
  }

  // นับข้อความที่ไม่ซ้ำ — ตรวจง่ายกว่าไล่ดูตัวอย่างสุ่ม ว่ามีข้อความแปลกปลอมหลุดเข้ามาไหม
  const byBody = new Map<string, number>()
  // body เป็น null ได้เมื่อเป็นไฟล์แนบที่ mirror สำเร็จ (เนื้อหาอยู่ที่ imageUrl ไม่ใช่ข้อความ)
  updates.forEach((u) => {
    const k = u.body ?? '(ไฟล์แนบ — ไม่มีข้อความ)'
    byBody.set(k, (byBody.get(k) ?? 0) + 1)
  })
  console.log(`\nข้อความที่จะเขียน (ไม่ซ้ำ ${byBody.size} แบบ):`)
  ;[...byBody.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([body, n]) => console.log(`  ${String(n).padStart(4)} × ${body}`))

  console.log('\nตัวอย่างที่ตรวจเจอ (สูงสุด 25):')
  samples.forEach((s) => console.log(s))

  console.log('\nสรุป:')
  console.log(`  การ์ดที่ได้เนื้อหาจริง   ${tally.card}`)
  console.log(`  ข้อความที่ Graph ให้มา   ${tally.text}`)
  console.log(`  เป็นสื่อ (ยังไม่แตะ)     ${tally.media}`)
  console.log(`  Meta ไม่ให้อะไรจริง ๆ    ${tally['still-empty']}`)
  console.log(`  Graph ปฏิเสธ/ลบไปแล้ว    ${tally['graph-null']}`)
  console.log(`  ไม่มี token ที่ใช้ได้     ${tally['no-token']}`)
  console.log(`  → จะอัปเดตทั้งหมด ${updates.length} แถว`)

  if (LEGACY && APPLY) {
    console.log('\n--legacy ยังทำไม่เสร็จ (ดู comment หัวไฟล์) — ปิดทางเขียนจริงไว้ก่อน ไม่มีอะไรถูกเขียน')
    return
  }
  if (!APPLY) {
    console.log('\nDRY-RUN — ไม่มีอะไรถูกเขียน. ใส่ --apply เพื่อเขียนจริง')
    return
  }

  let done = 0
  for (const u of updates) {
    // scope แคบ: ผูก id + ยืนยันว่า body ยังเป็น placeholder เดิม (กันชนกับ webhook ที่อาจเขียนแทรก)
    done += (
      await prisma.chatMessage.updateMany({
        where: { id: u.id, body: PLACEHOLDER },
        data: { body: u.body },
      })
    ).count
  }
  console.log(`\nเขียนจริงแล้ว ${done} แถว`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
