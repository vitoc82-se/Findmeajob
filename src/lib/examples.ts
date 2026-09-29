// The example searches offered as one-tap chips on the landing page. Shared with
// the nightly prewarm job so exactly these searches are already cached when
// someone taps one.
export const EXAMPLE_QUERIES: Record<"sv" | "en", string[]> = {
  sv: ["Projektledare", "Sjuksköterska", "Lagerarbetare", "Utvecklare", "Säljare", "Ekonomi"],
  en: ["Project manager", "Nurse", "Warehouse", "Developer", "Sales", "Accounting"],
};
