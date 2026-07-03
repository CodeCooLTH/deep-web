'use client'

/**
 * BuyerChatWidget — floating chat bubble (มุมขวาล่าง) + panel (list↔thread) สำหรับ buyer (Vuexy)
 * feature 00011 Deep Chat ต่อ (ChatWidget), อ่าน UX-Design-Spec-Bubble.md ก่อนแก้
 *
 * Base (Popper+Fade+Paper+ClickAwayListener โครง icon-button→floating panel):
 *   src/components/layout/shared/NotificationsDropdown.tsx:173-311 (Popper/Fade/Paper/ClickAway
 *   + fetch-on-mount/fetch-on-open pattern) — เพิ่ม 2-view (list/thread) + back button
 * Base (list row markup): src/app/(marketing)/(buyer-app)/messages/page.tsx (renderChat li)
 *   — เปลี่ยน Link → onClick สลับ view แทน navigate; คง isUnread/formatInboxTime logic
 * Reuse ตรง (ไม่แก้): src/app/(marketing)/(buyer-app)/messages/[shopId]/ChatThread.tsx (thread body)
 *
 * State (open/view/activeShopId) persist ข้าม open/close ตาม resolved decision OQ3 (ไม่ reset ตอนปิด)
 * Breakpoint `lg` (resolved FINDING 1) — ≥lg = bubble+panel, <lg = bubble เล็ก router.push('/messages')
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import Badge from '@mui/material/Badge'
import IconButton from '@mui/material/IconButton'
import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

import { Icon } from '@iconify/react'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import { formatDate, formatTime } from '@/lib/format-date'

import ChatThread from '@/app/(marketing)/(buyer-app)/messages/[shopId]/ChatThread'

type SenderRole = 'BUYER' | 'SHOP'

// รูปแบบเดียวกับ messages/page.tsx (ConversationListItem) — ไม่ export จากที่นั่น จึงประกาศซ้ำที่นี่
type ConversationListItem = {
  id: string
  shopId: string
  lastMessageAt: string
  lastMessagePreview: string | null
  lastSenderRole: SenderRole | null
  buyerLastReadAt: string | null
  shopLastReadAt: string | null
  counterparty: { shopName: string; logo: string | null } | null
}

type ListResponse = { items: ConversationListItem[]; nextCursor: string | null }

const UNREAD_BADGE_MAX = 99

/** เวลาแถวรายการ — วันนี้โชว์เวลา (formatTime), อื่น ๆ โชว์วันที่ (formatDate); format-date.ts เท่านั้น */
function formatInboxTime(iso: string): string {
  const d = new Date(iso)
  const isToday = d.toDateString() === new Date().toDateString()
  return isToday ? formatTime(d) : formatDate(d)
}

function isUnread(item: ConversationListItem): boolean {
  return item.lastSenderRole === 'SHOP' && (item.buyerLastReadAt === null || item.lastMessageAt > item.buyerLastReadAt)
}

// icon-button สีขาวบนพื้น primary ของ header panel (composition token — HR7 ไม่เกี่ยว buyer/Vuexy)
const headerIconBtnSx = {
  color: 'common.white',
  bgcolor: 'rgba(255,255,255,0.16)',
  '&:hover': { bgcolor: 'rgba(255,255,255,0.28)' },
}

type View = 'list' | 'thread'

export default function BuyerChatWidget() {
  const theme = useTheme()
  const router = useRouter()
  const isLgUp = useMediaQuery(theme.breakpoints.up('lg'))

  const [open, setOpen] = useState(false)
  // persist view/active conversation ข้าม open/close (OQ3) — ไม่ reset ใน handleClose
  const [view, setView] = useState<View>('list')
  const [activeShopId, setActiveShopId] = useState<string | null>(null)
  const [activeShopName, setActiveShopName] = useState<string>('')
  const [activeShopLogo, setActiveShopLogo] = useState<string | null>(null)

  const [items, setItems] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const bubbleRef = useRef<HTMLButtonElement>(null)

  const unreadCount = items.filter(isUnread).length
  const badgeLabel = unreadCount > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : unreadCount

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch('/api/chat/conversations')
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as ListResponse
      setItems(data.items)
    } catch {
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // fetch on mount — ให้ badge นับ unread ได้ทันทีแม้ยังไม่เปิด panel
  useEffect(() => {
    fetchConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch ครั้งเดียวตอน mount
  }, [])

  // refetch on open (pattern NotificationsDropdown OQ3)
  useEffect(() => {
    if (open) fetchConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleBubbleClick() {
    if (!isLgUp) {
      router.push('/messages')
      return
    }
    setOpen((prev) => !prev)
  }

  function handleClose() {
    setOpen(false)
  }

  function handleBack() {
    setView('list')
  }

  function handleSelectConversation(item: ConversationListItem) {
    setActiveShopId(item.shopId)
    setActiveShopName(item.counterparty?.shopName ?? 'ร้านค้า')
    setActiveShopLogo(item.counterparty?.logo ?? null)
    setView('thread')
  }

  function handleExpand() {
    if (view === 'thread' && activeShopId) {
      router.push(`/messages/${activeShopId}`)
    } else {
      router.push('/messages')
    }
    setOpen(false)
  }

  return (
    <>
      <Badge
        badgeContent={badgeLabel}
        color='error'
        overlap='circular'
        invisible={unreadCount === 0}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{
          position: 'fixed',
          bottom: { xs: 18, lg: 24 },
          right: { xs: 14, lg: 24 },
          zIndex: (t) => t.zIndex.modal, // ลอยเหนือเนื้อหาหน้าเสมอ (position:fixed ต้องชนะ stacking context ปกติ)
        }}
      >
        <Fab
          ref={bubbleRef}
          color='primary'
          size={isLgUp ? 'large' : 'medium'}
          onClick={handleBubbleClick}
          aria-label='เปิดแชท'
        >
          <Icon icon='tabler-message-circle' fontSize={26} />
        </Fab>
      </Badge>

      {isLgUp && (
        <Popper
          open={open}
          transition
          placement='top-end'
          anchorEl={bubbleRef.current}
          sx={{ zIndex: (t) => t.zIndex.modal }}
          modifiers={[{ name: 'offset', options: { offset: [0, 12] } }]}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} style={{ transformOrigin: 'right bottom' }}>
              <Paper
                elevation={8}
                sx={{
                  width: 366,
                  maxWidth: 'calc(100vw - 44px)',
                  height: 418,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  borderRadius: 2,
                }}
              >
                <ClickAwayListener onClickAway={handleClose}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* header — พื้น primary ตัวหนังสือขาว (resolved OQ4) */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        py: '12px',
                        px: '14px',
                        bgcolor: 'primary.main',
                        color: 'common.white',
                        flexShrink: 0,
                      }}
                    >
                      {view === 'thread' && (
                        <IconButton size='small' onClick={handleBack} sx={headerIconBtnSx} aria-label='กลับ'>
                          <Icon icon='tabler-arrow-left' fontSize={18} />
                        </IconButton>
                      )}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 15 }} className='truncate'>
                          {view === 'thread' ? activeShopName : 'ข้อความ'}
                        </Typography>
                        {view === 'list' && unreadCount > 0 && (
                          <Typography sx={{ fontSize: 11.5, opacity: 0.85 }}>{unreadCount} ยังไม่อ่าน</Typography>
                        )}
                      </Box>
                      <IconButton size='small' onClick={handleExpand} sx={headerIconBtnSx} aria-label='ขยายเต็มหน้า'>
                        <Icon icon='tabler-arrows-maximize' fontSize={16} />
                      </IconButton>
                      <IconButton size='small' onClick={handleClose} sx={headerIconBtnSx} aria-label='ปิด'>
                        <Icon icon='tabler-x' fontSize={18} />
                      </IconButton>
                    </Box>

                    {/* body — list ↔ thread */}
                    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                      {view === 'thread' && activeShopId ? (
                        <ChatThread shopId={activeShopId} shopName={activeShopName} shopLogo={activeShopLogo} />
                      ) : (
                        <Box sx={{ flex: 1, overflowY: 'auto' }}>
                          {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                              <CircularProgress size={26} />
                            </Box>
                          ) : fetchError && items.length === 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', py: 6 }}>
                              <Typography color='text.secondary' sx={{ fontSize: 13 }}>
                                โหลดข้อความไม่สำเร็จ
                              </Typography>
                              <Box
                                component='button'
                                type='button'
                                onClick={() => fetchConversations()}
                                sx={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  border: 'none',
                                  background: 'none',
                                  cursor: 'pointer',
                                  color: 'primary.main',
                                  fontWeight: 700,
                                  fontSize: 13,
                                }}
                              >
                                <Icon icon='tabler-refresh' fontSize={14} />
                                ลองใหม่
                              </Box>
                            </Box>
                          ) : items.length === 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', py: 7 }}>
                              <CustomAvatar variant='circular' size={56} color='primary' skin='light'>
                                <Icon icon='tabler-message-2' fontSize={28} />
                              </CustomAvatar>
                              <Typography color='text.secondary' sx={{ fontSize: 13 }}>
                                ยังไม่มีข้อความ
                              </Typography>
                            </Box>
                          ) : (
                            <Box component='ul' sx={{ listStyle: 'none', p: 0, m: 0 }}>
                              {items.map((item) => {
                                const shopName = item.counterparty?.shopName ?? 'ร้านค้า'
                                const logo = item.counterparty?.logo
                                const preview =
                                  item.lastMessagePreview === null
                                    ? 'ยังไม่มีข้อความ'
                                    : item.lastSenderRole === 'BUYER'
                                      ? `คุณ: ${item.lastMessagePreview}`
                                      : item.lastMessagePreview
                                const unread = isUnread(item)

                                return (
                                  <Box component='li' key={item.id}>
                                    <Box
                                      component='button'
                                      type='button'
                                      onClick={() => handleSelectConversation(item)}
                                      sx={{
                                        width: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '11px',
                                        py: '11px',
                                        px: '14px',
                                        border: 'none',
                                        borderBottom: '1px solid',
                                        borderColor: 'divider',
                                        bgcolor: 'transparent',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        font: 'inherit',
                                        color: 'inherit',
                                        '&:hover': { bgcolor: 'action.hover' },
                                      }}
                                    >
                                      <CustomAvatar src={logo ? `/api/files/${logo}` : undefined} skin='light' size={42}>
                                        {getInitials(shopName)}
                                      </CustomAvatar>
                                      <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography sx={{ fontWeight: unread ? 700 : 500, fontSize: 14 }} className='truncate'>
                                          {shopName}
                                        </Typography>
                                        <Typography
                                          sx={{ fontSize: 12.5 }}
                                          color={unread ? 'text.primary' : 'text.secondary'}
                                          className='truncate'
                                        >
                                          {preview}
                                        </Typography>
                                      </Box>
                                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                                        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                                          {formatInboxTime(item.lastMessageAt)}
                                        </Typography>
                                        {unread && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main' }} />}
                                      </Box>
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </ClickAwayListener>
              </Paper>
            </Fade>
          )}
        </Popper>
      )}
    </>
  )
}
