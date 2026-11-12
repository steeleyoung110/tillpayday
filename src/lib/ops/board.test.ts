import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildInstallments,
  dayOf,
  isISODate,
  lineCounts,
  nextDue,
  rentCounts,
  scheduleDates,
  snapshot,
  taskBucket,
  todayIn,
} from "./board";
import type { OpsTaskRow } from "./rows";

const TODAY = "2026-11-12"; // a Thursday

const task = (over: Partial<OpsTaskRow>): OpsTaskRow => ({
  id: Math.random().toString(36).slice(2),
  line_id: "L1",
  title: "t",
  assignee: null,
  due_date: null,
  repeat: null,
  notes: null,
  done_at: null,
  is_sample: false,
  created_at: "2026-11-01T00:00:00Z",
  ...over,
});

describe("task buckets", () => {
  it("splits by due date: past = red, within 7 days = orange, later or undated = open", () => {
    expect(taskBucket(task({ due_date: "2026-11-11" }), TODAY)).toBe("red");
    expect(taskBucket(task({ due_date: "2026-11-12" }), TODAY)).toBe("orange");
    expect(taskBucket(task({ due_date: "2026-11-19" }), TODAY)).toBe("orange");
    expect(taskBucket(task({ due_date: "2026-11-20" }), TODAY)).toBe("open");
    expect(taskBucket(task({}), TODAY)).toBe("open");
    expect(taskBucket(task({ due_date: "2026-11-01", done_at: "2026-11-02T12:00:00Z" }), TODAY)).toBe("done");
  });

  it("counts a line's tiles and shows NA for lines without due dates", () => {
    const tasks = [
      task({ due_date: "2026-11-10" }),
      task({ due_date: "2026-11-17" }),
      task({ due_date: "2026-11-25" }),
      task({ due_date: "2026-11-05", done_at: "2026-11-06T00:00:00Z" }),
      task({ line_id: "other", due_date: "2026-11-01" }),
    ];
    expect(lineCounts({ id: "L1", dated: true }, tasks, TODAY)).toEqual({ red: 1, orange: 1, blue: 3 });
    expect(lineCounts({ id: "L1", dated: false }, tasks, TODAY)).toEqual({ red: null, orange: null, blue: 3 });
  });
});

describe("repeating tasks", () => {
  it("weekly lands on the next same weekday after today, even when finished late", () => {
    expect(nextDue("2026-11-13", "weekly", TODAY)).toBe("2026-11-20");
    expect(nextDue("2026-10-19", "weekly", TODAY)).toBe("2026-11-16");
  });
  it("daily and monthly", () => {
    expect(nextDue("2026-11-12", "daily", TODAY)).toBe("2026-11-13");
    expect(nextDue("2026-10-31", "monthly", TODAY)).toBe("2026-11-30");
    expect(nextDue("2026-11-30", "monthly", "2026-12-05")).toBe("2026-12-30");
    expect(nextDue("2026-01-31", "monthly", "2026-02-10")).toBe("2026-02-28");
    expect(nextDue("2026-01-31", "monthly", "2026-03-01")).toBe("2026-03-31");
  });
});

describe("dates", () => {
  it("only accepts believable years (a typed date can come out as year 0525)", () => {
    expect(isISODate("2026-11-23")).toBe(true);
    expect(isISODate("0525-11-23")).toBe(false);
    expect(isISODate("3026-11-23")).toBe(false);
    expect(isISODate("2026-11")).toBe(false);
  });
  it("clamps month math to the month's last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
  it("reads today and timestamps on New Hampshire time", () => {
    // 02:30 UTC on Nov 13 is still the evening of Nov 12 in New Hampshire.
    expect(todayIn("America/New_York", new Date("2026-11-13T02:30:00Z"))).toBe("2026-11-12");
    expect(dayOf("2026-11-13T02:30:00Z")).toBe("2026-11-12");
    expect(dayOf(null)).toBe("");
  });
  it("lists plan due dates inside a window", () => {
    expect(scheduleDates("weekly", "2026-11-09", null, "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
    expect(scheduleDates("weekly", "2026-11-09", "2026-11-20", "2026-11-12", "2026-11-30")).toEqual(["2026-11-16"]);
    expect(scheduleDates("biweekly", "2026-11-02", null, "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-02",
      "2026-11-16",
      "2026-11-30",
    ]);
  });
});

// Concord-style setup: $2,300/mo lease, $700 every Monday from Nov 9.
const lease = {
  id: "lease1",
  unit_id: "u1",
  rent_amount: 2300,
  due_day: 1,
  start_date: "2025-11-01",
  end_date: "2026-10-31",
  status: "active" as const,
};
const plan = {
  id: "plan1",
  lease_id: "lease1",
  property_id: "p1",
  amount: 700,
  frequency: "weekly" as const,
  start_date: "2026-11-09",
  end_date: null,
};
const unitProperty = new Map([["u1", "p1"], ["u2", "p2"]]);
const pay = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  property_id: "p1",
  lease_id: "lease1",
  amount: 700,
  status: "received" as const,
  paid_date: null as string | null,
  expected_date: null as string | null,
  period_month: null as string | null,
  schedule_id: null as string | null,
  installment_date: null as string | null,
  ...over,
});

describe("rent installments from a payment plan", () => {
  it("lists every Monday from the plan start through the next 7 days", () => {
    const insts = buildInstallments({ schedules: [plan], leases: [lease], unitProperty, payments: [], today: TODAY });
    expect(insts.map((i) => i.date)).toEqual(["2026-11-09", "2026-11-16"]);
    expect(insts.every((i) => i.status === "due")).toBe(true);
    expect(rentCounts(insts, TODAY)).toEqual({ red: 1, orange: 1, blue: 2 });
  });

  it("a payment logged from the board answers exactly its installment", () => {
    const insts = buildInstallments({
      schedules: [plan],
      leases: [lease],
      unitProperty,
      payments: [pay({ paid_date: "2026-11-12", schedule_id: "plan1", installment_date: "2026-11-16" })],
      today: TODAY,
    });
    expect(insts.find((i) => i.date === "2026-11-16")!.status).toBe("paid");
    expect(insts.find((i) => i.date === "2026-11-09")!.status).toBe("due");
  });

  it("matches a payment logged in the ledger by date, and tracks partial and promised money", () => {
    const insts = buildInstallments({
      schedules: [plan],
      leases: [lease],
      unitProperty,
      payments: [
        pay({ paid_date: "2026-11-10", amount: 600 }), // Tuesday after Nov 9 — partial
        pay({ status: "pending", expected_date: "2026-11-17" }), // promised for Nov 16
        pay({ paid_date: "2026-11-03" }), // before the plan window: ignored
      ],
      today: TODAY,
    });
    const nov9 = insts.find((i) => i.date === "2026-11-09")!;
    const nov16 = insts.find((i) => i.date === "2026-11-16")!;
    expect(nov9).toMatchObject({ received: 600, status: "partial" });
    expect(nov16).toMatchObject({ received: 0, pending: 700, status: "promised" });
    expect(nov16.promised).toHaveLength(1);
    // Promised money is still not money: both stay open.
    expect(rentCounts(insts, TODAY)).toEqual({ red: 1, orange: 1, blue: 2 });
  });

  it("a plan replaces the lease's monthly due day", () => {
    const insts = buildInstallments({
      schedules: [plan],
      leases: [{ ...lease, end_date: null }],
      unitProperty,
      payments: [],
      today: TODAY,
    });
    expect(insts.every((i) => i.scheduleId === "plan1")).toBe(true);
  });
});

describe("rent installments from a monthly lease", () => {
  const monthly = { ...lease, id: "lease2", unit_id: "u2", rent_amount: 1600, start_date: "2024-03-01", end_date: null };

  it("lists recent due days and matches payments by the month they cover", () => {
    const insts = buildInstallments({
      schedules: [],
      leases: [monthly],
      unitProperty,
      payments: [
        pay({ property_id: "p2", lease_id: "lease2", amount: 1600, paid_date: "2026-10-02" }),
        pay({ property_id: "p2", lease_id: "lease2", amount: 1600, paid_date: "2026-10-30", period_month: "2026-11-01" }),
      ],
      today: TODAY,
    });
    expect(insts.map((i) => [i.date, i.status])).toEqual([
      ["2026-10-01", "paid"],
      ["2026-11-01", "paid"],
    ]);
    expect(rentCounts(insts, TODAY)).toEqual({ red: 0, orange: 0, blue: 0 });
  });

  it("skips ended leases and leases that no longer cover today", () => {
    const insts = buildInstallments({
      schedules: [],
      leases: [lease, { ...monthly, status: "ended" as const }],
      unitProperty,
      payments: [],
      today: TODAY,
    });
    expect(insts).toEqual([]);
  });
});

describe("snapshot strip", () => {
  it("sums tasks and rent for the top of the board", () => {
    const tasks = [
      task({ due_date: "2026-11-10" }),
      task({ due_date: "2026-11-14" }),
      task({}),
      task({ done_at: "2026-11-10T15:00:00Z" }),
      task({ done_at: "2026-10-01T15:00:00Z" }),
      task({ line_id: "deleted", due_date: "2026-11-01" }),
    ];
    const insts = buildInstallments({
      schedules: [plan],
      leases: [lease],
      unitProperty,
      payments: [pay({ paid_date: "2026-11-10", amount: 600 })],
      today: TODAY,
    });
    expect(snapshot(tasks, [{ id: "L1", dated: true }], insts, TODAY)).toEqual({
      openTasks: 3,
      overdueTasks: 1,
      dueSoonTasks: 1,
      doneLast7: 1,
      rentOverdue: 100,
      rentDueSoon: 700,
    });
  });
});
