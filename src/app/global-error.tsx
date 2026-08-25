"use client";

/**
 * The last line of defence: an error the root layout itself couldn't survive.
 * This replaces the whole document, so it ships its own <html> and its own
 * inline styles — no Tailwind, no fonts, nothing that could be the thing
 * that's broken.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.4rem", margin: 0, color: "#fcd34d" }}>
            Till Payday didn&apos;t load properly.
          </h1>
          <p style={{ marginTop: ".75rem", lineHeight: 1.5, color: "#cbd5e1" }}>
            Your numbers are safe — nothing was changed or lost. This is the app
            failing to start, not your budget.
          </p>
          <div style={{ marginTop: "1.25rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <button
              onClick={reset}
              style={{
                background: "#10b981",
                color: "#020617",
                border: "none",
                borderRadius: ".5rem",
                padding: ".6rem 1rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                border: "1px solid #475569",
                color: "#cbd5e1",
                borderRadius: ".5rem",
                padding: ".6rem 1rem",
                textDecoration: "none",
              }}
            >
              Reload the app
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
