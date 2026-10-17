/**
 * auto-notify-config.service — ตั้งค่าแจ้งลูกค้าอัตโนมัติของร้าน (00078 S-9, S-28 · API.md §4)
 *
 * ทำไมเขียนด้วย SQL เดียว: enabledAt คือ "เวลาเริ่มนับ" ที่ตัวส่งใช้แยกออเดอร์เก่า/ใหม่ (A-12)
 * read-then-write สองคนกดพร้อมกันจะรีเซ็ต enabledAt ของคนที่เปิดอยู่แล้ว
 */
import { prisma } from '@/lib/prisma'
import { can, type ShopRole } from '@/lib/shop-permissions'
import { AUTO_NOTIFY_DAILY_CAP, type AutoNotifyKind } from '@/lib/auto-notify/ledger-constants'
import { isKindAvailable, kindsForVertical } from '@/lib/auto-notify/kinds'
import { DEFAULT_TEMPLATES } from '@/lib/auto-notify/defaults'
import { TEMPLATE_VARIABLES, validateTemplate, type TemplateIssue } from '@/lib/auto-notify/variables'

export class AutoNotifyKindNotAvailableError extends Error {
  constructor(public kind: string) {
    super(`KIND_NOT_AVAILABLE:${kind}`)
    this.name = 'AutoNotifyKindNotAvailableError'
  }
}
export class AutoNotifyTemplateConflictError extends Error {
  constructor(public currentUpdatedAt: Date | null) {
    super('TEMPLATE_CONFLICT')
    this.name = 'AutoNotifyTemplateConflictError'
  }
}
export class AutoNotifyTemplateInvalidError extends Error {
  constructor(public issues: TemplateIssue[]) {
    super('TEMPLATE_INVALID')
    this.name = 'AutoNotifyTemplateInvalidError'
  }
}

type Who = { name: string } | null
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const who = (u: { displayName: string } | null | undefined): Who => (u ? { name: u.displayName } : null)

async function verticalOf(shopId: string): Promise<string> {
  const s = await prisma.shop.findUnique({ where: { id: shopId }, select: { vertical: true } })
  return s?.vertical ?? ''
}

async function assertAvailable(shopId: string, kind: AutoNotifyKind) {
  if (!isKindAvailable(await verticalOf(shopId), kind)) throw new AutoNotifyKindNotAvailableError(kind)
}

export async function getAutoNotifySettings(shopId: string, roles: readonly ShopRole[]) {
  const vertical = await verticalOf(shopId)
  const kinds = kindsForVertical(vertical)
  const by = { select: { displayName: true } }
  const [cfg, switches, templates] = await Promise.all([
    prisma.autoNotifyConfig.findUnique({ where: { shopId }, select: { dailyCapPerRoom: true } }),
    prisma.autoNotifySwitch.findMany({ where: { shopId, kind: { in: [...kinds] } }, include: { updatedByUser: by } }),
    prisma.autoNotifyTemplate.findMany({ where: { shopId, kind: { in: [...kinds] } }, include: { updatedByUser: by } }),
  ])
  const sw = new Map(switches.map((r) => [r.kind, r]))
  const tp = new Map(templates.map((r) => [r.kind, r]))
  return {
    vertical,
    dailyCapPerRoom: cfg?.dailyCapPerRoom ?? AUTO_NOTIFY_DAILY_CAP.default,
    canEdit: can(roles, 'X8'),
    kinds: kinds.map((kind) => {
      const s = sw.get(kind)
      const t = tp.get(kind)
      return {
        kind,
        enabled: s?.enabled ?? false,
        enabledAt: iso(s?.enabledAt),
        updatedBy: who(s?.updatedByUser),
        template: {
          body: t?.body ?? null,
          defaultBody: DEFAULT_TEMPLATES[kind],
          isCustom: !!t,
          updatedAt: iso(t?.updatedAt),
          updatedBy: who(t?.updatedByUser),
        },
      }
    }),
    variables: Object.fromEntries(kinds.map((k) => [k, TEMPLATE_VARIABLES[k]])),
  }
}

export async function setDailyCap(shopId: string, dailyCapPerRoom: number, userId: string) {
  const r = await prisma.autoNotifyConfig.upsert({
    where: { shopId },
    create: { shopId, dailyCapPerRoom, updatedByUserId: userId },
    update: { dailyCapPerRoom, updatedByUserId: userId },
    select: { dailyCapPerRoom: true },
  })
  return r
}

export async function setSwitch(shopId: string, kind: AutoNotifyKind, enabled: boolean, userId: string) {
  await assertAvailable(shopId, kind)
  // firstEnable เป็นแค่สัญญาณ UX (Swal ผ่านแล้ว) ไม่ใช่กฎ — อ่านก่อนเขียนได้ ส่วน enabledAt ตัดสินใน SQL เดียวด้านล่าง
  const before = await prisma.autoNotifySwitch.findUnique({ where: { shopId_kind: { shopId, kind } }, select: { enabledAt: true } })
  // เปิด: CASE ใน statement เดียว — เปิดซ้ำตอนเปิดอยู่ไม่รีเซ็ต · ปิด: ไม่แตะ enabledAt
  const rows = await prisma.$queryRaw<{ enabled: boolean; enabledAt: Date | null }[]>`
    INSERT INTO "AutoNotifySwitch" ("id","shopId","kind","enabled","enabledAt","updatedByUserId","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, ${shopId}, ${kind}, ${enabled}::boolean,
            CASE WHEN ${enabled}::boolean THEN now() ELSE NULL END, ${userId}, now(), now())
    ON CONFLICT ("shopId","kind") DO UPDATE SET
      "enabledAt" = CASE WHEN ${enabled}::boolean THEN
          CASE WHEN "AutoNotifySwitch"."enabled" THEN "AutoNotifySwitch"."enabledAt" ELSE now() END
        ELSE "AutoNotifySwitch"."enabledAt" END,
      "enabled" = ${enabled}::boolean,
      "updatedByUserId" = ${userId},
      "updatedAt" = now()
    RETURNING "enabled", "enabledAt"`
  const row = rows[0]
  return { kind, enabled: row.enabled, enabledAt: iso(row.enabledAt), firstEnable: enabled && !before?.enabledAt }
}

export async function saveTemplate(
  shopId: string,
  kind: AutoNotifyKind,
  body: string,
  expectedUpdatedAt: Date | null,
  userId: string,
) {
  await assertAvailable(shopId, kind)
  const issues = validateTemplate(kind, body)
  if (issues.length) throw new AutoNotifyTemplateInvalidError(issues)
  const select = { body: true, updatedAt: true, updatedByUser: { select: { displayName: true } } } as const
  if (expectedUpdatedAt === null) {
    // ยังไม่เคยมีแถว: ON CONFLICT DO NOTHING — มีคนสร้างก่อนแล้ว = ชน
    const n = await prisma.$executeRaw`
      INSERT INTO "AutoNotifyTemplate" ("id","shopId","kind","body","updatedByUserId","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text, ${shopId}, ${kind}, ${body}, ${userId}, now(), now())
      ON CONFLICT ("shopId","kind") DO NOTHING`
    if (n === 0) throw new AutoNotifyTemplateConflictError(await currentTemplateUpdatedAt(shopId, kind))
  } else {
    const r = await prisma.autoNotifyTemplate.updateMany({
      where: { shopId, kind, updatedAt: expectedUpdatedAt },
      data: { body, updatedByUserId: userId },
    })
    if (r.count === 0) throw new AutoNotifyTemplateConflictError(await currentTemplateUpdatedAt(shopId, kind))
  }
  const row = await prisma.autoNotifyTemplate.findUniqueOrThrow({ where: { shopId_kind: { shopId, kind } }, select })
  return { kind, body: row.body, updatedAt: row.updatedAt.toISOString(), updatedBy: who(row.updatedByUser) }
}

const currentTemplateUpdatedAt = async (shopId: string, kind: string) =>
  (await prisma.autoNotifyTemplate.findUnique({ where: { shopId_kind: { shopId, kind } }, select: { updatedAt: true } }))?.updatedAt ?? null

/** คืนค่าตั้งต้น = ลบแถว · ไม่มีแถว = สำเร็จ (idempotent) · แถวมีแต่ updatedAt ไม่ตรง = ชน */
export async function resetTemplate(shopId: string, kind: AutoNotifyKind, expectedUpdatedAt: Date) {
  await assertAvailable(shopId, kind)
  const r = await prisma.autoNotifyTemplate.deleteMany({ where: { shopId, kind, updatedAt: expectedUpdatedAt } })
  if (r.count > 0) return
  const cur = await currentTemplateUpdatedAt(shopId, kind)
  if (cur) throw new AutoNotifyTemplateConflictError(cur)
}

/** ข้อมูลให้แถบแจ้ง — ไม่มีเงิน/ที่อยู่/เบอร์ · ห้อง/ออเดอร์ต้องเป็นของร้านใน WHERE (ไม่ใช่ = null → route ตอบ 404) */
export async function getStripContext(
  shopId: string,
  roles: readonly ShopRole[],
  q: { conversationId?: string | null; orderToken?: string | null },
) {
  const vertical = await verticalOf(shopId)
  const kinds = kindsForVertical(vertical)
  const [switches, templates, conv, ord] = await Promise.all([
    prisma.autoNotifySwitch.findMany({ where: { shopId, kind: { in: [...kinds] } }, select: { kind: true, enabled: true, enabledAt: true } }),
    prisma.autoNotifyTemplate.findMany({ where: { shopId, kind: { in: [...kinds] } }, select: { kind: true, body: true } }),
    q.conversationId
      ? prisma.conversation.findFirst({
          where: { id: q.conversationId, shopId },
          select: { id: true, channel: true, lastInboundAt: true, alias: true },
        })
      : null,
    q.orderToken
      ? prisma.order.findFirst({
          where: { publicToken: q.orderToken, shopId },
          select: { conversationId: true, isDryRun: true, status: true, serviceStart: true, appointmentStatus: true, serviceClosedAt: true },
        })
      : null,
  ])
  const sw = new Map(switches.map((r) => [r.kind, r]))
  const tp = new Map(templates.map((r) => [r.kind, r.body]))
  // ส่งคู่กัน: ออเดอร์ต้องผูกกับห้องนั้นจริง ไม่งั้นถือว่าไม่พบ (กันจับคู่ห้อง/ออเดอร์ข้ามกัน)
  const paired = !(conv && ord) || ord.conversationId === conv.id
  return {
    found: { conversation: (q.conversationId ? !!conv : true) && paired, order: (q.orderToken ? !!ord : true) && paired },
    context: {
      switches: Object.fromEntries(kinds.map((k) => [k, { enabled: sw.get(k)?.enabled ?? false, enabledAt: iso(sw.get(k)?.enabledAt) }])),
      templates: Object.fromEntries(kinds.map((k) => [k, tp.get(k) ?? null])),
      canOpenSettings: can(roles, 'H1'),
      conversation: conv ? { id: conv.id, channel: conv.channel, lastInboundAt: iso(conv.lastInboundAt), customerName: conv.alias } : null,
      order: ord
        ? {
            conversationId: ord.conversationId,
            isDryRun: ord.isDryRun,
            status: ord.status,
            serviceStart: iso(ord.serviceStart),
            appointmentStatus: ord.appointmentStatus,
            serviceClosedAt: iso(ord.serviceClosedAt),
          }
        : null,
    },
  }
}
