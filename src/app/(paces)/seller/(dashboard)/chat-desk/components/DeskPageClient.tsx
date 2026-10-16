'use client'

/**
 * DeskPageClient — เปลือกหน้า "โต๊ะแชท": ประกอบ snapshot + presence + ฉาก 3D/รายการ 2D + การ์ด ①–④ + แผงข้าง
 *
 * Base: theme/paces/Admin/TS/src/app/(admin)/apps/ecommerce/(orders)/orders/page.tsx (โครงหน้า breadcrumb → เนื้อหา)
 *   + theme/paces/Admin/TS/src/app/(admin)/ui/cards/page.tsx (เวที = card ไม่มี padding, overflow-hidden)
 *   + ตัวสลับ segmented จาก src/app/(paces)/seller/(chat)/_components/ChatShopSwitcher.tsx (bg-light p-1 · active bg-card shadow-sm)
 * ฉาก 3D ยกเว้น HR1 (มติ 2026-10-16) — ดู DeskCanvas
 *
 * กติกาที่หน้านี้ถือ:
 *  - events กับ view ต้องมาจาก render เดียวกัน (ฉากเล่นอนิเมชันจาก events แล้ววางตำแหน่งตาม view) → derive ใน render ไม่ใช้ effect
 *  - เปลี่ยนร้าน/ตัวกรอง = reset "snapshot ก่อนหน้า" เป็น null ก่อน diff ไม่งั้นห้องที่โผล่/หายเพราะตัวกรองกลายเป็นเหตุการณ์
 *  - URL เขียนด้วย history.replaceState ใน event handler (Next sync เข้า useSearchParams เอง) — router.replace จะยิง RSC ทั้งหน้าใหม่ทุกครั้งที่กดชิป
 *  - forbidden (สิทธิ์หายระหว่างใช้) = hook ล้าง snapshot แล้ว ที่นี่แสดงการ์ดไม่มีสิทธิ์ ห้ามค้างฉากเก่า
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import PageBreadcrumb from '@/components/PageBreadcrumb'
import Icon from '@/components/wrappers/Icon'
import { useChatDeskPresence } from '@/hooks/useChatDeskPresence'
import { useDeskSnapshot } from '@/hooks/useDeskSnapshot'
import { useMinWidth } from '@/hooks/useMinWidth'
import { EMPTY_FILTERS, serializeDeskFilters } from '@/lib/chat-desk/filters'
import {
  countActiveFilterGroups, channelMix, eventsToActivity, listDeskRooms, prependActivity, fmtInt,
  type ActivityItem,
} from '@/lib/chat-desk/page-model'
import { resolveInitialView } from '@/lib/chat-desk/rules'
import { buildDeskView, diffSnapshots } from '@/lib/chat-desk/scene-model'
import type { DeskCustomer, DeskEvent, DeskFilters as Filters, DeskSnapshot, DeskViewMode } from '@/lib/chat-desk/types'
import { formatTimeHM } from '@/lib/format-date'
import NoPermissionCard from '../../_shared/NoPermissionCard'
import SellerEmptyState from '../../_shared/SellerEmptyState'
import SellerErrorState from '../../_shared/SellerErrorState'
import { SellerCardSkeleton } from '../../_shared/SellerCardSkeleton'
import ActivityCard from './ActivityCard'
import AdminPanel from './AdminPanel'
import ChannelMixCard from './ChannelMixCard'
import ChatPreviewPanel from './ChatPreviewPanel'
import ClockCard from './ClockCard'
import DeskCanvas from './DeskCanvas'
import DeskFilters from './DeskFilters'
import DeskLegend from './DeskLegend'
import DeskList2D from './DeskList2D'
import DeskSceneBoundary from './DeskSceneBoundary'
import DeskSidePanel from './DeskSidePanel'
import DeskToolbar, { ZOOM_MAX, ZOOM_MIN } from './DeskToolbar'
import OverviewCard from './OverviewCard'
import ShopSwitcher, { type ShopOption } from './ShopSwitcher'
import { useFullscreen, usePageHidden, useReducedMotion } from './desk-hooks'
import { ChannelDot } from './desk-ui'

export type DeskPageClientProps = {
  /** primitive ล้วน — ข้ามเส้น RSC → client */
  ownerShops: ShopOption[]
  initialShopId: string
  initialFilters: Filters
  /** ค่า ?view= ที่ถูกต้อง · null = ให้ตัดสินตามความกว้างจอ */
  initialView: DeskViewMode | null
}

type Selection =
  | { kind: 'room'; id: string; fromTable?: string }
  | { kind: 'table'; key: string }
  | { kind: 'lounge' }
  | { kind: 'hidden' }

type Track = { scope: string; snap: DeskSnapshot | null; events: DeskEvent[]; feed: ActivityItem[] }

// ความสูงเวที: เต็มส่วนที่เหลือของจอ (ไม่มี token ความสูงอิง viewport ใน Paces — carve-out ใน Design Spec · precedent max-h-[85dvh] ของ DeskSidePanel)
const STAGE_H = 'lg:h-[calc(100dvh-12rem)] lg:min-h-[34rem]' // HR7: carve-out ความสูงเวที
const STAGE_H_3D = `h-[calc(100dvh-20rem)] min-h-[28rem] ${STAGE_H}` // HR7: carve-out ความสูงเวที (มือถือหัก header + bottom nav)
/** px ของคอลัมน์การ์ดซ้าย (w-72 = 288 + start-3 = 12 + ช่องว่าง) ให้ฉากจัดกลางส่วนที่เหลือ */
const CARDS_INSET_PX = 312

function ListPanel({ title, items, onClose }: { title: string; items: { key: string; label: string; sub?: string; leading?: ReactNode; onClick: () => void }[]; onClose: () => void }) {
  return (
    <>
      <div className="border-default-300 flex items-center justify-between border-b border-dashed p-4">
        <div className="text-default-900 font-semibold">{title}</div>
        <button type="button" onClick={onClose} aria-label="ปิดแผง" className="btn btn-icon text-default-700 hover:bg-default-100">
          <Icon icon="x" className="text-lg" aria-hidden="true" />
        </button>
      </div>
      <ul className="divide-default-200 min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain px-4 pb-4">
        {items.map((i) => (
          <li key={i.key}>
            <button type="button" onClick={i.onClick} className="hover:bg-default-100 flex min-h-12 w-full items-center gap-2 py-2 text-start text-sm">
              {i.leading}
              <span className="min-w-0 flex-1">
                <span className="text-default-900 block truncate" title={i.label}>{i.label}</span>
                {i.sub && <span className="text-default-700 block truncate text-xs">{i.sub}</span>}
              </span>
              <Icon icon="chevron-right" className="text-default-400 shrink-0" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function DeskPageClient({ ownerShops, initialShopId, initialFilters, initialView }: DeskPageClientProps) {
  const [shopId, setShopId] = useState(initialShopId)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [userView, setUserView] = useState<DeskViewMode | null>(initialView)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [hideNumbers, setHideNumbers] = useState(false)
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0)
  const [zoom, setZoom] = useState(1)
  const [sel, setSel] = useState<Selection | null>(null)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const fullscreen = useFullscreen(stageRef)
  const reducedMotion = useReducedMotion()
  const hidden = usePageHidden()
  const lg = useMinWidth(1024) === true
  const wide = useMinWidth(768)

  const { snapshot, status, lastUpdatedAt, refresh } = useDeskSnapshot(shopId, filters)
  const presence = useChatDeskPresence(shopId)
  const presenceStatus = presence.status
  const presenceKeys = presence.keys
  const onlineKeys = useMemo(() => (presenceStatus === 'ready' ? new Set(presenceKeys) : null), [presenceStatus, presenceKeys])

  // มุมมอง: ผู้ใช้/URL เลือกชนะความกว้างจอ · ไม่มี WebGL (หรือฉากล้ม) = 2D เสมอ · ยังไม่รู้ความกว้าง = ยังไม่ตัดสิน
  const view: DeskViewMode | null =
    wide === null && !userView && !sceneFailed ? null : resolveInitialView(wide ? 768 : 0, !sceneFailed, userView)
  const isMobile = wide === false

  // ── events + ฟีด: derive ใน render เดียวกับ view (ดูหัวไฟล์) ──
  const scope = `${shopId}|${JSON.stringify(serializeDeskFilters(filters))}`
  const [track, setTrack] = useState<Track>({ scope, snap: null, events: [], feed: [] })
  if (track.scope !== scope || track.snap !== snapshot) {
    const same = track.scope === scope
    const events = same && snapshot ? diffSnapshots(track.snap, snapshot) : []
    setTrack({
      scope,
      snap: snapshot,
      events,
      feed: !same ? [] : snapshot && events.length ? prependActivity(track.feed, eventsToActivity(events, snapshot)) : track.feed,
    })
  }

  const model = useMemo(() => {
    if (!snapshot) return null
    // ใช้ filters ที่ server ทำความสะอาดแล้ว (snapshot.filters) ไม่ใช่ค่าดิบจาก URL
    const f = snapshot.filters
    return {
      view: buildDeskView({ snapshot, filters: f, onlineKeys, now: snapshot.serverNow }),
      lists: listDeskRooms(snapshot, f, snapshot.serverNow),
    }
  }, [snapshot, onlineKeys])

  const applied = snapshot?.filters ?? filters
  const filtered = countActiveFilterGroups(applied) > 0
  const pageName = useCallback((id: string | null) => (id ? snapshot?.channels.find((c) => c.id === id)?.name ?? null : null), [snapshot])

  // ── URL ──
  const writeUrl = useCallback((next: { shop: string; filters: Filters; view: DeskViewMode | null }) => {
    const q = new URLSearchParams({ shop: next.shop, ...serializeDeskFilters(next.filters) })
    if (next.view) q.set('view', next.view)
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`)
  }, [])
  const applyFilters = (f: Filters) => { setFilters(f); writeUrl({ shop: shopId, filters: f, view: userView }) }
  const changeShop = (id: string) => {
    // เพจ/แอดมินเป็นของร้านเดิม — ทิ้ง · แพลตฟอร์มข้ามร้านได้
    const f: Filters = { ...filters, pages: [], admins: [] }
    setShopId(id); setFilters(f); setSel(null); setOverviewOpen(false)
    writeUrl({ shop: id, filters: f, view: userView })
  }
  const changeView = (v: DeskViewMode) => { setUserView(v); setSel(null); writeUrl({ shop: shopId, filters, view: v }) }

  // ── ที่เลือก (derive — ห้อง/โต๊ะหายไปแล้ว = ปิดแผงเอง) ──
  const allTables = model ? [...model.view.tables, ...model.view.hiddenAdminTables] : []
  const selRoom = sel?.kind === 'room' ? model?.lists.byId.get(sel.id) ?? null : null
  const selTable = sel?.kind === 'table' ? allTables.find((t) => t.key === sel.key) ?? null : null
  const closePanel = () => setSel(null)
  const openRoom = (id: string, fromTable?: string) => setSel({ kind: 'room', id, fromTable })
  const selectedTableKey = selTable?.key ?? (sel?.kind === 'room' ? sel.fromTable ?? null : null)

  if (status === 'forbidden') {
    return (
      <>
        <PageBreadcrumb title="โต๊ะแชท" subtitle="แชท" />
        <NoPermissionCard capability="X7" viewerRoles={[]} />
      </>
    )
  }

  const shopName = snapshot?.shop.name ?? ownerShops.find((s) => s.id === shopId)?.name ?? ''
  const canRoute = view !== null
  const filtersNode = (variant: 'icon' | 'button') => (
    <DeskFilters value={applied} channels={snapshot?.channels ?? []} members={snapshot?.members ?? []} onApply={applyFilters} variant={variant} />
  )

  // ── ส่วนหัว: ตัวสลับร้าน + (2D เดสก์ท็อป) ตัวกรอง + segmented ──
  const segOptions: { v: DeskViewMode; label: string; icon?: string }[] = isMobile
    ? [{ v: '2d', label: 'รายการ' }, { v: '3d', label: view === '2d' ? 'เปิดฉาก 3D' : 'ฉาก 3D', icon: 'cube' }]
    : [{ v: '3d', label: 'ฉาก 3D' }, { v: '2d', label: 'รายการ' }]
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <ShopSwitcher shops={ownerShops} value={shopId} onChange={changeShop} />
      {lg && view === '2d' && filtersNode('button')}
      {!sceneFailed && canRoute && (
        <div role="group" aria-label="มุมมอง" className="bg-light inline-flex rounded-lg p-1 text-sm">
          {segOptions.map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={view === o.v}
              onClick={() => changeView(o.v)}
              className={`inline-flex h-8 items-center gap-1 rounded-md px-3 ${view === o.v ? 'bg-card text-default-900 font-semibold shadow-sm' : 'text-default-700'}`}
            >
              {o.icon && view !== o.v && <Icon icon={o.icon} className="text-sm" aria-hidden="true" />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  // ── สถานะก่อนมีข้อมูล ──
  if (!snapshot || !model) {
    return (
      <>
        <PageBreadcrumb title="โต๊ะแชท" subtitle="แชท" action={header} />
        {status === 'error' ? (
          <div className="card">
            <SellerErrorState compact title="โหลดโต๊ะแชทไม่สำเร็จ" message="ระบบติดต่อฐานข้อมูลไม่ได้ชั่วคราว แชทของคุณยังอยู่ครบ ลองใหม่ได้เลย" />
            <div className="pb-8 text-center">
              {/* ปุ่มจริง (callback) ไม่ใช่ลิงก์ — หน้านี้ถือ state ไม่ได้ reload */}
              <button type="button" onClick={refresh} className="btn bg-primary hover:bg-primary-hover rounded-full px-6 text-sm font-medium text-white">
                ลองใหม่
              </button>
            </div>
          </div>
        ) : (
          <div className={`card relative overflow-hidden ${STAGE_H_3D}`}>
            <div className="absolute start-3 top-3 bottom-3 hidden w-72 space-y-3 overflow-hidden lg:block">
              <SellerCardSkeleton /><SellerCardSkeleton /><SellerCardSkeleton />
            </div>
            <div role="status" className="text-default-700 grid size-full place-items-center text-sm">
              <span className="inline-flex items-center gap-2">
                <Icon icon="loader-2" className="animate-spin text-lg" aria-hidden="true" />
                กำลังเตรียมฉาก
              </span>
            </div>
          </div>
        )}
      </>
    )
  }

  const { view: dv, lists } = model
  const s = dv.summary
  const noChatAtAll = !filtered && snapshot.channels.length === 0 && snapshot.rooms.length === 0
  const filteredEmpty = filtered && lists.all.length === 0

  const cards = (
    <>
      <ClockCard shopName={shopName} shops={ownerShops} shopId={shopId} onShopChange={changeShop} lastUpdatedAt={lastUpdatedAt} onRefresh={refresh} />
      <OverviewCard summary={s} daily={snapshot.daily} filtered={filtered} />
      <ChannelMixCard rows={channelMix(lists.all)} />
      <ActivityCard items={track.feed} isPresent={(id) => lists.byId.has(id)} onSelectRoom={(id) => openRoom(id)} />
    </>
  )

  const list2d = (
    <DeskList2D
      lounge={lists.lounge}
      loungeCapped={s.awaitingCapped}
      tables={allTables}
      byTable={lists.byTable}
      pageName={pageName}
      now={snapshot.serverNow}
      onSelectCustomer={(c: DeskCustomer) => openRoom(c.id)}
    />
  )

  const clearFiltersBar = filteredEmpty && (
    <div role="status" className="bg-default-100 text-default-900 flex items-center gap-3 rounded-md px-3 py-2 text-sm">
      <span>ไม่พบห้องตามตัวกรองที่เลือก</span>
      <button type="button" onClick={() => applyFilters(EMPTY_FILTERS)} className="text-primary font-medium">ล้างตัวกรอง</button>
    </div>
  )

  const sceneBanner = sceneFailed && (
    <div role="status" className="bg-default-100 text-default-900 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
      <Icon icon="info-circle" className="shrink-0 text-base" aria-hidden="true" />
      เครื่องนี้แสดงฉาก 3D ไม่ได้ จึงแสดงเป็นรายการ ข้อมูลชุดเดียวกัน
    </div>
  )

  // ── แผงข้าง (อยู่ในเวที = ลูกของ element fullscreen) ──
  let panel: ReactNode = null
  if (selRoom) {
    panel = (
      <DeskSidePanel label={`แชทของ ${selRoom.name}`} onClose={closePanel}>
        <ChatPreviewPanel
          key={selRoom.id}
          customer={selRoom}
          now={snapshot.serverNow}
          onClose={closePanel}
          onBack={sel?.kind === 'room' && sel.fromTable ? () => setSel({ kind: 'table', key: sel.fromTable! }) : undefined}
        />
      </DeskSidePanel>
    )
  } else if (selTable) {
    panel = (
      <DeskSidePanel label={`โต๊ะ ${selTable.name}`} onClose={closePanel}>
        <AdminPanel table={selTable} customers={lists.byTable[selTable.key] ?? []} now={snapshot.serverNow} onSelectCustomer={(c) => openRoom(c.id, selTable.key)} onClose={closePanel} />
      </DeskSidePanel>
    )
  } else if (sel?.kind === 'lounge') {
    panel = (
      <DeskSidePanel label="ลูกค้ารอคำตอบ" onClose={closePanel}>
        <ListPanel
          title={`ลูกค้ารอคำตอบ (${fmtInt(lists.lounge.length)}${s.awaitingCapped ? '+' : ''})`}
          onClose={closePanel}
          items={lists.lounge.map((c) => ({ key: c.id, label: c.name, sub: pageName(c.pageId) ?? undefined, leading: <ChannelDot platform={c.platform} size="size-5" />, onClick: () => openRoom(c.id) }))}
        />
      </DeskSidePanel>
    )
  } else if (sel?.kind === 'hidden') {
    panel = (
      <DeskSidePanel label="โต๊ะที่ไม่ได้แสดงบนฉาก" onClose={closePanel}>
        <ListPanel
          title="โต๊ะที่ไม่ได้แสดงบนฉาก"
          onClose={closePanel}
          items={dv.hiddenAdminTables.map((t) => ({ key: t.key, label: t.name, sub: `แชทในมือ ${t.total}`, onClick: () => setSel({ kind: 'table', key: t.key }) }))}
        />
      </DeskSidePanel>
    )
  }

  const is3d = view === '3d'
  const summaryBar = (
    <div className="card divide-default-200 absolute start-3 bottom-3 z-10 flex items-center divide-x text-sm lg:hidden">
      <span className="inline-flex items-center gap-1.5 px-3 py-2.5">
        <Icon icon="clock" className="text-warning-ink text-base" aria-hidden="true" />รอคำตอบ <b className="tabular-nums">{fmtInt(s.waiting)}{s.awaitingCapped ? '+' : ''}</b>
      </span>
      <span className="inline-flex items-center gap-1.5 px-3 py-2.5">
        <Icon icon="alert-triangle" className="text-danger-ink text-base" aria-hidden="true" />เกินเวลา <b className={`tabular-nums ${s.overdue > 0 ? 'text-danger-ink' : ''}`}>{fmtInt(s.overdue)}</b>
      </span>
      <span className="hidden items-center gap-1.5 px-3 py-2.5 sm:inline-flex">
        <Icon icon="users" className="text-default-400 text-base" aria-hidden="true" />ออนไลน์ <b className="tabular-nums">{s.online === null ? '—' : `${s.online}/${s.chatters}`}</b>
      </span>
      <button type="button" onClick={() => setOverviewOpen(true)} className="text-primary inline-flex min-h-11 items-center gap-1 px-3 font-medium">
        ดูทั้งหมด<Icon icon="chevron-right" className="text-sm" aria-hidden="true" />
      </button>
    </div>
  )

  return (
    <>
      <PageBreadcrumb title="โต๊ะแชท" subtitle="แชท" action={header} />
      <p className="sr-only" role="status" aria-live="polite">
        รอคำตอบ {s.waiting} คน เกินเวลาตอบ {s.overdue} คน
      </p>

      {noChatAtAll ? (
        <div className="card">
          <SellerEmptyState compact icon="building-store" title="ร้านนี้ยังไม่มีแชท" description="เชื่อมเพจ Messenger, Instagram หรือ LINE เพื่อให้ลูกค้าทักเข้ามา" action={{ label: 'ไปตั้งค่าช่องทาง', href: '/settings/channels' }} />
        </div>
      ) : !canRoute ? null : (
        <div
          ref={stageRef}
          style={fullscreen.active ? { height: '100%' } : undefined}
          className={`relative overflow-hidden ${is3d ? `card ${STAGE_H_3D}` : `lg:card lg:bg-body ${STAGE_H}`}`}
        >
          {is3d ? (
            <>
              <div className="absolute inset-0">
                <DeskSceneBoundary
                  onFail={() => setSceneFailed(true)}
                  fallback={() => (
                    <div className="size-full space-y-3 overflow-y-auto p-3">
                      {sceneBanner}
                      {list2d}
                    </div>
                  )}
                >
                  <DeskCanvas
                    view={dv}
                    shopName={shopName}
                    events={track.events}
                    selectedRoomId={selRoom?.id ?? null}
                    selectedTableKey={selectedTableKey}
                    hideNumbers={hideNumbers}
                    rotation={rotation}
                    zoom={zoom}
                    leftInset={lg ? CARDS_INSET_PX : 0}
                    reducedMotion={reducedMotion}
                    paused={hidden}
                    onSelectRoom={(id) => openRoom(id)}
                    onSelectTable={(key) => setSel({ kind: 'table', key })}
                    onOpenLounge={() => setSel({ kind: 'lounge' })}
                    onOpenHiddenTables={() => setSel({ kind: 'hidden' })}
                  />
                </DeskSceneBoundary>
              </div>
              {lg && <div className="absolute start-3 top-3 bottom-3 z-10 w-72 space-y-3 overflow-y-auto pe-1">{cards}</div>}
              <div className="absolute end-3 top-3 z-20">
                <DeskToolbar
                  zoom={zoom}
                  onRotate={() => setRotation((r) => ((r + 1) % 4) as 0 | 1 | 2 | 3)}
                  onZoomIn={() => setZoom((z) => Math.min(ZOOM_MAX, +(z * 1.25).toFixed(2)))}
                  onZoomOut={() => setZoom((z) => Math.max(ZOOM_MIN, +(z / 1.25).toFixed(2)))}
                  hideNumbers={hideNumbers}
                  onToggleNumbers={() => setHideNumbers((h) => !h)}
                  fullscreen={fullscreen}
                  filterSlot={filtersNode('icon')}
                />
              </div>
              {clearFiltersBar && <div className="absolute start-1/2 top-3 z-20 -translate-x-1/2">{clearFiltersBar}</div>}
              {lg ? (
                <div className="absolute end-3 bottom-3 z-10"><DeskLegend /></div>
              ) : (
                <>
                  {summaryBar}
                  <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)} className="card absolute end-3 bottom-3 z-10 inline-flex h-11 items-center gap-1.5 px-3 text-sm font-medium">
                    <Icon icon="info-circle" className="text-base" aria-hidden="true" />สัญลักษณ์
                  </button>
                  {legendOpen && <div className="absolute end-3 bottom-16 z-20 w-72"><DeskLegend /></div>}
                </>
              )}
              {overviewOpen && !lg && (
                <DeskSidePanel label="ภาพรวมห้องแชท" onClose={() => setOverviewOpen(false)}>
                  <div className="border-default-300 flex items-center justify-between border-b border-dashed p-4">
                    <div className="text-default-900 font-semibold">ภาพรวมห้องแชท</div>
                    <button type="button" onClick={() => setOverviewOpen(false)} aria-label="ปิดแผง" className="btn btn-icon text-default-700 hover:bg-default-100">
                      <Icon icon="x" className="text-lg" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">{cards}</div>
                </DeskSidePanel>
              )}
            </>
          ) : lg ? (
            <div className="flex size-full gap-4 p-3">
              <div className="w-80 shrink-0 space-y-3 overflow-y-auto pe-1">{cards}</div>
              <div className="min-w-0 flex-1 space-y-3 overflow-y-auto pe-1">
                {sceneBanner}
                {clearFiltersBar}
                {list2d}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {sceneBanner}
              <div className="card divide-default-300 grid grid-cols-2 divide-x">
                <div className="p-3">
                  <div className="text-default-700 flex items-center gap-1 text-xs"><Icon icon="clock" width={13} height={13} aria-hidden="true" />รอคำตอบ</div>
                  <div className="text-xl font-bold tabular-nums">{fmtInt(s.waiting)}{s.awaitingCapped ? '+' : ''}</div>
                </div>
                <div className="p-3">
                  <div className="text-default-700 flex items-center gap-1 text-xs"><Icon icon="alert-triangle" width={13} height={13} aria-hidden="true" />เกินเวลาตอบ</div>
                  <div className={`text-xl font-bold tabular-nums ${s.overdue > 0 ? 'text-danger-ink' : ''}`}>{fmtInt(s.overdue)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                {filtersNode('button')}
                <span className="text-default-700 inline-flex items-center gap-1 text-xs">
                  อัปเดต <span className="tabular-nums">{lastUpdatedAt ? formatTimeHM(lastUpdatedAt) : '—'}</span>
                  <button type="button" onClick={refresh} aria-label="ดึงข้อมูลใหม่" className="btn btn-icon">
                    <Icon icon="refresh" className="text-lg" aria-hidden="true" />
                  </button>
                </span>
              </div>
              {clearFiltersBar}
              {list2d}
              <details className="card">
                <summary className="flex h-12 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium">
                  <Icon icon="chevron-right" className="text-default-400 text-sm" aria-hidden="true" />
                  ภาพรวมห้องแชท / ช่องทาง / ความเคลื่อนไหว
                </summary>
                <div className="space-y-3 p-3">{cards}</div>
              </details>
            </div>
          )}
          {panel}
        </div>
      )}
    </>
  )
}
