'use client'

/**
 * ChatThread — client thread body ของ /messages/[shopId] (feature 00011 Deep Chat, S-10)
 *
 * Base (bubble structure): theme/vuexy/typescript-version/full-version/src/views/apps/chat/ChatLog.tsx
 *   — คงสี/ทิศทาง bubble (ซ้าย=SHOP bg-backgroundPaper, ขวา=BUYER bg-primary+contrastText, rounded)
 *   Adapt: ตัด PerfectScrollbar/msgGroup-consecutive-avatar → plain `<div overflow-y-auto>` + ref
 *   (ต้อง programmatic scroll: preserve-scroll ตอนโหลดข้อความเก่า + auto-scroll-bottom ตอนส่ง/รับใหม่)
 *   ตัด msgStatus (isSeen/isDelivered/isSent) ทั้งหมด — ไม่มี per-message read-receipt (SDS §5 FROZEN CONTRACT)
 * Base (composer): theme/.../apps/chat/SendMsgForm.tsx — คง TextField multiline + endAdornment icon row
 *   Adapt: ตัด emoji-mart Picker + microphone icon ทั้งหมด; attach เปลี่ยนจาก plain <input hidden> เป็น
 *   auto-upload flow (pattern ProductImagesCardV2.tsx: FormData → POST /api/upload → {fileId}) + preview Chip
 * Realtime subscribe pattern: src/app/(marketing)/a/[id]/AuctionDetailClient.tsx:144-179
 *   (signal-only broadcast, ไม่เชื่อ payload — refetch authoritative เสมอ)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'

import { Icon } from '@iconify/react'
import { toast } from 'react-toastify'

import CustomAvatar from '@core/components/mui/Avatar'
import { getInitials } from '@/utils/getInitials'
import { formatDate, formatTime } from '@/lib/format-date'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

type SenderRole = 'BUYER' | 'SHOP'
type ChatMessageType = 'TEXT' | 'IMAGE'

type ChatMessageView = {
  id: string
  conversationId: string
  senderUserId: string
  senderRole: SenderRole
  type: ChatMessageType
  body: string | null
  imageUrl: string | null
  createdAt: string
}

type ConversationSummary = {
  id: string
  buyerUserId: string
  shopId: string
}

type MessagesResponse = { items: ChatMessageView[]; nextCursor: string | null }

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'
const IMAGE_MIME_ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_MAX_SIZE = 5 * 1024 * 1024

type PendingImage = { file: File; previewUrl: string }

function mapSendError(status: number, apiError?: string): string {
  if (status === 429) return 'ส่งข้อความเร็วเกินไป กรุณารอสักครู่'
  return apiError ?? 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่'
}

/** จัดกลุ่มข้อความตามวันที่ (formatDate พ.ศ. — ห้าม theme formatDateToMonthShort) สำหรับ divider คั่นวัน */
function groupByDate(messages: ChatMessageView[]): { dateLabel: string; messages: ChatMessageView[] }[] {
  const groups: { dateLabel: string; messages: ChatMessageView[] }[] = []
  for (const m of messages) {
    const dateLabel = formatDate(m.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.dateLabel === dateLabel) last.messages.push(m)
    else groups.push({ dateLabel, messages: [m] })
  }
  return groups
}

type Props = { shopId: string; shopName: string; shopLogo: string | null }

export default function ChatThread({ shopId, shopName, shopLogo }: Props) {
  const { data: session } = useSession()
  const myUserId = (session?.user as { id?: string } | undefined)?.id ?? null

  const [conversation, setConversation] = useState<ConversationSummary | null>(null)
  const [convError, setConvError] = useState<'not-found' | 'generic' | null>(null)
  const [loadingConv, setLoadingConv] = useState(true)

  const [messages, setMessages] = useState<ChatMessageView[]>([])
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [olderLoadError, setOlderLoadError] = useState(false)

  const [msgText, setMsgText] = useState('')
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const [optimisticPreviews, setOptimisticPreviews] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  const scrollBoxRef = useRef<HTMLDivElement | null>(null)
  const topSentinelRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    const el = scrollBoxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const markRead = useCallback((convId: string) => {
    fetch(`/api/chat/conversations/${convId}/read`, { method: 'POST' }).catch(() => {
      // เงียบ — mark-read ไม่ critical พอที่จะ toast รบกวน user
    })
  }, [])

  const markReadDebounced = useCallback(
    (convId: string) => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current)
      markReadTimerRef.current = setTimeout(() => markRead(convId), 400)
    },
    [markRead],
  )

  const fetchLatest = useCallback(async (convId: string): Promise<MessagesResponse> => {
    const res = await fetch(`/api/chat/conversations/${convId}/messages`)
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as MessagesResponse
  }, [])

  // 1) get-or-create conversation → 2) โหลดข้อความชุดแรก (reverse ก่อน render) → 3) mark-read
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoadingConv(true)
      setConvError(null)
      try {
        const convRes = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shopId }),
        })
        if (!convRes.ok) {
          if (cancelled) return
          setConvError(convRes.status === 404 ? 'not-found' : 'generic')
          return
        }
        const conv = (await convRes.json()) as ConversationSummary
        if (cancelled) return
        setConversation(conv)

        const data = await fetchLatest(conv.id)
        if (cancelled) return
        setMessages(data.items.slice().reverse())
        setOlderCursor(data.nextCursor)
        markRead(conv.id)
        requestAnimationFrame(scrollToBottom)
      } catch {
        if (!cancelled) setConvError('generic')
      } finally {
        if (!cancelled) setLoadingConv(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init ครั้งเดียวต่อ shopId เท่านั้น
  }, [shopId])

  // realtime subscribe — signal-only, refetch authoritative (pattern AuctionDetailClient.tsx:144-179)
  useEffect(() => {
    if (!conversation) return
    const supabase = getSupabaseBrowserClient()
    let refetchTimer: ReturnType<typeof setTimeout> | null = null

    const refetchNewer = () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      refetchTimer = setTimeout(() => {
        fetchLatest(conversation.id)
          .then((data) => {
            const latestAsc = data.items.slice().reverse()
            setMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id))
              const fresh = latestAsc.filter((m) => !existingIds.has(m.id))
              if (fresh.length === 0) return prev
              return [...prev, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            })
            markReadDebounced(conversation.id)
            requestAnimationFrame(scrollToBottom)
          })
          .catch(() => {
            // เงียบ — sync รอบถัดไปจาก broadcast/fallback
          })
      }, 400)
    }

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on('broadcast', { event: 'update' }, refetchNewer)
      .subscribe()

    // fallback: focus/visibilitychange — เผื่อ broadcast หลุด
    const onFocus = () => refetchNewer()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe ตาม conversation.id เท่านั้น
  }, [conversation?.id])

  const loadOlder = useCallback(async () => {
    if (!conversation || !olderCursor || loadingOlder) return
    setLoadingOlder(true)
    setOlderLoadError(false)
    const container = scrollBoxRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversation.id}/messages?cursor=${encodeURIComponent(olderCursor)}`,
      )
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as MessagesResponse
      const olderAsc = data.items.slice().reverse()
      setMessages((prev) => [...olderAsc, ...prev])
      setOlderCursor(data.nextCursor)
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - prevScrollHeight
      })
    } catch {
      setOlderLoadError(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [conversation, olderCursor, loadingOlder])

  // infinite-scroll-up — sentinel บนสุดของลิสต์ (preserve scroll หลังโหลดเสร็จ)
  useEffect(() => {
    if (!olderCursor) return
    const el = topSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !olderLoadError) loadOlder()
      },
      { root: scrollBoxRef.current, threshold: 0.1 },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก sentinel/olderCursor/olderLoadError เท่านั้น
  }, [olderCursor, olderLoadError, loadOlder])

  function handleAttachClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // เคลียร์เพื่อเลือกไฟล์เดิมซ้ำได้
    if (!file) return
    if (!IMAGE_MIME_ALLOWED.has(file.type) || file.size > IMAGE_MAX_SIZE) {
      toast.error('รองรับเฉพาะ JPG/PNG/WEBP ≤5MB')
      return
    }
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl)
    setPendingImage(null)
  }

  async function sendTextMessage(convId: string, text: string) {
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessageView = {
      id: tempId,
      conversationId: convId,
      senderUserId: myUserId ?? '',
      senderRole: 'BUYER',
      type: 'TEXT',
      body: text,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    requestAnimationFrame(scrollToBottom)
    setSending(true)
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'TEXT', body: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        toast.error(mapSendError(res.status, data.error))
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessageView) : m)))
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error('ส่งข้อความไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setSending(false)
    }
  }

  async function sendImageMessage(convId: string, image: PendingImage, caption: string | null) {
    const tempId = `temp-${Date.now()}`
    const optimisticMsg: ChatMessageView = {
      id: tempId,
      conversationId: convId,
      senderUserId: myUserId ?? '',
      senderRole: 'BUYER',
      type: 'IMAGE',
      body: caption,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    }
    setOptimisticPreviews((prev) => ({ ...prev, [tempId]: image.previewUrl }))
    setMessages((prev) => [...prev, optimisticMsg])
    requestAnimationFrame(scrollToBottom)
    setSending(true)
    try {
      const fd = new FormData()
      fd.append('file', image.file)
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) throw new Error('รองรับเฉพาะ JPG/PNG/WEBP ≤5MB')
      const { fileId } = (await uploadRes.json()) as { fileId: string }

      const res = await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'IMAGE', imageUrl: fileId, body: caption }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(mapSendError(res.status, data.error))
      setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as ChatMessageView) : m)))
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error(e instanceof Error && e.message ? e.message : 'ส่งรูปไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setOptimisticPreviews((prev) => {
        const next = { ...prev }
        delete next[tempId]
        return next
      })
      URL.revokeObjectURL(image.previewUrl)
      setSending(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!conversation || sending) return
    const text = msgText.trim()
    const caption = text || null

    if (pendingImage) {
      const image = pendingImage
      setPendingImage(null)
      setMsgText('')
      await sendImageMessage(conversation.id, image, caption)
      return
    }
    if (!text) return
    setMsgText('')
    await sendTextMessage(conversation.id, text)
  }

  // --- Render states ---

  if (convError) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4 }}>
        <CustomAvatar variant='circular' size={72} color='error' skin='light'>
          <Icon icon='tabler-message-off' fontSize={36} />
        </CustomAvatar>
        <Typography sx={{ fontWeight: 600 }}>
          {convError === 'not-found' ? 'ไม่พบร้านค้านี้' : 'ไม่มีสิทธิ์เข้าถึงบทสนทนานี้'}
        </Typography>
      </Box>
    )
  }

  if (loadingConv) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  const dateGroups = groupByDate(messages)

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* message list — plain div ref (ต้อง programmatic scroll: preserve-scroll ตอนโหลดเก่า/auto-scroll ตอนส่งใหม่) */}
      <Box ref={scrollBoxRef} sx={{ flex: 1, overflowY: 'auto', px: '16px', py: '12px', bgcolor: 'background.default' }}>
        {olderCursor && (
          <Box ref={topSentinelRef} sx={{ display: 'flex', justifyContent: 'center', py: '10px' }}>
            {olderLoadError ? (
              <Box
                component='button'
                type='button'
                onClick={loadOlder}
                sx={{ border: 'none', background: 'none', cursor: 'pointer', color: 'error.main', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon icon='tabler-refresh' fontSize={14} />
                โหลดข้อความเก่าไม่สำเร็จ ลองใหม่
              </Box>
            ) : (
              <CircularProgress size={16} />
            )}
          </Box>
        )}

        {messages.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', py: 8 }}>
            <CustomAvatar variant='circular' size={72} color='primary' skin='light'>
              <Icon icon='tabler-message-2' fontSize={36} />
            </CustomAvatar>
            <Typography color='text.secondary' sx={{ fontSize: 14 }}>
              เริ่มต้นทักทาย {shopName} ได้เลย
            </Typography>
          </Box>
        ) : (
          dateGroups.map((group) => (
            <Box key={group.dateLabel}>
              <Box sx={{ display: 'flex', justifyContent: 'center', py: '10px' }}>
                <Box sx={{ px: '12px', py: '3px', borderRadius: 999, bgcolor: 'action.selected', fontSize: 11.5, color: 'text.secondary' }}>
                  {group.dateLabel}
                </Box>
              </Box>
              {group.messages.map((msg) => {
                const isBuyer = msg.senderRole === 'BUYER'
                const imgSrc = msg.imageUrl ? `/api/files/${msg.imageUrl}` : optimisticPreviews[msg.id]

                return (
                  <Box key={msg.id} sx={{ display: 'flex', gap: '10px', py: '6px', flexDirection: isBuyer ? 'row-reverse' : 'row' }}>
                    {!isBuyer && (
                      <CustomAvatar
                        src={shopLogo ? `/api/files/${shopLogo}` : undefined}
                        skin='light'
                        size={28}
                        sx={{ flexShrink: 0 }}
                      >
                        {getInitials(shopName)}
                      </CustomAvatar>
                    )}
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isBuyer ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                      <Box
                        sx={{
                          px: msg.type === 'IMAGE' ? '6px' : '14px',
                          py: msg.type === 'IMAGE' ? '6px' : '9px',
                          borderRadius: isBuyer ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                          bgcolor: isBuyer ? 'primary.main' : 'background.paper',
                          color: isBuyer ? 'primary.contrastText' : 'text.primary',
                          boxShadow: 'var(--mui-customShadows-xs)',
                        }}
                      >
                        {msg.type === 'IMAGE' && imgSrc && (
                          // eslint-disable-next-line @next/next/no-img-element -- ChatMessage.imageUrl = raw fileId, render ผ่าน /api/files/{id} เสมอ (SDS §5 FROZEN CONTRACT)
                          <img
                            src={imgSrc}
                            alt='รูปภาพที่ส่ง'
                            style={{ maxWidth: 220, maxHeight: 220, borderRadius: 8, display: 'block' }}
                          />
                        )}
                        {msg.body && (
                          <Typography
                            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, mt: msg.type === 'IMAGE' ? '6px' : 0 }}
                          >
                            {msg.body}
                          </Typography>
                        )}
                      </Box>
                      <Typography variant='caption' color='text.disabled' sx={{ mt: '2px', px: '4px' }}>
                        {formatTime(msg.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ))
        )}
      </Box>

      {/* composer — ตัด emoji-mart + microphone ตาม UX spec */}
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', p: '12px', flexShrink: 0 }}>
        {pendingImage && (
          <Box sx={{ mb: '8px' }}>
            <Chip
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview เท่านั้น ไม่ใช่ /api/files
              avatar={<img src={pendingImage.previewUrl} alt='ตัวอย่างรูปภาพ' style={{ borderRadius: '50%' }} />}
              label={pendingImage.file.name}
              onDelete={clearPendingImage}
            />
          </Box>
        )}
        <Box component='form' onSubmit={handleSend} sx={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <input ref={fileInputRef} type='file' accept={IMAGE_ACCEPT} hidden onChange={handleFileChange} />
          <IconButton onClick={handleAttachClick} disabled={sending} aria-label='แนบรูปภาพ'>
            <Icon icon='tabler-paperclip' />
          </IconButton>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size='small'
            placeholder={pendingImage ? 'เพิ่มคำบรรยาย (ไม่บังคับ)' : 'พิมพ์ข้อความ...'}
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                handleSend(e)
              }
            }}
            disabled={sending}
          />
          <IconButton type='submit' color='primary' disabled={sending || (!msgText.trim() && !pendingImage)} aria-label='ส่งข้อความ'>
            <Icon icon='tabler-send' />
          </IconButton>
        </Box>
      </Box>
    </Box>
  )
}
