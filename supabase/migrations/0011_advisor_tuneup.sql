-- Supabase advisor tune-up:
-- 1) Pin the trigger function's search_path (security lint 0011).
-- 2) Index the two unindexed foreign keys (performance lint 0001).
-- 3) Rewrite every RLS policy to evaluate auth.uid() once per query instead
--    of once per row (performance lint 0003) — same rules, cached evaluation.

alter function public.touch_updated_at() set search_path = '';

create index if not exists expenses_bucket_idx on public.expenses (bucket_id);
create index if not exists whatif_items_bucket_idx on public.whatif_items (bucket_id);

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies where schemaname = 'public'
  loop
    if p.qual is not null and p.qual like '%auth.uid()%'
       and p.qual not like '%SELECT auth.uid()%' then
      execute format(
        'alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename,
        replace(p.qual, 'auth.uid()', '(select auth.uid())')
      );
    end if;
    if p.with_check is not null and p.with_check like '%auth.uid()%'
       and p.with_check not like '%SELECT auth.uid()%' then
      execute format(
        'alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename,
        replace(p.with_check, 'auth.uid()', '(select auth.uid())')
      );
    end if;
  end loop;
end $$;
