import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { startLocalPostgres, loadV21Foundation, readMigration } from './local-postgres.mjs';
import { v21Payload, v22Payload, invalidV22Cases, mutatePayload } from './fixtures/onboarding-v22-payload.ts';
import { DURATION_RANGES, INITIAL_TRAINING_LEVELS, AEROBIC_PRACTICE_FREQUENCIES,
  FOOD_PREPARATION_AVAILABILITIES, CURRENT_EATING_ROUTINES, V22_ACTIVITY_CODES,
  ACTIVITY_INTENSITIES, buildOnboardingV22Payload } from '../../src/app/onboarding/lib/onboarding-v22-contract.ts';

let local; let db; let legacyUser; let v1User; let v21Definition; let oldColumns; let legacySnapshot;
const domainTables = ['user_health_profiles', 'training_profiles', 'training_profile_activities', 'nutrition_profiles',
  'nutrition_profile_restrictions', 'nutrition_profile_disliked_foods', 'nutrition_profile_preferred_foods',
  'nutrition_profile_supplements', 'onboarding_completion_receipts'];
async function seed() {
  const user = randomUUID();
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
  await db.query("INSERT INTO public.profiles(user_id,nome) VALUES ($1,'Original')", [user]);
  return user;
}
async function asRole(client, role, user, run) {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    const result = await run(); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
const invoke = (user, payload = v22Payload(), rpc = 'complete_onboarding_v22', client = db) =>
  asRole(client, 'authenticated', user, () => client.query(`SELECT * FROM public.${rpc}($1::jsonb)`, [JSON.stringify(payload)]));
const canonical = async (payload) => (await db.query('SELECT public.canonicalize_onboarding_v22($1::jsonb) AS value', [JSON.stringify(payload)])).rows[0].value;
const hash = async (payload) => (await db.query("SELECT encode(sha256(convert_to(public.canonicalize_onboarding_v22($1::jsonb)::text,'UTF8')),'hex') AS value", [JSON.stringify(payload)])).rows[0].value;
const row = async (table, user) => (await db.query(`SELECT * FROM public.${table} WHERE user_id=$1`, [user])).rows[0];
async function emptyDomain(user) {
  for (const table of domainTables) assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE user_id=$1`, [user])).rows[0].n, 0, table);
  const profile = await row('profiles', user);
  assert.equal(profile.nome, 'Original'); assert.equal(profile.onboarding_completed, false);
  assert.equal(profile.onboarding_version, null); assert.equal(profile.onboarding_completed_at, null);
}
async function snapshotOldRows() {
  const snapshot = {};
  for (const [table, columns] of Object.entries(oldColumns)) {
    snapshot[table] = (await db.query(`SELECT ${columns.map((x) => `"${x}"`).join(',')} FROM public.${table} ORDER BY user_id`, [])).rows;
  }
  return snapshot;
}

before(async () => {
  local = await startLocalPostgres(); db = local.db;
  await loadV21Foundation(db);
  await db.query(await readMigration('20261002000100_harden_profiles_client_acl.sql'));
  v21Definition = (await db.query("SELECT pg_get_functiondef('public.complete_onboarding_v2(jsonb)'::regprocedure) AS definition")).rows[0].definition;
  oldColumns = {};
  for (const table of ['profiles', ...domainTables]) oldColumns[table] = (await db.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', ['public', table])).rows.map((x) => x.column_name);
  legacyUser = await seed(); await invoke(legacyUser, v21Payload(), 'complete_onboarding_v2');
  for (let index = 0; index < 2; index++) {
    const historicalUser = await seed();
    await invoke(historicalUser, v21Payload(), 'complete_onboarding_v2');
  }
  v1User = await seed();
  await db.query("UPDATE public.profiles SET onboarding_completed=true, objetivo='massa', peso=70, altura=175 WHERE user_id=$1", [v1User]);
  legacySnapshot = await snapshotOldRows();
  await db.query(await readMigration('20260928000100_onboarding_v22_foundation.sql'));
}, { timeout: 120000 });
after(async () => { if (local) await local.stop(); });

test('post-migration audit returns one consolidated result set with no failures', async () => {
  const audit = await readMigration('audit_onboarding_v22_production_postmigration_readonly.sql');
  const result = await db.query(audit);
  assert.equal(Array.isArray(result), false);
  assert.ok(result.rows.length > 1);
  const failures = result.rows.filter((item) => item.audit_status === 'FAIL');
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  const final = result.rows.at(-1);
  assert.equal(final.check_order, 999);
  assert.equal(final.check_name, 'ONBOARDING_V22_PRODUCTION_POSTMIGRATION');
  assert.equal(final.observed_value, 'PASS=26; WARN=1; FAIL=0');
});

test('post-migration audit detects material ACL drift without persisting it', async () => {
  const audit = await readMigration('audit_onboarding_v22_production_postmigration_readonly.sql');
  await db.query('BEGIN');
  try {
    await db.query('GRANT DELETE ON TABLE public.profiles TO authenticated');
    const result = await db.query(audit);
    assert.equal(result.rows.find((item) => item.check_order === 110).audit_status, 'FAIL');
    assert.equal(result.rows.at(-1).audit_status, 'FAIL');
  } finally {
    await db.query('ROLLBACK');
  }
});

test('V2.1 compatibility audit passes after V2.2 without invoking the RPC', async () => {
  const audit = await readMigration('audit_onboarding_v21_post_v22_compatibility_readonly.sql');
  const result = await db.query(audit);
  assert.equal(Array.isArray(result), false);
  assert.deepEqual(result.rows.filter((item) => item.audit_status === 'FAIL'), []);
  const final = result.rows.at(-1);
  assert.equal(final.check_order, 999);
  assert.equal(final.check_name, 'ONBOARDING_V21_POST_V22_COMPATIBILITY');
  assert.equal(final.observed_value, 'PASS=16; WARN=0; FAIL=0');
});

test('migration preserves every pre-existing V1/V2.1 value, receipt and RPC definition', async () => {
  assert.deepEqual(await snapshotOldRows(), legacySnapshot);
  assert.equal((await db.query("SELECT pg_get_functiondef('public.complete_onboarding_v2(jsonb)'::regprocedure) AS definition")).rows[0].definition, v21Definition);
  const training = await row('training_profiles', legacyUser); const nutrition = await row('nutrition_profiles', legacyUser);
  for (const key of ['onboarding_payload_schema_version', 'preferred_weekdays', 'session_duration_range', 'aerobic_practice_frequency', 'aerobic_safety_limitation']) assert.equal(training[key], null);
  for (const key of ['onboarding_payload_schema_version', 'available_meal_moments', 'food_preparation_availability', 'current_eating_routine']) assert.equal(nutrition[key], null);
  assert.equal((await invoke(legacyUser, v21Payload(), 'complete_onboarding_v2')).rows[0].result, 'replay');
  assert.deepEqual(
    await row('onboarding_completion_receipts', legacyUser),
    legacySnapshot.onboarding_completion_receipts.find((receipt) => receipt.user_id === legacyUser)
  );
});

test('V2.1 completion and replay remain 2/2 with NULL V2.2 discriminators', async () => {
  const user = await seed();
  assert.equal((await invoke(user, v21Payload(), 'complete_onboarding_v2')).rows[0].result, 'completed');
  assert.equal((await invoke(user, v21Payload(), 'complete_onboarding_v2')).rows[0].result, 'replay');
  const receipt = await row('onboarding_completion_receipts', user);
  assert.equal(receipt.onboarding_version, 2);
  assert.equal(receipt.payload_schema_version, 2);
  assert.equal(receipt.canonicalization_version, 2);
  assert.equal((await row('training_profiles', user)).onboarding_payload_schema_version, null);
  assert.equal((await row('nutrition_profiles', user)).onboarding_payload_schema_version, null);
  assert.equal((await db.query(
    'SELECT count(*)::int AS n FROM public.training_profile_activities WHERE user_id=$1 AND onboarding_payload_schema_version IS NOT NULL',
    [user]
  )).rows[0].n, 0);
});

test('V2.2 completes atomically and stores only collected data', async () => {
  const user = await seed(); const result = (await invoke(user)).rows[0];
  assert.equal(result.result, 'completed'); assert.equal(result.onboarding_version, 2);
  const profile = await row('profiles', user); const training = await row('training_profiles', user);
  const nutrition = await row('nutrition_profiles', user); const receipt = await row('onboarding_completion_receipts', user);
  assert.equal(profile.nome, 'Pessoa Teste'); assert.equal(profile.onboarding_completed, true);
  assert.equal(profile.onboarding_version, 2); assert.equal(profile.objetivo, null);
  assert.equal(training.initial_training_level, 'advanced'); assert.equal(training.training_location, 'simple_gym');
  assert.deepEqual(training.preferred_weekdays, [1, 3]); assert.equal(training.training_days_per_week, 6);
  assert.equal(training.aerobic_safety_limitation, true);
  for (const key of ['training_experience', 'exercise_confidence', 'recent_training_break', 'priority_muscles',
    'available_weekdays', 'session_duration_min', 'session_duration_is_plus', 'pain_or_limitation', 'affected_body_areas']) assert.equal(training[key], null, key);
  for (const key of ['food_budget_style', 'food_preparation_style', 'meal_schedule_flexibility', 'meals_per_day', 'accepts_eggs', 'accepts_dairy']) assert.equal(nutrition[key], null, key);
  assert.equal(nutrition.current_eating_routine, 'variable'); assert.equal(nutrition.has_food_restrictions, true); assert.equal(nutrition.uses_supplements, true);
  assert.equal(receipt.payload_schema_version, 3); assert.equal(receipt.canonicalization_version, 3);
  assert.equal(Buffer.from(receipt.payload_hash).toString('hex'), await hash(v22Payload()));
  assert.deepEqual(receipt.completed_at, profile.onboarding_completed_at);
  const walking = (await db.query("SELECT * FROM public.training_profile_activities WHERE user_id=$1 AND activity_code='walking'", [user])).rows[0];
  assert.deepEqual(walking.available_weekdays, [2, 5]); assert.equal(walking.sessions_per_week, 3);
  assert.equal(walking.duration_range, 'under_30'); assert.equal(walking.intensity, 'low'); assert.equal(walking.schedule_type, null);
});

for (const [name, path, value] of invalidV22Cases) test(`server rejects ${name}`, async () => {
  const user = await seed();
  await assert.rejects(invoke(user, mutatePayload(path, value)), { code: '22023' }); await emptyDomain(user);
});

test('server rejects missing keys and non-object domains before any write', async () => {
  for (const domain of ['identity', 'health', 'training', 'nutrition']) {
    for (const value of [null, [], 'invalid']) await assert.rejects(canonical(mutatePayload([domain], value)), { code: '22023' });
    for (const key of Object.keys(v22Payload()[domain])) {
      const p = v22Payload(); delete p[domain][key];
      await assert.rejects(canonical(p), { code: '22023' });
    }
  }
  for (const p of [null, [], {}, 3]) await assert.rejects(canonical(p), { code: '22023' });
});

test('server rejects duplicate activities and normalized nutrition labels', async () => {
  const p = v22Payload(); p.training.activities.push(p.training.activities[0]);
  await assert.rejects(canonical(p), { code: '22023' });
  for (const kind of ['restrictions', 'disliked_foods', 'preferred_foods', 'supplements']) {
    const p = v22Payload(); p.nutrition[kind][1].declared_label = ` ${p.nutrition[kind][0].declared_label.toUpperCase()} `;
    await assert.rejects(canonical(p), { code: '22023' });
  }
});

for (const [domain, field, values] of [
  ['training', 'session_duration_range', DURATION_RANGES], ['training', 'initial_training_level', INITIAL_TRAINING_LEVELS],
  ['training', 'aerobic_practice_frequency', AEROBIC_PRACTICE_FREQUENCIES],
  ['nutrition', 'food_preparation_availability', FOOD_PREPARATION_AVAILABILITIES], ['nutrition', 'current_eating_routine', CURRENT_EATING_ROUTINES],
]) for (const value of values) test(`server persists ${domain}.${field}=${value}`, async () => {
  const user = await seed(); await invoke(user, mutatePayload([domain, field], value));
  assert.equal((await row(`${domain}_profiles`, user))[field], value);
});

test('full gym, no preferred days and no activities produce empty sets/zero activity rows', async () => {
  const p = v22Payload(); Object.assign(p.training, { training_location: 'full_gym', available_equipment: [],
    preferred_weekdays: [], activities: [], aerobic_safety_limitation: false });
  p.nutrition.restrictions = []; p.nutrition.supplements = [];
  const user = await seed(); await invoke(user, p);
  const t = await row('training_profiles', user); const n = await row('nutrition_profiles', user);
  assert.deepEqual(t.available_equipment, []); assert.equal(t.other_equipment_label, null);
  assert.deepEqual(t.preferred_weekdays, []); assert.equal(t.aerobic_safety_limitation, false);
  assert.equal((await db.query('SELECT count(*)::int n FROM public.training_profile_activities WHERE user_id=$1', [user])).rows[0].n, 0);
  assert.equal(n.has_food_restrictions, false); assert.equal(n.uses_supplements, false);
});

test('all activity codes/ranges/intensities and optional scheduling are supported', async () => {
  for (const activity_code of V22_ACTIVITY_CODES) for (const duration_range of DURATION_RANGES) for (const intensity of ACTIVITY_INTENSITIES) {
    const p = v22Payload(); p.training.activities = [{ activity_code, other_activity_label: activity_code === 'other' ? 'Tênis' : null,
      weekdays: [2, 4], sessions_per_week: 3, duration_range, intensity }];
    const result = await canonical(p); assert.equal(result.training.activities[0].activity_code, activity_code);
  }
  for (const [weekdays, sessions_per_week] of [[null, null], [[2], null], [null, 2], [[2], 3]]) {
    const p = v22Payload(); p.training.activities = [{ activity_code: 'walking', other_activity_label: null,
      weekdays, sessions_per_week, duration_range: null, intensity: null }];
    const user = await seed(); await invoke(user, p);
    const a = await row('training_profile_activities', user);
    assert.deepEqual(a.available_weekdays, weekdays); assert.equal(a.sessions_per_week, sessions_per_week);
  }
});

test('all limited locations and other labels are persisted without truncation', async () => {
  for (const location of ['simple_gym', 'home', 'outdoor', 'other']) {
    const p = v22Payload(); p.training.training_location = location;
    p.training.other_location_label = location === 'other' ? '  Condomínio  ' : null;
    p.training.available_equipment = ['other']; p.training.other_equipment_label = '  Equipamento  ';
    p.nutrition.dietary_pattern = 'other'; p.nutrition.dietary_pattern_other_label = '  Padrão  ';
    const user = await seed(); await invoke(user, p);
    assert.equal((await row('training_profiles', user)).other_equipment_label, 'Equipamento');
    assert.equal((await row('nutrition_profiles', user)).dietary_pattern_other_label, 'Padrão');
  }
});

test('server canonicalization sorts all sets, normalizes numeric scales and trims labels', async () => {
  const p = v22Payload(); const q = structuredClone(p);
  q.identity.name = `  ${p.identity.name}  `;
  q.training.preferred_weekdays.reverse(); q.training.available_equipment.reverse(); q.training.activities.reverse();
  for (const a of q.training.activities) a.weekdays?.reverse();
  q.nutrition.available_meal_moments.reverse();
  for (const k of ['restrictions', 'disliked_foods', 'preferred_foods', 'supplements']) {
    q.nutrition[k].reverse(); for (const x of q.nutrition[k]) x.declared_label = ` ${x.declared_label} `;
  }
  assert.deepEqual(await canonical(p), await canonical(q)); assert.equal(await hash(p), await hash(q));
  const scaled = JSON.stringify(p).replace('"height_cm":175', '"height_cm":175.000').replace('"weight_kg":70', '"weight_kg":70.00')
    .replace('"training_days_per_week":6', '"training_days_per_week":6.0').replace('"preferred_weekdays":[3,1]', '"preferred_weekdays":[3.0,1.00]');
  const result = await db.query("SELECT encode(sha256(convert_to(public.canonicalize_onboarding_v22($1::jsonb)::text,'UTF8')),'hex') h", [scaled]);
  assert.equal(result.rows[0].h, await hash(p));
  await db.query("SET DateStyle = 'German, DMY'");
  try { assert.equal(await hash(p), await hash(q)); } finally { await db.query("SET DateStyle = 'ISO, MDY'"); }
  // Verify actual server digest bytes against an independent SHA-256 implementation.
  const text = (await db.query('SELECT public.canonicalize_onboarding_v22($1::jsonb)::text AS c', [JSON.stringify(p)])).rows[0].c;
  assert.equal(createHash('sha256').update(text, 'utf8').digest('hex'), await hash(p));
  assert.deepEqual(await canonical(buildOnboardingV22Payload(q)), await canonical(p));
});

test('canonicalization retains meaningful differences and excludes only the attempt key', async () => {
  const p = v22Payload(); const baseline = await hash(p);
  const keyOnly = structuredClone(p); keyOnly.idempotency_key = randomUUID(); assert.equal(await hash(keyOnly), baseline);
  for (const [path, value] of [
    [['identity', 'name'], 'PESSOA TESTE'], [['health', 'weight_kg'], 71], [['health', 'primary_goal'], 'fat_loss'],
    [['training', 'initial_training_level'], 'beginner'], [['training', 'preferred_weekdays'], [1]],
    [['training', 'aerobic_safety_limitation'], false], [['training', 'session_duration_range'], 'over_90'],
    [['training', 'activities', '0', 'sessions_per_week'], 2], [['training', 'activities', '0', 'duration_range'], '30_45'],
    [['training', 'activities', '0', 'intensity'], 'high'], [['nutrition', 'available_meal_moments'], ['dinner']],
    [['nutrition', 'food_preparation_availability'], 'limited'], [['nutrition', 'current_eating_routine'], 'irregular'],
    [['nutrition', 'preferred_foods', '0', 'declared_label'], 'ARROZ'],
  ]) assert.notEqual(await hash(mutatePayload(path, value)), baseline, path.join('.'));
});

test('strict replay requires identical key, hash, contract and consistent markers', async () => {
  const user = await seed(); const p = v22Payload(); const first = (await invoke(user, p)).rows[0];
  const receipt = await row('onboarding_completion_receipts', user);
  p.training.preferred_weekdays.reverse(); p.nutrition.supplements.reverse();
  const replay = (await invoke(user, p)).rows[0]; assert.equal(replay.result, 'replay'); assert.deepEqual(replay.completed_at, first.completed_at);
  await assert.rejects(invoke(user, { ...p, idempotency_key: randomUUID() }), { code: '23505' });
  p.health.weight_kg = 71; await assert.rejects(invoke(user, p), { code: '23505' });
  assert.deepEqual(await row('onboarding_completion_receipts', user), receipt);
  await db.query('UPDATE public.profiles SET onboarding_completed_at=onboarding_completed_at + interval \'1 second\' WHERE user_id=$1', [user]);
  await assert.rejects(invoke(user, v22Payload()), { code: '23505' });
});

test('replay does not overwrite legitimate edits made after completion', async () => {
  const user = await seed(); await invoke(user);
  const receipt = await row('onboarding_completion_receipts', user);
  await asRole(db, 'authenticated', user, () => db.query("UPDATE public.profiles SET nome='Nome editado' WHERE user_id=$1", [user]));
  assert.equal((await invoke(user)).rows[0].result, 'replay');
  assert.equal((await row('profiles', user)).nome, 'Nome editado');
  assert.deepEqual(await row('onboarding_completion_receipts', user), receipt);
});

test('V1 and V2.1 completions cannot be replaced; V2.1 cannot replace V2.2', async () => {
  const oldReceipt = await row('onboarding_completion_receipts', legacyUser);
  await assert.rejects(invoke(legacyUser), { code: '23505' });
  await assert.rejects(invoke(v1User), { code: '55000' });
  const user = await seed(); await invoke(user);
  await assert.rejects(invoke(user, v21Payload(), 'complete_onboarding_v2'), { code: '23505' });
  assert.deepEqual(await row('onboarding_completion_receipts', legacyUser), oldReceipt);
});

test('V2.1 trigger classification remains exact for every experience/confidence/break combination', async () => {
  for (const experience of ['none', 'under_6_months', '6_to_12_months', '1_to_2_years', 'over_2_years']) {
    for (const confidence of ['needs_guidance', 'basic_independent', 'confident_independent']) {
      for (const pause of experience === 'none' ? [null] : ['no_significant_break', 'under_1_month', '1_to_3_months', 'over_3_months']) {
        const p = v21Payload(); Object.assign(p.training, { training_experience: experience, exercise_confidence: confidence, recent_training_break: pause });
        const user = await seed(); await invoke(user, p, 'complete_onboarding_v2');
        const expected = ['none', 'under_6_months'].includes(experience) || confidence === 'needs_guidance' || pause === 'over_3_months' ? 'beginner'
          : experience === 'over_2_years' && confidence === 'confident_independent' && ['no_significant_break', 'under_1_month'].includes(pause) ? 'advanced' : 'intermediate';
        assert.equal((await row('training_profiles', user)).initial_training_level, expected);
      }
    }
  }
});

test('version-aware table constraints retain V2.1 requirements and require all V2.2 fields', async () => {
  const user = await seed(); await invoke(user);
  for (const [table, field] of [['training_profiles', 'session_duration_range'], ['training_profiles', 'preferred_weekdays'],
    ['training_profiles', 'aerobic_practice_frequency'], ['training_profiles', 'aerobic_safety_limitation'],
    ['nutrition_profiles', 'available_meal_moments'], ['nutrition_profiles', 'food_preparation_availability'], ['nutrition_profiles', 'current_eating_routine']]) {
    await assert.rejects(db.query(`UPDATE public.${table} SET ${field}=NULL WHERE user_id=$1`, [user]), { code: '23514' });
  }
  for (const [table, field] of [['training_profiles', 'training_experience'], ['training_profiles', 'exercise_confidence'],
    ['training_profiles', 'priority_muscles'], ['training_profiles', 'available_weekdays'], ['training_profiles', 'session_duration_min'],
    ['training_profiles', 'pain_or_limitation'], ['nutrition_profiles', 'food_preparation_style'], ['nutrition_profiles', 'food_budget_style']]) {
    await assert.rejects(db.query(`UPDATE public.${table} SET ${field}=NULL WHERE user_id=$1`, [legacyUser]), { code: '23514' });
  }
  // Preserve legacy DB behavior; the unchanged V2.1 RPC itself enforces empty.
  await db.query("UPDATE public.training_profiles SET available_equipment=ARRAY['bodyweight'] WHERE user_id=$1 AND training_location='full_gym'", [legacyUser]);
  await db.query("UPDATE public.training_profiles SET available_equipment='{}' WHERE user_id=$1", [legacyUser]);
  await assert.rejects(db.query('UPDATE public.training_profiles SET onboarding_payload_schema_version=2 WHERE user_id=$1', [user]), { code: '23514' });
  await assert.rejects(db.query('UPDATE public.training_profile_activities SET onboarding_payload_schema_version=NULL WHERE user_id=$1', [user]), { code: '23514' });
});

test('RPC and helper permissions are minimal; identity requires auth.uid()', async () => {
  const user = await seed();
  for (const role of ['anon', 'service_role']) await assert.rejects(asRole(db, role, user,
    () => db.query('SELECT * FROM public.complete_onboarding_v22($1::jsonb)', [JSON.stringify(v22Payload())])), { code: '42501' });
  await assert.rejects(invoke(null), { code: '28000' });
  await assert.rejects(invoke(randomUUID()), { code: 'P0002' });
  const settings = (await db.query("SELECT prosecdef,proconfig FROM pg_proc WHERE oid='public.complete_onboarding_v22(jsonb)'::regprocedure")).rows[0];
  assert.equal(settings.prosecdef, true); assert.ok(settings.proconfig.includes('search_path=""'));
  const publicExecute = await db.query("SELECT count(*)::int n FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid='public.complete_onboarding_v22(jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'");
  assert.equal(publicExecute.rows[0].n, 0);
  await assert.rejects(asRole(db, 'authenticated', user,
    () => db.query('SELECT public.canonicalize_onboarding_v22($1::jsonb)', [JSON.stringify(v22Payload())])), { code: '42501' });
  for (const [table, column, value] of [['training_profiles', 'onboarding_payload_schema_version', 3], ['training_profiles', 'initial_training_level', 'advanced'],
    ['training_profiles', 'aerobic_safety_limitation', false], ['nutrition_profiles', 'current_eating_routine', 'structured']]) {
    await assert.rejects(asRole(db, 'authenticated', user,
      () => db.query(`UPDATE public.${table} SET ${column}=$1 WHERE user_id=$2`, [value, user])), { code: '42501' });
  }
  await emptyDomain(user);
});

test('authenticated RLS prevents cross-user access; payloads cannot select another identity', async () => {
  const alice = await seed(); const bob = await seed(); await invoke(bob);
  await assert.rejects(invoke(alice, { ...v22Payload(), user_id: bob }), { code: '22023' });
  await emptyDomain(alice);
  for (const table of ['profiles', ...domainTables]) {
    const result = await asRole(db, 'authenticated', alice, () => db.query(`SELECT * FROM public.${table} WHERE user_id=$1`, [bob]));
    assert.equal(result.rows.length, 0, table);
  }
  const change = await asRole(db, 'authenticated', alice, () => db.query("UPDATE public.profiles SET nome='Spoof' WHERE user_id=$1 RETURNING user_id", [bob]));
  assert.equal(change.rows.length, 0); assert.equal((await row('profiles', bob)).nome, 'Pessoa Teste');
  await assert.rejects(asRole(db, 'authenticated', alice, () => db.query(
    "INSERT INTO public.user_health_profiles(user_id,birth_date,biological_sex,height_cm,weight_kg,primary_goal) VALUES ($1,'2000-01-01','male',175,70,'hypertrophy')", [bob])), { code: '42501' });
});

test('existing partial rows and orphaned completion markers are never overwritten', async () => {
  const user = await seed();
  await db.query("INSERT INTO public.user_health_profiles(user_id,birth_date,biological_sex,height_cm,weight_kg,primary_goal) VALUES ($1,'2000-01-01','male',175,70,'hypertrophy')", [user]);
  const old = await row('user_health_profiles', user);
  await assert.rejects(invoke(user), { code: '55000' }); assert.deepEqual(await row('user_health_profiles', user), old);
  for (const assignment of ['onboarding_version=2', 'onboarding_completed_at=now()', 'onboarding_completed=true']) {
    const user = await seed(); await db.query(`UPDATE public.profiles SET ${assignment} WHERE user_id=$1`, [user]);
    await assert.rejects(invoke(user), { code: '55000' }); assert.equal((await row('profiles', user)).nome, 'Original');
  }
});

test('markers are last and failures at every write phase roll back identity/domain/receipt', async () => {
  await db.query(`
    CREATE TABLE public.test_write_events (sequence bigint GENERATED ALWAYS AS IDENTITY, user_id uuid, relation text, markers boolean);
    CREATE FUNCTION public.test_observe_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    BEGIN
      IF current_setting('test.fail_table',true)=TG_TABLE_NAME
         AND (TG_TABLE_NAME <> 'profiles' OR to_jsonb(NEW)->>'onboarding_completed'='true') THEN
        RAISE EXCEPTION USING ERRCODE='XX000', MESSAGE='Synthetic test failure';
      END IF;
      IF TG_TABLE_NAME='profiles' AND to_jsonb(NEW)->>'onboarding_completed'='true' THEN
        IF NOT EXISTS (SELECT 1 FROM public.user_health_profiles WHERE user_id=NEW.user_id)
           OR NOT EXISTS (SELECT 1 FROM public.training_profiles WHERE user_id=NEW.user_id)
           OR NOT EXISTS (SELECT 1 FROM public.nutrition_profiles WHERE user_id=NEW.user_id)
           OR NOT EXISTS (SELECT 1 FROM public.onboarding_completion_receipts WHERE user_id=NEW.user_id) THEN
          RAISE EXCEPTION 'Markers preceded domain/receipt';
        END IF;
      END IF;
      INSERT INTO public.test_write_events(user_id,relation,markers)
      VALUES (NEW.user_id,TG_TABLE_NAME,coalesce((to_jsonb(NEW)->>'onboarding_completed')::boolean,false));
      RETURN NEW;
    END $$;
  `);
  for (const table of domainTables) await db.query(`CREATE TRIGGER test_observe AFTER INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.test_observe_writes()`);
  await db.query('CREATE TRIGGER test_observe AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.test_observe_writes()');
  try {
    const user = await seed(); await invoke(user);
    const events = (await db.query('SELECT relation,markers FROM public.test_write_events WHERE user_id=$1 ORDER BY sequence', [user])).rows;
    assert.deepEqual(events[0], { relation: 'profiles', markers: false });
    assert.deepEqual(events.at(-2), { relation: 'onboarding_completion_receipts', markers: false });
    assert.deepEqual(events.at(-1), { relation: 'profiles', markers: true });
    for (const table of [...domainTables, 'profiles']) {
      const user = await seed();
      await assert.rejects(asRole(db, 'authenticated', user, async () => {
        await db.query("SELECT set_config('test.fail_table',$1,true)", [table]);
        return db.query('SELECT * FROM public.complete_onboarding_v22($1::jsonb)', [JSON.stringify(v22Payload())]);
      }), { code: 'XX000' });
      await emptyDomain(user);
      assert.equal((await db.query('SELECT count(*)::int n FROM public.test_write_events WHERE user_id=$1', [user])).rows[0].n, 0);
      assert.equal((await invoke(user)).rows[0].result, 'completed');
    }
  } finally {
    for (const table of [...domainTables, 'profiles']) await db.query(`DROP TRIGGER test_observe ON public.${table}`);
    await db.query('DROP FUNCTION public.test_observe_writes(); DROP TABLE public.test_write_events;');
  }
});

async function race(firstRpc, secondRpc, divergent = false, abortFirst = false) {
  const user = await seed(); const a = await local.connect(); const b = await local.connect();
  const payloadA = firstRpc === 'complete_onboarding_v2' ? v21Payload() : v22Payload();
  const payloadB = secondRpc === 'complete_onboarding_v2' ? v21Payload() : v22Payload();
  if (divergent) payloadB.health.weight_kg = 71;
  let pending;
  try {
    for (const client of [a, b]) {
      await client.query('BEGIN; SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
    }
    const first = await a.query(`SELECT * FROM public.${firstRpc}($1::jsonb)`, [JSON.stringify(payloadA)]);
    const pid = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending = b.query(`SELECT * FROM public.${secondRpc}($1::jsonb)`, [JSON.stringify(payloadB)]).then(
      (value) => ({ value }), (error) => ({ error }));
    let blocked = false;
    for (let i = 0; i < 100; i++) {
      const activity = (await db.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [pid])).rows[0];
      if (activity?.wait_event_type === 'Lock') { blocked = true; break; }
      await delay(20);
    }
    assert.equal(blocked, true, 'second connection must wait for the profile lock');
    await emptyDomain(user); // observer must not see the first transaction's partial state
    await a.query(abortFirst ? 'ROLLBACK' : 'COMMIT');
    const second = await pending;
    if (abortFirst || (firstRpc === secondRpc && !divergent)) {
      assert.ifError(second.error); assert.equal(second.value.rows[0].result, abortFirst ? 'completed' : 'replay'); await b.query('COMMIT');
    } else { assert.equal(second.error?.code, '23505'); await b.query('ROLLBACK'); }
    assert.equal(first.rows[0].result, 'completed');
    const receipt = await row('onboarding_completion_receipts', user);
    assert.equal(receipt.payload_schema_version, (abortFirst ? secondRpc : firstRpc) === 'complete_onboarding_v2' ? 2 : 3);
    for (const table of ['user_health_profiles', 'training_profiles', 'nutrition_profiles', 'onboarding_completion_receipts']) {
      assert.equal((await db.query(`SELECT count(*)::int n FROM public.${table} WHERE user_id=$1`, [user])).rows[0].n, 1);
    }
  } finally {
    await a.query('ROLLBACK').catch(() => {});
    if (pending) await pending;
    await b.query('ROLLBACK').catch(() => {}); await a.end(); await b.end();
  }
}
const concurrencyOptions = { skip: process.env.ONBOARDING_TEST_ENGINE === 'pglite' ? 'PGlite has one connection; use native PostgreSQL for lock tests' : false };
test('concurrent identical V2.2 requests block and replay without duplicate rows', concurrencyOptions, () => race('complete_onboarding_v22', 'complete_onboarding_v22'));
test('concurrent divergent V2.2 requests block and reject without partial rows', concurrencyOptions, () => race('complete_onboarding_v22', 'complete_onboarding_v22', true));
test('V2.1 winning the shared lock rejects a concurrent V2.2 completion', concurrencyOptions, () => race('complete_onboarding_v2', 'complete_onboarding_v22'));
test('V2.2 winning the shared lock rejects a concurrent V2.1 completion', concurrencyOptions, () => race('complete_onboarding_v22', 'complete_onboarding_v2'));
test('rollback of the first concurrent call lets the second finish cleanly', concurrencyOptions, () => race('complete_onboarding_v22', 'complete_onboarding_v22', false, true));

test('new contract creates no clinical text columns or logging statements', async () => {
  const names = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('training_profiles','training_profile_activities')")).rows.map((x) => x.column_name);
  assert.equal(names.some((name) => /diagnos|medication|clinical|medical_note/.test(name)), false);
  const migration = await readMigration('20260928000100_onboarding_v22_foundation.sql');
  assert.doesNotMatch(migration, /RAISE\s+(?:LOG|NOTICE|INFO|DEBUG|WARNING)/i);
  assert.doesNotMatch(migration, /CREATE\s+TABLE/i);
});

test('reapplication fails visibly and rolls back rather than hiding schema drift', async () => {
  const receipt = await row('onboarding_completion_receipts', legacyUser);
  await assert.rejects(db.query(await readMigration('20260928000100_onboarding_v22_foundation.sql')), { code: '42701' });
  await db.query('ROLLBACK');
  assert.deepEqual(await row('onboarding_completion_receipts', legacyUser), receipt);
  assert.equal((await db.query("SELECT pg_get_functiondef('public.complete_onboarding_v2(jsonb)'::regprocedure) AS definition")).rows[0].definition, v21Definition);
});

test('consolidated preflight summary remains one read-only executable result set', async () => {
  const audit = await readMigration('audit_onboarding_v22_production_preflight_summary_readonly.sql');
  const result = await db.query(audit);
  assert.equal(Array.isArray(result), false);
  assert.ok(result.rows.length > 1);
  assert.equal(result.rows.at(-1).check_name, 'ONBOARDING_V22_PRODUCTION_PREFLIGHT');

  const detailed = await db.query(await readMigration('audit_onboarding_v22_production_preflight_readonly.sql'));
  assert.equal(Array.isArray(detailed), true);
  assert.ok(detailed.length > 1);
});

test('profiles ACL remediation removes dangerous client capabilities without changing compatibility grants', async () => {
  const dangerous = ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'];
  await db.query(`GRANT ${dangerous.join(', ')} ON TABLE public.profiles TO anon, authenticated`);
  await db.query(`
    DROP POLICY profiles_select_own ON public.profiles;
    DROP POLICY profiles_update_own ON public.profiles;
    DROP POLICY profiles_insert_own ON public.profiles;
    CREATE POLICY "Usuários podem gerenciar o próprio perfil"
      ON public.profiles FOR ALL TO PUBLIC
      USING (auth.uid() = user_id);
  `);
  const audit = await readMigration('audit_onboarding_v22_production_preflight_summary_readonly.sql');
  const auditBefore = (await db.query(audit)).rows;
  for (const order of [70, 122, 131, 132]) {
    assert.equal(auditBefore.find((item) => item.check_order === order).audit_status, 'PASS', `audit ${order}`);
  }
  const blockingBefore = auditBefore.find((item) => item.check_order === 130);
  assert.equal(blockingBefore.audit_status, 'FAIL');
  assert.match(blockingBefore.details, /profiles/);

  const beforeColumns = (await db.query(`
    SELECT r.rolname, a.attname, privilege.privilege_name
    FROM pg_roles AS r
    CROSS JOIN pg_attribute AS a
    CROSS JOIN (VALUES ('INSERT'::text), ('UPDATE'::text)) AS privilege(privilege_name)
    WHERE r.rolname IN ('anon', 'authenticated')
      AND a.attrelid = 'public.profiles'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(r.oid, a.attrelid, a.attnum, privilege.privilege_name)
    ORDER BY r.rolname, a.attname, privilege.privilege_name
  `)).rows;

  await db.query(await readMigration('20261002000100_harden_profiles_client_acl.sql'));
  const blockingAfter = (await db.query(audit)).rows.find((item) => item.check_order === 130);
  assert.equal(blockingAfter.audit_status, 'PASS');

  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query(
      `SELECT has_table_privilege($1, 'public.profiles', 'SELECT') AS allowed`, [role]
    )).rows[0].allowed, true);
    for (const privilege of ['INSERT', 'UPDATE', ...dangerous]) {
      assert.equal((await db.query(
        `SELECT has_table_privilege($1, 'public.profiles', $2) AS allowed`, [role, privilege]
      )).rows[0].allowed, false, `${role} ${privilege}`);
    }
  }

  const afterColumns = (await db.query(`
    SELECT r.rolname, a.attname, privilege.privilege_name
    FROM pg_roles AS r
    CROSS JOIN pg_attribute AS a
    CROSS JOIN (VALUES ('INSERT'::text), ('UPDATE'::text)) AS privilege(privilege_name)
    WHERE r.rolname IN ('anon', 'authenticated')
      AND a.attrelid = 'public.profiles'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege(r.oid, a.attrelid, a.attnum, privilege.privilege_name)
    ORDER BY r.rolname, a.attname, privilege.privilege_name
  `)).rows;
  assert.deepEqual(afterColumns, beforeColumns);

  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', ...dangerous]) {
    assert.equal((await db.query(
      `SELECT has_table_privilege('service_role', 'public.profiles', $1) AS allowed`, [privilege]
    )).rows[0].allowed, true, `service_role ${privilege}`);
  }

  const v1 = await seed();
  await asRole(db, 'authenticated', v1, () => db.query(
    'UPDATE public.profiles SET onboarding_completed=true, objetivo=$2 WHERE user_id=$1',
    [v1, 'massa']
  ));
  assert.equal((await row('profiles', v1)).onboarding_completed, true);

  const v22 = await seed();
  assert.equal((await invoke(v22)).rows[0].result, 'completed');
});
