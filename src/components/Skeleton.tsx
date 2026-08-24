/**
 * Skeleton primitives: gray shapes that match the real layout, so a loading
 * screen reads as "your numbers are on their way" instead of a blank flash
 * or a spinner. Every skeleton mirrors the geometry of the thing it stands
 * in for — same card shapes, same grid, same rough heights.
 *
 * Motion is `motion-safe:` only — anyone who asked their OS for reduced
 * motion gets flat gray blocks instead of a pulse.
 */

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded bg-slate-800 motion-safe:animate-pulse ${className}`}
    />
  );
}

/** A bordered card matching the app's standard rounded-2xl panel. */
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={`rounded-2xl border border-slate-800 bg-slate-900 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** One small stat tile: label line + big number line. */
export function SkeletonTile() {
  return (
    <SkeletonCard className="p-4">
      <SkeletonBlock className="h-3 w-20" />
      <SkeletonBlock className="mt-2 h-6 w-24" />
    </SkeletonCard>
  );
}

/** A row of `count` stat tiles. */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonTile key={i} />
      ))}
    </div>
  );
}

/** A titled card with a few body lines. */
export function SkeletonPanel({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <SkeletonCard className={className}>
      <SkeletonBlock className="h-4 w-40" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonBlock key={i} className="h-8 w-full" />
        ))}
      </div>
    </SkeletonCard>
  );
}

/** Chart-shaped placeholder: title, plot area, axis ticks. */
export function SkeletonChart({ height = "h-64" }: { height?: string }) {
  return (
    <SkeletonCard>
      <SkeletonBlock className="h-4 w-44" />
      <SkeletonBlock className={`mt-3 w-full ${height}`} />
      <div className="mt-3 flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonBlock key={i} className="h-3 w-10" />
        ))}
      </div>
    </SkeletonCard>
  );
}

/**
 * Announce loading to screen readers once, politely — the visual skeletons
 * are aria-hidden, so without this the change is silent.
 */
export function SkeletonAnnounce({ what }: { what: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {`Loading your ${what}…`}
    </p>
  );
}
