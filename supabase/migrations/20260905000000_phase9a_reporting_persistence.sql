-- Migration: 20260905000000_phase9a_reporting_persistence.sql
-- Description: Phase 9A.0 — Persistence for Campaign Metric Snapshots & Report Deliveries (Hardened)

-- ─── 1. campaign_metric_snapshots ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campaign_metric_snapshots (
  id                   uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id      uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id            uuid          NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id          uuid              NULL REFERENCES public.campaigns(id) ON DELETE SET NULL,
  activation_id        uuid              NULL REFERENCES public.campaign_activations(id) ON DELETE SET NULL,
  platform             text          NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other')),
  provider_account_id  text              NULL,
  external_campaign_id text              NULL,
  snapshot_date        date          NOT NULL,
  granularity          text          NOT NULL DEFAULT 'daily' CHECK (granularity IN ('daily', 'weekly', 'monthly', 'total')),
  scope                text          NOT NULL DEFAULT 'campaign' CHECK (scope IN ('campaign', 'client', 'account')),
  currency             text          NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
  spend                numeric(14,2)     NULL CHECK (spend IS NULL OR spend >= 0),
  impressions          bigint            NULL CHECK (impressions IS NULL OR impressions >= 0),
  reach                bigint            NULL CHECK (reach IS NULL OR reach >= 0),
  clicks               bigint            NULL CHECK (clicks IS NULL OR clicks >= 0),
  leads                integer           NULL CHECK (leads IS NULL OR leads >= 0),
  conversions          integer           NULL CHECK (conversions IS NULL OR conversions >= 0),
  revenue              numeric(14,2)     NULL CHECK (revenue IS NULL OR revenue >= 0),
  ctr                  numeric(10,4)     NULL CHECK (ctr IS NULL OR ctr >= 0),
  cpc                  numeric(14,4)     NULL CHECK (cpc IS NULL OR cpc >= 0),
  cpm                  numeric(14,4)     NULL CHECK (cpm IS NULL OR cpm >= 0),
  roas                 numeric(10,4)     NULL CHECK (roas IS NULL OR roas >= 0),
  metadata             jsonb         NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT campaign_metric_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT ck_campaign_metric_snapshots_metadata_obj CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT ck_snapshot_scope_invariants CHECK (
    (scope = 'campaign' AND campaign_id IS NOT NULL) OR
    (scope = 'account'  AND campaign_id IS NULL AND activation_id IS NULL AND external_campaign_id IS NULL AND provider_account_id IS NOT NULL) OR
    (scope = 'client'   AND campaign_id IS NULL AND activation_id IS NULL AND external_campaign_id IS NULL AND provider_account_id IS NULL)
  )
);

-- Unique index ensuring stream co-existence and deterministic upsert idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_metric_snapshots_stream
  ON public.campaign_metric_snapshots (
    organization_id,
    client_id,
    COALESCE(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(activation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    platform,
    COALESCE(provider_account_id, ''),
    COALESCE(external_campaign_id, ''),
    snapshot_date,
    granularity,
    scope
  );

CREATE INDEX IF NOT EXISTS idx_campaign_metric_snapshots_client_id
  ON public.campaign_metric_snapshots(client_id);

CREATE INDEX IF NOT EXISTS idx_campaign_metric_snapshots_campaign_id
  ON public.campaign_metric_snapshots(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_metric_snapshots_org_client_date
  ON public.campaign_metric_snapshots(organization_id, client_id, snapshot_date);

-- ─── 2. report_deliveries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_deliveries (
  id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id     uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_id           uuid          NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  recipient_email     text          NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 255),
  channel             text          NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'pdf_download', 'webhook')),
  status              text          NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'delivered', 'failed')),
  attempt_number      integer       NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  idempotency_key     text              NULL,
  provider_message_id text              NULL,
  sent_at             timestamptz       NULL,
  error_message       text              NULL CHECK (error_message IS NULL OR char_length(error_message) <= 2000),
  metadata            jsonb         NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
  created_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT report_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT ck_report_deliveries_metadata_obj CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_report_id
  ON public.report_deliveries(report_id);

CREATE INDEX IF NOT EXISTS idx_report_deliveries_org_status
  ON public.report_deliveries(organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_deliveries_idempotency_key
  ON public.report_deliveries (organization_id, idempotency_key, attempt_number)
  WHERE idempotency_key IS NOT NULL;

-- ─── 3. Tenant Consistency Triggers (Enforced EVEN FOR service_role) ─────────

CREATE OR REPLACE FUNCTION public.check_snapshot_tenant_consistency()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = NEW.client_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Tenant mismatch: client % does not belong to organization %', NEW.client_id, NEW.organization_id;
  END IF;
  IF NEW.campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns cmp
      WHERE cmp.id = NEW.campaign_id AND cmp.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Tenant mismatch: campaign % does not belong to organization %', NEW.campaign_id, NEW.organization_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_snapshot_tenant_consistency ON public.campaign_metric_snapshots;
CREATE TRIGGER trg_check_snapshot_tenant_consistency
  BEFORE INSERT OR UPDATE ON public.campaign_metric_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.check_snapshot_tenant_consistency();

CREATE OR REPLACE FUNCTION public.check_report_delivery_tenant_consistency()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = NEW.report_id AND r.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Tenant mismatch: report % does not belong to organization %', NEW.report_id, NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_report_delivery_tenant_consistency ON public.report_deliveries;
CREATE TRIGGER trg_check_report_delivery_tenant_consistency
  BEFORE INSERT OR UPDATE ON public.report_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.check_report_delivery_tenant_consistency();

-- ─── 4. Permissions & RLS ─────────────────────────────────────────────────────

REVOKE ALL ON public.campaign_metric_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_metric_snapshots TO authenticated;

REVOKE ALL ON public.report_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.report_deliveries TO authenticated;

ALTER TABLE public.campaign_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies — campaign_metric_snapshots
DROP POLICY IF EXISTS campaign_metric_snapshots_select ON public.campaign_metric_snapshots;
CREATE POLICY campaign_metric_snapshots_select ON public.campaign_metric_snapshots
  FOR SELECT TO authenticated
  USING (
    is_organization_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = campaign_metric_snapshots.client_id
        AND c.organization_id = campaign_metric_snapshots.organization_id
    )
  );

DROP POLICY IF EXISTS campaign_metric_snapshots_insert ON public.campaign_metric_snapshots;
CREATE POLICY campaign_metric_snapshots_insert ON public.campaign_metric_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = campaign_metric_snapshots.client_id
        AND c.organization_id = campaign_metric_snapshots.organization_id
    )
  );

DROP POLICY IF EXISTS campaign_metric_snapshots_update ON public.campaign_metric_snapshots;
CREATE POLICY campaign_metric_snapshots_update ON public.campaign_metric_snapshots
  FOR UPDATE TO authenticated
  USING (has_organization_role(organization_id, 'admin'))
  WITH CHECK (has_organization_role(organization_id, 'admin'));

-- RLS Policies — report_deliveries
DROP POLICY IF EXISTS report_deliveries_select ON public.report_deliveries;
CREATE POLICY report_deliveries_select ON public.report_deliveries
  FOR SELECT TO authenticated
  USING (
    is_organization_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_deliveries.report_id
        AND r.organization_id = report_deliveries.organization_id
    )
  );

DROP POLICY IF EXISTS report_deliveries_insert ON public.report_deliveries;
CREATE POLICY report_deliveries_insert ON public.report_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (
    has_organization_role(organization_id, 'operator')
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_deliveries.report_id
        AND r.organization_id = report_deliveries.organization_id
    )
  );

DROP POLICY IF EXISTS report_deliveries_update ON public.report_deliveries;
CREATE POLICY report_deliveries_update ON public.report_deliveries
  FOR UPDATE TO authenticated
  USING (has_organization_role(organization_id, 'admin'))
  WITH CHECK (has_organization_role(organization_id, 'admin'));

-- ─── 5. Updated At Triggers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_campaign_metric_snapshots_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_metric_snapshots_updated_at ON public.campaign_metric_snapshots;
CREATE TRIGGER trg_campaign_metric_snapshots_updated_at
  BEFORE UPDATE ON public.campaign_metric_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_campaign_metric_snapshots_updated_at();
