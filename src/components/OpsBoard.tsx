"use client";

/**
 * The ops board (client side): snapshot strip, one column per section, a
 * red / orange / blue tile row per line, the task drawer, and the rent
 * "Has it been received?" dialog. Data arrives from the server page; every
 * change goes through a Server Action, which revalidates /board and hands
 * fresh props back.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  addOpsLine,
  addOpsSection,
  addOpsTask,
  clearSampleTasks,
  completeOpsTask,
  createStarterBoard,
  deleteOpsLine,
  deleteOpsSection,
  deleteOpsTask,
  markPromisedReceived,
  moveOpsSection,
  recordInstallmentPayment,
  reopenOpsTask,
  updateOpsLine,
  updateOpsSection,
  updateOpsTask,
  type ActionResult,
} from "@/app/opsActions";
import { showToast } from "@/components/InstantAction";
import { LeaseCard, ReportPeriods, ReportSettingsForm } from "@/components/LeasePaperwork";
import { leaseCounts, reportCounts } from "@/lib/property/compliance";
import type { LeaseVM, Paperwork, ReportsVM, StaysVM } from "@/lib/property/paperwork";
import {
  SOON_DAYS,
  addDays,
  diffDays,
  dayOf,
  installmentBucket,
  lineCounts,
  rentCounts,
  snapshot,
  taskBucket,
  type Bucket,
  type Installment,
  type TileCounts,
} from "@/lib/ops/board";
import {
  FREQUENCY_LABELS,
  REPEAT_LABELS,
  SECTION_ICONS,
  type OpsLineRow,
  type OpsSectionRow,
  type OpsTaskRow,
  type RentFrequency,
} from "@/lib/ops/rows";

export interface LeaseInfo {
  tenant: string | null;
  rent: number;
  endDate: string | null;
  status: "active" | "ended";
}
export interface PlanInfo {
  amount: number;
  frequency: RentFrequency;
  startDate: string;
  endDate: string | null;
}

export interface BoardProps {
  userId: string;
  /** Show just this section, with everything behind each line. */
  focusId?: string;
  paperwork: Paperwork;
  today: string;
  sections: OpsSectionRow[];
  lines: OpsLineRow[];
  tasks: OpsTaskRow[];
  installments: Installment[];
  leases: Record<string, LeaseInfo>;
  plans: Record<string, PlanInfo>;
  properties: { id: string; name: string }[];
  people: string[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ICON_PATHS: Record<string, string> = {
  home: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6",
  store: "M3 9l1.6-5h14.8L21 9M3 9h18v1.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13.5V21h14v-7.5M10 21v-5h4v5",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.3-.6-.6-2.3z",
  tent: "M3 20L12 4l9 16zM12 4v16M9 20l3-6 3 6",
  megaphone: "M3 11v3a1 1 0 0 0 1 1h2l5 4V6l-5 4H4a1 1 0 0 0-1 1zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12",
  key: "M15 7a4 4 0 1 1-3.9 5H3v3h3v-2h2v2h3.1A4 4 0 0 1 15 7zM16 10h.01",
  truck: "M2 6h11v10H2zM13 9h4l4 4v3h-8M6 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  clipboard: "M8 4h8v2H8zM6 5h2M16 5h2v16H6V5h2M9 11h6M9 15h6M9 19h3",
  thumb:
    "M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9z",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6L6 18",
  repeat: "M4 10a6 6 0 0 1 10.2-4.2L17 8.5M17 4v4.5h-4.5M20 14a6 6 0 0 1-10.2 4.2L7 15.5M7 20v-4.5h4.5",
  camera: "M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 13m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  dollar: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3M8 21h8",
  axe: "M4 21l10-10M12.5 7.5l4 4M13 6c2.5-2.5 6-2.5 7.5-1.5-1 1.5-1 5-3.5 7.5z",
};

function Icon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  const d = ICON_PATHS[name] ?? ICON_PATHS.clipboard;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n: number) => (Math.abs(n - Math.round(n)) < 0.005 ? usd.format(n) : usdCents.format(n));

function fmtDay(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none";
const labelCls = "grid gap-1 text-xs text-slate-400";
const btnPrimary =
  "rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white";

/** Run a Server Action and report the outcome as a toast. */
async function call(
  action: (fd: FormData) => Promise<ActionResult>,
  fd: FormData,
  okMessage?: string,
): Promise<boolean> {
  try {
    const res = await action(fd);
    if (res?.ok) {
      if (okMessage) showToast(okMessage);
      return true;
    }
    showToast(res?.error ?? "That didn't save. Try again.");
  } catch {
    showToast("That didn't save. Check your connection and try again.");
  }
  return false;
}
function fdOf(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

const TILE_BASE =
  "inline-flex h-7 min-w-[54px] items-center justify-center rounded px-2 text-[15px] font-bold tabular-nums text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";

function Tile({
  n,
  bucket,
  label,
  onClick,
  neutralZero,
}: {
  n: number | null;
  bucket: "red" | "orange" | "open";
  label: string;
  onClick: () => void;
  /** Show a plain 0 instead of a thumbs-up (for counts where none isn't good news). */
  neutralZero?: boolean;
}) {
  if (n === null) {
    return (
      <span className={`${TILE_BASE} border border-slate-700 bg-slate-800 text-xs text-slate-400`} aria-label={`${label}: not tracked`}>
        NA
      </span>
    );
  }
  if (n === 0 && neutralZero) {
    return (
      <button type="button" onClick={onClick} className={`${TILE_BASE} border border-slate-700 bg-slate-800 text-slate-400`} aria-label={`${label}: 0`}>
        0
      </button>
    );
  }
  const color =
    n === 0 ? "bg-[#5aa83a]" : bucket === "red" ? "bg-[#e0484d]" : bucket === "orange" ? "bg-[#ea8a05]" : "bg-[#2f63cf]";
  return (
    <button type="button" onClick={onClick} className={`${TILE_BASE} ${color} hover:brightness-110`} aria-label={`${label}: ${n}`}>
      {n === 0 ? <Icon name="thumb" className="h-4 w-4" /> : n}
    </button>
  );
}

function TileRow({
  counts,
  name,
  onOpen,
  rent,
  neutralZero,
}: {
  counts: TileCounts;
  name: string;
  onOpen: (b: Bucket) => void;
  rent?: boolean;
  neutralZero?: boolean;
}) {
  const words = rent
    ? { red: "payments past due", orange: `payments due within ${SOON_DAYS} days`, open: "payments not received" }
    : { red: "overdue", orange: `due within ${SOON_DAYS} days`, open: "open" };
  return (
    <div className="flex justify-between gap-2">
      <Tile n={counts.red} bucket="red" label={`${name}: ${words.red}`} onClick={() => onOpen("red")} neutralZero={neutralZero} />
      <Tile n={counts.orange} bucket="orange" label={`${name}: ${words.orange}`} onClick={() => onOpen("orange")} neutralZero={neutralZero} />
      <Tile n={counts.blue} bucket="open" label={`${name}: ${words.open}`} onClick={() => onOpen("open")} neutralZero={neutralZero} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

type View = "all" | "properties" | "business";
type Dialog =
  | { kind: "line"; id: string; bucket: Bucket }
  | { kind: "rent" | "lease" | "reports" | "stays"; pid: string }
  | null;

const LEASE_INFO =
  "Red: the lease ended and hasn't been renewed. Orange: it ends within 2 months. Blue: leases that need something, including a missing signed copy.";
const RENT_INFO =
  "Red: a payment past due that isn't marked received. Orange: due in the next 7 days. Blue: every payment not yet received.";
const STAYS_INFO = "Orange: guests arriving in the next 7 days. Blue: every upcoming stay.";

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function leaseSummary(leases: LeaseVM[]): string {
  const rank: Record<string, number> = { past_due: 0, due_soon: 1, in_progress: 2, complete: 3 };
  const l = [...leases].sort((a, b) => rank[a.state] - rank[b.state])[0];
  if (!l) return "";
  if (l.state === "past_due") return `Past due · ended ${shortDay(l.end!)}`;
  if (l.state === "due_soon") return `Due soon · ends ${shortDay(l.end!)}`;
  return l.end ? `In progress · ends ${shortDay(l.end)}` : "In progress · month-to-month";
}

function reportSummary(r: ReportsVM | null): string {
  if (!r) return "Not set up";
  const late = r.periods.find((p) => p.state === "past_due");
  if (late) return `${late.label} past due`;
  const due = r.periods.find((p) => p.state === "due");
  if (due) return `${due.label} due ${shortDay(due.dueDate)}`;
  const next = r.periods.find((p) => p.state === "in_progress");
  return next ? `${r.cadence === "monthly" ? "Monthly" : "Quarterly"} · next ${next.label}` : "Up to date";
}

function AutoLine({
  icon,
  title,
  summary,
  info,
  counts,
  onOpen,
  detail,
  neutralZero,
  rent,
}: {
  icon: string;
  title: string;
  summary: string;
  info: string;
  counts: TileCounts;
  onOpen: () => void;
  detail?: React.ReactNode;
  neutralZero?: boolean;
  rent?: boolean;
}) {
  return (
    <li className="grid gap-2 border-b border-slate-800 px-3 pb-3 pt-2.5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="flex items-center gap-1.5 text-left text-[15px] font-semibold text-sky-300 hover:underline">
          <Icon name={icon} className="h-4 w-4 shrink-0" />
          {title}
        </button>
        <span className="flex items-start gap-2">
          <span className="pt-0.5 text-right text-xs text-slate-500">{summary}</span>
          <InfoTip text={info} label={`About ${title}`} />
        </span>
      </div>
      <TileRow counts={counts} name={title} rent={rent} neutralZero={neutralZero} onOpen={() => onOpen()} />
      {detail}
    </li>
  );
}

export function OpsBoard(props: BoardProps) {
  const { today, sections, lines, tasks, installments, properties, people, paperwork, userId, focusId } = props;
  const [person, setPerson] = useState("all");
  const [view, setView] = useState<View>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const focus = focusId ? sections.find((s) => s.id === focusId) : undefined;

  const shownTasks = useMemo(
    () =>
      person === "all"
        ? tasks
        : person === "__none"
          ? tasks.filter((t) => !t.assignee)
          : tasks.filter((t) => t.assignee === person),
    [tasks, person],
  );
  const shownSections = focus
    ? [focus]
    : sections.filter((s) => (view === "all" ? true : view === "properties" ? !!s.property_id : !s.property_id));
  const shownSectionIds = new Set(shownSections.map((s) => s.id));
  const shownLines = lines.filter((l) => shownSectionIds.has(l.section_id));
  const shownPropertyIds = new Set(shownSections.map((s) => s.property_id).filter((x): x is string => !!x));
  const shownInsts = person === "all" ? installments.filter((i) => shownPropertyIds.has(i.propertyId)) : [];
  const snap = snapshot(shownTasks, shownLines, shownInsts, today);
  let paperworkLate = 0;
  for (const pid of shownPropertyIds) {
    paperworkLate += leaseCounts(
      (paperwork.leases[pid] ?? []).filter((l) => l.current).map((l) => ({ state: l.state, hasFile: l.files.length > 0 })),
    ).red;
    const r = paperwork.reports[pid];
    if (r) paperworkLate += reportCounts(r.periods).red;
  }
  const samples = tasks.filter((t) => t.is_sample && !t.done_at).length;
  const propName = (pid: string) => properties.find((p) => p.id === pid)?.name ?? "Property";

  const run = (action: (fd: FormData) => Promise<ActionResult>, values: Record<string, string>, ok?: string) =>
    startTransition(async () => {
      await call(action, fdOf(values), ok);
    });

  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 pt-10">
        <h1 className="text-2xl font-bold text-white">Board</h1>
        <p className="mt-2 text-slate-400">
          One column per property and business, with red for overdue, orange for due soon and blue for everything
          open. Start with a column for each of your properties.
        </p>
        <button type="button" className={`${btnPrimary} mt-5`} onClick={() => run(createStarterBoard, {}, "Board created.")}>
          Set up my board
        </button>
      </div>
    );
  }

  const renderSection = (s: OpsSectionRow) => {
    const pid = s.property_id;
    const detailed = !!focus;
    const secLines = lines.filter((l) => l.section_id === s.id);
    const rentInsts = pid ? installments.filter((i) => i.propertyId === pid) : [];
    const currentLeases = pid ? (paperwork.leases[pid] ?? []).filter((l) => l.current) : [];
    const isShort = !!pid && paperwork.shortTerm.includes(pid);
    const reports = pid ? (paperwork.reports[pid] ?? null) : null;
    const stays = pid ? paperwork.stays[pid] : undefined;
    const soonEnd = addDays(today, SOON_DAYS);
    const autoLines: React.ReactNode[] = [];

    if (pid && person === "all") {
      if (currentLeases.length > 0) {
        autoLines.push(
          <AutoLine
            key="lease"
            icon="file"
            title="Lease"
            summary={leaseSummary(currentLeases)}
            info={LEASE_INFO}
            counts={leaseCounts(currentLeases.map((l) => ({ state: l.state, hasFile: l.files.length > 0 })))}
            onOpen={() => setDialog({ kind: "lease", pid })}
            detail={
              detailed && (
                <div className="grid gap-2">
                  {currentLeases.map((l) => (
                    <LeaseCard key={l.id} lease={l} userId={userId} />
                  ))}
                </div>
              )
            }
          />,
        );
      }
      if (isShort) {
        autoLines.push(
          <AutoLine
            key="reports"
            icon="file"
            title="Rental reports"
            summary={reportSummary(reports)}
            info={
              reports
                ? `Upload each ${reports.cadence === "monthly" ? "month's" : "quarter's"} completed rentals. Orange: the period ended and its report is due. Red: past its due date.`
                : "Set how often you upload completed rentals (monthly or quarterly) on the property page."
            }
            counts={reports ? reportCounts(reports.periods) : { red: null, orange: null, blue: 0 }}
            onOpen={() => setDialog({ kind: "reports", pid })}
            detail={
              detailed &&
              (reports ? (
                <ReportPeriods propertyId={pid} userId={userId} reports={reports} limit={4} />
              ) : (
                <ReportSettingsForm propertyId={pid} reports={null} />
              ))
            }
          />,
        );
      }
      if (rentInsts.length > 0) {
        const open = rentInsts.filter((i) => i.status !== "paid");
        autoLines.push(
          <AutoLine
            key="rent"
            icon="dollar"
            title="Rent collected"
            summary={rentSummary(rentInsts, props)}
            info={RENT_INFO}
            rent
            counts={rentCounts(rentInsts, today)}
            onOpen={() => setDialog({ kind: "rent", pid })}
            detail={
              detailed && (
                <ul className="grid gap-1 text-sm">
                  {open.length === 0 && <li className="text-slate-400">Everything due is received.</li>}
                  {open.map((i) => (
                    <li key={i.key}>
                      <button type="button" onClick={() => setDialog({ kind: "rent", pid })} className="flex w-full justify-between gap-2 rounded-lg bg-slate-950/50 px-3 py-2 text-left hover:bg-slate-800">
                        <span className="text-slate-200">{`${fmtDay(i.date)} · ${money(i.amount - i.received)}`}</span>
                        <span className={installmentBucket(i, today) === "red" ? "text-[#ff6b6f]" : "text-[#f5a524]"}>
                          {installmentBucket(i, today) === "red" ? "past due" : "coming up"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            }
          />,
        );
      }
      if (isShort && stays) {
        const arriving = stays.upcoming.filter((b) => b.checkIn >= today && b.checkIn <= soonEnd).length;
        autoLines.push(
          <AutoLine
            key="stays"
            icon="calendar"
            title="Bookings"
            summary={`${money(stays.monthPayout)} booked ${new Date(`${today}T00:00:00`).toLocaleDateString("en-US", { month: "short" })}`}
            info={STAYS_INFO}
            neutralZero
            counts={{ red: null, orange: arriving, blue: stays.upcoming.length }}
            onOpen={() => setDialog({ kind: "stays", pid })}
            detail={detailed && <StayList stays={stays} today={today} />}
          />,
        );
      }
    }

    return (
      <article
        key={s.id}
        className={`overflow-visible rounded-lg bg-slate-900 shadow-lg shadow-black/20 ring-1 ring-slate-800 ${detailed ? "mx-auto w-full max-w-3xl" : ""}`}
      >
        <header className="flex items-center gap-2 rounded-t-lg bg-[#2357c4] px-3 py-2.5 text-white">
          <Icon name={s.icon} className="h-5 w-5 shrink-0" />
          <h2 className="min-w-0 flex-1 text-[15px] font-bold uppercase tracking-wide">
            {detailed ? (
              s.name
            ) : (
              <Link href={`/board/${s.id}`} className="hover:underline">
                {s.name}
              </Link>
            )}
          </h2>
          {pid && (
            <Link href={`/properties/${pid}`} className="shrink-0 rounded px-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white" aria-label={`${s.name} property page`}>
              Details
            </Link>
          )}
        </header>
        <ul>
          {autoLines}
          {secLines.map((l) => {
            const openTasks = shownTasks
              .filter((t) => t.line_id === l.id && !t.done_at)
              .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
            return (
              <li key={l.id} className="grid gap-2 border-b border-slate-800 px-3 pb-3 pt-2.5">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setDialog({ kind: "line", id: l.id, bucket: "open" })} className="text-left text-[15px] font-semibold text-sky-300 hover:underline">
                    {l.name}
                  </button>
                  <InfoTip text={l.info || defaultInfo(l.dated)} label={`About ${l.name}`} />
                </div>
                <TileRow counts={lineCounts(l, shownTasks, today)} name={l.name} onOpen={(b) => setDialog({ kind: "line", id: l.id, bucket: b })} />
                {detailed && (
                  <ul className="grid gap-1 text-sm">
                    {openTasks.length === 0 && <li className="text-slate-500">Nothing open.</li>}
                    {openTasks.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setDialog({ kind: "line", id: l.id, bucket: "open" })} className="flex w-full flex-wrap justify-between gap-x-3 rounded-lg bg-slate-950/50 px-3 py-2 text-left hover:bg-slate-800">
                          <span className="text-slate-200">{t.title}</span>
                          <span className="flex gap-2 text-xs">
                            <span className="text-slate-400">{t.assignee || "Unassigned"}</span>
                            <DueText task={t} today={today} dated={l.dated} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {secLines.length === 0 && autoLines.length === 0 && <li className="px-3 py-4 text-sm text-slate-500">No lines yet.</li>}
        </ul>
        {editing && (
          <ColumnEditor
            section={s}
            isFirst={sections[0]?.id === s.id}
            isLast={sections[sections.length - 1]?.id === s.id}
            lineCount={secLines.length}
            run={run}
          />
        )}
      </article>
    );
  };

  const openLine = dialog?.kind === "line" ? dialog : null;
  const openPid = dialog && dialog.kind !== "line" ? dialog.pid : null;

  return (
    <div className="space-y-4 px-4 pt-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {focus ? (
            <>
              <Link href="/board" className="text-xs text-slate-400 hover:text-slate-200">
                ← Board
              </Link>
              <h1 className="mt-1 text-2xl font-bold text-white">{focus.name}</h1>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white">Board</h1>
              <p className="mt-1 text-sm text-slate-400">Tap any box to see what&apos;s behind it. Tap a column&apos;s name for its own page.</p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!focus && (
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5" role="group" aria-label="Columns to show">
              {(
                [
                  ["all", "All"],
                  ["properties", "Properties"],
                  ["business", "Businesses"],
                ] as [View, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={view === k}
                  onClick={() => setView(k)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    view === k ? "bg-[#2f63cf] text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <span>Showing</span>
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
            >
              <option value="all">Everyone</option>
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="__none">Unassigned</option>
            </select>
          </label>
          <button type="button" onClick={() => setEditing((e) => !e)} className={btnGhost} aria-pressed={editing}>
            {editing ? "Done editing" : "Edit board"}
          </button>
        </div>
      </div>

      {/* Snapshot strip */}
      <section aria-label="Today's snapshot" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex min-w-[180px] items-center gap-2 pr-2 sm:border-r sm:border-slate-800">
          <Icon name="camera" className="h-6 w-6 text-sky-400" />
          <div>
            <h2 className="text-base font-bold text-sky-300">Today&apos;s snapshot</h2>
            <p className="text-xs text-slate-400">{`${fmtDay(today)} · ${person === "all" ? "Everyone" : person === "__none" ? "Unassigned" : person}`}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <Pill label="Open tasks" value={String(snap.openTasks)} />
          <Pill label="Overdue" value={String(snap.overdueTasks)} tone={snap.overdueTasks ? "red" : "ok"} />
          <Pill label={`Due in ${SOON_DAYS} days`} value={String(snap.dueSoonTasks)} tone={snap.dueSoonTasks ? "orange" : "ok"} />
          <Pill label="Done last 7 days" value={String(snap.doneLast7)} />
          {person === "all" && shownPropertyIds.size > 0 && (
            <>
              <Pill label="Rent past due" value={money(snap.rentOverdue)} tone={snap.rentOverdue ? "red" : "ok"} />
              <Pill label={`Rent due in ${SOON_DAYS} days`} value={money(snap.rentDueSoon)} />
              <Pill label="Leases & reports past due" value={String(paperworkLate)} tone={paperworkLate ? "red" : "ok"} />
            </>
          )}
        </div>
      </section>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-[#e0484d]" />Overdue</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-[#ea8a05]" />{`Due within ${SOON_DAYS} days`}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-[#2f63cf]" />All open</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-3 w-5 items-center justify-center rounded-sm bg-[#5aa83a] text-white"><Icon name="thumb" className="h-2.5 w-2.5" /></span>Nothing waiting</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm border border-slate-700 bg-slate-800" />NA = not tracked</span>
      </div>

      {editing && samples > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <span>{`${samples} starter tasks were added as examples, with placeholder dates.`}</span>
          <ConfirmButton label="Clear starter tasks" confirm="Tap again to clear them" onConfirm={() => run(clearSampleTasks, {}, "Starter tasks cleared.")} />
        </div>
      )}

      {/* Columns */}
      <div className={focus ? "grid gap-3 pb-6" : "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] items-start gap-3 pb-6"}>
        {shownSections.map(renderSection)}
        {editing && !focus && <AddColumn properties={properties} sections={sections} />}
      </div>

      {openLine && (
        <TaskDrawer
          key={openLine.id}
          line={lines.find((l) => l.id === openLine.id)}
          section={sections.find((s) => s.id === lines.find((l) => l.id === openLine.id)?.section_id)}
          tasks={shownTasks.filter((t) => t.line_id === openLine.id)}
          bucket={openLine.bucket}
          setBucket={(b) => setDialog({ kind: "line", id: openLine.id, bucket: b })}
          today={today}
          people={people}
          person={person}
          onClose={() => setDialog(null)}
        />
      )}
      {openPid && dialog?.kind === "rent" && (
        <RentDialog
          key={openPid}
          propertyId={openPid}
          propertyName={propName(openPid)}
          installments={installments.filter((i) => i.propertyId === openPid)}
          leases={props.leases}
          plans={props.plans}
          today={today}
          onClose={() => setDialog(null)}
        />
      )}
      {openPid && dialog?.kind === "lease" && (
        <Modal title={`${propName(openPid)} lease`} eyebrow="Lease" onClose={() => setDialog(null)}>
          <div className="grid gap-3">
            {(paperwork.leases[openPid] ?? []).map((l) => (
              <LeaseCard key={l.id} lease={l} userId={userId} />
            ))}
            <Link href={`/properties/${openPid}`} className="text-sm font-semibold text-sky-300 hover:underline">
              Property page →
            </Link>
          </div>
        </Modal>
      )}
      {openPid && dialog?.kind === "reports" && (
        <Modal title={`${propName(openPid)} rental reports`} eyebrow="Completed rentals" onClose={() => setDialog(null)}>
          <div className="grid gap-4">
            {paperwork.reports[openPid] ? (
              <ReportPeriods propertyId={openPid} userId={userId} reports={paperwork.reports[openPid]!} limit={8} />
            ) : (
              <p className="text-sm text-slate-400">Choose how often you upload completed rentals for this property.</p>
            )}
            <details className="rounded-xl border border-slate-800 p-3" open={!paperwork.reports[openPid]}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-200">Report schedule</summary>
              <div className="mt-3">
                <ReportSettingsForm propertyId={openPid} reports={paperwork.reports[openPid] ?? null} />
              </div>
            </details>
          </div>
        </Modal>
      )}
      {openPid && dialog?.kind === "stays" && paperwork.stays[openPid] && (
        <Modal title={`${propName(openPid)} bookings`} eyebrow="Upcoming stays" onClose={() => setDialog(null)}>
          <StayList stays={paperwork.stays[openPid]} today={today} />
          <Link href={`/properties/${openPid}`} className="mt-4 inline-block text-sm font-semibold text-sky-300 hover:underline">
            Add stays or import a booking CSV on the property page →
          </Link>
        </Modal>
      )}
    </div>
  );
}

function StayList({ stays, today }: { stays: StaysVM; today: string }) {
  if (stays.upcoming.length === 0) return <p className="text-sm text-slate-400">No upcoming stays on the books.</p>;
  return (
    <ul className="grid gap-1 text-sm">
      {stays.upcoming.map((b) => {
        const nights = diffDays(b.checkIn, b.checkOut);
        const here = b.checkIn <= today;
        return (
          <li key={b.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950/50 px-3 py-2">
            <span className="text-slate-200">{`${shortDay(b.checkIn)} to ${shortDay(b.checkOut)} · ${nights} night${nights === 1 ? "" : "s"}${here ? " · checked in" : ""}`}</span>
            <span className="text-slate-400">{`${money(b.payout)} · ${b.platform}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function rentSummary(insts: Installment[], props: BoardProps): string {
  const plan = insts.find((i) => i.scheduleId)?.scheduleId;
  if (plan && props.plans[plan]) {
    const p = props.plans[plan];
    return `${money(p.amount)} ${FREQUENCY_LABELS[p.frequency]}`;
  }
  const lease = props.leases[insts[0]?.leaseId ?? ""];
  return lease ? `${money(lease.rent)} monthly` : "";
}

function defaultInfo(dated: boolean): string {
  return dated
    ? `Red: past due. Orange: due in the next ${SOON_DAYS} days. Blue: every open task. A thumbs-up means nothing is in that box.`
    : "Blue: every open task. This line has no due dates, so red and orange show NA.";
}

function Pill({ label, value, tone }: { label: string; value: string; tone?: "red" | "orange" | "ok" }) {
  const valueCls = tone === "red" ? "text-[#ff6b6f]" : tone === "orange" ? "text-[#f5a524]" : tone === "ok" ? "text-[#7cd35a]" : "text-white";
  return (
    <div className="flex min-w-[150px] flex-1 items-center justify-between gap-3 rounded-md bg-slate-800/80 px-3 py-2">
      <span className="text-sm font-semibold text-slate-200">{label}</span>
      <span className={`rounded-full bg-slate-950 px-2.5 py-0.5 text-sm font-bold tabular-nums ${valueCls}`}>{value}</span>
    </div>
  );
}

function InfoTip({ text, label }: { text: string; label: string }) {
  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        aria-label={label}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-600 text-[11px] font-semibold text-slate-400"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 z-20 hidden w-60 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-snug text-slate-900 shadow-xl group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

function ConfirmButton({ label, confirm, onConfirm, className }: { label: string; confirm: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      onBlur={() => setArmed(false)}
      className={
        className ??
        `rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
          armed ? "border-red-500 bg-red-500 text-white" : "border-red-500/60 text-red-300 hover:border-red-400"
        }`
      }
    >
      {armed ? confirm : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Editing columns
// ---------------------------------------------------------------------------

function ColumnEditor({
  section,
  isFirst,
  isLast,
  lineCount,
  run,
}: {
  section: OpsSectionRow;
  isFirst: boolean;
  isLast: boolean;
  lineCount: number;
  run: (a: (fd: FormData) => Promise<ActionResult>, v: Record<string, string>, ok?: string) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-slate-800 bg-slate-950/40 p-3">
      <form
        action={async (fd) => {
          await call(addOpsLine, fd, "Line added.");
        }}
        className="flex gap-2"
      >
        <input type="hidden" name="section_id" value={section.id} />
        <input name="name" required maxLength={80} placeholder="New line, e.g. Repairs" aria-label={`New line in ${section.name}`} className={inputCls} />
        <button type="submit" className={btnGhost}>
          Add
        </button>
      </form>
      <form
        action={async (fd) => {
          await call(updateOpsSection, fd, "Column saved.");
        }}
        className="grid grid-cols-[1fr_auto] gap-2"
      >
        <input type="hidden" name="id" value={section.id} />
        <input name="name" required maxLength={80} defaultValue={section.name} aria-label="Column name" className={inputCls} />
        <select name="icon" defaultValue={section.icon} aria-label="Column icon" className="rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm text-white">
          {SECTION_ICONS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <button type="submit" className={`${btnGhost} col-span-2`}>
          Save name and icon
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={isFirst} onClick={() => run(moveOpsSection, { id: section.id, dir: "-1" })} className={`${btnGhost} disabled:opacity-40`} aria-label={`Move ${section.name} left`}>
          ←
        </button>
        <button type="button" disabled={isLast} onClick={() => run(moveOpsSection, { id: section.id, dir: "1" })} className={`${btnGhost} disabled:opacity-40`} aria-label={`Move ${section.name} right`}>
          →
        </button>
        <span className="flex-1" />
        <ConfirmButton
          label="Delete column"
          confirm={lineCount ? `Delete it and ${lineCount} lines` : "Tap again to delete"}
          onConfirm={() => run(deleteOpsSection, { id: section.id }, "Column deleted.")}
        />
      </div>
    </div>
  );
}

function AddColumn({ properties, sections }: { properties: { id: string; name: string }[]; sections: OpsSectionRow[] }) {
  const used = new Set(sections.map((s) => s.property_id).filter(Boolean));
  const free = properties.filter((p) => !used.has(p.id));
  return (
    <form
      action={async (fd) => {
        await call(addOpsSection, fd, "Column added.");
      }}
      className="grid gap-2 rounded-lg border border-dashed border-slate-700 p-3"
    >
      <h2 className="text-sm font-semibold text-white">Add a column</h2>
      <input name="name" required maxLength={80} placeholder="Column name" aria-label="New column name" className={inputCls} />
      <label className={labelCls}>
        Tie it to a property (shows its rent)
        <select name="property_id" defaultValue="" className={inputCls}>
          <option value="">No property</option>
          {free.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className={btnPrimary}>
        Add column
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Modal frame
// ---------------------------------------------------------------------------

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  side,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
  side?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          side
            ? "relative ml-auto flex h-full w-full max-w-[540px] flex-col overflow-y-auto bg-slate-900 shadow-2xl"
            : "relative m-auto flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-2xl bg-slate-900 shadow-2xl"
        }
      >
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 px-5 pb-3 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</p>
          <h2 className="mt-1 pr-10 text-xl font-bold text-sky-300">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:text-white"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 px-5 pb-8 pt-3">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task drawer
// ---------------------------------------------------------------------------

function TaskDrawer({
  line,
  section,
  tasks,
  bucket,
  setBucket,
  today,
  people,
  person,
  onClose,
}: {
  line: OpsLineRow | undefined;
  section: OpsSectionRow | undefined;
  tasks: OpsTaskRow[];
  bucket: Bucket;
  setBucket: (b: Bucket) => void;
  today: string;
  people: string[];
  person: string;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [lineEdit, setLineEdit] = useState(false);
  const [, startTransition] = useTransition();
  if (!line) return null;

  const dated = line.dated;
  const groups: Record<Bucket, OpsTaskRow[]> = { red: [], orange: [], open: [], done: [] };
  const monthAgo = addDays(today, -30);
  for (const t of tasks) {
    if (t.done_at) {
      if (dayOf(t.done_at) > monthAgo) groups.done.push(t);
      continue;
    }
    groups.open.push(t);
    if (dated) {
      const b = taskBucket(t, today);
      if (b === "red" || b === "orange") groups[b].push(t);
    }
  }
  const byDue = (a: OpsTaskRow, b: OpsTaskRow) =>
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || a.title.localeCompare(b.title);
  groups.red.sort(byDue);
  groups.orange.sort(byDue);
  groups.open.sort(byDue);
  groups.done.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const tabs: [Bucket, string, string][] = (
    [
      ["red", "Overdue", "bg-[#e0484d]"],
      ["orange", `Due in ${SOON_DAYS} days`, "bg-[#ea8a05]"],
      ["open", "All open", "bg-[#2f63cf]"],
      ["done", "Done, 30 days", "bg-[#5aa83a]"],
    ] as [Bucket, string, string][]
  ).filter(([k]) => dated || k === "open" || k === "done");
  const active = tabs.some(([k]) => k === bucket) ? bucket : "open";
  const items = groups[active];
  const defaultWho = person !== "all" && person !== "__none" ? person : "";

  const complete = (t: OpsTaskRow) =>
    startTransition(async () => {
      await call(completeOpsTask, fdOf({ id: t.id }), t.repeat && t.due_date ? "Done. The next one is on the board." : "Marked done.");
    });
  const reopen = (t: OpsTaskRow) =>
    startTransition(async () => {
      await call(reopenOpsTask, fdOf({ id: t.id }), "Reopened.");
    });

  return (
    <Modal title={line.name} eyebrow={section?.name ?? "Board"} onClose={onClose} side>
      <p className="text-sm text-slate-400">{line.info || defaultInfo(dated)}</p>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist">
        {tabs.map(([k, label, dot]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active === k}
            onClick={() => setBucket(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              active === k ? "border-white bg-white text-slate-900" : "border-slate-700 text-slate-300"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
            {`${label} (${groups[k].length})`}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {adding ? (
          <TaskForm
            mode="add"
            lineId={line.id}
            people={people}
            initial={{ assignee: defaultWho }}
            onDone={() => setAdding(false)}
            keepOpen
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGhost} onClick={() => setAdding(true)}>
              + Add task
            </button>
            <button type="button" className="text-sm text-slate-400 hover:text-white" onClick={() => setLineEdit((v) => !v)}>
              {lineEdit ? "Close line settings" : "Line settings"}
            </button>
          </div>
        )}
        {lineEdit && !adding && <LineSettings line={line} onDeleted={onClose} />}
      </div>

      <ul className="mt-3">
        {items.length === 0 && (
          <li className="flex items-center gap-2 py-6 text-slate-400">
            {active !== "done" && <Icon name="thumb" className="h-5 w-5 text-[#7cd35a]" />}
            {active === "red"
              ? "Nothing overdue."
              : active === "orange"
                ? `Nothing due in the next ${SOON_DAYS} days.`
                : active === "open"
                  ? "No open tasks here."
                  : "Nothing finished in the last 30 days."}
          </li>
        )}
        {items.map((t) =>
          editId === t.id ? (
            <li key={t.id} className="border-b border-slate-800 py-3">
              <TaskForm mode="edit" task={t} lineId={line.id} people={people} onDone={() => setEditId(null)} />
            </li>
          ) : (
            <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-slate-800 py-3">
              <button
                type="button"
                onClick={() => (t.done_at ? reopen(t) : complete(t))}
                aria-label={`${t.done_at ? "Reopen" : "Mark done"}: ${t.title}`}
                className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 transition ${
                  t.done_at
                    ? "border-[#5aa83a] bg-[#5aa83a] text-white"
                    : "border-slate-500 text-transparent hover:border-[#5aa83a] hover:text-[#5aa83a]"
                }`}
              >
                <Icon name="check" className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <p className={`font-semibold ${t.done_at ? "text-slate-500 line-through" : "text-white"}`}>{t.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 font-semibold text-slate-200">{t.assignee || "Unassigned"}</span>
                  <DueText task={t} today={today} dated={dated} />
                  {t.repeat && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="repeat" className="h-3 w-3" />
                      {REPEAT_LABELS[t.repeat]}
                    </span>
                  )}
                  {t.done_at && dayOf(t.done_at) && <span>{`Done ${fmtDay(dayOf(t.done_at))}`}</span>}
                </p>
                {t.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-400">{t.notes}</p>}
              </div>
              <button type="button" onClick={() => setEditId(t.id)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:text-white" aria-label={`Edit ${t.title}`}>
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
    </Modal>
  );
}

function DueText({ task, today, dated }: { task: OpsTaskRow; today: string; dated: boolean }) {
  if (!task.due_date) return dated ? <span>No due date</span> : null;
  if (task.done_at) return <span>{`Was due ${fmtDay(task.due_date)}`}</span>;
  const n = diffDays(today, task.due_date);
  if (n < 0) return <span className="font-semibold text-[#ff6b6f]">{`Overdue ${-n} day${n === -1 ? "" : "s"} · ${fmtDay(task.due_date)}`}</span>;
  if (n === 0) return <span className="font-semibold text-[#f5a524]">Due today</span>;
  if (n <= SOON_DAYS) return <span className="font-semibold text-[#f5a524]">{`Due ${fmtDay(task.due_date)}`}</span>;
  return <span className="font-semibold text-sky-300">{`Due ${fmtDay(task.due_date)}`}</span>;
}

function TaskForm({
  mode,
  task,
  lineId,
  people,
  initial,
  onDone,
  keepOpen,
}: {
  mode: "add" | "edit";
  task?: OpsTaskRow;
  lineId: string;
  people: string[];
  initial?: { assignee?: string };
  onDone: () => void;
  keepOpen?: boolean;
}) {
  const [, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const listId = `people-${mode}-${task?.id ?? lineId}`;
  return (
    <form
      action={async (fd) => {
        const ok = await call(mode === "add" ? addOpsTask : updateOpsTask, fd, mode === "add" ? "Added to the board." : "Saved.");
        if (ok && !keepOpen) onDone();
        if (ok && keepOpen) titleRef.current?.focus();
      }}
      className="grid gap-3 rounded-xl bg-slate-950/60 p-3"
    >
      <input type="hidden" name="line_id" value={lineId} />
      {task && <input type="hidden" name="id" value={task.id} />}
      <label className={labelCls}>
        Task
        <input ref={titleRef} name="title" required maxLength={200} defaultValue={task?.title} placeholder="What needs doing" className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={labelCls}>
          Who
          <input name="assignee" list={listId} maxLength={60} defaultValue={task?.assignee ?? initial?.assignee ?? ""} placeholder="Name" className={inputCls} />
          <datalist id={listId}>
            {people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className={labelCls}>
          Due
          <input type="date" name="due_date" defaultValue={task?.due_date ?? ""} className={inputCls} />
        </label>
        <label className={labelCls}>
          Repeats
          <select name="repeat" defaultValue={task?.repeat ?? ""} className={inputCls}>
            <option value="">Doesn&apos;t repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>
      <label className={labelCls}>
        Notes
        <textarea name="notes" maxLength={1000} defaultValue={task?.notes ?? ""} rows={2} className={inputCls} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary}>
          {mode === "add" ? "Add to board" : "Save"}
        </button>
        <button type="button" onClick={onDone} className={btnGhost}>
          {mode === "add" ? "Close" : "Cancel"}
        </button>
        <span className="flex-1" />
        {task && (
          <ConfirmButton
            label="Delete"
            confirm="Tap again to delete"
            onConfirm={() =>
              startTransition(async () => {
                if (await call(deleteOpsTask, fdOf({ id: task.id }), "Task deleted.")) onDone();
              })
            }
          />
        )}
      </div>
    </form>
  );
}

function LineSettings({ line, onDeleted }: { line: OpsLineRow; onDeleted: () => void }) {
  const [, startTransition] = useTransition();
  return (
    <form
      action={async (fd) => {
        await call(updateOpsLine, fd, "Line saved.");
      }}
      className="mt-3 grid gap-3 rounded-xl bg-slate-950/60 p-3"
    >
      <input type="hidden" name="id" value={line.id} />
      <label className={labelCls}>
        Line name
        <input name="name" required maxLength={80} defaultValue={line.name} className={inputCls} />
      </label>
      <label className={labelCls}>
        What counts here (shows on the i button)
        <input name="info" maxLength={400} defaultValue={line.info ?? ""} className={inputCls} />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" name="dated" defaultChecked={line.dated} className="h-4 w-4" />
        Tasks here have due dates (off = red and orange show NA)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={btnPrimary}>
          Save line
        </button>
        <span className="flex-1" />
        <ConfirmButton
          label="Delete line"
          confirm="Tap again: deletes its tasks too"
          onConfirm={() =>
            startTransition(async () => {
              if (await call(deleteOpsLine, fdOf({ id: line.id }), "Line deleted.")) onDeleted();
            })
          }
        />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Rent dialog — "Has it been received?"
// ---------------------------------------------------------------------------

const METHODS = ["Venmo", "Zelle", "Check", "Cash", "Assistance check", "Bank transfer", "Other"];

function RentDialog({
  propertyId,
  propertyName,
  installments,
  leases,
  plans,
  today,
  onClose,
}: {
  propertyId: string;
  propertyName: string;
  installments: Installment[];
  leases: Record<string, LeaseInfo>;
  plans: Record<string, PlanInfo>;
  today: string;
  onClose: () => void;
}) {
  const open = installments.filter((i) => i.status !== "paid");
  const paid = installments.filter((i) => i.status === "paid").reverse().slice(0, 4);
  const first = open.find((i) => installmentBucket(i, today) !== "open") ?? open[0];
  const [activeKey, setActiveKey] = useState<string | null>(first?.key ?? null);
  const leaseIds = [...new Set(installments.map((i) => i.leaseId))];
  const endedLeases = leaseIds.map((id) => leases[id]).filter((l) => l && l.endDate && l.endDate < today);
  const planIds = [...new Set(installments.map((i) => i.scheduleId).filter((x): x is string => !!x))];

  return (
    <Modal title={`${propertyName} rent`} eyebrow="Has it been received?" onClose={onClose}>
      <div className="space-y-1 text-sm text-slate-400">
        {planIds.map((id) => {
          const p = plans[id];
          return p ? (
            <p key={id}>{`Payment plan: ${money(p.amount)} ${FREQUENCY_LABELS[p.frequency]} since ${fmtDay(p.startDate, true)}${p.endDate ? `, ending ${fmtDay(p.endDate, true)}` : ""}.`}</p>
          ) : null;
        })}
        {endedLeases.map((l, i) => (
          <p key={i} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
            {`The lease on file ended ${fmtDay(l!.endDate!, true)}, so monthly rent has stopped adding to the balance. Enter the renewal on the property page to keep the balance right.`}
          </p>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {open.length === 0 && (
          <li className="flex items-center gap-2 py-4 text-slate-300">
            <Icon name="thumb" className="h-5 w-5 text-[#7cd35a]" />
            Everything due is received.
          </li>
        )}
        {open.map((i) => (
          <InstallmentRow
            key={i.key}
            inst={i}
            tenant={leases[i.leaseId]?.tenant ?? null}
            today={today}
            active={activeKey === i.key}
            onToggle={() => setActiveKey((k) => (k === i.key ? null : i.key))}
            onDone={() => setActiveKey(null)}
          />
        ))}
      </ul>

      {paid.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recently received</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-300">
            {paid.map((i) => (
              <li key={i.key} className="flex justify-between gap-2">
                <span>{`Due ${fmtDay(i.date)}`}</span>
                <span className="font-semibold text-[#7cd35a]">{`${money(i.received)} received`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-800 pt-4 text-sm">
        <Link href={`/properties/${propertyId}`} className="font-semibold text-sky-300 hover:underline">
          Open the full ledger →
        </Link>
        <a href={`/properties/${propertyId}/export`} className="font-semibold text-sky-300 hover:underline">
          Download Excel
        </a>
      </div>
    </Modal>
  );
}

function InstallmentRow({
  inst,
  tenant,
  today,
  active,
  onToggle,
  onDone,
}: {
  inst: Installment;
  tenant: string | null;
  today: string;
  active: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"ask" | "yes" | "promised">("ask");
  const [, startTransition] = useTransition();
  const left = Math.max(0, Math.round((inst.amount - inst.received) * 100) / 100);
  const b = installmentBucket(inst, today);
  const n = diffDays(today, inst.date);
  const when = n < 0 ? `${-n} day${n === -1 ? "" : "s"} past due` : n === 0 ? "due today" : `due in ${n} day${n === 1 ? "" : "s"}`;
  const stripe = b === "red" ? "border-l-[#e0484d]" : b === "orange" ? "border-l-[#ea8a05]" : "border-l-[#2f63cf]";

  return (
    <li className={`rounded-xl border border-slate-800 border-l-4 ${stripe} bg-slate-950/50`}>
      <button type="button" onClick={onToggle} aria-expanded={active} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="block font-semibold text-white">{`${fmtDay(inst.date)} · ${money(inst.amount)}${tenant ? ` · ${tenant}` : ""}`}</span>
          <span className="block text-xs text-slate-400">{when}</span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          {inst.received > 0 && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-200">{`${money(inst.received)} of ${money(inst.amount)} in`}</span>
          )}
          {inst.pending > 0 && (
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-semibold text-violet-300">{`${money(inst.pending)} promised`}</span>
          )}
        </span>
      </button>

      {active && (
        <div className="border-t border-slate-800 px-4 pb-4 pt-3">
          {inst.promised.length > 0 && (
            <ul className="mb-3 space-y-2">
              {inst.promised.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                  <span>{`${money(p.amount)} promised${p.expectedDate ? ` for ${fmtDay(p.expectedDate)}` : ""}`}</span>
                  <button
                    type="button"
                    className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-semibold text-white hover:bg-violet-400"
                    onClick={() =>
                      startTransition(async () => {
                        await call(
                          markPromisedReceived,
                          fdOf({ id: p.id, property_id: inst.propertyId, paid_date: today }),
                          "Marked received today. The ledger and balance are updated.",
                        );
                      })
                    }
                  >
                    It came in today
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === "ask" && (
            <div>
              <p className="font-semibold text-white">Has it been received?</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setMode("yes")} className="rounded-lg bg-[#5aa83a] px-3 py-2.5 text-sm font-bold text-white hover:brightness-110">
                  Yes
                </button>
                <button type="button" onClick={() => setMode("promised")} className="rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-violet-500">
                  Promised
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDone();
                    showToast(b === "red" ? "Left open. It stays red until it's marked received." : "Left open.");
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-2.5 text-sm font-bold text-slate-200 hover:border-slate-400"
                >
                  Not yet
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Promised = she said it&apos;s coming. It shows purple and counts toward nothing until it lands. No late fee is ever added on its own.</p>
            </div>
          )}

          {mode !== "ask" && (
            <form
              action={async (fd) => {
                const ok = await call(
                  recordInstallmentPayment,
                  fd,
                  mode === "yes" ? "Received. The ledger, balance and Excel are updated." : "Logged as promised.",
                );
                if (ok) {
                  setMode("ask");
                  onDone();
                }
              }}
              className="grid gap-3"
            >
              <input type="hidden" name="property_id" value={inst.propertyId} />
              <input type="hidden" name="lease_id" value={inst.leaseId} />
              <input type="hidden" name="schedule_id" value={inst.scheduleId ?? ""} />
              <input type="hidden" name="installment_date" value={inst.date} />
              <input type="hidden" name="status" value={mode === "yes" ? "received" : "pending"} />
              <div className="grid grid-cols-2 gap-3">
                <label className={labelCls}>
                  Amount
                  <input name="amount" inputMode="decimal" required defaultValue={String(left || inst.amount)} className={inputCls} />
                </label>
                <label className={labelCls}>
                  {mode === "yes" ? "Date received" : "Expected on"}
                  <input type="date" name="date" required defaultValue={mode === "yes" ? today : inst.date > today ? inst.date : today} className={inputCls} />
                </label>
                {mode === "yes" && (
                  <label className={labelCls}>
                    How it came in
                    <select name="method" defaultValue="Venmo" className={inputCls}>
                      {METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className={labelCls}>
                  From
                  <input name="from" maxLength={80} defaultValue={tenant ?? ""} placeholder="Who paid" className={inputCls} />
                </label>
              </div>
              <label className={labelCls}>
                Note
                <input name="note" maxLength={300} placeholder="Optional" className={inputCls} />
              </label>
              <div className="flex gap-2">
                <button type="submit" className={mode === "yes" ? btnPrimary : "rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"}>
                  {mode === "yes" ? "Mark received" : "Log as promised"}
                </button>
                <button type="button" onClick={() => setMode("ask")} className={btnGhost}>
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
