export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      // NOTA (revisión de consistencia Phase 6): este archivo no está
      // importado por ningún código (server.ts/browser.ts usan el `Database`
      // de ./types, no de aquí). Se corrige igualmente para que no quede
      // desalineado con la migración real si en el futuro se regenera o se
      // empieza a usar (ver 20260804000000_phase6b_automation_runtime.sql):
      // la columna real es `metadata` (no `context`) y existe `event_type`.
      automation_execution_logs: {
        Row: {
          id: string;
          execution_id: string;
          organization_id: string;
          level: string;
          event_type: string | null;
          message: string;
          metadata: Json | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          execution_id: string;
          organization_id: string;
          level?: string;
          event_type?: string | null;
          message: string;
          metadata?: Json | null;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          execution_id?: string;
          organization_id?: string;
          level?: string;
          event_type?: string | null;
          message?: string;
          metadata?: Json | null;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      automation_executions: {
        Row: {
          id: string;
          organization_id: string;
          automation_id: string;
          client_id: string | null;
          status: string;
          attempt: number;
          idempotency_key: string;
          triggered_by: string;
          trigger_type: string;
          input_metadata: Json | null;
          output_metadata: Json | null;
          error_code: string | null;
          error_message: string | null;
          queued_at: string;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          automation_id: string;
          client_id?: string | null;
          status?: string;
          attempt?: number;
          idempotency_key: string;
          triggered_by: string;
          trigger_type: string;
          input_metadata?: Json | null;
          output_metadata?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
          queued_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          automation_id?: string;
          client_id?: string | null;
          status?: string;
          attempt?: number;
          idempotency_key?: string;
          triggered_by?: string;
          trigger_type?: string;
          input_metadata?: Json | null;
          output_metadata?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
          queued_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_webhook_events: {
        Row: {
          id: string;
          organization_id: string | null;
          execution_id: string | null;
          external_event_id: string | null;
          source: string;
          event_type: string;
          payload_hash: string | null;
          received_at: string;
          processed_at: string | null;
          status: string;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          execution_id?: string | null;
          external_event_id?: string | null;
          source?: string;
          event_type: string;
          payload_hash?: string | null;
          received_at?: string;
          processed_at?: string | null;
          status?: string;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          execution_id?: string | null;
          external_event_id?: string | null;
          source?: string;
          event_type?: string;
          payload_hash?: string | null;
          received_at?: string;
          processed_at?: string | null;
          status?: string;
          error_code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agents: {
        Row: {
          agent_type: Database['public']['Enums']['agent_type'];
          content: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_global: boolean;
          legacy_path: string | null;
          migrated_at: string | null;
          migration_version: string | null;
          name: string;
          organization_id: string | null;
          slug: string;
          source_hash: string | null;
          updated_at: string;
        };
        Insert: {
          agent_type?: Database['public']['Enums']['agent_type'];
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name: string;
          organization_id?: string | null;
          slug: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          agent_type?: Database['public']['Enums']['agent_type'];
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name?: string;
          organization_id?: string | null;
          slug?: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      alerts: {
        Row: {
          account_id: string | null;
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          alert_key: string;
          alert_type: string;
          client_id: string | null;
          created_at: string;
          description: string | null;
          detected_at: string | null;
          id: string;
          legacy_path: string | null;
          metadata: Json;
          migrated_at: string | null;
          migration_version: string | null;
          organization_id: string;
          platform: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: Database['public']['Enums']['alert_severity'];
          snoozed_until: string | null;
          source_hash: string | null;
          status: Database['public']['Enums']['alert_status'];
          title: string | null;
          updated_at: string;
        };
        Insert: {
          account_id?: string | null;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          alert_key: string;
          alert_type: string;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          detected_at?: string | null;
          id?: string;
          legacy_path?: string | null;
          metadata?: Json;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id: string;
          platform?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: Database['public']['Enums']['alert_severity'];
          snoozed_until?: string | null;
          source_hash?: string | null;
          status?: Database['public']['Enums']['alert_status'];
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string | null;
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          alert_key?: string;
          alert_type?: string;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          detected_at?: string | null;
          id?: string;
          legacy_path?: string | null;
          metadata?: Json;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id?: string;
          platform?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: Database['public']['Enums']['alert_severity'];
          snoozed_until?: string | null;
          source_hash?: string | null;
          status?: Database['public']['Enums']['alert_status'];
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      automations: {
        Row: {
          category: string | null;
          client_id: string | null;
          created_at: string;
          description: string | null;
          health: Json | null;
          id: string;
          legacy_id: string;
          legacy_path: string | null;
          links: Json | null;
          migrated_at: string | null;
          migration_version: string | null;
          name: string;
          organization_id: string;
          provider: string;
          schedule: Json;
          source_hash: string | null;
          status: Database['public']['Enums']['automation_status'];
          updated_at: string;
          workflow_id: string | null;
        };
        Insert: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          health?: Json | null;
          id?: string;
          legacy_id: string;
          legacy_path?: string | null;
          links?: Json | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name: string;
          organization_id: string;
          provider?: string;
          schedule?: Json;
          source_hash?: string | null;
          status?: Database['public']['Enums']['automation_status'];
          updated_at?: string;
          workflow_id?: string | null;
        };
        Update: {
          category?: string | null;
          client_id?: string | null;
          created_at?: string;
          description?: string | null;
          health?: Json | null;
          id?: string;
          legacy_id?: string;
          legacy_path?: string | null;
          links?: Json | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name?: string;
          organization_id?: string;
          provider?: string;
          schedule?: Json;
          source_hash?: string | null;
          status?: Database['public']['Enums']['automation_status'];
          updated_at?: string;
          workflow_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'automations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'automations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_contacts: {
        Row: {
          client_id: string;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          id: string;
          is_primary: boolean;
          name: string;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          is_primary?: boolean;
          name: string;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          id?: string;
          is_primary?: boolean;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_contacts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_contacts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_documents: {
        Row: {
          category: string;
          client_id: string;
          content: string;
          created_at: string;
          created_by: string;
          document_key: string;
          id: string;
          organization_id: string;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          category?: string;
          client_id: string;
          content?: string;
          created_at?: string;
          created_by: string;
          document_key: string;
          id?: string;
          organization_id: string;
          status?: Database['public']['Enums']['document_status'];
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          category?: string;
          client_id?: string;
          content?: string;
          created_at?: string;
          created_by?: string;
          document_key?: string;
          id?: string;
          organization_id?: string;
          status?: Database['public']['Enums']['document_status'];
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'client_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_integrations: {
        Row: {
          client_id: string;
          configuration: Json;
          created_at: string;
          external_account_id: string;
          id: string;
          last_synced_at: string | null;
          organization_id: string;
          provider: string;
          status: Database['public']['Enums']['integration_status'];
          updated_at: string;
        };
        Insert: {
          client_id: string;
          configuration?: Json;
          created_at?: string;
          external_account_id: string;
          id?: string;
          last_synced_at?: string | null;
          organization_id: string;
          provider: string;
          status?: Database['public']['Enums']['integration_status'];
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          configuration?: Json;
          created_at?: string;
          external_account_id?: string;
          id?: string;
          last_synced_at?: string | null;
          organization_id?: string;
          provider?: string;
          status?: Database['public']['Enums']['integration_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_integrations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_integrations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_metrics: {
        Row: {
          account_id: string;
          account_name: string | null;
          campaigns: Json;
          client_id: string;
          created_at: string;
          currency: string;
          data_quality: Json | null;
          id: string;
          legacy_path: string | null;
          metrics: Json;
          migrated_at: string | null;
          migration_version: string | null;
          organization_id: string;
          period_end: string;
          period_start: string;
          platform: string;
          source_hash: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          account_name?: string | null;
          campaigns?: Json;
          client_id: string;
          created_at?: string;
          currency?: string;
          data_quality?: Json | null;
          id?: string;
          legacy_path?: string | null;
          metrics?: Json;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id: string;
          period_end: string;
          period_start: string;
          platform: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          account_name?: string | null;
          campaigns?: Json;
          client_id?: string;
          created_at?: string;
          currency?: string;
          data_quality?: Json | null;
          id?: string;
          legacy_path?: string | null;
          metrics?: Json;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id?: string;
          period_end?: string;
          period_start?: string;
          platform?: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_metrics_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_metrics_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      campaigns: {
        Row: {
          approved_at: string | null;
          brief: string | null;
          budget: number;
          client_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          end_date: string | null;
          generated_content: Json | null;
          id: string;
          metadata: Json;
          name: string;
          objective: Database['public']['Enums']['campaign_objective'];
          organization_id: string;
          platform: string;
          rejected_at: string | null;
          start_date: string | null;
          status: Database['public']['Enums']['campaign_status'];
          submitted_for_review_at: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          approved_at?: string | null;
          brief?: string | null;
          budget: number;
          client_id: string;
          created_at?: string;
          created_by: string;
          currency?: string;
          end_date?: string | null;
          generated_content?: Json | null;
          id?: string;
          metadata?: Json;
          name: string;
          objective: Database['public']['Enums']['campaign_objective'];
          organization_id: string;
          platform: string;
          rejected_at?: string | null;
          start_date?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          submitted_for_review_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          approved_at?: string | null;
          brief?: string | null;
          budget?: number;
          client_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          end_date?: string | null;
          generated_content?: Json | null;
          id?: string;
          metadata?: Json;
          name?: string;
          objective?: Database['public']['Enums']['campaign_objective'];
          organization_id?: string;
          platform?: string;
          rejected_at?: string | null;
          start_date?: string | null;
          status?: Database['public']['Enums']['campaign_status'];
          submitted_for_review_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'campaigns_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaigns_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_approvals: {
        Row: {
          action: Database['public']['Enums']['campaign_approval_action'];
          actor_user_id: string;
          campaign_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          note: string | null;
          organization_id: string;
        };
        // NOTA (Phase 7C): desde 20260816140000_phase7c_campaign_approval_workflow.sql
        // `authenticated` ya no tiene GRANT INSERT aquí (se retiró la policy
        // campaign_approvals_insert) — la única escritura válida es a través
        // de las RPCs SECURITY DEFINER approve_campaign/reject_campaign.
        Insert: {
          action: Database['public']['Enums']['campaign_approval_action'];
          actor_user_id: string;
          campaign_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          note?: string | null;
          organization_id: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: 'campaign_approvals_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_approvals_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      compliance_rules: {
        Row: {
          active: boolean;
          category: string;
          client_id: string | null;
          created_at: string;
          description: string;
          id: string;
          jurisdiction: string | null;
          metadata: Json;
          organization_id: string | null;
          platform: string | null;
          rule_key: string;
          severity: Database['public']['Enums']['compliance_rule_severity'];
          source: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          jurisdiction?: string | null;
          metadata?: Json;
          organization_id?: string | null;
          platform?: string | null;
          rule_key: string;
          severity?: Database['public']['Enums']['compliance_rule_severity'];
          source?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category?: string;
          client_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          jurisdiction?: string | null;
          metadata?: Json;
          organization_id?: string | null;
          platform?: string | null;
          rule_key?: string;
          severity?: Database['public']['Enums']['compliance_rule_severity'];
          source?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'compliance_rules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'compliance_rules_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          created_at: string;
          created_by: string;
          currency: string;
          deleted_at: string | null;
          deleted_by: string | null;
          email: string | null;
          id: string;
          industry: string | null;
          legal_name: string | null;
          metadata: Json;
          name: string;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          slug: string;
          status: Database['public']['Enums']['client_status'];
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          currency?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          metadata?: Json;
          name: string;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          slug: string;
          status?: Database['public']['Enums']['client_status'];
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          currency?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          email?: string | null;
          id?: string;
          industry?: string | null;
          legal_name?: string | null;
          metadata?: Json;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          slug?: string;
          status?: Database['public']['Enums']['client_status'];
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      migration_records: {
        Row: {
          action: Database['public']['Enums']['migration_action'];
          created_at: string;
          entity_type: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          organization_id: string;
          run_id: string;
          source_hash: string | null;
          source_key: string;
          source_path: string;
          target_id: string | null;
          target_table: string;
        };
        Insert: {
          action: Database['public']['Enums']['migration_action'];
          created_at?: string;
          entity_type: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          organization_id: string;
          run_id: string;
          source_hash?: string | null;
          source_key: string;
          source_path: string;
          target_id?: string | null;
          target_table: string;
        };
        Update: {
          action?: Database['public']['Enums']['migration_action'];
          created_at?: string;
          entity_type?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          organization_id?: string;
          run_id?: string;
          source_hash?: string | null;
          source_key?: string;
          source_path?: string;
          target_id?: string | null;
          target_table?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'migration_records_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'migration_records_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'migration_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      migration_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          error_summary: Json;
          id: string;
          migration_name: string;
          migration_version: string;
          mode: Database['public']['Enums']['migration_mode'];
          organization_id: string;
          result_summary: Json;
          source_summary: Json;
          started_at: string;
          status: Database['public']['Enums']['migration_run_status'];
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error_summary?: Json;
          id?: string;
          migration_name: string;
          migration_version: string;
          mode?: Database['public']['Enums']['migration_mode'];
          organization_id: string;
          result_summary?: Json;
          source_summary?: Json;
          started_at?: string;
          status?: Database['public']['Enums']['migration_run_status'];
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          error_summary?: Json;
          id?: string;
          migration_name?: string;
          migration_version?: string;
          mode?: Database['public']['Enums']['migration_mode'];
          organization_id?: string;
          result_summary?: Json;
          source_summary?: Json;
          started_at?: string;
          status?: Database['public']['Enums']['migration_run_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'migration_runs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          organization_id: string;
          role: string;
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by: string;
          organization_id: string;
          role: string;
          status?: string;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          organization_id?: string;
          role?: string;
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_invitations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_members: {
        Row: {
          id: string;
          invited_by: string | null;
          joined_at: string;
          organization_id: string;
          role: string;
          status: Database['public']['Enums']['membership_status'];
          user_id: string;
        };
        Insert: {
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id: string;
          role: string;
          status?: Database['public']['Enums']['membership_status'];
          user_id: string;
        };
        Update: {
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          organization_id?: string;
          role?: string;
          status?: Database['public']['Enums']['membership_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan: string;
          settings: Json;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan?: string;
          settings?: Json;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan?: string;
          settings?: Json;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active_organization_id: string | null;
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          active_organization_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          active_organization_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_profiles_active_organization';
            columns: ['active_organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      report_recipients: {
        Row: {
          client_id: string | null;
          created_at: string;
          email: string;
          id: string;
          is_active: boolean;
          migrated_at: string | null;
          migration_version: string | null;
          organization_id: string;
          report_types: Database['public']['Enums']['report_type'][];
          updated_at: string;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          is_active?: boolean;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id: string;
          report_types?: Database['public']['Enums']['report_type'][];
          updated_at?: string;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          is_active?: boolean;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id?: string;
          report_types?: Database['public']['Enums']['report_type'][];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_recipients_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'report_recipients_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          client_id: string;
          created_at: string;
          currency: string;
          generated_at: string | null;
          id: string;
          legacy_id: string | null;
          legacy_path: string | null;
          migrated_at: string | null;
          migration_version: string | null;
          organization_id: string;
          payload: Json | null;
          period_end: string;
          period_label: string | null;
          period_start: string;
          report_type: Database['public']['Enums']['report_type'];
          source_hash: string | null;
          status: Database['public']['Enums']['report_status'];
          summary: Json;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          currency?: string;
          generated_at?: string | null;
          id?: string;
          legacy_id?: string | null;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id: string;
          payload?: Json | null;
          period_end: string;
          period_label?: string | null;
          period_start: string;
          report_type: Database['public']['Enums']['report_type'];
          source_hash?: string | null;
          status?: Database['public']['Enums']['report_status'];
          summary?: Json;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          currency?: string;
          generated_at?: string | null;
          id?: string;
          legacy_id?: string | null;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id?: string;
          payload?: Json | null;
          period_end?: string;
          period_label?: string | null;
          period_start?: string;
          report_type?: Database['public']['Enums']['report_type'];
          source_hash?: string | null;
          status?: Database['public']['Enums']['report_status'];
          summary?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      skills: {
        Row: {
          content: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_global: boolean;
          legacy_path: string | null;
          migrated_at: string | null;
          migration_version: string | null;
          name: string;
          organization_id: string | null;
          slug: string;
          source_hash: string | null;
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name: string;
          organization_id?: string | null;
          slug: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name?: string;
          organization_id?: string | null;
          slug?: string;
          source_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'skills_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          legacy_id: string | null;
          legacy_path: string | null;
          legacy_source: string | null;
          migrated_at: string | null;
          migration_version: string | null;
          organization_id: string;
          priority: Database['public']['Enums']['task_priority'];
          status: Database['public']['Enums']['task_status'];
          tags: string[];
          title: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          legacy_id?: string | null;
          legacy_path?: string | null;
          legacy_source?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id: string;
          priority?: Database['public']['Enums']['task_priority'];
          status?: Database['public']['Enums']['task_status'];
          tags?: string[];
          title: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          legacy_id?: string | null;
          legacy_path?: string | null;
          legacy_source?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          organization_id?: string;
          priority?: Database['public']['Enums']['task_priority'];
          status?: Database['public']['Enums']['task_status'];
          tags?: string[];
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      templates: {
        Row: {
          content: string;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          is_global: boolean;
          legacy_path: string | null;
          migrated_at: string | null;
          migration_version: string | null;
          name: string;
          organization_id: string | null;
          slug: string;
          source_hash: string | null;
          template_type: string;
          updated_at: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name: string;
          organization_id?: string | null;
          slug: string;
          source_hash?: string | null;
          template_type?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_global?: boolean;
          legacy_path?: string | null;
          migrated_at?: string | null;
          migration_version?: string | null;
          name?: string;
          organization_id?: string | null;
          slug?: string;
          source_hash?: string | null;
          template_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'templates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          active_organization_id: string | null;
          created_at: string;
          email_notifications: boolean;
          id: string;
          language: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_organization_id?: string | null;
          created_at?: string;
          email_notifications?: boolean;
          id?: string;
          language?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_organization_id?: string | null;
          created_at?: string;
          email_notifications?: boolean;
          id?: string;
          language?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_active_organization_id_fkey';
            columns: ['active_organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      acknowledge_alert: { Args: { p_alert_id: string }; Returns: undefined };
      approve_campaign: { Args: { p_campaign_id: string }; Returns: undefined };
      can_manage_organization: { Args: { p_org_id: string }; Returns: boolean };
      create_organization_with_owner: {
        Args: { organization_name: string; organization_slug: string };
        Returns: string;
      };
      current_active_organization_id: { Args: never; Returns: string };
      has_organization_role: {
        Args: { p_org_id: string; p_role: string };
        Returns: boolean;
      };
      is_organization_member: { Args: { p_org_id: string }; Returns: boolean };
      reject_campaign: {
        Args: { p_campaign_id: string; p_note: string };
        Returns: undefined;
      };
      resolve_alert: { Args: { p_alert_id: string }; Returns: undefined };
      soft_delete_client: {
        Args: { p_client_id: string };
        Returns: {
          created_at: string;
          created_by: string;
          currency: string;
          deleted_at: string | null;
          deleted_by: string | null;
          email: string | null;
          id: string;
          industry: string | null;
          legal_name: string | null;
          metadata: Json;
          name: string;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          slug: string;
          status: Database['public']['Enums']['client_status'];
          timezone: string;
          updated_at: string;
          updated_by: string | null;
          website: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'clients';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      upsert_client_document: {
        Args: {
          p_category?: string;
          p_client_id: string;
          p_content?: string;
          p_document_key: string;
          p_expected_version?: number;
          p_status?: Database['public']['Enums']['document_status'];
          p_title: string;
        };
        Returns: {
          category: string;
          client_id: string;
          content: string;
          created_at: string;
          created_by: string;
          document_key: string;
          id: string;
          organization_id: string;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'client_documents';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      agent_type: 'specialist' | 'strategist' | 'analyst' | 'creative' | 'manager' | 'custom';
      alert_severity: 'info' | 'warning' | 'critical';
      alert_status: 'active' | 'acknowledged' | 'snoozed' | 'resolved';
      automation_status: 'active' | 'paused' | 'error' | 'disabled' | 'inactive' | 'draft' | 'archived';
      campaign_approval_action: 'approved' | 'rejected';
      campaign_objective:
        | 'brand_awareness'
        | 'reach'
        | 'traffic'
        | 'engagement'
        | 'lead_generation'
        | 'conversions'
        | 'catalog_sales';
      campaign_status: 'draft' | 'review' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';
      client_status: 'active' | 'inactive' | 'onboarding' | 'churned';
      compliance_rule_severity: 'critical' | 'high' | 'medium' | 'low';
      document_status: 'draft' | 'published' | 'archived';
      integration_status: 'active' | 'inactive' | 'error';
      membership_status: 'active' | 'invited' | 'suspended' | 'removed';
      migration_action:
        | 'insert'
        | 'update'
        | 'skip'
        | 'skip-preexisting'
        | 'conflict'
        | 'error'
        | 'excluded'
        | 'excluded-secret'
        | 'excluded-contaminated';
      migration_mode: 'dry_run' | 'execute';
      migration_run_status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
      report_status: 'draft' | 'generated' | 'sent' | 'failed';
      report_type: 'weekly' | 'monthly' | 'custom';
      task_priority: 'low' | 'medium' | 'high' | 'urgent';
      task_status: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      agent_type: ['specialist', 'strategist', 'analyst', 'creative', 'manager', 'custom'],
      alert_severity: ['info', 'warning', 'critical'],
      alert_status: ['active', 'acknowledged', 'snoozed', 'resolved'],
      automation_status: ['active', 'paused', 'error', 'disabled', 'inactive', 'draft', 'archived'],
      campaign_approval_action: ['approved', 'rejected'],
      campaign_objective: [
        'brand_awareness',
        'reach',
        'traffic',
        'engagement',
        'lead_generation',
        'conversions',
        'catalog_sales',
      ],
      campaign_status: ['draft', 'review', 'approved', 'active', 'paused', 'completed', 'rejected'],
      client_status: ['active', 'inactive', 'onboarding', 'churned'],
      compliance_rule_severity: ['critical', 'high', 'medium', 'low'],
      document_status: ['draft', 'published', 'archived'],
      integration_status: ['active', 'inactive', 'error'],
      membership_status: ['active', 'invited', 'suspended', 'removed'],
      migration_action: [
        'insert',
        'update',
        'skip',
        'skip-preexisting',
        'conflict',
        'error',
        'excluded',
        'excluded-secret',
        'excluded-contaminated',
      ],
      migration_mode: ['dry_run', 'execute'],
      migration_run_status: ['pending', 'running', 'completed', 'failed', 'rolled_back'],
      report_status: ['draft', 'generated', 'sent', 'failed'],
      report_type: ['weekly', 'monthly', 'custom'],
      task_priority: ['low', 'medium', 'high', 'urgent'],
      task_status: ['pending', 'in_progress', 'done', 'cancelled', 'blocked'],
    },
  },
} as const;
