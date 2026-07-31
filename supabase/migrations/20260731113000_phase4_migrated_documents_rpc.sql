-- =============================================================================
-- BopIAgency — Phase 4: Migration RPC for client_documents
-- Archivo: 20260731113000_phase4_migrated_documents_rpc.sql
-- Requiere: 20260730120000_phase3_clients.sql (define client_documents y triggers)
--           20260731000000_phase4_migration_actor.sql (patrón set_config)
--
-- PROBLEMA RESUELTO:
--   public.upsert_client_document exige auth.uid() IS NOT NULL y eleva excepción
--   'upsert_client_document: unauthenticated' cuando service_role ejecuta sin JWT.
--
-- SOLUCIÓN:
--   upsert_migrated_client_document():
--     1. Verifica que p_client_id exista y no esté eliminado.
--     2. Verifica que p_actor_user_id sea miembro admin u owner de la org del cliente.
--     3. Usa set_config('request.jwt.claim.sub', …, true) = SET LOCAL para que
--        auth.uid() devuelva el UUID del actor durante la transacción.
--     4. El trigger set_document_audit ve auth.uid() = actor_uuid y asigna
--        created_by / updated_by correctamente.
--     5. Reseta el config al finalizar.
--
-- SEGURIDAD:
--   • REVOKE ALL FROM PUBLIC, anon, authenticated.
--   • GRANT EXECUTE TO service_role solamente.
--   • Actor validado como admin/owner de la org propietaria del cliente.
--   • client_id validado dentro de la misma organización (se obtiene de BD).
--   • No se debilita upsert_client_document ni ningún trigger existente.
--   • search_path fijado a 'public' (previene search_path injection).
--   • set_config(..., true) = SET LOCAL → solo aplica a la transacción en curso.
--
-- IDEMPOTENCIA: CREATE OR REPLACE garantiza idempotencia.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_migrated_client_document(
  p_client_id      uuid,
  p_actor_user_id  uuid,
  p_document_key   text,
  p_title          text,
  p_content        text,
  p_category       text                   DEFAULT 'general',
  p_status         public.document_status DEFAULT 'draft'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_existing  public.client_documents;
  v_doc_id    uuid;
BEGIN
  -- ── 1. Verificar que el cliente exista y obtener org_id ─────────────────────
  SELECT organization_id
  INTO   v_org_id
  FROM   public.clients
  WHERE  id = p_client_id
    AND  deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'upsert_migrated_client_document: cliente no encontrado o eliminado (id: %)',
      p_client_id;
  END IF;

  -- ── 2. Validar actor: debe ser admin u owner de la org del cliente ───────────
  IF NOT EXISTS (
    SELECT 1
    FROM   public.organization_members
    WHERE  organization_id = v_org_id
      AND  user_id         = p_actor_user_id
      AND  role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION
      'upsert_migrated_client_document: actor % no es miembro admin/owner en org % '
      '(cliente %)',
      p_actor_user_id, v_org_id, p_client_id;
  END IF;

  -- ── 3. Impersonar actor para la duración de esta transacción ────────────────
  --    set_config(..., true) = SET LOCAL → expira al final de la transacción.
  --    El trigger set_document_audit lee auth.uid() y asigna created_by/updated_by.
  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);

  -- ── 4. Buscar documento existente ───────────────────────────────────────────
  SELECT *
  INTO   v_existing
  FROM   public.client_documents
  WHERE  client_id    = p_client_id
    AND  document_key = p_document_key;

  IF FOUND THEN
    -- UPDATE: trigger set_document_audit asigna updated_by desde auth.uid() = actor
    UPDATE public.client_documents
    SET
      title      = p_title,
      category   = p_category,
      content    = p_content,
      status     = p_status,
      version    = v_existing.version + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_doc_id;

  ELSE
    -- INSERT: trigger set_document_audit asigna created_by/updated_by = auth.uid() = actor
    --         No se pasan created_by/updated_by explícitamente — el trigger los asigna.
    INSERT INTO public.client_documents (
      client_id,
      organization_id,
      document_key,
      title,
      category,
      content,
      status,
      version
    ) VALUES (
      p_client_id,
      v_org_id,
      p_document_key,
      p_title,
      p_category,
      p_content,
      p_status,
      1
    )
    RETURNING id INTO v_doc_id;
  END IF;

  -- ── 5. Restaurar contexto (defensa adicional; SET LOCAL ya expira) ──────────
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RETURN v_doc_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_migrated_client_document(uuid, uuid, text, text, text, text, public.document_status) IS
  'RPC de migración para insertar o actualizar un documento de cliente con actor '
  'explícito validado. Solo ejecutable por service_role. '
  'Valida que el actor sea admin/owner de la org del cliente. '
  'Usa set_config para que set_document_audit asigne created_by/updated_by al actor. '
  'No debilita upsert_client_document ni los triggers existentes.';

-- Seguridad: solo service_role puede ejecutar esta RPC
REVOKE ALL ON FUNCTION public.upsert_migrated_client_document(uuid, uuid, text, text, text, text, public.document_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_migrated_client_document(uuid, uuid, text, text, text, text, public.document_status) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_migrated_client_document(uuid, uuid, text, text, text, text, public.document_status) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.upsert_migrated_client_document(uuid, uuid, text, text, text, text, public.document_status) TO service_role;

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run
-- Luego ejecutar: npm run migrate:phase4 -- --dry-run --verbose
-- =============================================================================
