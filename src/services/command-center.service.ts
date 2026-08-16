/**
 * 00049 AI Command Center — ตัวกลางเดียวระหว่างจอ admin กับ GitHub REST API
 *
 * 🛑 D-8: ฟีเจอร์นี้**ไม่มี Prisma model ไม่มี migration** — GitHub คือความจริง ไม่ใช่ฐานของเรา
 *    cache ในไฟล์นี้ทั้งหมดเป็น in-memory ที่ derive ซ้ำได้เสมอ หายแล้วไม่กระทบความถูกต้อง
 *    (กระทบแค่ความเร็วรอบแรกหลัง cold start) — ดู SDS TD-003
 *
 * 🛑 TD-001: ใช้ `fetch()` ตรง ไม่ใช้ `@octokit/rest` — ต้องการแค่ ~8 endpoint และ workflow
 *    (`auto-merge.yml`) เองก็ใช้ `gh api` ดิบ รูปแบบเดียวกันทั้งระบบ
 *
 * 🛑 token อยู่ใน server env เท่านั้น ห้ามหลุดเข้า response หรือ log ใด ๆ
 */

import {
  STAGE_COLUMNS,
  READY_STAGE_LABEL,
  APPROVED_LABEL,
  WATCHDOG_LABEL,
  MIGRATION_PATH_RE,
  stageFromLabels,
  type BoardResponse,
  type BoardItem,
  type BoardColumn,
  type HeartbeatResponse,
} from "@/lib/command-center";

/* ─────────────────────────── error classes ───────────────────────────
   🛑 ทุกตัวที่โยนจากไฟล์นี้ต้องมี `instanceof` ดักในทุก route ที่เรียกถึง (API.md §5)
   ไม่ใช่แค่ try/catch เฉย ๆ — ต้องมี branch เจาะจงต่อ error class
   (กัน feedback_service_error_route_mapping ซ้ำ: 00003 P2 `OutOfStockError`
   เคยตกหล่นจนคืน 500 แทน 400) */

export class GithubUnreachableError extends Error {
  constructor(message = "อ่านข้อมูลจาก GitHub ไม่สำเร็จ") {
    super(message)
    this.name = "GithubUnreachableError"
  }
}

export class GithubRateLimitedError extends Error {
  constructor(message = "โควตาเรียก GitHub หมดชั่วคราว") {
    super(message)
    this.name = "GithubRateLimitedError"
  }
}

export class GithubAuthError extends Error {
  constructor(message = "GitHub ปฏิเสธ token") {
    super(message)
    this.name = "GithubAuthError"
  }
}

export class ItemNotFoundError extends Error {
  constructor(message = "ไม่พบใบงานนี้") {
    super(message)
    this.name = "ItemNotFoundError"
  }
}

export class ItemNotApprovableError extends Error {
  constructor(message = "ใบงานนี้ยังไม่มี PR ให้อนุมัติ") {
    super(message)
    this.name = "ItemNotApprovableError"
  }
}

/* ─────────────────────────── config ─────────────────────────── */

const API = "https://api.github.com"

/** อ่าน env ตอนเรียก ไม่ใช่ตอน import — ไม่งั้น build time ที่ไม่มี env จะพังทั้งไฟล์ */
function config(): { token: string; repo: string } {
  const token = process.env.COMMAND_CENTER_GITHUB_TOKEN ?? ""
  const repo = process.env.COMMAND_CENTER_GITHUB_REPO ?? ""
  // ไม่มี token = ปัญหา config ของผู้ดูแล ไม่ใช่สิ่งที่ user แก้เองได้ → ชนิดเดียวกับ 401
  if (!token || !repo) throw new GithubAuthError("ยังไม่ได้ตั้งค่า COMMAND_CENTER_GITHUB_*")
  return { token, repo }
}

/* ─────────────────────────── HTTP ───────────────────────────
   จุดเดียวที่คุยกับ GitHub — การแปลง status → error class อยู่ที่นี่ที่เดียว
   ไม่งั้นผู้เรียกแต่ละรายจะตีความ 403 กันคนละแบบ */

type GhResult<T> = { status: number; body: T; etag: string | null }

async function gh<T = unknown>(
  path: string,
  init: RequestInit & { etag?: string | null } = {},
): Promise<GhResult<T>> {
  const { token, repo } = config()
  const { etag, ...rest } = init

  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    ...(rest.headers as Record<string, string> | undefined),
  }
  if (etag) headers["if-none-match"] = etag
  if (rest.body) headers["content-type"] = "application/json"

  let res: Response
  try {
    res = await fetch(`${API}${path.replace("{repo}", repo)}`, {
      ...rest,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    // network error / timeout — ไม่มี status ให้ดู
    throw new GithubUnreachableError()
  }

  if (res.status === 401) throw new GithubAuthError()

  // 🛑 403 มี 2 ความหมาย: โควตาหมด กับ scope ไม่พอ — แยกด้วย header ไม่ใช่เดา
  if (res.status === 403 || res.status === 429) {
    if (res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429) {
      throw new GithubRateLimitedError()
    }
    throw new GithubAuthError("token ไม่มีสิทธิ์พอสำหรับ endpoint นี้")
  }

  if (res.status === 404) throw new ItemNotFoundError()
  if (res.status >= 500) throw new GithubUnreachableError()

  // 304 = ไม่มี body ใหม่ ผู้เรียกต้องใช้ cache ของตัวเอง · คืน etag เดิมกลับไป
  // (`etag` เป็น optional param จึงเป็น `undefined` ได้ — normalize เป็น null ให้ตรงชนิด)
  if (res.status === 304) return { status: 304, body: undefined as T, etag: etag ?? null }

  if (!res.ok) throw new GithubUnreachableError(`GitHub ตอบ ${res.status}`)

  const text = await res.text()
  return {
    status: res.status,
    body: (text ? JSON.parse(text) : undefined) as T,
    etag: res.headers.get("etag"),
  }
}

/* ─────────────────────────── cache (SDS TD-003) ───────────────────────────
   ทั้งหมด derive ซ้ำได้ + หายแล้วไม่กระทบความถูกต้อง จึงไม่ขัด D-8 */

type GhIssue = {
  number: number
  title: string
  html_url: string
  updated_at: string
  labels: Array<{ name: string }>
  pull_request?: unknown
}

const listCache: { etag: string | null; body: GhIssue[]; at: string | null } = {
  etag: null,
  body: [],
  at: null,
}

/** คีย์ `${number}:${stageLabel}` — คงที่จนกว่า label จะเปลี่ยน */
const stageEnteredCache = new Map<string, string | null>()
/** คีย์ `${number}:${updatedAt}` — invalidate เองเมื่อ PR อัปเดต */
const migrationCache = new Map<string, boolean>()

/** เปิดให้เทสล้างสถานะระหว่างเคส — ไม่มีผู้เรียกใน production path */
export function __resetCommandCenterCache() {
  listCache.etag = null
  listCache.body = []
  listCache.at = null
  stageEnteredCache.clear()
  migrationCache.clear()
}

/* ─────────────────────────── board (TFR-CC-13) ─────────────────────────── */

async function stageEnteredAt(number: number, stageLabel: string): Promise<string | null> {
  const key = `${number}:${stageLabel}`
  const hit = stageEnteredCache.get(key)
  if (hit !== undefined) return hit

  let value: string | null = null
  try {
    const { body } = await gh<Array<{ event: string; label?: { name: string }; created_at: string }>>(
      `/repos/{repo}/issues/${number}/timeline?per_page=100`,
    )
    // ไล่จากท้ายขึ้นหน้า — เอาครั้งล่าสุดที่ป้ายนี้ถูกติด ไม่ใช่ครั้งแรก
    for (let i = (body ?? []).length - 1; i >= 0; i--) {
      const e = body[i]
      if (e.event === "labeled" && e.label?.name === stageLabel) {
        value = e.created_at
        break
      }
    }
  } catch {
    // อ่าน timeline ไม่ได้ = ไม่รู้เวลา ไม่ใช่ "เพิ่งเข้าขั้นนี้"
    // null ทำให้ UI แสดง "—" แทนที่จะโกหกว่า 0 นาที
    return null
  }

  stageEnteredCache.set(key, value)
  return value
}

async function touchesMigration(number: number, updatedAt: string): Promise<boolean> {
  const key = `${number}:${updatedAt}`
  const hit = migrationCache.get(key)
  if (hit !== undefined) return hit

  let value = false
  try {
    const { body } = await gh<Array<{ filename: string }>>(
      `/repos/{repo}/pulls/${number}/files?per_page=100`,
    )
    // 🛑 ต้องใช้ regex เดียวกันเป๊ะกับ auto-merge.yml ด่าน 5 ไม่งั้นจอกับด่านไม่ตรงกัน (HR16)
    value = (body ?? []).some((f) => MIGRATION_PATH_RE.test(f.filename))
  } catch {
    // อ่านไม่ได้ = fail-closed: ถือว่าแตะ migration ไว้ก่อน
    // เตือนเกินจริงแล้วคนไปดูเอง ปลอดภัยกว่าเงียบแล้วปล่อยผ่าน
    value = true
  }

  migrationCache.set(key, value)
  return value
}

export async function listBoard(): Promise<BoardResponse> {
  let degraded = false

  try {
    const { status, body, etag } = await gh<GhIssue[]>(
      `/repos/{repo}/issues?state=open&per_page=100`,
      { etag: listCache.etag },
    )
    if (status !== 304) {
      listCache.body = body ?? []
      listCache.etag = etag
      listCache.at = new Date().toISOString()
    }
  } catch (err) {
    // 🛑 โควตาหมดแต่มี cache = ลดระดับ ไม่ใช่ error (UX spec §7)
    // ไม่มี cache เลย = โยนต่อให้ route ตอบ 502 แล้วบล็อกทั้งหน้า
    // จอว่างโดยไม่บอกเหตุ = ถูกเข้าใจว่า "ไม่มีงาน" ซึ่งอันตรายกว่า error
    if (err instanceof GithubRateLimitedError && listCache.at) degraded = true
    else throw err
  }

  const columns: BoardColumn[] = STAGE_COLUMNS.map((c) => ({ ...c, count: 0, items: [] }))
  const byStage = new Map(columns.map((c) => [c.stage, c]))

  for (const raw of listCache.body) {
    const labels = (raw.labels ?? []).map((l) => l.name)
    const stage = stageFromLabels(labels)
    if (!stage) continue // ไม่มี stage:*/พร้อมขึ้น = ไม่แสดงบนบอร์ด (TFR-CC-13 ข้อ 3)

    const kind: BoardItem["kind"] = raw.pull_request ? "pr" : "issue"
    // ใบที่มีทั้ง stage:ready และ พร้อมขึ้น อยู่คอลัมน์เดียวและนับครั้งเดียว (SDS TD-006)
    const approved = labels.includes(APPROVED_LABEL)

    const item: BoardItem = {
      number: raw.number,
      kind,
      title: raw.title,
      url: raw.html_url,
      stage,
      stageEnteredAt: null,
      touchesMigration: false,
      // 🛑 true = "ยังไม่ถูกเคาะ" (ปุ่มผูกกับกลุ่มนี้) — ไม่ใช่ "อยู่คอลัมน์ ready"
      awaitingApproval: stage === "ready" && !approved,
    }

    byStage.get(stage)?.items.push(item)
  }

  // เติมข้อมูลที่ต้องยิงเพิ่มรายใบ — ทำหลังจัด bucket เพื่อให้ยิงเฉพาะใบที่แสดงจริง
  await Promise.all(
    columns.flatMap((col) =>
      col.items.map(async (item) => {
        const raw = listCache.body.find((r) => r.number === item.number)
        const labelOfStage =
          item.stage === "ready"
            ? // ใบที่เคาะแล้วจับเวลาจากป้าย stage:ready ที่ยังติดอยู่ ถ้าไม่มีค่อยใช้ พร้อมขึ้น
              (raw?.labels ?? []).some((l) => l.name === READY_STAGE_LABEL)
              ? READY_STAGE_LABEL
              : APPROVED_LABEL
            : `stage:${item.stage}`

        item.stageEnteredAt = await stageEnteredAt(item.number, labelOfStage)

        // คำนวณเฉพาะใบที่เคาะแล้ว (มีป้าย พร้อมขึ้น) — ประหยัดโควตา ตาม TFR-CC-09
        if (item.kind === "pr" && item.stage === "ready" && !item.awaitingApproval && raw) {
          item.touchesMigration = await touchesMigration(item.number, raw.updated_at)
        }
      }),
    ),
  )

  for (const col of columns) {
    col.items.sort((a, b) => a.number - b.number)
    col.count = col.items.length
  }

  return {
    columns,
    generatedAt: new Date().toISOString(),
    degraded,
    degradedSince: degraded ? listCache.at : null,
  }
}

/* ─────────────────────────── heartbeat (TFR-CC-14) ─────────────────────────── */

export async function getHeartbeat(): Promise<HeartbeatResponse> {
  let lastHeartbeatAt: string | null = null
  try {
    const { body } = await gh<{ value: string }>(
      `/repos/{repo}/actions/variables/HERMES_HEARTBEAT`,
    )
    const raw = body?.value?.trim()
    if (raw) {
      const d = new Date(raw)
      // fail-closed: ค่าที่ parse ไม่ได้ = ไม่รู้ ไม่ใช่ "สด"
      if (!Number.isNaN(d.getTime())) lastHeartbeatAt = d.toISOString()
    }
  } catch (err) {
    // ยังไม่เคยตั้งค่าตัวแปรนี้ = ยังไม่เริ่ม P5 ไม่ใช่ error
    if (!(err instanceof ItemNotFoundError)) throw err
  }

  // สถานะ issue อ่านจาก label ตายตัว ไม่ใช่ค้นด้วย title (SDS TD-004)
  let watchdogIssue: HeartbeatResponse["watchdogIssue"] = {
    open: false,
    url: null,
    number: null,
  }
  const { body } = await gh<GhIssue[]>(
    `/repos/{repo}/issues?state=open&labels=${encodeURIComponent(WATCHDOG_LABEL)}&per_page=1`,
  )
  if (body?.length) {
    watchdogIssue = { open: true, url: body[0].html_url, number: body[0].number }
  }

  return {
    lastHeartbeatAt,
    // 🛑 คำนวณอายุฝั่ง server เสมอ (D-8 — frontend ไม่คำนวณเอง)
    ageSeconds: lastHeartbeatAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000))
      : null,
    watchdogIssue,
  }
}

/* ─────────────────────────── write ─────────────────────────── */

export async function createTask(
  title: string,
  description: string,
): Promise<{ number: number; url: string }> {
  // GitHub รับ labels ในคำขอสร้างได้เลย — ไม่ต้องแยก 2 call (TFR-CC-01)
  const { body } = await gh<{ number: number; html_url: string }>(`/repos/{repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body: description, labels: ["stage:plan"] }),
  })
  return { number: body.number, url: body.html_url }
}

/** อ่าน labels สดจาก GitHub — 🛑 ห้ามเชื่อ label ที่ client ส่งมา (TFR-CC-05) */
async function freshItem(number: number): Promise<{ labels: string[]; isPr: boolean }> {
  const { body } = await gh<GhIssue>(`/repos/{repo}/issues/${number}`)
  return {
    labels: (body.labels ?? []).map((l) => l.name),
    isPr: Boolean(body.pull_request),
  }
}

async function putLabels(number: number, labels: string[]): Promise<void> {
  await gh(`/repos/{repo}/issues/${number}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels }),
  })
}

async function comment(number: number, body: string): Promise<void> {
  await gh(`/repos/{repo}/issues/${number}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  })
}

export async function approveItem(number: number): Promise<void> {
  const { labels, isPr } = await freshItem(number)
  // 🛑 auto-merge.yml อ่านป้ายนี้จาก PR เท่านั้น — ติดบน issue = ป้ายที่ไม่มีใครอ่าน (TD-002)
  if (!isPr) throw new ItemNotApprovableError()
  if (labels.includes(APPROVED_LABEL)) return // idempotent — ป้ายที่ต้องการมีอยู่แล้ว
  await putLabels(number, [...labels, APPROVED_LABEL])
}

export async function rejectItem(number: number, reason: string): Promise<void> {
  const { labels } = await freshItem(number)

  /* 🛑 comment ก่อน ป้ายทีหลัง — ยึด BRD FR-CC-05 AC-05-1 ("เขียนเหตุผลเป็น comment
     **ก่อน**เปลี่ยนป้าย") ซึ่งเป็น *ความต้องการ* ส่วน SRS TFR-CC-05 กับ API §6 เดิมเขียน
     ลำดับกลับกัน (ป้ายก่อน) — เป็นเอกสารอนุพันธ์ที่หลุดจากความต้องการ แก้ให้ตรงแล้ว 2026-08-16

     ทำไมลำดับนี้ถึงสำคัญจริง ไม่ใช่แค่ความสวยงาม:
       comment สำเร็จ → ป้ายล้ม  = ใบค้างที่ stage:review พร้อมเหตุผลครบ (คนกดซ้ำได้)
       ป้ายสำเร็จ → comment ล้ม  = ใบเด้งไป stage:build **โดยไม่มีเหตุผลสักบรรทัด**
                                    developer agent รับงานต่อแล้วไม่รู้ว่าต้องแก้อะไร
     อย่างหลังคือสิ่งที่ FR-CC-05 มีอยู่เพื่อป้องกันพอดี */
  await comment(number, reason)

  const kept = labels.filter((l) => !l.startsWith("stage:"))
  await putLabels(number, [...kept, "stage:build"])
}

export async function stopItem(number: number): Promise<void> {
  const { labels } = await freshItem(number)
  const kept = labels.filter((l) => !l.startsWith("stage:"))
  // เรียกซ้ำ = idempotent success ไม่ error (TFR-CC-12)
  if (kept.length === labels.length) return
  await putLabels(number, kept)
}
