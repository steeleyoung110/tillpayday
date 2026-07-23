import Link from "next/link";

/**
 * App navigation frame: five sections — Dashboard (glance), Budget (manage),
 * Net worth, Grow, Settings. Sidebar on desktop, bottom tab bar on mobile.
 */

export type NavKey = "dashboard" | "budget" | "networth" | "grow" | "settings";

const ITEMS: { key: NavKey; href: string; label: string; icon: string }[] = [
  { key: "dashboard", href: "/", label: "Dashboard", icon: "🏠" },
  { key: "budget", href: "/budget", label: "Budget", icon: "🪣" },
  { key: "networth", href: "/net-worth", label: "Net worth", icon: "📊" },
  { key: "grow", href: "/grow", label: "Grow", icon: "🌱" },
  { key: "settings", href: "/settings", label: "Settings", icon: "⚙️" },
];

export function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r border-slate-800 bg-slate-900/60 p-4 md:flex">
        <Link href="/" className="px-2 text-xl font-bold text-white">
          Till <span className="text-emerald-400">Payday</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                active === item.key
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile top brand strip */}
      <header className="border-b border-slate-800 py-3 text-center md:hidden">
        <Link href="/" className="text-lg font-bold text-white">
          Till <span className="text-emerald-400">Payday</span>
        </Link>
      </header>

      {/* Content */}
      <div className="pb-24 md:pb-10 md:pl-52">{children}</div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-800 bg-slate-900/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${
              active === item.key ? "text-emerald-300" : "text-slate-500"
            }`}
          >
            <span className="text-lg" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
