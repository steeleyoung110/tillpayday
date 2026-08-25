-- Two-way testing loop: a suggestion can be classified, and answered.
--
-- No new policies needed. The existing RLS already says a person may read
-- their own suggestion rows and only an admin may update them — which is
-- exactly "the tester sees the reply, only I can write it".

alter table public.suggestions
  add column kind text not null default 'idea'
    check (kind in ('idea', 'bug', 'question')),
  add column reply text,
  add column replied_at timestamptz;
