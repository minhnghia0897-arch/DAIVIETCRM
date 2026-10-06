export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      approvals: {
        Row: {
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          entity: string;
          entity_id: string;
          id: string;
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string | null;
          requested_by_type: string;
          showroom_id: string;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          entity: string;
          entity_id: string;
          id?: string;
          payload?: NonNullable<Json>;
          reason: string;
          requested_by?: string | null;
          requested_by_type?: string;
          showroom_id: string;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          entity?: string;
          entity_id?: string;
          id?: string;
          payload?: NonNullable<Json>;
          reason?: string;
          requested_by?: string | null;
          requested_by_type?: string;
          showroom_id?: string;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approvals_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approvals_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          at: string;
          entity: string;
          entity_id: string | null;
          id: number;
          ip: unknown;
          metadata: NonNullable<Json>;
          showroom_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          at?: string;
          entity: string;
          entity_id?: string | null;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          showroom_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          showroom_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_ranges: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          showroom_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_ranges_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      call_outcomes: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          showroom_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "call_outcomes_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          channel: string;
          contact_id: string;
          created_at: string;
          created_by: string | null;
          granted: boolean;
          granted_at: string;
          id: string;
          provided_by_contact_id: string | null;
          purpose: string;
          showroom_id: string;
          source: string;
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          channel: string;
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          granted: boolean;
          granted_at?: string;
          id?: string;
          provided_by_contact_id?: string | null;
          purpose: string;
          showroom_id: string;
          source: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          channel?: string;
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          granted?: boolean;
          granted_at?: string;
          id?: string;
          provided_by_contact_id?: string | null;
          purpose?: string;
          showroom_id?: string;
          source?: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consents_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_provided_by_contact_id_fkey";
            columns: ["provided_by_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consents_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_identities: {
        Row: {
          contact_id: string;
          created_at: string;
          created_by: string | null;
          display_masked: string;
          id: string;
          is_primary: boolean;
          is_valid: boolean;
          showroom_id: string;
          source: string | null;
          type: string;
          updated_at: string;
          value: string;
          value_raw: string | null;
          verified_at: string | null;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          display_masked: string;
          id?: string;
          is_primary?: boolean;
          is_valid?: boolean;
          showroom_id: string;
          source?: string | null;
          type: string;
          updated_at?: string;
          value: string;
          value_raw?: string | null;
          verified_at?: string | null;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          display_masked?: string;
          id?: string;
          is_primary?: boolean;
          is_valid?: boolean;
          showroom_id?: string;
          source?: string | null;
          type?: string;
          updated_at?: string;
          value?: string;
          value_raw?: string | null;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_identities_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_identities_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          city: string | null;
          contact_via_contact_id: string | null;
          country_of_residence: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          full_name: string;
          household_id: string | null;
          id: string;
          lifecycle_stage: string;
          province: string | null;
          relation_in_household: string | null;
          showroom_id: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          contact_via_contact_id?: string | null;
          country_of_residence?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name: string;
          household_id?: string | null;
          id?: string;
          lifecycle_stage?: string;
          province?: string | null;
          relation_in_household?: string | null;
          showroom_id: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          contact_via_contact_id?: string | null;
          country_of_residence?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          full_name?: string;
          household_id?: string | null;
          id?: string;
          lifecycle_stage?: string;
          province?: string | null;
          relation_in_household?: string | null;
          showroom_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_contact_via_contact_id_fkey";
            columns: ["contact_via_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_lifecycle: {
        Row: {
          contact_id: string;
          flags: string[];
          last_interaction_at: string | null;
          open_tasks: number;
          orders_count: number;
          owned_products: NonNullable<Json>;
          showroom_id: string;
          stage: string;
          stage_since: string;
          total_paid: number;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          flags?: string[];
          last_interaction_at?: string | null;
          open_tasks?: number;
          orders_count?: number;
          owned_products?: NonNullable<Json>;
          showroom_id: string;
          stage: string;
          stage_since?: string;
          total_paid?: number;
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          flags?: string[];
          last_interaction_at?: string | null;
          open_tasks?: number;
          orders_count?: number;
          owned_products?: NonNullable<Json>;
          showroom_id?: string;
          stage?: string;
          stage_since?: string;
          total_paid?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_lifecycle_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: true;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_lifecycle_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          actor_id: string | null;
          actor_type: string;
          contact_id: string | null;
          household_id: string | null;
          id: number;
          lead_id: string | null;
          occurred_at: string;
          order_id: string | null;
          payload: NonNullable<Json>;
          showroom_id: string;
          type: string;
        };
        Insert: {
          actor_id?: string | null;
          actor_type?: string;
          contact_id?: string | null;
          household_id?: string | null;
          id?: never;
          lead_id?: string | null;
          occurred_at?: string;
          order_id?: string | null;
          payload?: NonNullable<Json>;
          showroom_id: string;
          type: string;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string;
          contact_id?: string | null;
          household_id?: string | null;
          id?: never;
          lead_id?: string | null;
          occurred_at?: string;
          order_id?: string | null;
          payload?: NonNullable<Json>;
          showroom_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      households: {
        Row: {
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          display_name: string;
          district: string | null;
          id: string;
          note: string | null;
          province: string | null;
          showroom_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          display_name: string;
          district?: string | null;
          id?: string;
          note?: string | null;
          province?: string | null;
          showroom_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          display_name?: string;
          district?: string | null;
          id?: string;
          note?: string | null;
          province?: string | null;
          showroom_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "households_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      important_dates: {
        Row: {
          contact_id: string;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          recurring_yearly: boolean;
          showroom_id: string;
          source: string | null;
          type: string;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          date: string;
          id?: string;
          recurring_yearly?: boolean;
          showroom_id: string;
          source?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          recurring_yearly?: boolean;
          showroom_id?: string;
          source?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "important_dates_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "important_dates_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_secrets: {
        Row: {
          created_at: string;
          id: string;
          integration_key: string;
          name: string;
          showroom_id: string;
          updated_at: string;
          updated_by: string | null;
          vault_secret_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          integration_key: string;
          name: string;
          showroom_id: string;
          updated_at?: string;
          updated_by?: string | null;
          vault_secret_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          integration_key?: string;
          name?: string;
          showroom_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          vault_secret_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_secrets_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_secrets_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      integrations: {
        Row: {
          config: NonNullable<Json>;
          connected_at: string | null;
          connected_by: string | null;
          created_at: string;
          enabled: boolean;
          id: string;
          key: string;
          last_error: string | null;
          last_error_at: string | null;
          last_event_at: string | null;
          last_success_at: string | null;
          prerequisites_done: NonNullable<Json>;
          reply_mode: string | null;
          secret_ref: string | null;
          showroom_id: string;
          status: string;
          token_expires_at: string | null;
          updated_at: string;
        };
        Insert: {
          config?: NonNullable<Json>;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_event_at?: string | null;
          last_success_at?: string | null;
          prerequisites_done?: NonNullable<Json>;
          reply_mode?: string | null;
          secret_ref?: string | null;
          showroom_id: string;
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Update: {
          config?: NonNullable<Json>;
          connected_at?: string | null;
          connected_by?: string | null;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_event_at?: string | null;
          last_success_at?: string | null;
          prerequisites_done?: NonNullable<Json>;
          reply_mode?: string | null;
          secret_ref?: string | null;
          showroom_id?: string;
          status?: string;
          token_expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integrations_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          attempts: number;
          created_at: string;
          id: number;
          last_error: string | null;
          payload: NonNullable<Json>;
          run_at: string;
          showroom_id: string | null;
          status: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: never;
          last_error?: string | null;
          payload?: NonNullable<Json>;
          run_at?: string;
          showroom_id?: string | null;
          status?: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: never;
          last_error?: string | null;
          payload?: NonNullable<Json>;
          run_at?: string;
          showroom_id?: string | null;
          status?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_sources: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          showroom_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sources_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          assigned_at: string | null;
          assigned_to: string | null;
          budget_range_id: string | null;
          contact_id: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          first_contact_at: string | null;
          flags: string[];
          id: string;
          keep_surprise: boolean;
          lost_reason_id: string | null;
          occasion_date: string | null;
          occasion_id: string | null;
          product_interest_id: string | null;
          recipient_contact_id: string | null;
          recipient_province: string | null;
          score: number;
          showroom_id: string;
          sla_due_at: string | null;
          source: string;
          source_detail: NonNullable<Json>;
          stage: string;
          updated_at: string;
          window_wait_until: string | null;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          budget_range_id?: string | null;
          contact_id: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          first_contact_at?: string | null;
          flags?: string[];
          id?: string;
          keep_surprise?: boolean;
          lost_reason_id?: string | null;
          occasion_date?: string | null;
          occasion_id?: string | null;
          product_interest_id?: string | null;
          recipient_contact_id?: string | null;
          recipient_province?: string | null;
          score?: number;
          showroom_id: string;
          sla_due_at?: string | null;
          source: string;
          source_detail?: NonNullable<Json>;
          stage?: string;
          updated_at?: string;
          window_wait_until?: string | null;
        };
        Update: {
          assigned_at?: string | null;
          assigned_to?: string | null;
          budget_range_id?: string | null;
          contact_id?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          first_contact_at?: string | null;
          flags?: string[];
          id?: string;
          keep_surprise?: boolean;
          lost_reason_id?: string | null;
          occasion_date?: string | null;
          occasion_id?: string | null;
          product_interest_id?: string | null;
          recipient_contact_id?: string | null;
          recipient_province?: string | null;
          score?: number;
          showroom_id?: string;
          sla_due_at?: string | null;
          source?: string;
          source_detail?: NonNullable<Json>;
          stage?: string;
          updated_at?: string;
          window_wait_until?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_budget_range_id_fkey";
            columns: ["budget_range_id"];
            isOneToOne: false;
            referencedRelation: "budget_ranges";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_lost_reason_id_fkey";
            columns: ["lost_reason_id"];
            isOneToOne: false;
            referencedRelation: "lost_reasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_occasion_id_fkey";
            columns: ["occasion_id"];
            isOneToOne: false;
            referencedRelation: "occasions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_recipient_contact_id_fkey";
            columns: ["recipient_contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      lost_reasons: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          showroom_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lost_reasons_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      markets: {
        Row: {
          allowed_channels: string[];
          call_windows: NonNullable<Json>;
          color_token: string;
          country_code: string;
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          name: string;
          showroom_id: string;
          sort: number;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          allowed_channels?: string[];
          call_windows?: NonNullable<Json>;
          color_token?: string;
          country_code: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          showroom_id: string;
          sort?: number;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          allowed_channels?: string[];
          call_windows?: NonNullable<Json>;
          color_token?: string;
          country_code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          showroom_id?: string;
          sort?: number;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "markets_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          created_at: string;
          created_by: string | null;
          events: NonNullable<Json>;
          level: string;
          quiet_from: string | null;
          quiet_to: string | null;
          showroom_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          events?: NonNullable<Json>;
          level?: string;
          quiet_from?: string | null;
          quiet_to?: string | null;
          showroom_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          events?: NonNullable<Json>;
          level?: string;
          quiet_from?: string | null;
          quiet_to?: string | null;
          showroom_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_prefs_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          link: string | null;
          read_at: string | null;
          showroom_id: string;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          showroom_id: string;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          link?: string | null;
          read_at?: string | null;
          showroom_id?: string;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      occasions: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_active: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key: string;
          label: string;
          showroom_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_active?: boolean;
          key?: string;
          label?: string;
          showroom_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "occasions_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          description: string;
          grantable: boolean;
          group: string;
          key: string;
          sensitive: boolean;
        };
        Insert: {
          description: string;
          grantable?: boolean;
          group: string;
          key: string;
          sensitive?: boolean;
        };
        Update: {
          description?: string;
          grantable?: boolean;
          group?: string;
          key?: string;
          sensitive?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          call_extension: string | null;
          created_at: string;
          created_by: string | null;
          full_name: string;
          id: string;
          is_active: boolean;
          role_id: string;
          showroom_id: string;
          updated_at: string;
        };
        Insert: {
          call_extension?: string | null;
          created_at?: string;
          created_by?: string | null;
          full_name: string;
          id: string;
          is_active?: boolean;
          role_id: string;
          showroom_id: string;
          updated_at?: string;
        };
        Update: {
          call_extension?: string | null;
          created_at?: string;
          created_by?: string | null;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          role_id?: string;
          showroom_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          created_at: string;
          created_by: string | null;
          permission_key: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          permission_key: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          permission_key?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          is_owner: boolean;
          is_system: boolean;
          key: string;
          name: string;
          showroom_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_owner?: boolean;
          is_system?: boolean;
          key: string;
          name: string;
          showroom_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_owner?: boolean;
          is_system?: boolean;
          key?: string;
          name?: string;
          showroom_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "roles_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      showrooms: {
        Row: {
          call_mode: string;
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          call_mode?: string;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          organization_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          call_mode?: string;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      task_rules: {
        Row: {
          assignee: string;
          conditions: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          due_offset: string;
          id: string;
          is_active: boolean;
          name: string;
          priority: number;
          rule_key: string;
          showroom_id: string;
          task_type: string;
          title_template: string;
          trigger: NonNullable<Json>;
          updated_at: string;
        };
        Insert: {
          assignee?: string;
          conditions?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          due_offset?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          priority?: number;
          rule_key: string;
          showroom_id: string;
          task_type: string;
          title_template: string;
          trigger: NonNullable<Json>;
          updated_at?: string;
        };
        Update: {
          assignee?: string;
          conditions?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          due_offset?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          priority?: number;
          rule_key?: string;
          showroom_id?: string;
          task_type?: string;
          title_template?: string;
          trigger?: NonNullable<Json>;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_rules_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          assigned_to: string | null;
          contact_id: string | null;
          created_at: string;
          created_by: string | null;
          done_at: string | null;
          due_at: string;
          id: string;
          lead_id: string | null;
          order_id: string | null;
          outcome: string | null;
          priority: number;
          rule_key: string | null;
          showroom_id: string;
          source: string;
          status: string;
          title: string;
          type: string;
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          done_at?: string | null;
          due_at: string;
          id?: string;
          lead_id?: string | null;
          order_id?: string | null;
          outcome?: string | null;
          priority?: number;
          rule_key?: string | null;
          showroom_id: string;
          source?: string;
          status?: string;
          title: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          contact_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          done_at?: string | null;
          due_at?: string;
          id?: string;
          lead_id?: string | null;
          order_id?: string | null;
          outcome?: string | null;
          priority?: number;
          rule_key?: string | null;
          showroom_id?: string;
          source?: string;
          status?: string;
          title?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_groups: {
        Row: {
          assigned_at: string | null;
          assigned_by: string | null;
          chat_id: number;
          created_at: string;
          created_by: string | null;
          id: string;
          purpose: string;
          showroom_id: string;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          chat_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          purpose?: string;
          showroom_id: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          chat_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          purpose?: string;
          showroom_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_groups_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_groups_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_link_codes: {
        Row: {
          code_hash: string;
          created_at: string;
          created_by: string | null;
          expires_at: string;
          id: string;
          showroom_id: string;
          updated_at: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          code_hash: string;
          created_at?: string;
          created_by?: string | null;
          expires_at: string;
          id?: string;
          showroom_id: string;
          updated_at?: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          code_hash?: string;
          created_at?: string;
          created_by?: string | null;
          expires_at?: string;
          id?: string;
          showroom_id?: string;
          updated_at?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_link_codes_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_link_codes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_links: {
        Row: {
          chat_id: number;
          created_at: string;
          created_by: string | null;
          id: string;
          linked_at: string;
          revoked_at: string | null;
          showroom_id: string;
          telegram_user_id: number;
          updated_at: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          linked_at?: string;
          revoked_at?: string | null;
          showroom_id: string;
          telegram_user_id: number;
          updated_at?: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          linked_at?: string;
          revoked_at?: string | null;
          showroom_id?: string;
          telegram_user_id?: number;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_links_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_links_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_messages: {
        Row: {
          chat_id: number;
          created_at: string;
          created_by: string | null;
          event_type: string;
          id: string;
          lead_id: string | null;
          message_id: number;
          showroom_id: string;
          task_id: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          created_by?: string | null;
          event_type: string;
          id?: string;
          lead_id?: string | null;
          message_id: number;
          showroom_id: string;
          task_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          created_by?: string | null;
          event_type?: string;
          id?: string;
          lead_id?: string | null;
          message_id?: number;
          showroom_id?: string;
          task_id?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_messages_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_messages_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_messages_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_permission_overrides: {
        Row: {
          effect: string;
          permission_key: string;
          set_at: string;
          set_by: string | null;
          user_id: string;
        };
        Insert: {
          effect: string;
          permission_key: string;
          set_at?: string;
          set_by?: string | null;
          user_id: string;
        };
        Update: {
          effect?: string;
          permission_key?: string;
          set_at?: string;
          set_by?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey";
            columns: ["permission_key"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["key"];
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      view_as_sessions: {
        Row: {
          ended_at: string | null;
          expires_at: string;
          id: string;
          owner_id: string;
          showroom_id: string;
          started_at: string;
          target_id: string;
        };
        Insert: {
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          owner_id: string;
          showroom_id: string;
          started_at?: string;
          target_id: string;
        };
        Update: {
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          owner_id?: string;
          showroom_id?: string;
          started_at?: string;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "view_as_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "view_as_sessions_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "view_as_sessions_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          error: string | null;
          event_type: string | null;
          external_id: string;
          id: number;
          payload: NonNullable<Json>;
          processed_at: string | null;
          provider: string;
          received_at: string;
          showroom_id: string | null;
          signature_valid: boolean;
          status: string;
        };
        Insert: {
          error?: string | null;
          event_type?: string | null;
          external_id: string;
          id?: never;
          payload: NonNullable<Json>;
          processed_at?: string | null;
          provider: string;
          received_at?: string;
          showroom_id?: string | null;
          signature_valid: boolean;
          status?: string;
        };
        Update: {
          error?: string | null;
          event_type?: string | null;
          external_id?: string;
          id?: never;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          provider?: string;
          received_at?: string;
          showroom_id?: string | null;
          signature_valid?: boolean;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_events_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      activities: {
        Row: {
          actor_id: string | null;
          actor_type: string | null;
          contact_id: string | null;
          household_id: string | null;
          id: number | null;
          lead_id: string | null;
          occurred_at: string | null;
          order_id: string | null;
          payload: Json | null;
          showroom_id: string | null;
          type: string | null;
        };
        Insert: {
          actor_id?: string | null;
          actor_type?: string | null;
          contact_id?: string | null;
          household_id?: string | null;
          id?: number | null;
          lead_id?: string | null;
          occurred_at?: string | null;
          order_id?: string | null;
          payload?: Json | null;
          showroom_id?: string | null;
          type?: string | null;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string | null;
          contact_id?: string | null;
          household_id?: string | null;
          id?: number | null;
          lead_id?: string | null;
          occurred_at?: string | null;
          order_id?: string | null;
          payload?: Json | null;
          showroom_id?: string | null;
          type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_household_id_fkey";
            columns: ["household_id"];
            isOneToOne: false;
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_identity_display: {
        Row: {
          contact_id: string | null;
          display_masked: string | null;
          id: string | null;
          is_primary: boolean | null;
          is_valid: boolean | null;
          showroom_id: string | null;
          type: string | null;
          verified_at: string | null;
        };
        Insert: {
          contact_id?: string | null;
          display_masked?: string | null;
          id?: string | null;
          is_primary?: boolean | null;
          is_valid?: boolean | null;
          showroom_id?: string | null;
          type?: string | null;
          verified_at?: string | null;
        };
        Update: {
          contact_id?: string | null;
          display_masked?: string | null;
          id?: string | null;
          is_primary?: boolean | null;
          is_valid?: boolean | null;
          showroom_id?: string | null;
          type?: string | null;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_identities_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_identities_showroom_id_fkey";
            columns: ["showroom_id"];
            isOneToOne: false;
            referencedRelation: "showrooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      active_view_as: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ended_at: string | null;
          expires_at: string;
          id: string;
          owner_id: string;
          showroom_id: string;
          started_at: string;
          target_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "view_as_sessions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      approval_permission: { Args: { p_type: string }; Returns: string };
      assert_integration_writer: { Args: { p_key: string }; Returns: string };
      can_view_contact: { Args: { p_contact_id: string }; Returns: boolean };
      can_view_lead: { Args: { p_lead_id: string }; Returns: boolean };
      check_request: { Args: Record<PropertyKey, never>; Returns: undefined };
      create_telegram_link_code: { Args: Record<PropertyKey, never>; Returns: string };
      current_showroom_id: { Args: Record<PropertyKey, never>; Returns: string };
      delete_integration_secret: { Args: { p_key: string; p_name: string }; Returns: boolean };
      effective_uid: { Args: Record<PropertyKey, never>; Returns: string };
      get_integration_secret: {
        Args: { p_key: string; p_name: string; p_showroom: string };
        Returns: string;
      };
      has_perm: { Args: { perm: string }; Returns: boolean };
      has_perm_for: { Args: { perm: string; uid: string }; Returns: boolean };
      has_real_perm: { Args: { perm: string }; Returns: boolean };
      is_owner_user: { Args: { uid: string }; Returns: boolean };
      my_permissions: { Args: Record<PropertyKey, never>; Returns: string[] };
      record_event: {
        Args: {
          p_actor_type?: string;
          p_contact_id?: string;
          p_lead_id?: string;
          p_payload?: Json;
          p_showroom_id: string;
          p_type: string;
        };
        Returns: number;
      };
      redeem_telegram_link_code: {
        Args: { p_chat_id: number; p_code: string; p_telegram_user_id: number; p_username?: string };
        Returns: string;
      };
      reveal_identity: { Args: { p_identity_id: string; p_lead_id?: string }; Returns: string };
      revoke_my_telegram_link: { Args: Record<PropertyKey, never>; Returns: boolean };
      set_integration_secret: { Args: { p_key: string; p_name: string; p_value: string }; Returns: string };
      telegram_act_as: { Args: { p_user: string }; Returns: undefined };
      telegram_add_note: {
        Args: { p_file_path?: string; p_lead_id: string; p_telegram_user_id: number; p_text: string };
        Returns: number;
      };
      telegram_assign_group: {
        Args: { p_chat_id: number; p_purpose: string; p_telegram_user_id: number; p_title: string };
        Returns: string;
      };
      telegram_task_action: {
        Args: { p_action: string; p_minutes?: number; p_task_id: string; p_telegram_user_id: number };
        Returns: string;
      };
      telegram_user: { Args: { p_telegram_user_id: number }; Returns: string };
      view_as_header: { Args: Record<PropertyKey, never>; Returns: string };
      whoami: {
        Args: Record<PropertyKey, never>;
        Returns: {
          effective_uid: string;
          real_uid: string;
          view_as_session_id: string;
        }[];
      };
      write_audit: {
        Args: {
          p_action: string;
          p_actor_type?: string;
          p_entity: string;
          p_entity_id: string;
          p_metadata?: Json;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
