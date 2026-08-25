-- Feedback context: which screen they were on, and which build they were
-- running. "The chart looks wrong" is a mystery; "the chart looks wrong, on
-- /budget, build a1cc92d" is a bug report.
--
-- Deliberately extends `suggestions` rather than adding a parallel `feedback`
-- table. Two inboxes for the same act — telling me something — would mean two
-- places for a tester to learn and two places for me to forget to read.
--
-- Route only. No screenshots, no field values, nothing about the numbers
-- themselves: knowing which screen is enough to reproduce, and anything more
-- would mean shipping someone's finances into a support queue.

alter table public.suggestions
  add column route text,
  add column app_version text;
