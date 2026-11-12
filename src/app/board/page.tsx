import { AppShell } from "@/components/AppShell";
import { OpsBoard } from "@/components/OpsBoard";
import { loadBoard } from "./load";

/**
 * Ops board: every business and property as a column of red / orange / blue
 * tiles, the way a Copart yard board marks out what's overdue, due soon and
 * open. Property columns also carry their lease or rental-report status and
 * their rent or bookings.
 */
export default async function BoardPage() {
  const props = await loadBoard();
  return (
    <AppShell active="board">
      <OpsBoard {...props} />
    </AppShell>
  );
}
