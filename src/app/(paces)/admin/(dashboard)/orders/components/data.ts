export type AdminOrderStatus =
  | 'PENDING'
  | 'SHIPPED'
  | 'CONFIRMED'
  | 'CANCELLED'

export type AdminOrderType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE'

export type AdminOrderItemRow = {
  name: string
  qty: number
  price: number
}

export type AdminOrderRow = {
  id: string // internal order id
  publicToken: string // full token (for /o/{token} link)
  tokenShort: string // first 8 chars

  // Shop
  shopName: string
  sellerUsername: string
  shopUrl: string // buyer-subdomain /u/{sellerUsername}

  // Buyer — one of three display modes
  buyerDisplayName: string | null
  buyerUsername: string | null
  buyerContactMasked: string | null // masked phone/contact (fallback)

  // Items
  firstItemName: string
  extraItemCount: number // N s.t. "+อีก N"
  items: AdminOrderItemRow[]

  // Money + meta
  total: number
  type: AdminOrderType
  status: AdminOrderStatus
  createdAt: string // ISO
  createdAtTh: string // formatted th-TH short

  // Cross-subdomain view URL (/o/{token})
  viewUrl: string
}
