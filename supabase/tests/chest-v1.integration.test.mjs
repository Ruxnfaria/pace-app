import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readMigration, startLocalPostgres } from './local-postgres.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const expectedCacheRoot = resolve(root, 'node_modules/.cache/onboarding-v22');
const migrationName = '20261013033003_implement_authoritative_chest_v1.sql';
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const allowedAmounts = {
  common_chest: new Set([3, 5, 8]),
  rare_chest: new Set([8, 12, 20]),
  epic_chest: new Set([30, 50, 80]),
};

let local;

after(async () => {
  if (local) {
    await local.stop();
    local = undefined;
  }
});

async function bootstrapSupabaseMinimum(db) {
  await db.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $$
      select nullif(
        pg_catalog.current_setting('request.jwt.claim.sub', true),
        ''
      )::uuid
    $$;
  `);
  await db.query(await readMigration('20260907000100_reward_system_foundation.sql'));
  await db.query(await readMigration(migrationName));
  await db.query(
    'insert into auth.users (id) values ($1), ($2)',
    [userA, userB],
  );
}

async function authenticatedClient(userId) {
  const client = await local.connect();
  await client.query(
    `select pg_catalog.set_config('request.jwt.claim.sub', $1, false)`,
    [userId],
  );
  await client.query('set role authenticated');
  return client;
}

async function grantChest(db, userId, chestSlug, suffix = randomUUID()) {
  const result = await db.query(`
    insert into public.user_chests (
      user_id,
      chest_definition_id,
      status,
      source_type,
      source_id,
      idempotency_key
    )
    select
      $1::uuid,
      definition.id,
      'granted',
      'test',
      $3::text,
      'test:' || $1::text || ':' || $3::text
    from public.chest_definitions as definition
    where definition.slug = $2::text
    returning id
  `, [userId, chestSlug, suffix]);
  assert.equal(result.rowCount, 1);
  return result.rows[0].id;
}

async function openChest(client, chestId) {
  const result = await client.query(
    'select * from public.open_user_chest($1::uuid)',
    [chestId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

test('authoritative chest V1 is atomic, secure, and exactly-once', async () => {
  local = await startLocalPostgres();
  const readiness = local.startupDiagnostics.readiness;
  assert.equal(readiness.host, '127.0.0.1');
  assert.ok(Number.isInteger(readiness.port) && readiness.port > 0);
  assert.ok(isAbsolute(local.dataDir));
  assert.equal(relative(expectedCacheRoot, local.dataDir).startsWith('..'), false);

  await bootstrapSupabaseMinimum(local.db);

  const loot = await local.db.query(`
    select
      definition.slug,
      entry.min_quantity as amount,
      entry.relative_weight::integer as weight,
      entry.reward_type
    from public.loot_table_entries as entry
    join public.loot_tables as loot_table
      on loot_table.id = entry.loot_table_id
    join public.chest_definitions as definition
      on definition.id = loot_table.chest_definition_id
    where entry.active = true
    order by definition.slug, entry.min_quantity
  `);
  assert.deepEqual(loot.rows, [
    { slug: 'common_chest', amount: 3, weight: 55, reward_type: 'crystals' },
    { slug: 'common_chest', amount: 5, weight: 35, reward_type: 'crystals' },
    { slug: 'common_chest', amount: 8, weight: 10, reward_type: 'crystals' },
    { slug: 'epic_chest', amount: 30, weight: 45, reward_type: 'crystals' },
    { slug: 'epic_chest', amount: 50, weight: 40, reward_type: 'crystals' },
    { slug: 'epic_chest', amount: 80, weight: 15, reward_type: 'crystals' },
    { slug: 'rare_chest', amount: 8, weight: 50, reward_type: 'crystals' },
    { slug: 'rare_chest', amount: 12, weight: 35, reward_type: 'crystals' },
    { slug: 'rare_chest', amount: 20, weight: 15, reward_type: 'crystals' },
  ]);

  const acl = await local.db.query(`
    select
      function_record.prosecdef as security_definer,
      pg_catalog.pg_get_userbyid(function_record.proowner)::text as owner_name,
      function_record.proconfig as configuration,
      pg_catalog.has_function_privilege('anon', function_record.oid, 'EXECUTE')
        as anon_execute,
      pg_catalog.has_function_privilege(
        'authenticated', function_record.oid, 'EXECUTE'
      ) as authenticated_execute,
      pg_catalog.has_function_privilege(
        'service_role', function_record.oid, 'EXECUTE'
      ) as service_role_execute,
      coalesce(pg_catalog.bool_or(expanded.grantee = 0), false)
        as public_execute
    from pg_catalog.pg_proc as function_record
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_record.proacl,
        pg_catalog.acldefault('f', function_record.proowner)
      )
    ) as expanded
    where function_record.oid =
      'public.open_user_chest(uuid)'::pg_catalog.regprocedure
    group by function_record.oid
  `);
  assert.deepEqual(acl.rows[0], {
    security_definer: true,
    owner_name: 'postgres',
    configuration: ['search_path=""'],
    anon_execute: false,
    authenticated_execute: true,
    service_role_execute: false,
    public_execute: false,
  });

  const clientA = await authenticatedClient(userA);
  let expectedWallet = 0;

  for (const chestSlug of ['common_chest', 'rare_chest', 'epic_chest']) {
    const chestId = await grantChest(local.db, userA, chestSlug);
    const reward = await openChest(clientA, chestId);
    assert.equal(reward.chest_id, chestId);
    assert.equal(reward.chest_slug, chestSlug);
    assert.equal(reward.reward_type, 'crystals');
    assert.equal(reward.item_id, null);
    assert.equal(allowedAmounts[chestSlug].has(reward.amount), true);
    expectedWallet += reward.amount;

    const state = await local.db.query(`
      select status, opened_at is not null as has_opened_at,
             metadata -> 'opened_reward' ->> 'amount' as persisted_amount
      from public.user_chests
      where id = $1
    `, [chestId]);
    assert.deepEqual(state.rows[0], {
      status: 'opened',
      has_opened_at: true,
      persisted_amount: String(reward.amount),
    });
  }

  const wallet = await local.db.query(
    'select crystals from public.user_wallets where user_id = $1',
    [userA],
  );
  assert.equal(Number(wallet.rows[0].crystals), expectedWallet);

  const ledgers = await local.db.query(`
    select
      (select count(*)::integer from public.currency_transactions
       where user_id = $1 and source_type = 'chest_open') as currency_count,
      (select count(*)::integer from public.reward_transactions
       where user_id = $1 and source_type = 'chest_open') as reward_count,
      (select coalesce(sum(amount), 0)::integer
       from public.currency_transactions
       where user_id = $1 and source_type = 'chest_open') as credited
  `, [userA]);
  assert.deepEqual(ledgers.rows[0], {
    currency_count: 3,
    reward_count: 3,
    credited: expectedWallet,
  });

  const replayChestId = await grantChest(local.db, userA, 'common_chest');
  const firstReward = await openChest(clientA, replayChestId);
  const replayReward = await openChest(clientA, replayChestId);
  assert.deepEqual(replayReward, firstReward);
  const replayCounts = await local.db.query(`
    select
      (select count(*)::integer from public.currency_transactions
       where source_id = $1) as currency_count,
      (select count(*)::integer from public.reward_transactions
       where source_id = $1) as reward_count
  `, [replayChestId]);
  assert.deepEqual(replayCounts.rows[0], {
    currency_count: 1,
    reward_count: 1,
  });

  const concurrentChestId = await grantChest(local.db, userA, 'rare_chest');
  const clientA2 = await authenticatedClient(userA);
  const [concurrentA, concurrentB] = await Promise.all([
    openChest(clientA, concurrentChestId),
    openChest(clientA2, concurrentChestId),
  ]);
  assert.deepEqual(concurrentB, concurrentA);
  const concurrentCounts = await local.db.query(`
    select
      (select count(*)::integer from public.currency_transactions
       where source_id = $1) as currency_count,
      (select count(*)::integer from public.reward_transactions
       where source_id = $1) as reward_count
  `, [concurrentChestId]);
  assert.deepEqual(concurrentCounts.rows[0], {
    currency_count: 1,
    reward_count: 1,
  });

  const foreignChestId = await grantChest(local.db, userB, 'epic_chest');
  await assert.rejects(
    openChest(clientA, foreignChestId),
    (error) => error?.code === 'P0002',
  );
  await assert.rejects(
    openChest(clientA, randomUUID()),
    (error) => error?.code === 'P0002',
  );

  const rollbackChestId = await grantChest(local.db, userA, 'common_chest');
  const walletBeforeRollback = await local.db.query(
    'select crystals from public.user_wallets where user_id = $1',
    [userA],
  );
  await local.db.query(`
    create function public.test_reject_chest_currency_ledger()
    returns trigger
    language plpgsql
    set search_path = ''
    as $$
    begin
      if new.source_id = '${rollbackChestId}' then
        raise exception 'forced ledger failure';
      end if;
      return new;
    end
    $$;
    create trigger test_reject_chest_currency_ledger
    before insert on public.currency_transactions
    for each row execute function public.test_reject_chest_currency_ledger();
  `);
  await assert.rejects(openChest(clientA, rollbackChestId), /forced ledger failure/);
  await local.db.query(`
    drop trigger test_reject_chest_currency_ledger
      on public.currency_transactions;
    drop function public.test_reject_chest_currency_ledger();
  `);
  const rollbackState = await local.db.query(`
    select
      (select status from public.user_chests where id = $1::uuid) as chest_status,
      (select opened_at from public.user_chests where id = $1::uuid) as opened_at,
      (select crystals from public.user_wallets where user_id = $2::uuid) as crystals,
      (select count(*)::integer from public.currency_transactions
       where source_id = $1::uuid::text) as currency_count,
      (select count(*)::integer from public.reward_transactions
       where source_id = $1::uuid::text) as reward_count
  `, [rollbackChestId, userA]);
  assert.deepEqual(rollbackState.rows[0], {
    chest_status: 'granted',
    opened_at: null,
    crystals: walletBeforeRollback.rows[0].crystals,
    currency_count: 0,
    reward_count: 0,
  });
});
