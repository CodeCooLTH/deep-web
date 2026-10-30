// QA guard (00086 retro) — กันการยิงออกภายนอก (push มือถือ / Messenger / LINE / IG) จาก dev server ตอน browser QA
//
// ทำไม: ฐาน local 5434 copy มาจากข้อมูลจริง มี Expo push token จริงของเจ้าของ/ผู้จัดการร้านจริง
// ปุ่มที่เรียก pushToUsers หรือส่งข้อความอัตโนมัติจะเด้งถึงมือถือ/แชทของคนจริง ถ้าไม่กันไว้
//
// ใช้: NODE_OPTIONS="--require ./scripts/qa-block-external.cjs" DATABASE_URL=... DIRECT_URL=... npx next dev ...
// ทุกคำขอที่ถูกกันจะถูกบันทึกที่ $TMPDIR/qa-blocked-external.log และตอบกลับ 503 (โค้ดเดินทาง "ส่งไม่สำเร็จ" ปกติ)
const fs = require('fs')
const os = require('os')
const path = require('path')

const LOG = path.join(os.tmpdir(), 'qa-blocked-external.log')
const BLOCK = /exp\.host|graph\.facebook\.com|api\.line\.me|api-data\.line\.me|notify-api\.line\.me|graph\.instagram\.com|fcm\.googleapis|onesignal|tiktok/i

const orig = globalThis.fetch
if (orig) {
  globalThis.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && (input.url || input.href)) || String(input)
    if (BLOCK.test(url)) {
      let body = ''
      try { body = typeof init?.body === 'string' ? init.body.slice(0, 600) : '' } catch {}
      fs.appendFileSync(LOG, `${new Date().toISOString()} BLOCKED ${init?.method || 'GET'} ${url} ${body}\n`)
      return new Response(JSON.stringify({ data: [], blockedByQA: true }), { status: 503, headers: { 'content-type': 'application/json' } })
    }
    return orig.apply(this, arguments)
  }
}
fs.appendFileSync(LOG, `${new Date().toISOString()} guard loaded pid=${process.pid}\n`)
