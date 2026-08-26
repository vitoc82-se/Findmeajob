import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Findmeajob",
  description:
    "How Findmeajob collects, uses, and protects your data, the processors we rely on, and your rights under the GDPR.",
};

// Last substantive update to this policy. Bump when the data practices change.
const LAST_UPDATED = "26 August 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">Privacy</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-neutral-500">Last updated {LAST_UPDATED}</p>

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
