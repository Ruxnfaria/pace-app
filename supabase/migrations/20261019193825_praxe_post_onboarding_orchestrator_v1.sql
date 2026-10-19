-- PRAXE 3B7: unified, service-managed post-onboarding orchestration.
-- Local migration only. Artifact generation runs after onboarding commits.
begin;

set local lock_timeout = '5s';

do $preflight$
begin
  if pg_catalog.to_regclass('public.onboarding_completion_receipts') is null
     or pg_catalog.to_regclass('public.training_profiles') is null
     or pg_catalog.to_regclass('public.nutrition_target_snapshots') is null
     or pg_catalog.to_regclass('public.nutrition_meal_plans') is null
     or pg_catalog.to_regclass('public.daily_missions') is null
     or pg_catalog.to_regclass('public.workouts') is null
     or pg_catalog.to_regclass('public.workout_weekly_schedule') is null
     or pg_catalog.to_regprocedure('public.reward_system_set_updated_at()') is null
     or pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception 'Post-onboarding orchestration dependencies are incomplete';
  end if;
  if pg_catalog.to_regclass('public.post_onboarding_jobs') is not null then
    raise exception 'post_onboarding_jobs already exists; audit before proceeding';
  end if;
end
$preflight$;

create table public.post_onboarding_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_onboarding_version smallint not null,
  receipt_idempotency_key uuid not null,
  artifact text not null,
  algorithm_version text not null,
  retry_policy_version text not null,
  status text not null default 'pending',
  attempt_count smallint not null default 0,
  idempotency_key text not null,
  error_code text,
  context_date date not null default current_date,
  available_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_onboarding_jobs_receipt_fk foreign key
    (user_id, receipt_idempotency_key)
    references public.onboarding_completion_receipts (user_id, idempotency_key)
    on delete cascade,
  constraint post_onboarding_jobs_identity_unique unique
    (user_id, receipt_idempotency_key, artifact, algorithm_version),
  constraint post_onboarding_jobs_idempotency_unique unique (idempotency_key),
  constraint post_onboarding_jobs_artifact_check check
    (artifact in ('WORKOUT_PLAN', 'MISSIONS', 'MEAL_PLAN')),
  constraint post_onboarding_jobs_status_check check
    (status in ('pending', 'processing', 'ready', 'failed_retryable', 'requires_review')),
  constraint post_onboarding_jobs_error_code_check check (error_code is null or error_code in (
    'WORKOUT_GENERATION_FAILED', 'WORKOUT_VALIDATION_FAILED', 'CATALOG_NOT_READY',
    'MEAL_PLAN_NOT_ELIGIBLE', 'MEAL_GENERATION_FAILED', 'MEAL_VALIDATION_FAILED',
    'MISSION_GENERATION_FAILED'
  )),
  constraint post_onboarding_jobs_attempt_check check (attempt_count between 0 and 3),
  constraint post_onboarding_jobs_text_check check (
    btrim(algorithm_version) <> '' and btrim(retry_policy_version) <> ''
    and btrim(idempotency_key) <> '' and char_length(idempotency_key) <= 300
    and (error_code is null or (btrim(error_code) <> '' and char_length(error_code) <= 100))
  ),
  constraint post_onboarding_jobs_timestamps_check check (
    (status <> 'processing' or started_at is not null)
    and (status not in ('ready', 'requires_review') or completed_at is not null)
  )
);

create index post_onboarding_jobs_user_status_idx
  on public.post_onboarding_jobs (user_id, status, available_after, created_at);

create trigger post_onboarding_jobs_set_updated_at
before update on public.post_onboarding_jobs
for each row execute function public.reward_system_set_updated_at();

alter table public.post_onboarding_jobs enable row level security;
create policy post_onboarding_jobs_select_own
  on public.post_onboarding_jobs for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.post_onboarding_jobs from public, anon, authenticated;
grant select on table public.post_onboarding_jobs to authenticated;
grant select, insert, update, delete on table public.post_onboarding_jobs to service_role;

create function public.initialize_post_onboarding_jobs_v1(
  p_user_id uuid,
  p_completed_at timestamptz default null
)
returns setof public.post_onboarding_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receipt public.onboarding_completion_receipts%rowtype;
  v_artifact text;
  v_algorithm text := 'praxe-post-onboarding-orchestrator-v1';
begin
  select r.* into v_receipt
  from public.onboarding_completion_receipts r
  where r.user_id = p_user_id
    and r.onboarding_version = 2
    and r.payload_schema_version = 5
    and r.canonicalization_version = 5
    and (p_completed_at is null or r.completed_at = p_completed_at)
  order by r.completed_at desc
  limit 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'Eligible schema-5 onboarding receipt not found';
  end if;

  foreach v_artifact in array array['WORKOUT_PLAN', 'MISSIONS', 'MEAL_PLAN'] loop
    insert into public.post_onboarding_jobs (
      user_id, receipt_onboarding_version, receipt_idempotency_key, artifact,
      algorithm_version, retry_policy_version, idempotency_key, context_date
    ) values (
      p_user_id, v_receipt.onboarding_version, v_receipt.idempotency_key, v_artifact,
      v_algorithm, 'praxe-post-onboarding-retry-policy-v1',
      pg_catalog.concat_ws(':', 'post-onboarding', p_user_id::text,
        v_receipt.idempotency_key::text, pg_catalog.lower(v_artifact), v_algorithm),
      (v_receipt.completed_at at time zone 'America/Sao_Paulo')::date
    ) on conflict (user_id, receipt_idempotency_key, artifact, algorithm_version) do nothing;
  end loop;

  return query select j.* from public.post_onboarding_jobs j
  where j.user_id = p_user_id and j.receipt_idempotency_key = v_receipt.idempotency_key
  order by j.artifact;
end
$function$;

create function public.claim_post_onboarding_job_v1(
  p_user_id uuid,
  p_artifact text,
  p_algorithm_version text,
  p_max_attempts smallint
)
returns setof public.post_onboarding_jobs
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_max_attempts <> 3 then
    raise exception using errcode = '22023', message = 'Unsupported post-onboarding attempt policy';
  end if;
  return query
  with candidate as (
    select j.id from public.post_onboarding_jobs j
    where j.user_id = p_user_id and j.artifact = p_artifact
      and j.algorithm_version = p_algorithm_version
      and j.attempt_count < p_max_attempts
      and j.available_after <= now()
      and (j.status in ('pending', 'failed_retryable')
        or (j.status = 'processing' and j.started_at < now() - interval '15 minutes'))
    order by j.created_at desc
    limit 1 for update skip locked
  )
  update public.post_onboarding_jobs j
  set status = 'processing', attempt_count = j.attempt_count + 1,
      started_at = now(), completed_at = null, error_code = null
  from candidate c where j.id = c.id
  returning j.*;
end
$function$;

create function public.finish_post_onboarding_job_v1(
  p_job_id uuid,
  p_status text,
  p_error_code text default null
)
returns setof public.post_onboarding_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.post_onboarding_jobs%rowtype;
  v_ready boolean := false;
begin
  if p_status not in ('ready', 'failed_retryable', 'requires_review')
     or (p_status = 'ready' and p_error_code is not null)
     or (p_status <> 'ready' and (p_error_code is null or btrim(p_error_code) = '' or char_length(p_error_code) > 100)) then
    raise exception using errcode = '22023', message = 'Invalid post-onboarding job outcome';
  end if;
  select * into v_job from public.post_onboarding_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'processing' then
    raise exception using errcode = 'P0002', message = 'Processing job not found';
  end if;
  if p_status = 'ready' then
    if v_job.artifact = 'WORKOUT_PLAN' then
      select exists(select 1 from public.workouts w where w.user_id = v_job.user_id)
        and (select count(*) from public.workout_weekly_schedule s where s.user_id = v_job.user_id) = 7 into v_ready;
    elsif v_job.artifact = 'MEAL_PLAN' then
      select exists(select 1 from public.nutrition_meal_plans p where p.user_id = v_job.user_id and p.status = 'active') into v_ready;
    elsif v_job.artifact = 'MISSIONS' then
      select exists(select 1 from public.daily_missions m where m.user_id = v_job.user_id and m.for_date = v_job.context_date) into v_ready;
    end if;
    if not v_ready then
      raise exception using errcode = '23514', message = 'Artifact does not exist; ready transition refused';
    end if;
  end if;
  update public.post_onboarding_jobs
  set status = case when p_status = 'failed_retryable' and attempt_count >= 3 then 'requires_review' else p_status end,
      error_code = p_error_code,
      completed_at = case when p_status in ('ready', 'requires_review') or attempt_count >= 3 then now() else null end,
      available_after = case when p_status = 'failed_retryable' and attempt_count < 3 then now() + interval '1 minute' else available_after end
  where id = p_job_id returning * into v_job;
  return next v_job;
end
$function$;

create function public.defer_post_onboarding_job_v1(
  p_job_id uuid,
  p_error_code text,
  p_available_after timestamptz
)
returns setof public.post_onboarding_jobs
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_error_code is null or btrim(p_error_code) = '' or char_length(p_error_code) > 100
     or p_available_after <= now() then
    raise exception using errcode = '22023', message = 'Invalid dependency deferral';
  end if;
  return query update public.post_onboarding_jobs j
    set status = 'pending', attempt_count = greatest(j.attempt_count - 1, 0),
        error_code = p_error_code, started_at = null, completed_at = null,
        available_after = p_available_after
    where j.id = p_job_id and j.status = 'processing'
    returning j.*;
  if not found then raise exception using errcode = 'P0002', message = 'Processing job not found'; end if;
end
$function$;

revoke all on function public.initialize_post_onboarding_jobs_v1(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.claim_post_onboarding_job_v1(uuid, text, text, smallint) from public, anon, authenticated, service_role;
revoke all on function public.finish_post_onboarding_job_v1(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.defer_post_onboarding_job_v1(uuid, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.initialize_post_onboarding_jobs_v1(uuid, timestamptz) to service_role;
grant execute on function public.claim_post_onboarding_job_v1(uuid, text, text, smallint) to service_role;
grant execute on function public.finish_post_onboarding_job_v1(uuid, text, text) to service_role;
grant execute on function public.defer_post_onboarding_job_v1(uuid, text, timestamptz) to service_role;

comment on table public.post_onboarding_jobs is
  'Unified post-onboarding coordination. Artifact-specific generation remains independently validated and persisted.';
comment on column public.post_onboarding_jobs.error_code is
  'Safe bounded code only. Prompts, provider payloads, personal data, stacks, and secrets are forbidden.';

commit;
