// "Växjö, Kronobergs län, Sverige" -> "Växjö"; several workplaces are kept
// ("Stockholm; Sandviken" -> "Stockholm, Sandviken"), capped so a card stays tidy.
export function shortLocation(loc: string | null | undefined): string {
  if (!loc) return "";
  const places = loc
    .split(";")
    .map((p) => p.split(",")[0]?.trim())
    .filter((p): p is string => Boolean(p));
  const unique = [...new Set(places)];
  const shown = unique.slice(0, 3).join(", ");
  return unique.length > 3 ? `${shown} +${unique.length - 3}` : shown;
}
