import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { OpsBoard } from "@/components/OpsBoard";
import { loadBoard } from "../load";

/** One board section on its own page: every line with what's behind it. */
export default async function BoardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const [{ section }, props] = await Promise.all([params, loadBoard()]);
  if (!props.sections.some((s) => s.id === section)) notFound();
  return (
    <AppShell active="board">
      <OpsBoard {...props} focusId={section} />
    </AppShell>
  );
}
