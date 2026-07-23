import Link from "next/link";

/** Top-level navigation: Budget, Net worth, and Grow are separate modules. */
export function NavTabs({ active }: { active: "budget" | "networth" | "grow" }) {
  const tab = (href: string, key: string, label: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active === key
          ? "bg-emerald-500/15 text-emerald-300"
          : "text-slate-400 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav className="flex items-center gap-1">
      {tab("/", "budget", "Budget")}
      {tab("/net-worth", "networth", "Net worth")}
      {tab("/grow", "grow", "Grow")}
    </nav>
  );
}
