export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TicketStatus = 'open' | 'quoted' | 'accepted' | 'in_progress' | 'completed' | 'cancelled' | 'declined' | 'pending_sign_off' | 'snag' | 'snag_in_progress' | 'variation_pending' | 'variation_accepted'
export type QuoteStatus = 'pending' | 'accepted' | 'declined'
export type QuoteType = 'quote' | 'variation'
export type UserRole = 'client' | 'store_manager' | 'regional_manager' | 'supplier'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  company_name: string | null
  sub_store: string | null
  regional_manager_id: string | null
  capex_budget: number | null
  closed_at: string | null
  closure_reason: string | null
  created_at: string
}

export interface Ticket {
  id: string
  job_number?: number | null
  client_id: string
  title: string
  description: string
  priority: Priority
  status: TicketStatus
  photo_urls: string[]
  created_at: string
  updated_at: string
  profiles?: Profile
  quotes?: Quote[]
}

export interface Quote {
  id: string
  ticket_id: string
  admin_id: string
  type: QuoteType
  amount: number
  amount_incl_vat: number | null
  description: string
  valid_until: string | null
  file_url: string | null
  status: QuoteStatus
  decline_reason?: string | null
  created_at: string
  tickets?: Ticket
  profiles?: Profile
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  link: string | null
  read: boolean
  created_at: string
}

export interface Supplier {
  id: string
  company_name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  trade: string | null
  qualified: boolean
  qualification_number: string | null
  qualification_expiry: string | null
  vat_number: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export function isStoreManager(role: UserRole | string | null) {
  return role === 'store_manager' || role === 'client'
}

export interface Completion {
  id: string
  ticket_id: string
  admin_id: string
  coc_url: string | null
  poc_urls: string[]
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  tickets?: Ticket
  profiles?: Profile
}
