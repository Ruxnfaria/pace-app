begin;

lock table public.daily_missions in share row exclusive mode;

do $migration$
begin
  if exists (
    select 1
    from public.daily_missions as dm
    where dm.category in ('workout', 'nutrition', 'protein')
    group by dm.user_id, dm.for_date, dm.category
    having count(*) > 1
  ) then
    raise exception
      'Cannot create current mission unique index: duplicate workout, nutrition, or protein missions exist';
  end if;
end
$migration$;

create unique index if not exists daily_missions_current_category_unique
  on public.daily_missions (user_id, for_date, category)
  where category in ('workout', 'nutrition', 'protein');

commit;
