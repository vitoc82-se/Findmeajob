// Structured facts about a job, read from the source's own payload (stored in
// Job.raw). Arbetsförmedlingen classifies every ad with the national occupation
// taxonomy and many requirement fields; these are far more reliable than guessing
// from the text, and they are free. Missing fields are simply undefined.
export interface JobFeatures {
  occupation?: string; // e.g. "Lagerarbetare/Terminalarbetare"
  occupationId?: string;
  group?: string; // occupation group, e.g. "Lager- och terminalpersonal"
  groupId?: string;
  ssyk?: string; // 4-digit SSYK code of the group (first digit: 1 = managers)
  field?: string; // occupation field, e.g. "Transport, distribution, lager"
  fieldId?: string;
  experienceRequired?: boolean;
  licenseRequired?: boolean;
  licenses?: string[];
  hours?: string; // "Heltid" | "Deltid"
  employmentType?: string;
  workplaceModel?: string; // on site / remote / hybrid
  mustSkills?: string[];
  mustEducation?: string[];
  mustExperience?: string[];
  relevance?: number; // the source's own keyword relevance (JobSearch only)
  lat?: number;
  lon?: number;
  publishedAt?: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const labels = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(obj(x)?.label)).filter((x): x is string => Boolean(x)) : [];

export function extractFeatures(raw: unknown): JobFeatures {
  const r = obj(raw);
  if (!r) return {};
  const occ = obj(r.occupation);
  const grp = obj(r.occupation_group);
  const fld = obj(r.occupation_field);
  const must = obj(r.must_have);
  const addr = obj(r.workplace_address) ?? obj(Array.isArray(r.workplace_addresses) ? r.workplace_addresses[0] : undefined);
  const coords = Array.isArray(addr?.coordinates) ? (addr!.coordinates as unknown[]) : undefined;
  const ssykRaw = grp?.legacy_ams_taxonomy_id;

  return {
    occupation: str(occ?.label),
    occupationId: str(occ?.concept_id),
    group: str(grp?.label),
    groupId: str(grp?.concept_id),
    ssyk: typeof ssykRaw === "string" || typeof ssykRaw === "number" ? String(ssykRaw) : undefined,
    field: str(fld?.label),
    fieldId: str(fld?.concept_id),
    experienceRequired: typeof r.experience_required === "boolean" ? r.experience_required : undefined,
    licenseRequired: typeof r.driving_license_required === "boolean" ? r.driving_license_required : undefined,
    licenses: labels(r.driving_license),
    hours: str(obj(r.working_hours_type)?.label),
    employmentType: str(obj(r.employment_type)?.label),
    workplaceModel: str(obj(r.workplace_model)?.label),
    mustSkills: labels(must?.skills),
    mustEducation: labels(must?.education),
    mustExperience: labels(must?.work_experiences),
    relevance: typeof r.relevance === "number" ? r.relevance : undefined,
    // GeoJSON order is [longitude, latitude]
    lon: typeof coords?.[0] === "number" ? (coords[0] as number) : undefined,
    lat: typeof coords?.[1] === "number" ? (coords[1] as number) : undefined,
    publishedAt: str(r.publication_date),
  };
}
