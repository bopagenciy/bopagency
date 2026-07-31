-- ============================================================
-- Lock down Phase 4 migration actor RPCs
-- ============================================================

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS function_signature
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_migrated_client',
        'update_migrated_client'
      )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC',
      fn.function_signature
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM anon',
      fn.function_signature
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM authenticated',
      fn.function_signature
    );

    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      fn.function_signature
    );
  END LOOP;
END;
$$;
