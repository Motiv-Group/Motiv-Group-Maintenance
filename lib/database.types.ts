// AUTO-GENERATED from supabase/schema.sql by scripts/gen-db-types.mjs — do not edit by hand.
// Regenerate with: npm run gen:types  (runs whenever schema.sql changes)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      approvals: {
        Row: {
          id: string
          company_id: string
          ticket_id: string | null
          quote_id: string | null
          approval_type: string
          status: string
          requested_at: string
          requested_from: string | null
          decided_by: string | null
          decided_at: string | null
          due_at: string | null
          amount: number | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          ticket_id?: string | null
          quote_id?: string | null
          approval_type?: string
          status?: string
          requested_at?: string
          requested_from?: string | null
          decided_by?: string | null
          decided_at?: string | null
          due_at?: string | null
          amount?: number | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          ticket_id?: string | null
          quote_id?: string | null
          approval_type?: string
          status?: string
          requested_at?: string
          requested_from?: string | null
          decided_by?: string | null
          decided_at?: string | null
          due_at?: string | null
          amount?: number | null
          reason?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "approvals_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "approvals_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "approvals_decided_by_fkey"
          columns: ["decided_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "approvals_requested_from_fkey"
          columns: ["requested_from"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "approvals_quote_id_fkey"
          columns: ["quote_id"]
          isOneToOne: false
          referencedRelation: "quotes"
          referencedColumns: ["id"]
        }
      ]
      }
      asset_categories: {
        Row: {
          id: string
          company_id: string
          name: string
          default_pm_interval_days: number | null
        }
        Insert: {
          id?: string
          company_id?: string
          name?: string
          default_pm_interval_days?: number | null
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          default_pm_interval_days?: number | null
        }
        Relationships: [
        {
          foreignKeyName: "asset_categories_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      asset_health_scores: {
        Row: {
          id: string
          asset_id: string
          snapshot_date: string
          score: number | null
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id?: string
          snapshot_date?: string
          score?: number | null
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          snapshot_date?: string
          score?: number | null
          status?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "asset_health_scores_asset_id_fkey"
          columns: ["asset_id"]
          isOneToOne: false
          referencedRelation: "assets"
          referencedColumns: ["id"]
        }
      ]
      }
      asset_service_history: {
        Row: {
          id: string
          asset_id: string
          ticket_id: string | null
          serviced_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          asset_id?: string
          ticket_id?: string | null
          serviced_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          asset_id?: string
          ticket_id?: string | null
          serviced_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "asset_service_history_asset_id_fkey"
          columns: ["asset_id"]
          isOneToOne: false
          referencedRelation: "assets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "asset_service_history_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      assets: {
        Row: {
          id: string
          company_id: string
          store_id: string | null
          category_id: string | null
          name: string
          asset_code: string | null
          serial_number: string | null
          installed_at: string | null
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          store_id?: string | null
          category_id?: string | null
          name?: string
          asset_code?: string | null
          serial_number?: string | null
          installed_at?: string | null
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          store_id?: string | null
          category_id?: string | null
          name?: string
          asset_code?: string | null
          serial_number?: string | null
          installed_at?: string | null
          status?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "assets_category_id_fkey"
          columns: ["category_id"]
          isOneToOne: false
          referencedRelation: "asset_categories"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "assets_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "assets_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      audit_logs: {
        Row: {
          id: string
          company_id: string | null
          actor_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          actor_id?: string | null
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          actor_id?: string | null
          action?: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "audit_logs_actor_id_fkey"
          columns: ["actor_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "audit_logs_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      companies: {
        Row: {
          id: string
          name: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_briefings: {
        Row: {
          id: string
          company_id: string
          scope: string
          scope_id: string
          briefing_date: string
          role: string
          headline: string | null
          body: string
          source: string
          facts: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          scope?: string
          scope_id?: string
          briefing_date?: string
          role?: string
          headline?: string | null
          body?: string
          source?: string
          facts?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          scope?: string
          scope_id?: string
          briefing_date?: string
          role?: string
          headline?: string | null
          body?: string
          source?: string
          facts?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      dashboard_snapshots: {
        Row: {
          id: string
          company_id: string
          scope: string
          scope_id: string | null
          snapshot_date: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          scope?: string
          scope_id?: string | null
          snapshot_date?: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          scope?: string
          scope_id?: string | null
          snapshot_date?: string
          payload?: Json
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "dashboard_snapshots_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      decision_items: {
        Row: {
          id: string
          company_id: string
          category: string
          title: string
          context: string | null
          main_driver: string | null
          business_impact: string | null
          exposure_value: number | null
          urgency: string | null
          recommended_action: string | null
          owner_id: string | null
          region_id: string | null
          store_id: string | null
          supplier_id: string | null
          priority: number | null
          due_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          category?: string
          title?: string
          context?: string | null
          main_driver?: string | null
          business_impact?: string | null
          exposure_value?: number | null
          urgency?: string | null
          recommended_action?: string | null
          owner_id?: string | null
          region_id?: string | null
          store_id?: string | null
          supplier_id?: string | null
          priority?: number | null
          due_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          category?: string
          title?: string
          context?: string | null
          main_driver?: string | null
          business_impact?: string | null
          exposure_value?: number | null
          urgency?: string | null
          recommended_action?: string | null
          owner_id?: string | null
          region_id?: string | null
          store_id?: string | null
          supplier_id?: string | null
          priority?: number | null
          due_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "decision_items_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decision_items_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decision_items_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decision_items_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "decision_items_owner_id_fkey"
          columns: ["owner_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      estate_health_scores: {
        Row: {
          id: string
          company_id: string
          snapshot_date: string
          weighted_regional_health: number | null
          risk_penalty: number | null
          final_estate_health: number | null
          status: string | null
          total_active_stores: number | null
          controlled_count: number | null
          attention_count: number | null
          at_risk_count: number | null
          critical_count: number | null
          open_tickets: number | null
          critical_tickets: number | null
          supplier_sla_breaches: number | null
          internal_sla_breaches: number | null
          decisions_pending: number | null
          cost_exposure: number | null
          main_risk_driver: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          snapshot_date?: string
          weighted_regional_health?: number | null
          risk_penalty?: number | null
          final_estate_health?: number | null
          status?: string | null
          total_active_stores?: number | null
          controlled_count?: number | null
          attention_count?: number | null
          at_risk_count?: number | null
          critical_count?: number | null
          open_tickets?: number | null
          critical_tickets?: number | null
          supplier_sla_breaches?: number | null
          internal_sla_breaches?: number | null
          decisions_pending?: number | null
          cost_exposure?: number | null
          main_risk_driver?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          snapshot_date?: string
          weighted_regional_health?: number | null
          risk_penalty?: number | null
          final_estate_health?: number | null
          status?: string | null
          total_active_stores?: number | null
          controlled_count?: number | null
          attention_count?: number | null
          at_risk_count?: number | null
          critical_count?: number | null
          open_tickets?: number | null
          critical_tickets?: number | null
          supplier_sla_breaches?: number | null
          internal_sla_breaches?: number | null
          decisions_pending?: number | null
          cost_exposure?: number | null
          main_risk_driver?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "estate_health_scores_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      notifications: {
        Row: {
          id: string
          company_id: string | null
          user_id: string
          type: string
          title: string
          message: string
          link: string | null
          read: boolean
          created_at: string
          ticket_id: string | null
          archived_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          user_id?: string
          type?: string
          title?: string
          message?: string
          link?: string | null
          read?: boolean
          created_at?: string
          ticket_id?: string | null
          archived_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          user_id?: string
          type?: string
          title?: string
          message?: string
          link?: string | null
          read?: boolean
          created_at?: string
          ticket_id?: string | null
          archived_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "notifications_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "notifications_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "notifications_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      preventative_maintenance_plans: {
        Row: {
          id: string
          company_id: string
          asset_id: string | null
          name: string
          interval_days: number
          active: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          asset_id?: string | null
          name?: string
          interval_days?: number
          active?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          asset_id?: string | null
          name?: string
          interval_days?: number
          active?: boolean | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "preventative_maintenance_plans_asset_id_fkey"
          columns: ["asset_id"]
          isOneToOne: false
          referencedRelation: "assets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "preventative_maintenance_plans_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      preventative_maintenance_tasks: {
        Row: {
          id: string
          plan_id: string | null
          due_at: string | null
          completed_at: string | null
          status: string | null
          ticket_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          plan_id?: string | null
          due_at?: string | null
          completed_at?: string | null
          status?: string | null
          ticket_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          plan_id?: string | null
          due_at?: string | null
          completed_at?: string | null
          status?: string | null
          ticket_id?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "preventative_maintenance_tasks_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "preventative_maintenance_tasks_plan_id_fkey"
          columns: ["plan_id"]
          isOneToOne: false
          referencedRelation: "preventative_maintenance_plans"
          referencedColumns: ["id"]
        }
      ]
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: []
      }
      quote_line_items: {
        Row: {
          id: string
          quote_id: string
          description: string
          qty: number | null
          unit_price: number | null
          line_total: number | null
          created_at: string
        }
        Insert: {
          id?: string
          quote_id?: string
          description?: string
          qty?: number | null
          unit_price?: number | null
          line_total?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          quote_id?: string
          description?: string
          qty?: number | null
          unit_price?: number | null
          line_total?: number | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "quote_line_items_quote_id_fkey"
          columns: ["quote_id"]
          isOneToOne: false
          referencedRelation: "quotes"
          referencedColumns: ["id"]
        }
      ]
      }
      quotes: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string | null
          submitted_by: string | null
          type: string
          amount: number
          amount_incl_vat: number | null
          description: string | null
          valid_until: string | null
          file_url: string | null
          status: string
          decline_reason: string | null
          created_at: string
          updated_at: string
          proposed_schedule_at: string | null
          warranty: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          submitted_by?: string | null
          type?: string
          amount?: number
          amount_incl_vat?: number | null
          description?: string | null
          valid_until?: string | null
          file_url?: string | null
          status?: string
          decline_reason?: string | null
          created_at?: string
          updated_at?: string
          proposed_schedule_at?: string | null
          warranty?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          submitted_by?: string | null
          type?: string
          amount?: number
          amount_incl_vat?: number | null
          description?: string | null
          valid_until?: string | null
          file_url?: string | null
          status?: string
          decline_reason?: string | null
          created_at?: string
          updated_at?: string
          proposed_schedule_at?: string | null
          warranty?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "quotes_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "quotes_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "quotes_submitted_by_fkey"
          columns: ["submitted_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "quotes_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      ratings: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string | null
          supplier_id: string | null
          contractor_id: string | null
          rated_by: string | null
          score: number
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string | null
          supplier_id?: string | null
          contractor_id?: string | null
          rated_by?: string | null
          score?: number
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string | null
          supplier_id?: string | null
          contractor_id?: string | null
          rated_by?: string | null
          score?: number
          comment?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ratings_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      regional_health_scores: {
        Row: {
          id: string
          company_id: string
          region_id: string
          snapshot_date: string
          average_store_health: number | null
          risk_penalty: number | null
          final_portfolio_health: number | null
          status: string | null
          active_stores: number | null
          controlled_count: number | null
          attention_count: number | null
          at_risk_count: number | null
          critical_count: number | null
          open_tickets: number | null
          overdue_tickets: number | null
          supplier_sla_breaches: number | null
          internal_sla_breaches: number | null
          cost_exposure: number | null
          main_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          region_id?: string
          snapshot_date?: string
          average_store_health?: number | null
          risk_penalty?: number | null
          final_portfolio_health?: number | null
          status?: string | null
          active_stores?: number | null
          controlled_count?: number | null
          attention_count?: number | null
          at_risk_count?: number | null
          critical_count?: number | null
          open_tickets?: number | null
          overdue_tickets?: number | null
          supplier_sla_breaches?: number | null
          internal_sla_breaches?: number | null
          cost_exposure?: number | null
          main_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          region_id?: string
          snapshot_date?: string
          average_store_health?: number | null
          risk_penalty?: number | null
          final_portfolio_health?: number | null
          status?: string | null
          active_stores?: number | null
          controlled_count?: number | null
          attention_count?: number | null
          at_risk_count?: number | null
          critical_count?: number | null
          open_tickets?: number | null
          overdue_tickets?: number | null
          supplier_sla_breaches?: number | null
          internal_sla_breaches?: number | null
          cost_exposure?: number | null
          main_reason?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "regional_health_scores_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "regional_health_scores_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      regional_users: {
        Row: {
          user_id: string
          region_id: string
        }
        Insert: {
          user_id?: string
          region_id?: string
        }
        Update: {
          user_id?: string
          region_id?: string
        }
        Relationships: [
        {
          foreignKeyName: "regional_users_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "regional_users_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      regions: {
        Row: {
          id: string
          company_id: string
          region_code: string
          name: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          region_code?: string
          name?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          region_code?: string
          name?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "regions_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      repeat_defect_groups: {
        Row: {
          id: string
          company_id: string
          store_id: string | null
          region_id: string | null
          category: string | null
          supplier_id: string | null
          occurrence_count: number
          window_days: number
          first_seen_at: string | null
          last_seen_at: string | null
          root_cause: string | null
          suggested_action: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          store_id?: string | null
          region_id?: string | null
          category?: string | null
          supplier_id?: string | null
          occurrence_count?: number
          window_days?: number
          first_seen_at?: string | null
          last_seen_at?: string | null
          root_cause?: string | null
          suggested_action?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          store_id?: string | null
          region_id?: string | null
          category?: string | null
          supplier_id?: string | null
          occurrence_count?: number
          window_days?: number
          first_seen_at?: string | null
          last_seen_at?: string | null
          root_cause?: string | null
          suggested_action?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "repeat_defect_groups_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "repeat_defect_groups_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "repeat_defect_groups_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "repeat_defect_groups_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      report_exports: {
        Row: {
          id: string
          report_id: string | null
          company_id: string
          exported_by: string | null
          format: string | null
          file_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          report_id?: string | null
          company_id?: string
          exported_by?: string | null
          format?: string | null
          file_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          report_id?: string | null
          company_id?: string
          exported_by?: string | null
          format?: string | null
          file_url?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "report_exports_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "report_exports_exported_by_fkey"
          columns: ["exported_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "report_exports_report_id_fkey"
          columns: ["report_id"]
          isOneToOne: false
          referencedRelation: "reports"
          referencedColumns: ["id"]
        }
      ]
      }
      reports: {
        Row: {
          id: string
          company_id: string
          role_scope: string
          report_type: string
          params: Json | null
          generated_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          role_scope?: string
          report_type?: string
          params?: Json | null
          generated_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          role_scope?: string
          report_type?: string
          params?: Json | null
          generated_by?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "reports_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "reports_generated_by_fkey"
          columns: ["generated_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      roles: {
        Row: {
          key: string
          label: string
        }
        Insert: {
          key?: string
          label?: string
        }
        Update: {
          key?: string
          label?: string
        }
        Relationships: []
      }
      signoff_rounds: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          signoff_id: string | null
          round_no: number
          kind: string
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          signoff_id?: string | null
          round_no?: number
          kind?: string
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          signoff_id?: string | null
          round_no?: number
          kind?: string
          reason?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "signoff_rounds_signoff_id_fkey"
          columns: ["signoff_id"]
          isOneToOne: false
          referencedRelation: "signoffs"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "signoff_rounds_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "signoff_rounds_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      signoffs: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string | null
          coc_url: string | null
          before_urls: string[] | null
          after_urls: string[] | null
          invoice_url: string | null
          notes: string | null
          store_confirmed_at: string | null
          status: string
          reject_reason: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          coc_url?: string | null
          before_urls?: string[] | null
          after_urls?: string[] | null
          invoice_url?: string | null
          notes?: string | null
          store_confirmed_at?: string | null
          status?: string
          reject_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          coc_url?: string | null
          before_urls?: string[] | null
          after_urls?: string[] | null
          invoice_url?: string | null
          notes?: string | null
          store_confirmed_at?: string | null
          status?: string
          reject_reason?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "signoffs_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "signoffs_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "signoffs_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "signoffs_reviewed_by_fkey"
          columns: ["reviewed_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      sla_rules: {
        Row: {
          id: string
          company_id: string | null
          priority: string
          first_response_mins: number
          attendance_mins: number
          quote_due_mins: number
          resolution_mins: number
          internal_decision_mins: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          priority?: string
          first_response_mins?: number
          attendance_mins?: number
          quote_due_mins?: number
          resolution_mins?: number
          internal_decision_mins?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          priority?: string
          first_response_mins?: number
          attendance_mins?: number
          quote_due_mins?: number
          resolution_mins?: number
          internal_decision_mins?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "sla_rules_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      snag_schedule_events: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          snag_id: string | null
          kind: string
          scheduled_for: string | null
          reason: string | null
          actor_role: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          snag_id?: string | null
          kind?: string
          scheduled_for?: string | null
          reason?: string | null
          actor_role?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          snag_id?: string | null
          kind?: string
          scheduled_for?: string | null
          reason?: string | null
          actor_role?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "snag_schedule_events_snag_id_fkey"
          columns: ["snag_id"]
          isOneToOne: false
          referencedRelation: "snags"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snag_schedule_events_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snag_schedule_events_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      snags: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string | null
          store_id: string | null
          supplier_id: string | null
          category: string | null
          severity: string | null
          description: string | null
          required_correction: string | null
          evidence_urls: string[] | null
          owner_id: string | null
          due_at: string | null
          status: string
          created_at: string
          updated_at: string
          assigned_at: string | null
          scheduled_at: string | null
          schedule_status: string | null
          schedule_decline_reason: string | null
          schedule_agreed_at: string | null
          schedule_declined_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string | null
          store_id?: string | null
          supplier_id?: string | null
          category?: string | null
          severity?: string | null
          description?: string | null
          required_correction?: string | null
          evidence_urls?: string[] | null
          owner_id?: string | null
          due_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          assigned_at?: string | null
          scheduled_at?: string | null
          schedule_status?: string | null
          schedule_decline_reason?: string | null
          schedule_agreed_at?: string | null
          schedule_declined_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string | null
          store_id?: string | null
          supplier_id?: string | null
          category?: string | null
          severity?: string | null
          description?: string | null
          required_correction?: string | null
          evidence_urls?: string[] | null
          owner_id?: string | null
          due_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
          assigned_at?: string | null
          scheduled_at?: string | null
          schedule_status?: string | null
          schedule_decline_reason?: string | null
          schedule_agreed_at?: string | null
          schedule_declined_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "snags_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snags_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snags_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snags_owner_id_fkey"
          columns: ["owner_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "snags_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      store_health_scores: {
        Row: {
          id: string
          company_id: string
          store_id: string
          region_id: string | null
          snapshot_date: string
          operational_risk_score: number | null
          sla_score: number | null
          ticket_load_score: number | null
          repeat_defect_score: number | null
          commercial_blocker_score: number | null
          data_quality_score: number | null
          calculated_health_score: number | null
          calculated_status: string | null
          override_applied: boolean | null
          override_reason: string | null
          final_health_score: number | null
          final_status: string | null
          open_tickets: number | null
          overdue_tickets: number | null
          main_issue: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          store_id?: string
          region_id?: string | null
          snapshot_date?: string
          operational_risk_score?: number | null
          sla_score?: number | null
          ticket_load_score?: number | null
          repeat_defect_score?: number | null
          commercial_blocker_score?: number | null
          data_quality_score?: number | null
          calculated_health_score?: number | null
          calculated_status?: string | null
          override_applied?: boolean | null
          override_reason?: string | null
          final_health_score?: number | null
          final_status?: string | null
          open_tickets?: number | null
          overdue_tickets?: number | null
          main_issue?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          store_id?: string
          region_id?: string | null
          snapshot_date?: string
          operational_risk_score?: number | null
          sla_score?: number | null
          ticket_load_score?: number | null
          repeat_defect_score?: number | null
          commercial_blocker_score?: number | null
          data_quality_score?: number | null
          calculated_health_score?: number | null
          calculated_status?: string | null
          override_applied?: boolean | null
          override_reason?: string | null
          final_health_score?: number | null
          final_status?: string | null
          open_tickets?: number | null
          overdue_tickets?: number | null
          main_issue?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "store_health_scores_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "store_health_scores_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "store_health_scores_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        }
      ]
      }
      store_ticket_counters: {
        Row: {
          store_id: string
          year: number
          last_number: number
        }
        Insert: {
          store_id?: string
          year?: number
          last_number?: number
        }
        Update: {
          store_id?: string
          year?: number
          last_number?: number
        }
        Relationships: []
      }
      store_users: {
        Row: {
          user_id: string
          store_id: string
        }
        Insert: {
          user_id?: string
          store_id?: string
        }
        Update: {
          user_id?: string
          store_id?: string
        }
        Relationships: [
        {
          foreignKeyName: "store_users_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "store_users_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      stores: {
        Row: {
          id: string
          company_id: string
          region_id: string | null
          region_code: string | null
          branch_code: string
          name: string
          sub_store: string | null
          address: string | null
          capex_budget: number | null
          active: boolean
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          region_id?: string | null
          region_code?: string | null
          branch_code?: string
          name?: string
          sub_store?: string | null
          address?: string | null
          capex_budget?: number | null
          active?: boolean
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          region_id?: string | null
          region_code?: string | null
          branch_code?: string
          name?: string
          sub_store?: string | null
          address?: string | null
          capex_budget?: number | null
          active?: boolean
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "stores_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "stores_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_escalations: {
        Row: {
          id: string
          company_id: string
          supplier_id: string
          region_id: string | null
          issue: string
          action_required: string | null
          status: string
          escalated_by: string | null
          escalated_at: string
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          supplier_id?: string
          region_id?: string | null
          issue?: string
          action_required?: string | null
          status?: string
          escalated_by?: string | null
          escalated_at?: string
          resolved_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          supplier_id?: string
          region_id?: string | null
          issue?: string
          action_required?: string | null
          status?: string
          escalated_by?: string | null
          escalated_at?: string
          resolved_at?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "supplier_escalations_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_escalations_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_escalations_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_invites: {
        Row: {
          id: string
          company_id: string
          supplier_id: string
          email: string
          token: string
          created_at: string
          expires_at: string | null
          accepted_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string
          supplier_id?: string
          email?: string
          token?: string
          created_at?: string
          expires_at?: string | null
          accepted_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string
          supplier_id?: string
          email?: string
          token?: string
          created_at?: string
          expires_at?: string | null
          accepted_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "supplier_invites_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_invites_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_performance_scores: {
        Row: {
          id: string
          company_id: string
          supplier_id: string
          region_id: string | null
          snapshot_date: string
          assigned_tickets: number | null
          completed_tickets: number | null
          sla_breaches: number | null
          avg_response_mins: number | null
          avg_resolution_mins: number | null
          first_time_fix_rate: number | null
          repeat_defect_involvement: number | null
          evidence_completion_rate: number | null
          escalation_count: number | null
          performance_score: number | null
          performance_band: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id?: string
          supplier_id?: string
          region_id?: string | null
          snapshot_date?: string
          assigned_tickets?: number | null
          completed_tickets?: number | null
          sla_breaches?: number | null
          avg_response_mins?: number | null
          avg_resolution_mins?: number | null
          first_time_fix_rate?: number | null
          repeat_defect_involvement?: number | null
          evidence_completion_rate?: number | null
          escalation_count?: number | null
          performance_score?: number | null
          performance_band?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          supplier_id?: string
          region_id?: string | null
          snapshot_date?: string
          assigned_tickets?: number | null
          completed_tickets?: number | null
          sla_breaches?: number | null
          avg_response_mins?: number | null
          avg_resolution_mins?: number | null
          first_time_fix_rate?: number | null
          repeat_defect_involvement?: number | null
          evidence_completion_rate?: number | null
          escalation_count?: number | null
          performance_score?: number | null
          performance_band?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "supplier_performance_scores_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_performance_scores_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_performance_scores_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_sla_acceptances: {
        Row: {
          id: string
          supplier_id: string | null
          user_id: string
          sla_version: string
          signed_name: string
          ip: string | null
          accepted_at: string
        }
        Insert: {
          id?: string
          supplier_id?: string | null
          user_id?: string
          sla_version?: string
          signed_name?: string
          ip?: string | null
          accepted_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string | null
          user_id?: string
          sla_version?: string
          signed_name?: string
          ip?: string | null
          accepted_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "supplier_sla_acceptances_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_users: {
        Row: {
          user_id: string
          supplier_id: string
        }
        Insert: {
          user_id?: string
          supplier_id?: string
        }
        Update: {
          user_id?: string
          supplier_id?: string
        }
        Relationships: [
        {
          foreignKeyName: "supplier_users_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "supplier_users_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      supplier_verification_docs: {
        Row: {
          id: string
          supplier_id: string
          uploaded_by: string
          kind: string
          url: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          supplier_id?: string
          uploaded_by?: string
          kind?: string
          url?: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          supplier_id?: string
          uploaded_by?: string
          kind?: string
          url?: string
          uploaded_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "supplier_verification_docs_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      suppliers: {
        Row: {
          id: string
          company_id: string | null
          company_name: string
          contact_name: string | null
          email: string | null
          phone: string | null
          address: string | null
          trade: string | null
          trades: string[] | null
          qualified: boolean
          qualification_number: string | null
          qualification_expiry: string | null
          vat_number: string | null
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
          is_motiv: boolean
          verification_status: string
          source: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          company_name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          trade?: string | null
          trades?: string[] | null
          qualified?: boolean
          qualification_number?: string | null
          qualification_expiry?: string | null
          vat_number?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
          is_motiv?: boolean
          verification_status?: string
          source?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          company_name?: string
          contact_name?: string | null
          email?: string | null
          phone?: string | null
          address?: string | null
          trade?: string | null
          trades?: string[] | null
          qualified?: boolean
          qualification_number?: string | null
          qualification_expiry?: string | null
          vat_number?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
          is_motiv?: boolean
          verification_status?: string
          source?: string
        }
        Relationships: [
        {
          foreignKeyName: "suppliers_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      technicians: {
        Row: {
          id: string
          company_id: string | null
          supplier_id: string | null
          name: string
          phone: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          supplier_id?: string | null
          name?: string
          phone?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          supplier_id?: string | null
          name?: string
          phone?: string
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_blockers: {
        Row: {
          id: string
          ticket_id: string
          blocker_type: string
          owner_type: string
          owner_id: string | null
          started_at: string
          resolved_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id?: string
          blocker_type?: string
          owner_type?: string
          owner_id?: string | null
          started_at?: string
          resolved_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          blocker_type?: string
          owner_type?: string
          owner_id?: string | null
          started_at?: string
          resolved_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_blockers_owner_id_fkey"
          columns: ["owner_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_blockers_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_dispute_messages: {
        Row: {
          id: string
          dispute_id: string
          ticket_id: string
          author_id: string | null
          author_role: string
          body: string | null
          evidence_urls: Json
          created_at: string
        }
        Insert: {
          id?: string
          dispute_id?: string
          ticket_id?: string
          author_id?: string | null
          author_role?: string
          body?: string | null
          evidence_urls?: Json
          created_at?: string
        }
        Update: {
          id?: string
          dispute_id?: string
          ticket_id?: string
          author_id?: string | null
          author_role?: string
          body?: string | null
          evidence_urls?: Json
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_dispute_messages_author_id_fkey"
          columns: ["author_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_dispute_messages_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_dispute_messages_dispute_id_fkey"
          columns: ["dispute_id"]
          isOneToOne: false
          referencedRelation: "ticket_disputes"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_disputes: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          origin: string
          status: string
          outcome: string | null
          raised_by: string | null
          resolved_by: string | null
          resolution_note: string | null
          created_at: string
          resolved_at: string | null
          signoff_id: string | null
          pending_outcome: string | null
          pending_by: string | null
          pending_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          origin?: string
          status?: string
          outcome?: string | null
          raised_by?: string | null
          resolved_by?: string | null
          resolution_note?: string | null
          created_at?: string
          resolved_at?: string | null
          signoff_id?: string | null
          pending_outcome?: string | null
          pending_by?: string | null
          pending_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          origin?: string
          status?: string
          outcome?: string | null
          raised_by?: string | null
          resolved_by?: string | null
          resolution_note?: string | null
          created_at?: string
          resolved_at?: string | null
          signoff_id?: string | null
          pending_outcome?: string | null
          pending_by?: string | null
          pending_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "ticket_disputes_signoff_id_fkey"
          columns: ["signoff_id"]
          isOneToOne: false
          referencedRelation: "signoffs"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_disputes_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_disputes_raised_by_fkey"
          columns: ["raised_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_disputes_resolved_by_fkey"
          columns: ["resolved_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_disputes_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_events: {
        Row: {
          id: string
          ticket_id: string
          company_id: string | null
          from_status: string | null
          to_status: string
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id?: string
          company_id?: string | null
          from_status?: string | null
          to_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          company_id?: string | null
          from_status?: string | null
          to_status?: string
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_events_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_evidence: {
        Row: {
          id: string
          ticket_id: string
          kind: string
          url: string
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id?: string
          kind?: string
          url?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          kind?: string
          url?: string
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_evidence_uploaded_by_fkey"
          columns: ["uploaded_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_evidence_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_quote_requests: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string | null
          requested_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          requested_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          requested_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_quote_requests_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_quote_requests_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_quote_requests_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_reads: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          user_id: string
          last_seen_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          user_id?: string
          last_seen_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          user_id?: string
          last_seen_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_reads_user_id_fkey"
          columns: ["user_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_reads_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_reads_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_sla_events: {
        Row: {
          id: string
          ticket_id: string
          event_type: string
          sla_kind: string | null
          actor_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id?: string
          event_type?: string
          sla_kind?: string | null
          actor_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          event_type?: string
          sla_kind?: string | null
          actor_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_sla_events_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_sla_events_actor_id_fkey"
          columns: ["actor_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_supplier_declines: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string | null
          reason: string | null
          declined_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          reason?: string | null
          declined_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          reason?: string | null
          declined_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_supplier_declines_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_supplier_declines_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_supplier_declines_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_suppliers: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string
          status: string
          quote_id: string | null
          decline_reason: string | null
          invited_at: string
          responded_at: string | null
          declined_by: string | null
          requote_requested_at: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string
          status?: string
          quote_id?: string | null
          decline_reason?: string | null
          invited_at?: string
          responded_at?: string | null
          declined_by?: string | null
          requote_requested_at?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string
          status?: string
          quote_id?: string | null
          decline_reason?: string | null
          invited_at?: string
          responded_at?: string | null
          declined_by?: string | null
          requote_requested_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "ticket_suppliers_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_suppliers_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_updates: {
        Row: {
          id: string
          ticket_id: string
          author_id: string | null
          author_role: string | null
          body: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id?: string
          author_id?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          author_id?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_updates_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_updates_author_id_fkey"
          columns: ["author_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_variations: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          supplier_id: string | null
          description: string
          amount: number | null
          status: string
          submitted_by: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          reject_reason: string | null
          created_at: string
          file_urls: string[]
          warranty: string | null
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          description?: string
          amount?: number | null
          status?: string
          submitted_by?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          reject_reason?: string | null
          created_at?: string
          file_urls?: string[]
          warranty?: string | null
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          supplier_id?: string | null
          description?: string
          amount?: number | null
          status?: string
          submitted_by?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          reject_reason?: string | null
          created_at?: string
          file_urls?: string[]
          warranty?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "ticket_variations_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_variations_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_variations_submitted_by_fkey"
          columns: ["submitted_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_variations_reviewed_by_fkey"
          columns: ["reviewed_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_variations_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        }
      ]
      }
      ticket_views: {
        Row: {
          id: string
          company_id: string | null
          ticket_id: string
          viewer_id: string | null
          viewer_role: string | null
          item_type: string
          first_viewed_at: string
          item_label: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          viewer_id?: string | null
          viewer_role?: string | null
          item_type?: string
          first_viewed_at?: string
          item_label?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          ticket_id?: string
          viewer_id?: string | null
          viewer_role?: string | null
          item_type?: string
          first_viewed_at?: string
          item_label?: string
        }
        Relationships: [
        {
          foreignKeyName: "ticket_views_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_views_ticket_id_fkey"
          columns: ["ticket_id"]
          isOneToOne: false
          referencedRelation: "tickets"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "ticket_views_viewer_id_fkey"
          columns: ["viewer_id"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        }
      ]
      }
      tickets: {
        Row: {
          id: string
          job_number: number | null
          company_id: string | null
          store_id: string | null
          branch_code: string | null
          region_id: string | null
          region_code: string | null
          supplier_id: string | null
          created_by: string | null
          assigned_user_id: string | null
          category: string | null
          subcategory: string | null
          asset_id: string | null
          title: string
          description: string
          priority: string
          severity: string | null
          operational_impact: string | null
          safety_risk_flag: boolean
          trading_impact_flag: boolean
          customer_visible_flag: boolean
          staff_impact_flag: boolean
          status: string
          photo_urls: string[] | null
          info_doc_urls: string[] | null
          created_at: string
          updated_at: string
          closed_at: string | null
          first_response_due_at: string | null
          first_response_at: string | null
          attendance_due_at: string | null
          attended_at: string | null
          quote_required: boolean
          quote_requested_at: string | null
          quote_due_at: string | null
          quote_submitted_at: string | null
          quote_value: number | null
          quote_decision_required: boolean
          quote_decision_status: string | null
          quote_decided_at: string | null
          resolution_due_at: string | null
          adjusted_resolution_due_at: string | null
          completed_at: string | null
          supplier_sla_status: string | null
          internal_sla_status: string | null
          sla_paused: boolean
          pause_reason: string | null
          pause_started_at: string | null
          pause_ended_at: string | null
          total_paused_minutes: number
          current_blocker: string | null
          blocker_owner_type: string | null
          blocker_owner_id: string | null
          blocker_started_at: string | null
          internal_action_due_at: string | null
          delay_owner: string | null
          repeat_defect_flag: boolean
          repeat_defect_group_id: string | null
          evidence_required: boolean
          before_photo_uploaded: boolean
          after_photo_uploaded: boolean
          completion_certificate_uploaded: boolean
          invoice_uploaded: boolean
          store_confirmation_required: boolean
          store_confirmed_at: string | null
          submitted_for_signoff_at: string | null
          signoff_status: string | null
          last_supplier_update_at: string | null
          last_internal_update_at: string | null
          last_store_update_at: string | null
          ticket_health_score: number | null
          ticket_health_status: string | null
          scheduled_at: string | null
          assessment_required: boolean
          assessment_at: string | null
          assessment_notes: string | null
          info_request_reason: string | null
          closed_out_at: string | null
          closed_out_by: string | null
          needs_review: boolean
          store_job_number: number | null
          store_job_year: number | null
          job_ref: string | null
          cancellation_reason: string | null
          technician_id: string | null
          edited_at: string | null
          edited_by: string | null
          schedule_status: string | null
          info_requested_at: string | null
          info_added_at: string | null
          evidence_request_reason: string | null
          edit_note: string | null
          first_quote_requested_at: string | null
          vo_none_confirmed_at: string | null
        }
        Insert: {
          id?: string
          job_number?: number | null
          company_id?: string | null
          store_id?: string | null
          branch_code?: string | null
          region_id?: string | null
          region_code?: string | null
          supplier_id?: string | null
          created_by?: string | null
          assigned_user_id?: string | null
          category?: string | null
          subcategory?: string | null
          asset_id?: string | null
          title?: string
          description?: string
          priority?: string
          severity?: string | null
          operational_impact?: string | null
          safety_risk_flag?: boolean
          trading_impact_flag?: boolean
          customer_visible_flag?: boolean
          staff_impact_flag?: boolean
          status?: string
          photo_urls?: string[] | null
          info_doc_urls?: string[] | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          first_response_due_at?: string | null
          first_response_at?: string | null
          attendance_due_at?: string | null
          attended_at?: string | null
          quote_required?: boolean
          quote_requested_at?: string | null
          quote_due_at?: string | null
          quote_submitted_at?: string | null
          quote_value?: number | null
          quote_decision_required?: boolean
          quote_decision_status?: string | null
          quote_decided_at?: string | null
          resolution_due_at?: string | null
          adjusted_resolution_due_at?: string | null
          completed_at?: string | null
          supplier_sla_status?: string | null
          internal_sla_status?: string | null
          sla_paused?: boolean
          pause_reason?: string | null
          pause_started_at?: string | null
          pause_ended_at?: string | null
          total_paused_minutes?: number
          current_blocker?: string | null
          blocker_owner_type?: string | null
          blocker_owner_id?: string | null
          blocker_started_at?: string | null
          internal_action_due_at?: string | null
          delay_owner?: string | null
          repeat_defect_flag?: boolean
          repeat_defect_group_id?: string | null
          evidence_required?: boolean
          before_photo_uploaded?: boolean
          after_photo_uploaded?: boolean
          completion_certificate_uploaded?: boolean
          invoice_uploaded?: boolean
          store_confirmation_required?: boolean
          store_confirmed_at?: string | null
          submitted_for_signoff_at?: string | null
          signoff_status?: string | null
          last_supplier_update_at?: string | null
          last_internal_update_at?: string | null
          last_store_update_at?: string | null
          ticket_health_score?: number | null
          ticket_health_status?: string | null
          scheduled_at?: string | null
          assessment_required?: boolean
          assessment_at?: string | null
          assessment_notes?: string | null
          info_request_reason?: string | null
          closed_out_at?: string | null
          closed_out_by?: string | null
          needs_review?: boolean
          store_job_number?: number | null
          store_job_year?: number | null
          job_ref?: string | null
          cancellation_reason?: string | null
          technician_id?: string | null
          edited_at?: string | null
          edited_by?: string | null
          schedule_status?: string | null
          info_requested_at?: string | null
          info_added_at?: string | null
          evidence_request_reason?: string | null
          edit_note?: string | null
          first_quote_requested_at?: string | null
          vo_none_confirmed_at?: string | null
        }
        Update: {
          id?: string
          job_number?: number | null
          company_id?: string | null
          store_id?: string | null
          branch_code?: string | null
          region_id?: string | null
          region_code?: string | null
          supplier_id?: string | null
          created_by?: string | null
          assigned_user_id?: string | null
          category?: string | null
          subcategory?: string | null
          asset_id?: string | null
          title?: string
          description?: string
          priority?: string
          severity?: string | null
          operational_impact?: string | null
          safety_risk_flag?: boolean
          trading_impact_flag?: boolean
          customer_visible_flag?: boolean
          staff_impact_flag?: boolean
          status?: string
          photo_urls?: string[] | null
          info_doc_urls?: string[] | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
          first_response_due_at?: string | null
          first_response_at?: string | null
          attendance_due_at?: string | null
          attended_at?: string | null
          quote_required?: boolean
          quote_requested_at?: string | null
          quote_due_at?: string | null
          quote_submitted_at?: string | null
          quote_value?: number | null
          quote_decision_required?: boolean
          quote_decision_status?: string | null
          quote_decided_at?: string | null
          resolution_due_at?: string | null
          adjusted_resolution_due_at?: string | null
          completed_at?: string | null
          supplier_sla_status?: string | null
          internal_sla_status?: string | null
          sla_paused?: boolean
          pause_reason?: string | null
          pause_started_at?: string | null
          pause_ended_at?: string | null
          total_paused_minutes?: number
          current_blocker?: string | null
          blocker_owner_type?: string | null
          blocker_owner_id?: string | null
          blocker_started_at?: string | null
          internal_action_due_at?: string | null
          delay_owner?: string | null
          repeat_defect_flag?: boolean
          repeat_defect_group_id?: string | null
          evidence_required?: boolean
          before_photo_uploaded?: boolean
          after_photo_uploaded?: boolean
          completion_certificate_uploaded?: boolean
          invoice_uploaded?: boolean
          store_confirmation_required?: boolean
          store_confirmed_at?: string | null
          submitted_for_signoff_at?: string | null
          signoff_status?: string | null
          last_supplier_update_at?: string | null
          last_internal_update_at?: string | null
          last_store_update_at?: string | null
          ticket_health_score?: number | null
          ticket_health_status?: string | null
          scheduled_at?: string | null
          assessment_required?: boolean
          assessment_at?: string | null
          assessment_notes?: string | null
          info_request_reason?: string | null
          closed_out_at?: string | null
          closed_out_by?: string | null
          needs_review?: boolean
          store_job_number?: number | null
          store_job_year?: number | null
          job_ref?: string | null
          cancellation_reason?: string | null
          technician_id?: string | null
          edited_at?: string | null
          edited_by?: string | null
          schedule_status?: string | null
          info_requested_at?: string | null
          info_added_at?: string | null
          evidence_request_reason?: string | null
          edit_note?: string | null
          first_quote_requested_at?: string | null
          vo_none_confirmed_at?: string | null
        }
        Relationships: [
        {
          foreignKeyName: "tickets_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_edited_by_fkey"
          columns: ["edited_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_repeat_defect_group_id_fkey"
          columns: ["repeat_defect_group_id"]
          isOneToOne: false
          referencedRelation: "repeat_defect_groups"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_closed_out_by_fkey"
          columns: ["closed_out_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_created_by_fkey"
          columns: ["created_by"]
          isOneToOne: false
          referencedRelation: "user_profiles"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_supplier_id_fkey"
          columns: ["supplier_id"]
          isOneToOne: false
          referencedRelation: "suppliers"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_region_id_fkey"
          columns: ["region_id"]
          isOneToOne: false
          referencedRelation: "regions"
          referencedColumns: ["id"]
        },
        {
          foreignKeyName: "tickets_store_id_fkey"
          columns: ["store_id"]
          isOneToOne: false
          referencedRelation: "stores"
          referencedColumns: ["id"]
        }
      ]
      }
      user_profiles: {
        Row: {
          id: string
          company_id: string | null
          role: string
          full_name: string | null
          email: string | null
          phone: string | null
          active: boolean
          created_at: string
          updated_at: string
          requested_region_code: string | null
          address: string | null
          company_name: string | null
          sub_store: string | null
          branch_code: string | null
          last_wa_inbound_at: string | null
          storage_bytes_used: number
        }
        Insert: {
          id?: string
          company_id?: string | null
          role?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
          requested_region_code?: string | null
          address?: string | null
          company_name?: string | null
          sub_store?: string | null
          branch_code?: string | null
          last_wa_inbound_at?: string | null
          storage_bytes_used?: number
        }
        Update: {
          id?: string
          company_id?: string | null
          role?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
          requested_region_code?: string | null
          address?: string | null
          company_name?: string | null
          sub_store?: string | null
          branch_code?: string | null
          last_wa_inbound_at?: string | null
          storage_bytes_used?: number
        }
        Relationships: [
        {
          foreignKeyName: "user_profiles_role_fkey"
          columns: ["role"]
          isOneToOne: false
          referencedRelation: "roles"
          referencedColumns: ["key"]
        },
        {
          foreignKeyName: "user_profiles_company_id_fkey"
          columns: ["company_id"]
          isOneToOne: false
          referencedRelation: "companies"
          referencedColumns: ["id"]
        }
      ]
      }
      whatsapp_sessions: {
        Row: {
          id: string
          phone: string
          title: string
          description: string
          priority: string
          photo_urls: string[]
          status: string
          created_at: string
          category: string
          operational_impact: string
          confidence: number | null
          pending_field: string | null
        }
        Insert: {
          id?: string
          phone?: string
          title?: string
          description?: string
          priority?: string
          photo_urls?: string[]
          status?: string
          created_at?: string
          category?: string
          operational_impact?: string
          confidence?: number | null
          pending_field?: string | null
        }
        Update: {
          id?: string
          phone?: string
          title?: string
          description?: string
          priority?: string
          photo_urls?: string[]
          status?: string
          created_at?: string
          category?: string
          operational_impact?: string
          confidence?: number | null
          pending_field?: string | null
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
