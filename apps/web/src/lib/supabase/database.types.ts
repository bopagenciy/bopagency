export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
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
      client_status: 'active' | 'inactive' | 'onboarding' | 'churned';
      document_status: 'draft' | 'published' | 'archived';
      integration_status: 'active' | 'inactive' | 'error';
      membership_status: 'active' | 'invited' | 'suspended' | 'removed';
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
      client_status: ['active', 'inactive', 'onboarding', 'churned'],
      document_status: ['draft', 'published', 'archived'],
      integration_status: ['active', 'inactive', 'error'],
      membership_status: ['active', 'invited', 'suspended', 'removed'],
    },
  },
} as const;
