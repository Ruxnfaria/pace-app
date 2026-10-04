-- PRODUCTION MIGRATION-HISTORY DISCOVERY AUDIT ONLY. READ-ONLY.
-- DO NOT APPLY AS A MIGRATION.
-- DO NOT CREATE, MODIFY, REPAIR, OR BASELINE MIGRATION HISTORY.
-- One statement, one compact result set. Catalog metadata only.
-- It does not query candidate rows, application tables, or business functions.
with relation_candidates as (
  select
    namespace.nspname::text as schema_name,
    relation.relname::text as relation_name,
    relation.oid as relation_oid,
    relation.relkind::text as relkind,
    case
      when namespace.nspname = 'supabase_migrations'
        and relation.relname = 'schema_migrations'
      then 'SUPABASE_CLI_PROJECT_LEDGER'
      when (namespace.nspname, relation.relname) in (
        ('auth', 'schema_migrations'),
        ('realtime', 'schema_migrations'),
        ('storage', 'migrations')
      )
      then 'SUPABASE_MANAGED_SERVICE_LEDGER'
      else 'OTHER_PROJECT_OR_TOOL_CANDIDATE'
    end as candidate_scope,
    case relation.relkind
      when 'r' then 'table'
      when 'p' then 'partitioned_table'
      when 'v' then 'view'
      when 'm' then 'materialized_view'
      when 'f' then 'foreign_table'
      else 'other'
    end as relation_kind,
    pg_catalog.pg_get_userbyid(relation.relowner)::text as owner_name,
    coalesce(
      pg_catalog.has_table_privilege(relation.oid, 'SELECT'),
      false
    ) as readable,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'ordinal', attribute.attnum,
          'name', attribute.attname::text,
          'type', pg_catalog.format_type(
            attribute.atttypid,
            attribute.atttypmod
          ),
          'not_null', attribute.attnotnull
        )
        order by attribute.attnum
      )
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = relation.oid
        and attribute.attnum > 0
        and not attribute.attisdropped
    ), '[]'::jsonb) as columns
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where relation.relkind in ('r', 'p', 'v', 'm', 'f')
    and namespace.nspname <> 'information_schema'
    and left(namespace.nspname, 3) <> 'pg_'
    and (
      lower(relation.relname) in (
        'migration',
        'migrations',
        'schema_migrations',
        'supabase_migrations',
        'migration_history'
      )
      or lower(relation.relname) like '%migration%'
    )
),
known_candidates(schema_name, relation_name, expected_scope) as (
  values
    (
      'supabase_migrations'::text,
      'schema_migrations'::text,
      'SUPABASE_CLI_PROJECT_LEDGER'::text
    ),
    ('public', 'schema_migrations', 'OTHER_PROJECT_OR_TOOL_CANDIDATE'),
    ('migrations', 'schema_migrations', 'OTHER_PROJECT_OR_TOOL_CANDIDATE'),
    ('auth', 'schema_migrations', 'SUPABASE_MANAGED_SERVICE_LEDGER'),
    ('realtime', 'schema_migrations', 'SUPABASE_MANAGED_SERVICE_LEDGER'),
    ('storage', 'migrations', 'SUPABASE_MANAGED_SERVICE_LEDGER')
),
known_candidate_status as (
  select
    known.schema_name,
    known.relation_name,
    known.expected_scope,
    candidate.relation_oid is not null as relation_exists,
    candidate.candidate_scope,
    candidate.relkind,
    candidate.relation_kind,
    candidate.owner_name,
    candidate.readable,
    coalesce(candidate.columns, '[]'::jsonb) as columns
  from known_candidates as known
  left join relation_candidates as candidate
    on candidate.schema_name = known.schema_name
    and candidate.relation_name = known.relation_name
),
candidate_summary as (
  select
    count(*)::integer as candidate_count,
    count(*) filter (
      where schema_name = 'supabase_migrations'
        and relation_name = 'schema_migrations'
    )::integer as known_supabase_count,
    count(*) filter (
      where candidate_scope = 'SUPABASE_MANAGED_SERVICE_LEDGER'
    )::integer as managed_service_candidate_count,
    count(*) filter (
      where candidate_scope = 'OTHER_PROJECT_OR_TOOL_CANDIDATE'
    )::integer as other_candidate_count,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'schema', schema_name,
        'relation', relation_name,
        'qualified_name', format('%I.%I', schema_name, relation_name),
        'candidate_scope', candidate_scope,
        'relkind', relkind,
        'relation_kind', relation_kind,
        'owner', owner_name,
        'readable', readable,
        'columns', columns
      )
      order by schema_name, relation_name
    ), '[]'::jsonb) as discovered_relations
  from relation_candidates
),
known_summary as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', schema_name,
      'relation', relation_name,
      'qualified_name', format('%I.%I', schema_name, relation_name),
      'expected_scope', expected_scope,
      'candidate_scope', candidate_scope,
      'exists', relation_exists,
      'relkind', relkind,
      'relation_kind', relation_kind,
      'owner', owner_name,
      'readable', readable,
      'columns', columns
    )
    order by schema_name, relation_name
  ) as explicitly_checked_candidates
  from known_candidate_status
),
result as (
  select
    case
      when candidates.known_supabase_count = 1
        and candidates.other_candidate_count = 0
      then 'KNOWN_SUPABASE_LEDGER_FOUND'
      when candidates.known_supabase_count = 0
        and candidates.other_candidate_count = 1
      then 'OTHER_MIGRATION_HISTORY_CANDIDATE_FOUND'
      when candidates.known_supabase_count = 0
        and candidates.other_candidate_count = 0
      then 'NO_MIGRATION_HISTORY_RELATION_FOUND'
      else 'AMBIGUOUS'
    end as discovery_status,
    candidates.candidate_count,
    candidates.known_supabase_count = 1
      as known_supabase_ledger_found,
    candidates.managed_service_candidate_count,
    candidates.other_candidate_count,
    candidates.discovered_relations,
    known.explicitly_checked_candidates,
    case
      when candidates.candidate_count = 0 then
        'No catalog relation name suggests migration history. Stop for a separate deployment-model decision.'
      when candidates.known_supabase_count = 0
        and candidates.other_candidate_count = 0 then
        'Only Supabase-managed service ledgers were found; no project migration-history relation was found. Stop for a separate deployment-model decision.'
      when candidates.known_supabase_count = 1
        and candidates.other_candidate_count = 0 then
        'The standard Supabase CLI ledger exists. Inspect it only in a separately authorized read-only check.'
      when candidates.known_supabase_count = 0
        and candidates.other_candidate_count = 1 then
        'One nonstandard candidate exists. Review its catalog shape before any separately authorized row-level metadata check.'
      else
        'Multiple candidates exist. Stop and disambiguate before any row-level metadata check.'
    end as required_action
  from candidate_summary as candidates
  cross join known_summary as known
)
select
  discovery_status,
  candidate_count,
  known_supabase_ledger_found,
  managed_service_candidate_count,
  other_candidate_count,
  discovered_relations,
  explicitly_checked_candidates,
  required_action
from result;
