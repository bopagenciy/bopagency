/**
 * TEMPORARY GENERATED-LIKE TYPES
 *
 * Estructuras TypeScript manuales que imitan la salida de Supabase CLI codegen.
 * Deben reemplazarse con tipos autogenerados después de aplicar la migración:
 *
 *   npx supabase gen types typescript \
 *     --project-id <PROJECT_REF> \
 *     --schema public \
 *     > apps/web/src/lib/supabase/database.types.ts
 *
 * Una vez generado, reemplazar este archivo con database.types.ts e importarlo
 * desde browser.ts, server.ts y middleware.ts.
 */

// ─── Json ──────────────────────────────────────────────────────────────────
// Tipo recursivo que coincide con el tipo jsonb de PostgreSQL.
// Requerido para columnas jsonb (ej. organizations.settings).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ─── Alias de dominio ──────────────────────────────────────────────────────

export type OrganizationRole = 'owner' | 'admin' | 'strategist' | 'operator' | 'viewer';
export type OrganizationPlan = 'free' | 'pro' | 'enterprise';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';
export type MembershipStatus = 'active' | 'invited' | 'suspended' | 'removed';
export type ClientStatus = 'active' | 'inactive' | 'onboarding' | 'churned';
export type ClientIndustry =
  | 'hospitality'
  | 'legal'
  | 'ecommerce'
  | 'retail'
  | 'healthcare'
  | 'technology'
  | 'education'
  | 'real_estate'
  | 'finance'
  | 'food_beverage'
  | 'other';
export type DocumentStatus = 'draft' | 'published' | 'archived';
export type IntegrationStatus = 'active' | 'inactive' | 'error';

// ─── Row types (match exacto con columnas SQL) ─────────────────────────────

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  active_organization_id: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  settings: Json;
  created_at: string;
  updated_at: string;
};

export type OrganizationMemberRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string;
};

export type OrganizationInvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type UserPreferencesRow = {
  id: string;
  user_id: string;
  active_organization_id: string | null;
  language: string;
  timezone: string;
  email_notifications: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Phase 3 Row types ────────────────────────────────────────────────────────

export type ClientRow = {
  id: string;
  organization_id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  status: ClientStatus;
  industry: ClientIndustry | null;
  timezone: string;
  currency: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  metadata: Json;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ClientContactRow = {
  id: string;
  client_id: string;
  organization_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ClientDocumentRow = {
  id: string;
  client_id: string;
  organization_id: string;
  document_key: string;
  title: string;
  category: string;
  content: string;
  status: DocumentStatus;
  version: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientIntegrationRow = {
  id: string;
  client_id: string;
  organization_id: string;
  provider: string;
  external_account_id: string;
  status: IntegrationStatus;
  configuration: Json;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Phase 3 Insert types ─────────────────────────────────────────────────────

export type ClientInsert = {
  id?: string;
  organization_id: string;
  name: string;
  legal_name?: string | null;
  slug: string;
  status?: ClientStatus;
  industry?: ClientIndustry | null;
  timezone?: string;
  currency?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  metadata?: Json;
  created_by: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type ClientContactInsert = {
  id?: string;
  client_id: string;
  organization_id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ClientDocumentInsert = {
  id?: string;
  client_id: string;
  organization_id: string;
  document_key: string;
  title: string;
  category?: string;
  content?: string;
  status?: DocumentStatus;
  version?: number;
  created_by: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientIntegrationInsert = {
  id?: string;
  client_id: string;
  organization_id: string;
  provider: string;
  external_account_id: string;
  status?: IntegrationStatus;
  configuration?: Json;
  last_synced_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ─── Phase 3 Update types ─────────────────────────────────────────────────────

export type ClientUpdate = {
  name?: string;
  legal_name?: string | null;
  slug?: string;
  status?: ClientStatus;
  industry?: ClientIndustry | null;
  timezone?: string;
  currency?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  metadata?: Json;
  updated_by?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
};

export type ClientContactUpdate = {
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ClientDocumentUpdate = {
  title?: string;
  category?: string;
  content?: string;
  status?: DocumentStatus;
  version?: number;
  updated_by?: string | null;
  updated_at?: string;
};

export type ClientIntegrationUpdate = {
  status?: IntegrationStatus;
  configuration?: Json;
  last_synced_at?: string | null;
  updated_at?: string;
};

// ─── Insert types (campos con DEFAULT son opcionales) ──────────────────────

export type ProfileInsert = {
  id: string; // requerido — coincide con auth.users.id
  email: string; // requerido
  full_name?: string | null;
  avatar_url?: string | null;
  active_organization_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type OrganizationInsert = {
  id?: string; // DEFAULT gen_random_uuid()
  name: string; // requerido
  slug: string; // requerido
  plan?: string; // DEFAULT 'free'
  settings?: Json; // DEFAULT '{}'
  created_at?: string;
  updated_at?: string;
};

export type OrganizationMemberInsert = {
  id?: string; // DEFAULT gen_random_uuid()
  organization_id: string; // requerido
  user_id: string; // requerido
  role: OrganizationRole; // requerido
  status?: MembershipStatus; // DEFAULT 'active'
  invited_by?: string | null;
  joined_at?: string; // DEFAULT now()
};

export type OrganizationInvitationInsert = {
  id?: string;
  organization_id: string;
  email: string;
  role: OrganizationRole;
  invited_by: string;
  token?: string; // DEFAULT encode(gen_random_bytes(32), 'hex')
  status?: InvitationStatus; // DEFAULT 'pending'
  expires_at?: string; // DEFAULT now() + 7 days
  accepted_at?: string | null;
  created_at?: string;
};

export type UserPreferencesInsert = {
  id?: string;
  user_id: string; // requerido
  active_organization_id?: string | null;
  language?: string; // DEFAULT 'es'
  timezone?: string; // DEFAULT 'America/Bogota'
  email_notifications?: boolean; // DEFAULT true
  created_at?: string;
  updated_at?: string;
};

// ─── Update types ──────────────────────────────────────────────────────────

export type ProfileUpdate = {
  full_name?: string | null;
  avatar_url?: string | null;
  active_organization_id?: string | null;
  updated_at?: string;
};

export type OrganizationUpdate = {
  name?: string;
  settings?: Json;
  updated_at?: string;
};

export type OrganizationMemberUpdate = {
  role?: OrganizationRole;
  status?: MembershipStatus;
};

export type OrganizationInvitationUpdate = {
  status?: InvitationStatus;
  accepted_at?: string | null;
};

export type UserPreferencesUpdate = {
  active_organization_id?: string | null;
  language?: string;
  timezone?: string;
  email_notifications?: boolean;
  updated_at?: string;
};

// ─── Phase 6B Row types ───────────────────────────────────────────────────────

export type AutomationWebhookEventStatus = 'received' | 'processed' | 'failed';

export type AutomationWebhookEventRow = {
  id: string;
  source: string;
  external_event_id: string;
  event_type: string;
  payload_hash: string;
  status: AutomationWebhookEventStatus;
  processed_at: string | null;
  error_code: string | null;
  created_at: string;
};

export type AutomationWebhookEventInsert = {
  id?: string;
  source: string;
  external_event_id: string;
  event_type: string;
  payload_hash: string;
  status?: AutomationWebhookEventStatus;
  processed_at?: string | null;
  error_code?: string | null;
  created_at?: string;
};

export type AutomationWebhookEventUpdate = {
  event_type?: string;
  status?: AutomationWebhookEventStatus;
  processed_at?: string | null;
  error_code?: string | null;
};

export type AutomationExecutionStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'retrying';

export type AutomationExecutionRow = {
  id: string;
  organization_id: string;
  automation_id: string;
  status: AutomationExecutionStatus;
  attempt: number;
  trigger_type: string | null;
  trigger_payload: Json;
  output_metadata: Json;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationExecutionUpdate = {
  status?: AutomationExecutionStatus;
  attempt?: number;
  output_metadata?: Json;
  error_code?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string;
};

export type AutomationExecutionLogRow = {
  id: string;
  execution_id: string;
  organization_id: string;
  level: string;
  message: string;
  context: Json;
  occurred_at: string;
  created_at: string;
};

export type AutomationExecutionLogInsert = {
  id?: string;
  execution_id: string;
  organization_id: string;
  level?: string;
  message: string;
  context?: Json;
  occurred_at?: string;
  created_at?: string;
};

// ─── Database interface ─────────────────────────────────────────────────────
// Debe extender GenericSchema de @supabase/supabase-js:
//   GenericSchema = { Tables, Views, Functions }
// Cada tabla debe tener: Row, Insert, Update, Relationships (requerido por GenericTable)

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
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
      organizations: {
        Row: OrganizationRow;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
        Relationships: [];
      };
      organization_members: {
        Row: OrganizationMemberRow;
        Insert: OrganizationMemberInsert;
        Update: OrganizationMemberUpdate;
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
      organization_invitations: {
        Row: OrganizationInvitationRow;
        Insert: OrganizationInvitationInsert;
        Update: OrganizationInvitationUpdate;
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
      user_preferences: {
        Row: UserPreferencesRow;
        Insert: UserPreferencesInsert;
        Update: UserPreferencesUpdate;
        Relationships: [];
      };
      clients: {
        Row: ClientRow;
        Insert: ClientInsert;
        Update: ClientUpdate;
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
      client_contacts: {
        Row: ClientContactRow;
        Insert: ClientContactInsert;
        Update: ClientContactUpdate;
        Relationships: [
          {
            foreignKeyName: 'client_contacts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      client_documents: {
        Row: ClientDocumentRow;
        Insert: ClientDocumentInsert;
        Update: ClientDocumentUpdate;
        Relationships: [
          {
            foreignKeyName: 'client_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      client_integrations: {
        Row: ClientIntegrationRow;
        Insert: ClientIntegrationInsert;
        Update: ClientIntegrationUpdate;
        Relationships: [
          {
            foreignKeyName: 'client_integrations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      // ─── Phase 6B tables ──────────────────────────────────────────────────
      automation_webhook_events: {
        Row: AutomationWebhookEventRow;
        Insert: AutomationWebhookEventInsert;
        Update: AutomationWebhookEventUpdate;
        Relationships: [];
      };
      automation_executions: {
        Row: AutomationExecutionRow;
        Insert: Record<string, never>;
        Update: AutomationExecutionUpdate;
        Relationships: [];
      };
      automation_execution_logs: {
        Row: AutomationExecutionLogRow;
        Insert: AutomationExecutionLogInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    // Sin vistas en Fase 2/3. Requerido para extender GenericSchema.
    Views: { [_ in never]: never };
    Functions: {
      is_organization_member: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      has_organization_role: {
        Args: { p_org_id: string; p_role: string };
        Returns: boolean;
      };
      current_active_organization_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      can_manage_organization: {
        Args: { p_org_id: string };
        Returns: boolean;
      };
      create_organization_with_owner: {
        Args: { organization_name: string; organization_slug: string };
        Returns: string;
      };
    };
  };
}
