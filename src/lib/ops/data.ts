/**
 * Server-side data access for the ops board. Row-level security scopes every
 * query to the signed-in user.
 */
import { createClient } from "@/lib/supabase/server";
import type { OpsLineRow, OpsSectionRow, OpsTaskRow, RentScheduleRow } from "./rows";

export interface BoardData {
  sections: OpsSectionRow[];
  lines: OpsLineRow[];
  tasks: OpsTaskRow[];
  schedules: RentScheduleRow[];
}

/** Done tasks older than this are left out of the board (they stay stored). */
const DONE_WINDOW_DAYS = 45;

export async function getBoardData(): Promise<BoardData> {
  const supabase = await createClient();
  const doneSince = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();
  const [sections, lines, tasks, schedules] = await Promise.all([
    supabase.from("ops_sections").select("*").order("sort_order").order("created_at"),
    supabase.from("ops_lines").select("*").order("sort_order").order("created_at"),
    supabase
      .from("ops_tasks")
      .select("*")
      .or(`done_at.is.null,done_at.gte.${doneSince}`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at"),
    supabase.from("rent_schedules").select("*").order("start_date"),
  ]);
  return {
    sections: (sections.data as OpsSectionRow[]) ?? [],
    lines: (lines.data as OpsLineRow[]) ?? [],
    tasks: (tasks.data as OpsTaskRow[]) ?? [],
    schedules: (schedules.data as RentScheduleRow[]) ?? [],
  };
}
