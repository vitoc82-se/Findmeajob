"use client";

// Last-resort boundary: renders when the root layout itself fails, so it cannot use
// the app's providers, fonts or Tailwind. Plain inline styles, both languages.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sv">
      <body style={{ margin: 0, background: "#FBF8F3", color: "#1D2B24", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "80px 24px" }}>
          <h1 style={{ fontSize: 34, margin: 0 }}>Något gick fel</h1>
          <p style={{ fontSize: 18, color: "#5B6B62" }}>
            Det var inte ditt fel. Försök igen om en stund. / Something went wrong. Please try again in a moment.
          </p>
          <button
            onClick={() => reset()}
            style={{ marginTop: 16, background: "#1E6B52", color: "#fff", border: 0, borderRadius: 999, padding: "14px 28px", fontSize: 17, fontWeight: 700, cursor: "pointer" }}
          >
            Försök igen / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
