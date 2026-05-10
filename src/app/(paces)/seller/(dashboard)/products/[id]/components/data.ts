export type ProductDetailProps = {
  id: string
  name: string
  description: string
  images: string[]
  price: number
  type: 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'SUBSCRIPTION'
  totalSold: number
  reviews: number
  rating: number
  createdAt: string
}

export type ReviewRow = {
  id: string
  rating: number
  comment: string
  reviewerLabel: string
  createdAt: string
}
