create temporary table praxe_disposable_fixture_confirmation(
  token text primary key
);

insert into praxe_disposable_fixture_confirmation values
  ('I_CONFIRM_THIS_IS_SYNTHETIC_DISPOSABLE_DATA');

-- TEST/DISPOSABLE ONLY
-- DO NOT RUN IN PRODUCTION
-- DO NOT APPLY AS MIGRATION
--
-- Preconditions:
-- 1. The database is an isolated Production-compatible test database.
-- 2. Two confirmed Auth users exist with the synthetic addresses below:
--      user_a@praxe.invalid
--      user_b@praxe.invalid
-- 3. The normal application bootstrap has created one public.profiles row for
--    each synthetic Auth user.
-- 4. In the SAME SQL session, the operator has deliberately created this gate:
--      create temporary table praxe_disposable_confirmation(token text primary key);
--      insert into praxe_disposable_confirmation values
--        ('I_CONFIRM_THIS_IS_NOT_PRODUCTION');
--
-- This fixture is intentionally repeatable only in a disposable database. It
-- deletes and resets rows belonging to the two named synthetic test identities.

begin;

do $safety_gate$
declare
  confirmation text;
  synthetic_user_count integer;
  synthetic_profile_count integer;
begin
  if to_regclass('pg_temp.praxe_disposable_confirmation') is null then
    raise exception 'Disposable confirmation temp table is missing';
  end if;

  execute 'select token from pg_temp.praxe_disposable_confirmation limit 1'
  into confirmation;

  if confirmation is distinct from 'I_CONFIRM_THIS_IS_NOT_PRODUCTION' then
    raise exception 'Disposable confirmation token is invalid';
  end if;

  select count(*)::integer
  into synthetic_user_count
  from auth.users as auth_user
  where auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  );

  if synthetic_user_count <> 2 then
    raise exception 'Exactly two disposable Auth users are required; found %',
      synthetic_user_count;
  end if;

  select count(*)::integer
  into synthetic_profile_count
  from public.profiles as profile
  join auth.users as auth_user on auth_user.id = profile.user_id
  where auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  );

  if synthetic_profile_count <> 2 then
    raise exception 'Both disposable users require bootstrapped profiles; found %',
      synthetic_profile_count;
  end if;
end
$safety_gate$;

-- Remove only prior A.3 test outputs so the disposable fixture can be reset.
delete from public.currency_transactions as transaction_record
using auth.users as auth_user
where transaction_record.user_id = auth_user.id
  and auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  )
  and (
    transaction_record.idempotency_key like 'praxe-a3:%'
    or transaction_record.idempotency_key like 'chest_open:a3000000-%'
  );

delete from public.reward_transactions as transaction_record
using auth.users as auth_user
where transaction_record.user_id = auth_user.id
  and auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  )
  and (
    transaction_record.idempotency_key like 'praxe-a3:%'
    or transaction_record.idempotency_key like 'daily_mission_completion:a3000000-%'
    or transaction_record.idempotency_key like 'chest_open:a3000000-%'
  );

delete from public.user_chests
where id in (
  'a3000000-0000-4000-8000-000000000401'::uuid,
  'a3000000-0000-4000-8000-000000000402'::uuid
);

delete from public.daily_missions
where id in (
  'a3000000-0000-4000-8000-000000000001'::uuid,
  'a3000000-0000-4000-8000-000000000002'::uuid,
  'a3000000-0000-4000-8000-000000000003'::uuid
);

delete from public.user_streaks as streak
using auth.users as auth_user
where streak.user_id = auth_user.id
  and auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  );

-- Reset legacy profile state without assuming the full profiles insert shape.
update public.profiles as profile
set total_xp = case auth_user.email
      when 'user_a@praxe.invalid' then 100
      else 75
    end,
    level = 1,
    streak = case auth_user.email
      when 'user_a@praxe.invalid' then 2
      else 0
    end,
    last_activity_date = case auth_user.email
      when 'user_a@praxe.invalid'
        then ((now() at time zone 'America/Sao_Paulo')::date - 1)
      else null
    end
from auth.users as auth_user
where profile.user_id = auth_user.id
  and auth_user.email in (
    'user_a@praxe.invalid',
    'user_b@praxe.invalid'
  );

insert into public.user_streaks (
  user_id,
  current_streak,
  longest_streak,
  last_active_date
)
select
  auth_user.id,
  2,
  4,
  (now() at time zone 'America/Sao_Paulo')::date - 1
from auth.users as auth_user
where auth_user.email = 'user_a@praxe.invalid';

insert into public.user_wallets (user_id, crystals)
select
  auth_user.id,
  case auth_user.email
    when 'user_a@praxe.invalid' then 20
    else 5
  end
from auth.users as auth_user
where auth_user.email in (
  'user_a@praxe.invalid',
  'user_b@praxe.invalid'
)
on conflict (user_id) do update
set crystals = excluded.crystals;

-- One unrelated ledger entry proves that reward history is preserved.
insert into public.reward_transactions (
  user_id,
  reward_type,
  source_type,
  source_id,
  idempotency_key,
  payload
)
select
  auth_user.id,
  'energy',
  'praxe_a3_fixture',
  'baseline',
  'praxe-a3:baseline-energy',
  jsonb_build_object('amount', 5, 'synthetic', true)
from auth.users as auth_user
where auth_user.email = 'user_a@praxe.invalid'
on conflict do nothing;

-- Incomplete owned mission, already-completed owned mission, and another-user
-- mission for ownership and exact-once tests.
insert into public.daily_missions (
  id,
  user_id,
  title,
  description,
  category,
  target_value,
  current_value,
  xp_reward,
  completed,
  completed_at,
  for_date
)
select
  fixture.id,
  auth_user.id,
  fixture.title,
  'Synthetic disposable validation mission',
  fixture.category,
  1,
  fixture.current_value,
  fixture.xp_reward,
  fixture.completed,
  case when fixture.completed then now() else null end,
  (now() at time zone 'America/Sao_Paulo')::date
from (
  values
    (
      'user_a@praxe.invalid'::text,
      'a3000000-0000-4000-8000-000000000001'::uuid,
      'A3 incomplete mission'::text,
      'workout'::text,
      0,
      50,
      false
    ),
    (
      'user_a@praxe.invalid',
      'a3000000-0000-4000-8000-000000000002'::uuid,
      'A3 completed mission',
      'nutrition',
      1,
      25,
      true
    ),
    (
      'user_b@praxe.invalid',
      'a3000000-0000-4000-8000-000000000003'::uuid,
      'A3 other-user mission',
      'protein',
      0,
      40,
      false
    )
) as fixture(email, id, title, category, current_value, xp_reward, completed)
join auth.users as auth_user on auth_user.email = fixture.email;

-- Two deterministic test-only chest catalogs make crystal and Energy branches
-- independently testable without depending on random Production-like loot.
insert into public.chest_definitions (
  slug, name, description, rarity, active
)
values
  (
    'praxe_a3_crystal_chest',
    'A3 Crystal Test Chest',
    'Synthetic disposable-only crystal chest.',
    'common',
    true
  ),
  (
    'praxe_a3_energy_chest',
    'A3 Energy Test Chest',
    'Synthetic disposable-only Energy chest.',
    'common',
    true
  )
on conflict (slug) do update
set active = true;

insert into public.loot_tables (chest_definition_id, name, active)
select
  definition.id,
  'A3 deterministic loot for ' || definition.slug,
  true
from public.chest_definitions as definition
where definition.slug in (
  'praxe_a3_crystal_chest',
  'praxe_a3_energy_chest'
)
on conflict (chest_definition_id) do update
set active = true;

insert into public.loot_table_entries (
  loot_table_id,
  reward_type,
  min_quantity,
  max_quantity,
  relative_weight,
  active
)
select
  loot_table.id,
  case definition.slug
    when 'praxe_a3_crystal_chest' then 'crystals'
    else 'energy'
  end,
  case definition.slug
    when 'praxe_a3_crystal_chest' then 7
    else 30
  end,
  case definition.slug
    when 'praxe_a3_crystal_chest' then 7
    else 30
  end,
  1,
  true
from public.chest_definitions as definition
join public.loot_tables as loot_table
  on loot_table.chest_definition_id = definition.id
where definition.slug in (
  'praxe_a3_crystal_chest',
  'praxe_a3_energy_chest'
)
on conflict do nothing;

insert into public.user_chests (
  id,
  user_id,
  chest_definition_id,
  source_type,
  source_id,
  idempotency_key
)
select
  case definition.slug
    when 'praxe_a3_crystal_chest'
      then 'a3000000-0000-4000-8000-000000000401'::uuid
    else 'a3000000-0000-4000-8000-000000000402'::uuid
  end,
  auth_user.id,
  definition.id,
  'praxe_a3_fixture',
  definition.slug,
  'praxe-a3:' || definition.slug
from auth.users as auth_user
cross join public.chest_definitions as definition
where auth_user.email = 'user_a@praxe.invalid'
  and definition.slug in (
    'praxe_a3_crystal_chest',
    'praxe_a3_energy_chest'
  );

commit;

-- The fixture intentionally returns only synthetic identifiers and aggregate
-- state. No Production identity or personal data is required.
select
  auth_user.email,
  auth_user.id as synthetic_user_id,
  profile.total_xp,
  profile.streak,
  wallet.crystals,
  count(distinct mission.id)::integer as fixture_missions,
  count(distinct user_chest.id)::integer as fixture_chests
from auth.users as auth_user
join public.profiles as profile on profile.user_id = auth_user.id
left join public.user_wallets as wallet on wallet.user_id = auth_user.id
left join public.daily_missions as mission
  on mission.user_id = auth_user.id
  and mission.id in (
    'a3000000-0000-4000-8000-000000000001'::uuid,
    'a3000000-0000-4000-8000-000000000002'::uuid,
    'a3000000-0000-4000-8000-000000000003'::uuid
  )
left join public.user_chests as user_chest
  on user_chest.user_id = auth_user.id
  and user_chest.id in (
    'a3000000-0000-4000-8000-000000000401'::uuid,
    'a3000000-0000-4000-8000-000000000402'::uuid
  )
where auth_user.email in (
  'user_a@praxe.invalid',
  'user_b@praxe.invalid'
)
group by
  auth_user.email,
  auth_user.id,
  profile.total_xp,
  profile.streak,
  wallet.crystals
order by auth_user.email;
