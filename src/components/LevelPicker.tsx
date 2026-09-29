"use client";

import { useT } from "./LangProvider";
import { LEVELS, type Level } from "@/lib/matching/levels";

// "What level?" as a row of pills: one tap, optional, always visible next to the
// job title and place. The line under it explains the selected level in plain words,
// so nobody has to guess what "Senior" or "Chef" means here.
export default function LevelPicker({
  value,
  onChange,
  variant = "card",
}: {
  value: Level | "";
  onChange: (l: Level | "") => void;
  variant?: "card" | "hero";
}) {
  const t = useT();
  const options: Array<{ v: Level | ""; label: string; hint: string }> = [
    { v: "", label: t.lvAll, hint: t.lvHintAll },
    { v: "junior", label: t.lvJunior, hint: t.lvHintJunior },
    { v: "mid", label: t.lvMid, hint: t.lvHintMid },
    { v: "senior", label: t.lvSenior, hint: t.lvHintSenior },
    { v: "lead", label: t.lvLead, hint: t.lvHintLead },
  ];
  const current = options.find((o) => o.v === value) ?? options[0];
  // On the mint hero the pills are white; inside a white card they carry a mint border.
  const border = variant === "hero" ? "border-mint-border" : "border-mint-border";

  return (
    <div role="radiogroup" aria-label={t.lvLabel}>
      <div className="text-sm font-semibold text-ink">
        {t.lvLabel} <span className="font-normal text-neutral-500">({t.lvOptional})</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.v === value;
          return (
            <button
              key={o.v || "all"}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.v)}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium ${
                on ? "border-brand bg-brand text-white" : `${border} bg-white text-ink hover:border-brand`
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-neutral-600" aria-live="polite">
        {current.hint}
      </p>
    </div>
  );
}

export function levelTag(t: ReturnType<typeof useT>, level: string | undefined): string | null {
  switch (level) {
    case "junior":
      return t.lvTagJunior;
    case "mid":
      return t.lvTagMid;
    case "senior":
      return t.lvTagSenior;
    case "lead":
      return t.lvTagLead;
    default:
      return null;
  }
}

export { LEVELS };
