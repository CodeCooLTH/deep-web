'use client'

// Base: theme/vuexy/typescript-version/full-version/src/components/layout/shared/NotificationsDropdown.tsx
// ปรับ: prop-driven → self-fetch GET /api/notifications (เหมือน UserDropdown.tsx useSession pattern)
// ปิด FLAG-3 feat 00011 Deep Chat — buyer web bell (Vuexy)

// React Imports
import { useRef, useState, useEffect, useCallback } from 'react'
import type { MouseEvent } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// MUI Imports
import IconButton from '@mui/material/IconButton'
import Badge from '@mui/material/Badge'
import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Divider from '@mui/material/Divider'
import useMediaQuery from '@mui/material/useMediaQuery'
import CircularProgress from '@mui/material/CircularProgress'
import type { Theme } from '@mui/material/styles'

// Third Party Components
import classnames from 'classnames'
import PerfectScrollbar from 'react-perfect-scrollbar'
import { useSession } from 'next-auth/react'
import { toast } from 'react-toastify'

// Type Imports
import type { ThemeColor } from '@core/types'

// Component Imports
import CustomAvatar from '@core/components/mui/Avatar'

// Config Imports
import themeConfig from '@configs/themeConfig'

// Hook Imports
import { useSettings } from '@core/hooks/useSettings'

// Util Imports
import { relativeTimeTh } from '@/lib/relative-time-th'

// รูปแบบรายการที่ได้จาก GET /api/notifications (Notification table: kind=chat_message/badge_earned)
type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string
  refId: string | null
  read: boolean
  createdAt: string
}

const ScrollWrapper = ({ children, hidden }: { children: React.ReactNode; hidden: boolean }) => {
  if (hidden) {
    return <div className='overflow-x-hidden bs-full'>{children}</div>
  } else {
    return (
      <PerfectScrollbar className='bs-full' options={{ wheelPropagation: false, suppressScrollX: true }}>
        {children}
      </PerfectScrollbar>
    )
  }
}

// avatar ตาม kind — chat_message=message-circle primary, badge_earned=award warning, อื่น=bell (fallback secondary)
const getAvatarByKind = (kind: string) => {
  let icon = 'tabler-bell'
  let color: ThemeColor = 'secondary'

  if (kind === 'chat_message') {
    icon = 'tabler-message-circle'
    color = 'primary'
  } else if (kind === 'badge_earned') {
    icon = 'tabler-award'
    color = 'warning'
  }

  return (
    <CustomAvatar color={color} skin='light-static'>
      <i className={icon} />
    </CustomAvatar>
  )
}

const NotificationsDropdown = () => {
  // States
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  // Refs
  const anchorRef = useRef<HTMLButtonElement>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  // Hooks
  const hidden = useMediaQuery((theme: Theme) => theme.breakpoints.down('lg'))
  const isSmallScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const { settings } = useSettings()
  const { status } = useSession()
  const router = useRouter()

  const isAuthed = status === 'authenticated'

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) throw new Error('fetch notifications failed')
      const data = await res.json()
      setItems(data.items ?? [])
      setUnreadCount(data.unreadCount ?? 0)
    } catch (error) {
      console.error(error)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // fetch on mount (เมื่อ authed) — OQ3
  useEffect(() => {
    if (isAuthed) {
      fetchNotifications()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed])

  // refetch on dropdown open — OQ3
  useEffect(() => {
    if (open && isAuthed) {
      fetchNotifications()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClose = () => {
    setOpen(false)
  }

  const handleToggle = () => {
    setOpen(prevOpen => !prevOpen)
  }

  // เรียก backend mark-read ทางเดียว (ไม่มี mark-unread) — id=รายการเดียว, ไม่มี id=ทั้งหมด
  const callMarkRead = async (id?: string) => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : {})
      })
      if (!res.ok) throw new Error('mark-read failed')
    } catch (error) {
      console.error(error)
      toast.error('ทำเครื่องหมายอ่านแล้วไม่สำเร็จ')
    }
  }

  // deep-link ตาม kind: chat_message→/messages, badge_earned→/badges, kind อื่น→ไม่ navigate
  const getDeepLink = (kind: string) => {
    if (kind === 'chat_message') return '/messages'
    if (kind === 'badge_earned') return '/badges'
    return null
  }

  const handleItemClick = async (event: MouseEvent<HTMLElement>, item: NotificationItem) => {
    event.stopPropagation()

    if (!item.read) {
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, read: true } : n)))
      setUnreadCount(prev => Math.max(0, prev - 1))
    }

    const href = getDeepLink(item.kind)

    if (href) {
      handleClose()
      router.push(href)
    }

    await callMarkRead(item.id)
  }

  const handleMarkAllRead = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    if (items.length === 0 || unreadCount === 0) return

    setItems(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
    callMarkRead()
  }

  useEffect(() => {
    const adjustPopoverHeight = () => {
      if (ref.current) {
        // Calculate available height, subtracting any fixed UI elements' height as necessary
        const availableHeight = window.innerHeight - 100

        ref.current.style.height = `${Math.min(availableHeight, 550)}px`
      }
    }

    window.addEventListener('resize', adjustPopoverHeight)

    return () => window.removeEventListener('resize', adjustPopoverHeight)
  }, [])

  return (
    <>
      {/* 44×44 — sizeMedium ของธีม = 38px ต่ำกว่า tap target (DESIGN.md §Do's) */}
      <IconButton
        ref={anchorRef}
        onClick={handleToggle}
        className='text-textPrimary'
        sx={{ inlineSize: 44, blockSize: 44 }}
      >
        <Badge
          color='error'
          className='cursor-pointer'
          variant='dot'
          overlap='circular'
          invisible={unreadCount === 0}
          sx={{
            '& .MuiBadge-dot': { top: 6, right: 5, boxShadow: 'var(--mui-palette-background-paper) 0px 0px 0px 2px' }
          }}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <i className='tabler-bell' />
        </Badge>
      </IconButton>
      <Popper
        open={open}
        transition
        disablePortal
        placement='bottom-end'
        ref={ref}
        anchorEl={anchorRef.current}
        {...(isSmallScreen
          ? {
              className: 'is-full !mbs-3 z-[1] max-bs-[550px] bs-[550px]',
              modifiers: [
                {
                  name: 'preventOverflow',
                  options: {
                    padding: themeConfig.layoutPadding
                  }
                }
              ]
            }
          : { className: 'is-96 !mbs-3 z-[1] max-bs-[550px] bs-[550px]' })}
      >
        {({ TransitionProps, placement }) => (
          <Fade {...TransitionProps} style={{ transformOrigin: placement === 'bottom-end' ? 'right top' : 'left top' }}>
            <Paper className={classnames('bs-full', settings.skin === 'bordered' ? 'border shadow-none' : 'shadow-lg')}>
              <ClickAwayListener onClickAway={handleClose}>
                <div className='bs-full flex flex-col'>
                  <div className='flex items-center justify-between plb-3.5 pli-4 is-full gap-2'>
                    <Typography variant='h6' className='flex-auto'>
                      การแจ้งเตือน
                    </Typography>
                    {unreadCount > 0 && (
                      <Chip size='small' variant='tonal' color='primary' label={`${unreadCount} New`} />
                    )}
                    {items.length > 0 && (
                      <Tooltip
                        title='ทำเครื่องหมายว่าอ่านแล้วทั้งหมด'
                        placement={placement === 'bottom-end' ? 'left' : 'right'}
                      >
                        <IconButton size='small' onClick={handleMarkAllRead} className='text-textPrimary'>
                          <i className='tabler-mail-opened' />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                  <Divider />
                  {loading ? (
                    <div className='flex flex-col items-center justify-center gap-2 bs-full plb-10'>
                      <CircularProgress size={28} />
                      <Typography variant='caption' color='text.disabled'>
                        กำลังโหลด...
                      </Typography>
                    </div>
                  ) : fetchError ? (
                    <div className='flex flex-col items-center justify-center gap-2 bs-full plb-10'>
                      <i className='tabler-alert-circle text-4xl text-textDisabled' />
                      <Typography variant='body2' color='text.secondary'>
                        โหลดการแจ้งเตือนไม่สำเร็จ
                      </Typography>
                      <button
                        type='button'
                        className='text-primary text-[13px] font-medium'
                        onClick={() => fetchNotifications()}
                      >
                        ลองใหม่
                      </button>
                    </div>
                  ) : items.length === 0 ? (
                    <div className='flex flex-col items-center justify-center gap-2 bs-full plb-10'>
                      <i className='tabler-bell-off text-4xl text-textDisabled' />
                      <Typography variant='body2' color='text.disabled'>
                        ยังไม่มีการแจ้งเตือน
                      </Typography>
                    </div>
                  ) : (
                    <ScrollWrapper hidden={hidden}>
                      {items.map((item, index) => (
                        <div
                          key={item.id}
                          className={classnames('flex plb-3 pli-4 gap-3 cursor-pointer hover:bg-actionHover', {
                            'border-be': index !== items.length - 1,
                            'bg-primary/[0.04]': !item.read
                          })}
                          onClick={e => handleItemClick(e, item)}
                        >
                          {getAvatarByKind(item.kind)}
                          <div className='flex flex-col flex-auto'>
                            <Typography variant='body2' className='font-medium mbe-1' color='text.primary'>
                              {item.title}
                            </Typography>
                            <Typography variant='caption' color='text.secondary' className='mbe-2'>
                              {item.body}
                            </Typography>
                            <Typography variant='caption' color='text.disabled'>
                              {relativeTimeTh(new Date(item.createdAt).getTime())}
                            </Typography>
                          </div>
                          {!item.read && (
                            <div className='flex flex-col items-end'>
                              <Badge variant='dot' color='primary' className='mbs-1 mie-1' />
                            </div>
                          )}
                        </div>
                      ))}
                    </ScrollWrapper>
                  )}
                </div>
              </ClickAwayListener>
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  )
}

export default NotificationsDropdown
