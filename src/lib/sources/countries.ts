// Selectable job markets. "se" is served by JobTech; the rest by Adzuna (when
// configured). Remote sources cover every market. This list is the single
// source of truth for the UI picker and server-side validation.
// When multi-user lands, the chosen country moves from the request into the
// user's saved preferences — nothing else changes.

export interface Country {
  code: string;
  label: string;
}

export const COUNTRIES: Country[] = [
  { code: "se", label: "Sweden" },
  { code: "gb", label: "United Kingdom" },
  { code: "de", label: "Germany" },
  { code: "nl", label: "Netherlands" },
  { code: "fr", label: "France" },
  { code: "at", label: "Austria" },
  { code: "pl", label: "Poland" },
  { code: "es", label: "Spain" },
  { code: "it", label: "Italy" },
  { code: "us", label: "United States" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "nz", label: "New Zealand" },
  { code: "in", label: "India" },
  { code: "sg", label: "Singapore" },
  { code: "za", label: "South Africa" },
  { code: "br", label: "Brazil" },
  { code: "mx", label: "Mexico" },
];

export const DEFAULT_COUNTRY = "se";

const CODES = new Set(COUNTRIES.map((c) => c.code));

export function isValidCountry(code: string): boolean {
  return CODES.has(code);
}
