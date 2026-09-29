// Minimal sv/en i18n for the public surfaces (landing, /try, consent banner).
// Swedish is the default: the audience is Swedish job seekers, and most Swedes
// browse with an English phone locale, so Accept-Language is NOT a reliable
// signal. The visitor can switch with the header toggle; the choice is kept in a
// cookie so server components render the right language on the first paint.

export type Lang = "sv" | "en";
export const LANG_COOKIE = "fmaj-lang";
export const DEFAULT_LANG: Lang = "sv";

export function parseLang(v: string | undefined | null): Lang {
  return v === "en" || v === "sv" ? v : DEFAULT_LANG;
}

const sv = {
  // shell
  metaTitle: "Findmeajob — se vilka jobb du faktiskt matchar",
  metaDesc:
    "Skriv vilken typ av jobb du söker. Findmeajob går igenom riktiga annonser och rankar dem efter hur väl de passar dig, med en rad om varför.",
  signIn: "Logga in",
  privacy: "Integritet",
  consentBefore:
    "Vi använder cookies för att mäta vår annonsering så att vi kan nå fler jobbsökare. Du kan tacka nej, tjänsten fungerar ändå. Läs vår ",
  consentLink: "integritetspolicy",
  decline: "Avböj",
  accept: "Godkänn",

  // shared search bar
  qLabel: "Vilken typ av jobb söker du?",
  qPlaceholder: "t.ex. projektledare eller lagerarbetare",
  regionLabel: "Var?",
  allSweden: "Hela Sverige",
  remoteOnly: "Distans",
  searchBtn: "Visa mina träffar",
  tryLabel: "Testa med",

  // landing
  heroEyebrow: "Gratis · Inget konto",
  heroH1: "Se vilka jobb du faktiskt matchar.",
  heroSub:
    "Skriv vilken typ av jobb du söker. Vi går igenom riktiga annonser från Arbetsförmedlingen och fler källor, rankar dem och skriver en rad om varför varje jobb passar dig.",
  heroNote: "Klart på cirka en halv minut. Ingen registrering.",
  sampleLabel: "Exempel på resultat",
  sampleTag: "Exempel",
  s1Title: "Projektledare IT",
  s1Meta: "Exempelbolaget AB · Malmö",
  s1Why: "Starkt: du har lett leveransprojekt och jobbat agilt.",
  s2Title: "Produktägare",
  s2Meta: "Exempelverket · Lund",
  s2Why: "Passar din riktning, men branschen är ny för dig.",
  s3Title: "Verksamhetsutvecklare",
  s3Meta: "Exempelregionen · Distans",
  s3Why: "Delvis: processarbete stämmer, mindre ledarerfarenhet än de vill ha.",
  howLabel: "Så funkar det",
  h1t: "Berätta vad du söker",
  h1d: "En jobbtitel räcker. Lägg till ditt CV om du vill ha vassare träffar. Vi läser det och sparar det aldrig.",
  h2t: "Vi gör sökningen",
  h2d: "Vi hämtar riktiga annonser från Arbetsförmedlingen och andra källor och tar bort dubbletter.",
  h3t: "Rangordnat, med skäl",
  h3d: "De bästa först. Varje träff har en rad om varför den passar och vad som saknas.",
  trust1: "Vi sparar inte ditt CV",
  trust2: "Inget konto för att prova",
  trust3: "Riktiga annonser från Arbetsförmedlingen m.fl.",
  finalH: "Se dina träffar på en halv minut.",
  finalCta: "Prova gratis",
  footerFree: "Findmeajob · Gratis att använda ·",

  // /try
  cvToggle: "Lägg till ditt CV för vassare träffar",
  cvToggleDone: "CV inläst",
  cvOptional: "valfritt",
  cvUpload: "Ladda upp CV (PDF)",
  cvRemove: "ta bort",
  cvPaste: "…eller klistra in texten här",
  cvPastePlaceholder: "Klistra in ditt CV eller beskriv din bakgrund.",
  cvPrivacy: "Läses, tolkas och kastas. Sparas aldrig.",
  cvApply: "Läs mitt CV och sök om",
  cvRolesLabel: "Roller vi hittade i ditt CV",
  needQuery: "Skriv vilken typ av jobb du söker, eller lägg till ditt CV.",
  searchAgain: "Uppdatera träffar",
  resultsLabel: "Dina bästa träffar",
  matchesCount: "{n} träffar",
  noResults: "Inga träffar för den här sökningen. Prova en annan titel eller bredda platsen.",
  saveCta: "Spara jobbet och få skräddarsytt CV + brev",
  moreWaiting: "{n} träffar till väntar",
  moreBody:
    "Skapa ett gratis konto för att se alla träffar, spara jobb, få ett skräddarsytt CV och personligt brev för varje jobb, och ett dagligt mejl med nya jobb.",
  signupSeeAll: "Skapa konto och se alla {n}",
  signupNote: "Gratis. Tar några sekunder.",
  likeIt: "Gillar du det du ser?",
  likeBody:
    "Skapa ett gratis konto för att spara jobben, få ett skräddarsytt CV och personligt brev för varje jobb, och ett dagligt mejl med nya träffar.",
  signupFree: "Skapa gratis konto",
  haveAccount: "Har du redan ett konto?",
  limitCta: "Skapa gratis konto, inga begränsningar",
  errGeneric: "Något gick fel. Försök igen om en stund.",
  errLimit: "Du har nått gränsen för gratis förhandsvisning. Skapa ett gratis konto för att fortsätta, eller försök igen om en stund.",
  errCv: "Vi kunde inte läsa ditt CV. Prova att klistra in texten istället.",
  warnSources: "Några källor svarade inte just nu, så listan kan vara ofullständig.",

  // progress
  parseEyebrow: "Läser ditt CV",
  parseTitle: "Vi går igenom ditt CV",
  parseTail: "Det tar cirka 15 sekunder.",
  searchEyebrow: "Söker jobb",
  searchTitle: "Letar efter dina bästa träffar",
  searchTail: "Vi söker i flera källor och rankar varje jobb mot din profil. Det kan ta upp till en halv minut.",
  p0: "Söker bland svenska jobbkällor…",
  p1: "Samlar jobb som passar dig…",
  p2: "Tar bort dubbletter…",
  p3: "Rankar dina bästa träffar…",
  p4: "Sätter ihop din lista…",
  c0: "Läser ditt CV…",
  c1: "Plockar ut din erfarenhet…",
  c2: "Hittar dina färdigheter…",
  c3: "Tar reda på vilka roller som passar…",
  c4: "Bygger din sökprofil…",
};

export type Dict = Record<keyof typeof sv, string>;

const en: Dict = {
  metaTitle: "Findmeajob — get matched, stop scrolling",
  metaDesc:
    "Tell Findmeajob what kind of job you want. It searches real job sources and ranks the roles that actually fit you, with a note on why.",
  signIn: "Sign in",
  privacy: "Privacy",
  consentBefore:
    "We use cookies to measure our advertising so we can reach more job seekers. You can decline, the app works either way. See our ",
  consentLink: "privacy policy",
  decline: "Decline",
  accept: "Accept",

  qLabel: "What kind of job are you looking for?",
  qPlaceholder: "e.g. project manager or nurse",
  regionLabel: "Where?",
  allSweden: "All of Sweden",
  remoteOnly: "Remote",
  searchBtn: "Show my matches",
  tryLabel: "Try",

  heroEyebrow: "Free · No account",
  heroH1: "See which jobs you actually match.",
  heroSub:
    "Tell us what kind of job you want. We go through real listings from Arbetsförmedlingen and more, rank them, and write a line on why each one fits you.",
  heroNote: "Takes about half a minute. No sign-up.",
  sampleLabel: "Example result",
  sampleTag: "Example",
  s1Title: "IT Project Manager",
  s1Meta: "Example Company AB · Malmö",
  s1Why: "Strong: you've led delivery projects and worked agile.",
  s2Title: "Product Owner",
  s2Meta: "Example Agency · Lund",
  s2Why: "Fits your direction, but the industry is new to you.",
  s3Title: "Business Developer",
  s3Meta: "Example Region · Remote",
  s3Why: "Partial: process work fits, less leadership than they want.",
  howLabel: "How it works",
  h1t: "Say what you're after",
  h1d: "A job title is enough. Add your CV for sharper matches. We read it and never keep it.",
  h2t: "We do the searching",
  h2d: "We pull real listings from Arbetsförmedlingen and other sources and remove duplicates.",
  h3t: "Ranked, with reasons",
  h3d: "Best fits first. Each match has a line on why it fits and what's missing.",
  trust1: "We don't store your CV",
  trust2: "No account needed to try",
  trust3: "Real listings from Arbetsförmedlingen and more",
  finalH: "See your matches in half a minute.",
  finalCta: "Try it free",
  footerFree: "Findmeajob · Free to use ·",

  cvToggle: "Add your CV for sharper matches",
  cvToggleDone: "CV read",
  cvOptional: "optional",
  cvUpload: "Upload CV (PDF)",
  cvRemove: "remove",
  cvPaste: "…or paste the text here",
  cvPastePlaceholder: "Paste your CV or describe your background.",
  cvPrivacy: "Read, parsed and discarded. Never stored.",
  cvApply: "Read my CV and search again",
  cvRolesLabel: "Roles we found in your CV",
  needQuery: "Type what kind of job you're after, or add your CV.",
  searchAgain: "Update matches",
  resultsLabel: "Your best matches",
  matchesCount: "{n} matches",
  noResults: "No matches for this search. Try a different title or widen the location.",
  saveCta: "Save this job and get a tailored CV + letter",
  moreWaiting: "{n} more matches waiting",
  moreBody:
    "Create a free account to see every match, save jobs, get a tailored CV and cover letter for each, and a daily email of new roles.",
  signupSeeAll: "Sign up and see all {n}",
  signupNote: "Free. Takes a few seconds.",
  likeIt: "Like what you see?",
  likeBody:
    "Create a free account to save these jobs, get a tailored CV and cover letter for each, and a daily email of new matches.",
  signupFree: "Create free account",
  haveAccount: "Already have an account?",
  limitCta: "Sign up free, no limits",
  errGeneric: "Something went wrong. Please try again in a moment.",
  errLimit: "You've hit the free preview limit. Create a free account to keep going, or try again in a while.",
  errCv: "We couldn't read your CV. Try pasting the text instead.",
  warnSources: "Some sources didn't respond just now, so the list may be incomplete.",

  parseEyebrow: "Reading your CV",
  parseTitle: "Making sense of your CV",
  parseTail: "This takes about 15 seconds.",
  searchEyebrow: "Finding jobs",
  searchTitle: "Finding your best matches",
  searchTail: "Searching multiple sources and ranking every role against your profile. This can take up to half a minute.",
  p0: "Searching Swedish job sources…",
  p1: "Gathering roles that match you…",
  p2: "Removing duplicate postings…",
  p3: "Ranking your best matches…",
  p4: "Putting your list together…",
  c0: "Reading your CV…",
  c1: "Pulling out your experience…",
  c2: "Spotting your skills…",
  c3: "Working out the roles that fit you…",
  c4: "Building your job-search profile…",
};

export const DICTS: Record<Lang, Dict> = { sv, en };

export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
