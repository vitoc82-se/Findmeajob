// Searches the nightly prewarm should have ready, on top of the landing-page chips.
// An ad that links straight to results (/try?q=Lagerarbetare&r=<regionId>&s=<level>)
// then opens in ~0.3 s instead of ~6.5 s. Edit this list to match what the running
// ads target; each entry costs one search a night. The link's q / r / s must match an
// entry exactly (same title wording, same region id, same level) to be a cache hit.
import { SWEDISH_REGIONS } from "./sources/regions";
import { EXAMPLE_QUERIES } from "./examples";
import type { Level } from "./matching/levels";

export interface PrewarmSearch {
  title: string;
  region?: string; // JobTech region id; omitted = all of Sweden
  level?: Level; // omitted = any level
}

const regionId = (label: string) => SWEDISH_REGIONS.find((r) => r.label === label)!.id;

// The three biggest job markets x the landing-page chips.
const BIG_REGIONS = ["Stockholms län", "Västra Götalands län", "Skåne län"].map(regionId);

// Add the exact title / region / level combinations the ads link to here.
const CAMPAIGN_EXTRA: PrewarmSearch[] = [];

export const PREWARM_SEARCHES: PrewarmSearch[] = [
  ...EXAMPLE_QUERIES.sv.map((title) => ({ title })),
  ...EXAMPLE_QUERIES.sv.flatMap((title) => BIG_REGIONS.map((region) => ({ title, region }))),
  ...CAMPAIGN_EXTRA,
];
