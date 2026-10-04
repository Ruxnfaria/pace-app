-- PRODUCTION MIGRATION LEDGER AUDIT ONLY. READ-ONLY.
-- DO NOT APPLY AS A MIGRATION.
-- DO NOT MODIFY OR REPAIR MIGRATION HISTORY.
-- Run manually only after confirming the Production project identity.
-- One statement, one compact result set. Catalog/ledger metadata only.
with expected_versions(version, expected_name, expected_file) as (
  values
    (
      '20261003000500'::text,
      'contain_legacy_mission_rpc'::text,
      'supabase/manual-history/gamification/20261003000500_contain_legacy_mission_rpc.sql'::text
    ),
    (
      '20261003000600',
      'reconcile_streak_sync',
      'supabase/manual-history/gamification/20261003000600_reconcile_streak_sync.sql'
    ),
    (
      '20261003000700',
      'reconcile_chest_currency_ledger',
      'supabase/manual-history/gamification/20261003000700_reconcile_chest_currency_ledger.sql'
    )
),
ledger_relation as (
  select pg_catalog.to_regclass(
    'supabase_migrations.schema_migrations'
  ) as ledger_oid
),
ledger_metadata as (
  select
    relation.ledger_oid,
    relation.ledger_oid is not null as relation_exists,
    coalesce(
      pg_catalog.has_table_privilege(relation.ledger_oid, 'SELECT'),
      false
    ) as readable,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = relation.ledger_oid
        and attribute.attname = 'version'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) as version_column_exists,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = relation.ledger_oid
        and attribute.attname = 'name'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) as name_column_exists,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = relation.ledger_oid
        and attribute.attname = 'statements'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) as statements_column_exists,
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conrelid = relation.ledger_oid
        and constraint_record.contype = 'p'
        and pg_catalog.pg_get_constraintdef(constraint_record.oid)
          ilike '%(version)%'
    ) as version_primary_key_exists
  from ledger_relation as relation
),
ledger_snapshot as (
  select
    metadata.*,
    case
      when metadata.relation_exists
        and metadata.readable
        and metadata.version_column_exists
      then pg_catalog.query_to_xml(
        'select '
          || 'to_jsonb(m)->>''version'' as version, '
          || 'to_jsonb(m)->>''name'' as name, '
          || 'case when jsonb_typeof(to_jsonb(m)->''statements'') = ''array'' '
          || 'then jsonb_array_length(to_jsonb(m)->''statements'') '
          || 'else null end as statement_count '
          || 'from supabase_migrations.schema_migrations as m '
          || 'where to_jsonb(m)->>''version'' in ('
          || '''20261003000500'',''20261003000600'',''20261003000700'') '
          || 'order by to_jsonb(m)->>''version''',
        false,
        false,
        ''
      )
      else null
    end as ledger_xml
  from ledger_metadata as metadata
),
version_results as (
  select
    expected.version,
    expected.expected_name,
    expected.expected_file,
    case
      when snapshot.ledger_xml is null then 'UNAVAILABLE'
      when pg_catalog.cardinality(pg_catalog.xpath(
        pg_catalog.format(
          '/table/row[version/text()="%s"]',
          expected.version
        ),
        snapshot.ledger_xml
      )) > 0 then 'PRESENT'
      else 'ABSENT'
    end as ledger_status,
    nullif(
      coalesce(
        (
          pg_catalog.xpath(
            pg_catalog.format(
              '/table/row[version/text()="%s"]/name/text()',
              expected.version
            ),
            snapshot.ledger_xml
          )
        )[1]::text,
        ''
      ),
      ''
    ) as recorded_name,
    nullif(
      coalesce(
        (
          pg_catalog.xpath(
            pg_catalog.format(
              '/table/row[version/text()="%s"]/statement_count/text()',
              expected.version
            ),
            snapshot.ledger_xml
          )
        )[1]::text,
        ''
      ),
      ''
    )::integer as recorded_statement_count
  from expected_versions as expected
  cross join ledger_snapshot as snapshot
),
summary as (
  select
    case
      when not snapshot.relation_exists then 'BLOCKED_LEDGER_RELATION_MISSING'
      when not snapshot.readable then 'BLOCKED_LEDGER_UNREADABLE'
      when not snapshot.version_column_exists then 'BLOCKED_LEDGER_SHAPE'
      when count(*) filter (
        where results.ledger_status = 'ABSENT'
      ) > 0 then 'STOP_LEDGER_VERSION_ABSENT'
      when count(*) filter (
        where results.ledger_status = 'PRESENT'
      ) = 3 then 'PASS_ALL_VERSIONS_PRESENT'
      else 'BLOCKED_LEDGER_UNAVAILABLE'
    end as overall_status,
    snapshot.relation_exists,
    snapshot.readable,
    snapshot.version_column_exists,
    snapshot.name_column_exists,
    snapshot.statements_column_exists,
    snapshot.version_primary_key_exists,
    count(*) filter (
      where results.ledger_status = 'PRESENT'
    )::integer as present_count,
    count(*) filter (
      where results.ledger_status = 'ABSENT'
    )::integer as absent_count,
    count(*) filter (
      where results.ledger_status = 'UNAVAILABLE'
    )::integer as unavailable_count,
    jsonb_agg(
      jsonb_build_object(
        'version', results.version,
        'status', results.ledger_status,
        'expected_name', results.expected_name,
        'recorded_name', results.recorded_name,
        'name_matches_expected', case
          when results.recorded_name is null then null
          else results.recorded_name = results.expected_name
        end,
        'recorded_statement_count', results.recorded_statement_count,
        'local_file', results.expected_file
      )
      order by results.version
    ) as versions,
    'ABSENT or UNAVAILABLE requires STOP and a separate reconciliation decision; this audit performs no repair.'::text
      as required_action
  from version_results as results
  cross join ledger_snapshot as snapshot
  group by
    snapshot.relation_exists,
    snapshot.readable,
    snapshot.version_column_exists,
    snapshot.name_column_exists,
    snapshot.statements_column_exists,
    snapshot.version_primary_key_exists
)
select
  overall_status,
  relation_exists,
  readable,
  version_column_exists,
  name_column_exists,
  statements_column_exists,
  version_primary_key_exists,
  present_count,
  absent_count,
  unavailable_count,
  versions,
  required_action
from summary;
