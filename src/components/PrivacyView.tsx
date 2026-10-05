"use client";

import Link from "next/link";
import { useLang } from "@/components/LangProvider";

const LAST_UPDATED = { sv: "29 september 2026", en: "29 September 2026" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600">{children}</div>
    </section>
  );
}

function English() {
  return (
    <main lang="en" className="mx-auto max-w-2xl px-5 py-14 sm:px-6">
      <p className="text-sm font-semibold text-brand">Privacy</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-neutral-500">Last updated {LAST_UPDATED.en}</p>

      <p className="mt-6 text-sm leading-relaxed text-neutral-600">
        Findmeajob helps you find jobs that fit your experience. This policy explains what data
        we collect, why, who processes it on our behalf, and the rights you have under the EU
        General Data Protection Regulation (GDPR). We collect only what the service needs, and we
        never sell your data.
      </p>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Your CV and job intent.</strong> When you paste your CV
            or upload a PDF, we extract the text to understand your experience. If you upload a
            PDF, the file is parsed in memory and <strong>never stored</strong> — only the
            extracted text and the structured profile derived from it are saved.
          </li>
          <li>
            <strong className="text-ink">Your search preferences.</strong> The job titles,
            country, regions, and remote preference you choose, plus whether you&apos;ve turned on
            the daily email digest.
          </li>
          <li>
            <strong className="text-ink">Account information.</strong> Your email address and
            authentication details, handled by our sign-in provider (Clerk).
          </li>
          <li>
            <strong className="text-ink">Activity.</strong> The matches we generate for you, their
            status (saved, applied, dismissed), any tailored CVs and cover letters you generate,
            and basic counts of actions (searches, parses, applications) used for rate limiting.
          </li>
          <li>
            <strong className="text-ink">Visits without an account.</strong> If you try the service
            without signing up, we store a short-lived usage counter tied to your IP address, only
            to limit abuse and to see which steps visitors reach (for example “opened the search
            page”). The CV text or search you type is never stored with it. If you read a CV on the try page, your browser keeps it on your own device for up to a day so it can follow you into a new account; it is never sent to us unless you sign up.
          </li>
          <li>
            <strong className="text-ink">Analytics.</strong> Aggregate, privacy-friendly usage
            measurement (page views, referrers, country) via Vercel Web Analytics, which does not
            use cookies. If you accept cookies, we also load the Meta (Facebook) advertising pixel
            — see “Cookies and advertising” below.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p>
          We use your CV and preferences to search real job sources and rank the roles that fit
          you, to generate tailored application documents when you ask for them, and — if you
          opt in — to send you a daily email of new strong matches. Activity counts are used only
          to keep the service fair (rate limiting) and to understand overall usage so we can
          improve the product.
        </p>
        <p>
          <strong className="text-ink">Legal basis.</strong> We process your CV and preferences to
          perform the service you asked for (contract). Advertising cookies are used only with
          your consent. Aggregate analytics rely on our legitimate interest in running and
          improving the service.
        </p>
      </Section>

      <Section title="Who processes your data">
        <p>We rely on a small number of trusted processors, each handling only what its function requires:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Clerk</strong> — account sign-in and authentication.</li>
          <li><strong className="text-ink">Neon</strong> — the database where your profile, preferences, and matches are stored (hosted in the EU where available).</li>
          <li><strong className="text-ink">Anthropic (Claude)</strong> — reads your CV text and job descriptions to parse your profile and rank matches, and to draft tailored application documents. Anthropic does not use this data to train its models.</li>
          <li><strong className="text-ink">Voyage AI</strong> — turns job and profile text into numeric embeddings used for matching.</li>
          <li><strong className="text-ink">Job sources</strong> — we send only your search terms (e.g. job titles, region) to public job APIs such as Arbetsförmedlingen (JobTech). We never send your CV or personal details to them.</li>
          <li><strong className="text-ink">Resend</strong> — delivers the daily digest email, if you enable it.</li>
          <li><strong className="text-ink">Vercel</strong> — hosts the application and provides cookieless analytics.</li>
          <li><strong className="text-ink">Meta</strong> — the advertising pixel, loaded only if you accept cookies.</li>
        </ul>
      </Section>

      <Section title="Cookies and advertising">
        <p>
          Findmeajob works fully without advertising cookies. We show a consent banner the first
          time you visit: if you accept, we load the Meta (Facebook) pixel to measure our
          advertising so we can reach more job seekers; if you decline, no advertising cookies are
          set and the app works exactly the same. You can change your mind by clearing the site&apos;s
          cookies in your browser. Vercel Web Analytics is cookieless and needs no consent.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          We keep your profile and preferences for as long as your account is active so the
          service can work for you. Job postings and matches are retained to power search and
          recall. Uploaded PDF files are never retained. If you ask us to delete your account, we
          remove your profile, preferences, matches, and generated documents.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you have the right to access, correct, export, or delete your personal
          data, to object to or restrict certain processing, and to withdraw consent at any time.
          You can turn off the daily digest from any digest email&apos;s unsubscribe link or in your
          settings. To exercise any other right, contact us using the details below and we&apos;ll
          respond within the timeframes the law requires. You also have the right to lodge a
          complaint with your data protection authority (in Sweden, the Integritetsskyddsmyndigheten,
          IMY).
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For any privacy question or request, email{" "}
          <a className="text-accent underline underline-offset-2" href="mailto:privacy@findmeajob.online">
            privacy@findmeajob.online
          </a>
          . We may update this policy as the service evolves; material changes will be reflected in
          the “last updated” date above.
        </p>
      </Section>

      <div className="mt-12 border-t border-neutral-200 pt-6 text-sm">
        <Link href="/" className="text-accent underline underline-offset-2">
          ← Back to Findmeajob
        </Link>
      </div>
    </main>
  );
}

function Swedish() {
  return (
    <main lang="sv" className="mx-auto max-w-2xl px-5 py-14 sm:px-6">
      <p className="text-sm font-semibold text-brand">Integritet</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">Integritetspolicy</h1>
      <p className="mt-3 text-sm text-neutral-500">Senast uppdaterad {LAST_UPDATED.sv}</p>

      <p className="mt-6 text-sm leading-relaxed text-neutral-600">
        Findmeajob hjälper dig hitta jobb som passar din erfarenhet. Här förklarar vi vilka uppgifter
        vi sparar, varför, vilka som hjälper oss att hantera dem och vilka rättigheter du har enligt
        dataskyddsförordningen (GDPR). Vi sparar bara det tjänsten behöver, och vi säljer aldrig
        dina uppgifter.
      </p>

      <Section title="Vad vi sparar">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-ink">Ditt CV och vad du söker.</strong> När du klistrar in ditt CV
            eller laddar upp en PDF läser vi texten för att förstå din erfarenhet. PDF-filen läses i
            minnet och <strong>sparas aldrig</strong>. Vi sparar bara den utlästa texten och den
            profil vi bygger av den.
          </li>
          <li>
            <strong className="text-ink">Dina sökinställningar.</strong> Jobbtitlar, land, regioner
            och om du vill ha distansjobb, och om du har slagit på mejlen med nya träffar.
          </li>
          <li>
            <strong className="text-ink">Kontouppgifter.</strong> Din mejladress och inloggning, som
            hanteras av vår inloggningstjänst (Clerk).
          </li>
          <li>
            <strong className="text-ink">Vad du gör i tjänsten.</strong> De träffar vi tar fram åt
            dig, om du sparat, sökt eller valt bort dem, CV och personliga brev du låtit oss skriva,
            samt hur många sökningar och ansökningar du gjort (för att kunna begränsa missbruk).
          </li>
          <li>
            <strong className="text-ink">Besök utan konto.</strong> Om du testar utan att skapa konto
            sparar vi en kortlivad räknare kopplad till din IP-adress. Den används bara för att
            stoppa missbruk och för att se hur långt besökare kommer (till exempel &quot;öppnade
            sökningen&quot;). Det du skriver in eller ditt CV sparas aldrig tillsammans med den. Om du läser in ett CV på testsidan sparar din webbläsare det på din egen enhet i upp till ett dygn, så att det följer med till ett nytt konto. Det skickas aldrig till oss om du inte skapar ett konto.
          </li>
          <li>
            <strong className="text-ink">Statistik.</strong> Vi mäter besök i sammanfattad form
            (sidvisningar, varifrån du kom, land) med Vercel Web Analytics, som inte använder cookies.
            Om du godkänner cookies laddar vi också Metas (Facebooks) annonspixel, se &quot;Cookies och
            annonsering&quot; nedan.
          </li>
        </ul>
      </Section>

      <Section title="Vad vi använder det till">
        <p>
          Vi använder ditt CV och dina inställningar för att söka bland riktiga annonser och sätta de
          som passar dig överst, för att skriva CV och personligt brev när du ber om det, och, om du
          vill, för att mejla dig när det kommer nya bra träffar. Räknarna över vad du gör använder
          vi bara för att hålla tjänsten rättvis och för att förstå hur den används så att vi kan
          göra den bättre.
        </p>
        <p>
          <strong className="text-ink">Rättslig grund.</strong> Vi behandlar ditt CV och dina
          inställningar för att kunna leverera tjänsten du bett om (avtal). Annonscookies används
          bara om du säger ja. Sammanfattad statistik bygger på vårt berättigade intresse av att
          driva och förbättra tjänsten.
        </p>
      </Section>

      <Section title="Vilka som hanterar uppgifterna åt oss">
        <p>Vi använder ett fåtal leverantörer, och var och en får bara det den behöver:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-ink">Clerk</strong>: inloggning och konton.</li>
          <li><strong className="text-ink">Neon</strong>: databasen där din profil, dina inställningar och dina träffar sparas (i EU när det går).</li>
          <li><strong className="text-ink">Anthropic (Claude)</strong>: läser ditt CV och jobbannonserna för att bygga din profil, ranka träffar och skriva utkast till ansökningar. Anthropic tränar inte sina modeller på de här uppgifterna.</li>
          <li><strong className="text-ink">Voyage AI</strong>: gör om text från annonser och profiler till tal som vi kan jämföra.</li>
          <li><strong className="text-ink">Jobbkällor</strong>: dit skickar vi bara dina sökord (till exempel jobbtitel och region), till öppna jobb-API:er som Arbetsförmedlingens JobTech. Vi skickar aldrig ditt CV eller personuppgifter dit.</li>
          <li><strong className="text-ink">Resend</strong>: skickar mejlen med nya träffar, om du slagit på dem.</li>
          <li><strong className="text-ink">Vercel</strong>: kör tjänsten och står för statistik utan cookies.</li>
          <li><strong className="text-ink">Meta</strong>: annonspixeln, som bara laddas om du godkänner cookies.</li>
        </ul>
      </Section>

      <Section title="Cookies och annonsering">
        <p>
          Findmeajob fungerar precis lika bra utan annonscookies. Första gången du besöker oss frågar
          vi. Säger du ja laddar vi Metas (Facebooks) pixel så att vi kan se hur vår annonsering
          fungerar och nå fler jobbsökare. Säger du nej sätts inga annonscookies och allt fungerar
          som vanligt. Du kan ändra dig genom att rensa sidans cookies i din webbläsare. Vercel Web
          Analytics använder inga cookies och behöver inget samtycke.
        </p>
      </Section>

      <Section title="Hur länge vi sparar">
        <p>
          Vi sparar din profil och dina inställningar så länge ditt konto finns, så att tjänsten kan
          jobba åt dig. Jobbannonser och träffar sparas för att sökningen ska bli bättre. Uppladdade
          PDF-filer sparas aldrig. Om du ber oss ta bort ditt konto raderar vi din profil, dina
          inställningar, dina träffar och de dokument vi skrivit åt dig.
        </p>
      </Section>

      <Section title="Dina rättigheter">
        <p>
          Enligt GDPR har du rätt att se, rätta, hämta ut och radera dina personuppgifter, att
          invända mot eller begränsa viss behandling och att ta tillbaka ett samtycke när som helst.
          Du kan stänga av mejlen via länken längst ned i varje mejl eller i appen. För allt annat
          kan du kontakta oss på adressen nedan, så svarar vi inom den tid lagen kräver. Du har också
          rätt att klaga hos Integritetsskyddsmyndigheten (IMY).
        </p>
      </Section>

      <Section title="Kontakt">
        <p>
          Har du frågor om integritet eller vill använda dina rättigheter, mejla{" "}
          <a className="text-accent underline underline-offset-2" href="mailto:privacy@findmeajob.online">
            privacy@findmeajob.online
          </a>
          . Ändrar vi något väsentligt uppdaterar vi datumet högst upp.
        </p>
      </Section>

      <div className="mt-12 border-t border-neutral-200 pt-6 text-sm">
        <Link href="/" className="text-accent underline underline-offset-2">
          ← Tillbaka till Findmeajob
        </Link>
      </div>
    </main>
  );
}

export default function PrivacyView() {
  return useLang() === "sv" ? <Swedish /> : <English />;
}
