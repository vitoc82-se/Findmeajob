import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { CvContent } from "./matching/applyAssist";

// A clean, single-column CV/letter renderer built on pdf-lib (pure JS — reliable
// on serverless, no headless browser). Brand accent matches the app (#2f5bea).
// The design is deliberately restrained: strong name, hairline-separated sections,
// tight typography — "calm control, sharply executed" in PDF form.

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 50;
const ACCENT = rgb(0.184, 0.357, 0.918); // #2f5bea
const INK = rgb(0.07, 0.07, 0.08);
const MUTED = rgb(0.42, 0.45, 0.5);
const HAIRLINE = rgb(0.88, 0.88, 0.89);

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number; // current pen top (content flows downward)
  font: PDFFont;
  bold: PDFFont;
  contentW: number;
}

// pdf-lib's StandardFonts use WinAnsi; exotic codepoints would throw. Transliterate
// the common typographic characters and drop anything still outside Latin-1 so a
// stray glyph can never 500 the download.
function safe(s: string): string {
  return (s ?? "")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/ /g, " ")
    .split("")
    .filter((ch) => ch.charCodeAt(0) <= 255)
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      cur = trial;
      continue;
    }
    if (cur) lines.push(cur);
    if (font.widthOfTextAtSize(w, size) > maxWidth) {
      // A single token longer than the line (e.g. a URL) — hard-break it.
      let chunk = "";
      for (const ch of w) {
        if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) chunk += ch;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      cur = chunk;
    } else {
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage(A4);
  ctx.y = A4[1] - MARGIN;
}

// Reserve a baseline for one line of `size`, adding a page if we'd overflow.
// Returns the baseline y to draw at.
function lineAt(ctx: Ctx, size: number): number {
  if (ctx.y - size * 1.35 < MARGIN) newPage(ctx);
  ctx.y -= size;
  const baseline = ctx.y;
  ctx.y -= size * 0.35;
  return baseline;
}

function paragraph(
  ctx: Ctx,
  text: string,
  opts: { x?: number; size?: number; font?: PDFFont; color?: RGB; maxWidth?: number } = {}
) {
  const x = opts.x ?? MARGIN;
  const size = opts.size ?? 9.5;
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? INK;
  const maxWidth = opts.maxWidth ?? ctx.contentW - (x - MARGIN);
  for (const line of wrap(text, font, size, maxWidth)) {
    const b = lineAt(ctx, size);
    ctx.page.drawText(line, { x, y: b, size, font, color });
  }
}

function bullet(ctx: Ctx, text: string, size = 9.5) {
  const x = MARGIN + 6;
  const textX = x + 11;
  const maxWidth = ctx.contentW - (textX - MARGIN);
  const lines = wrap(text, ctx.font, size, maxWidth);
  lines.forEach((line, i) => {
    const b = lineAt(ctx, size);
    if (i === 0) ctx.page.drawText("•", { x, y: b, size, font: ctx.font, color: ACCENT });
    ctx.page.drawText(line, { x: textX, y: b, size, font: ctx.font, color: INK });
  });
}

function sectionHeading(ctx: Ctx, label: string) {
  if (ctx.y - 30 < MARGIN) newPage(ctx);
  ctx.y -= 12;
  const b = lineAt(ctx, 9);
  ctx.page.drawText(safe(label).toUpperCase(), { x: MARGIN, y: b, size: 9, font: ctx.bold, color: ACCENT });
  ctx.y -= 3;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + ctx.contentW, y: ctx.y },
    thickness: 0.75,
    color: HAIRLINE,
  });
  ctx.y -= 6;
}

async function embedPhoto(doc: PDFDocument, photo?: Uint8Array) {
  if (!photo || photo.length < 4) return null;
  const isPng = photo[0] === 0x89 && photo[1] === 0x50;
  const isJpg = photo[0] === 0xff && photo[1] === 0xd8;
  try {
    if (isPng) return await doc.embedPng(photo);
    if (isJpg) return await doc.embedJpg(photo);
  } catch {
    return null; // a corrupt/unsupported image must not break the CV
  }
  return null;
}

// ---- CV ------------------------------------------------------------------

export async function renderCvPdf(cv: CvContent, photo?: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ctx: Ctx = { doc, page, y: A4[1] - MARGIN, font, bold, contentW: A4[0] - MARGIN * 2 };

  const img = await embedPhoto(doc, photo);
  const photoBox = 84;
  const headerTextW = img ? ctx.contentW - photoBox - 16 : ctx.contentW;

  // Photo, top-right, aspect-fit inside a square with a hairline frame.
  if (img) {
    const scale = Math.min(photoBox / img.width, photoBox / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const boxX = A4[0] - MARGIN - photoBox;
    const boxY = A4[1] - MARGIN - photoBox;
    ctx.page.drawImage(img, { x: boxX + (photoBox - w) / 2, y: boxY + (photoBox - h) / 2, width: w, height: h });
    ctx.page.drawRectangle({ x: boxX, y: boxY, width: photoBox, height: photoBox, borderColor: HAIRLINE, borderWidth: 0.75 });
  }

  // Name + headline + contact.
  {
    const b = lineAt(ctx, 22);
    ctx.page.drawText(safe(cv.name), { x: MARGIN, y: b, size: 22, font: bold, color: INK });
  }
  if (cv.headline) {
    ctx.y -= 2;
    paragraph(ctx, cv.headline, { size: 11.5, color: MUTED, maxWidth: headerTextW });
  }
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.location, ...(cv.contact.links ?? [])]
    .filter(Boolean)
    .join("   ·   ");
  if (contact) {
    ctx.y -= 2;
    paragraph(ctx, contact, { size: 9, color: MUTED, maxWidth: headerTextW });
  }

  // Accent rule under the header — never above the photo's bottom edge.
  ctx.y -= 8;
  if (img) ctx.y = Math.min(ctx.y, A4[1] - MARGIN - photoBox - 8);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + ctx.contentW, y: ctx.y },
    thickness: 1.5,
    color: ACCENT,
  });
  ctx.y -= 6;

  if (cv.summary) {
    sectionHeading(ctx, "Summary");
    paragraph(ctx, cv.summary, { size: 9.5, color: INK });
  }

  if (cv.experience.length) {
    sectionHeading(ctx, "Experience");
    cv.experience.forEach((e, idx) => {
      if (idx > 0) ctx.y -= 4;
      const head = [e.role, e.employer].filter(Boolean).join("  —  ");
      const meta = [e.period, e.location].filter(Boolean).join(" · ");
      const b = lineAt(ctx, 10.5);
      ctx.page.drawText(safe(head), { x: MARGIN, y: b, size: 10.5, font: bold, color: INK });
      if (meta) {
        const mw = font.widthOfTextAtSize(safe(meta), 8.5);
        ctx.page.drawText(safe(meta), { x: MARGIN + ctx.contentW - mw, y: b, size: 8.5, font, color: MUTED });
      }
      ctx.y -= 2;
      for (const bl of e.bullets) bullet(ctx, bl);
    });
  }

  if (cv.skills.length) {
    sectionHeading(ctx, "Skills");
    paragraph(ctx, cv.skills.join("   ·   "), { size: 9.5, color: INK });
  }

  if (cv.education.length) {
    sectionHeading(ctx, "Education");
    cv.education.forEach((ed, idx) => {
      if (idx > 0) ctx.y -= 2;
      const head = [ed.qualification, ed.school].filter(Boolean).join("  —  ");
      const b = lineAt(ctx, 10);
      ctx.page.drawText(safe(head), { x: MARGIN, y: b, size: 10, font: bold, color: INK });
      if (ed.period) {
        const mw = font.widthOfTextAtSize(safe(ed.period), 8.5);
        ctx.page.drawText(safe(ed.period), { x: MARGIN + ctx.contentW - mw, y: b, size: 8.5, font, color: MUTED });
      }
    });
  }

  if (cv.languages && cv.languages.length) {
    sectionHeading(ctx, "Languages");
    paragraph(ctx, cv.languages.join("   ·   "), { size: 9.5, color: INK });
  }

  return doc.save();
}

// ---- Plain-text fallback -------------------------------------------------

// Renders any plain text (a heading + body, newlines preserved) into a tidy PDF.
// Used for ApplyDocs generated before structured CVs existed — so their download
// still works without a regenerate.
export async function renderTextPdf(heading: string, body: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ctx: Ctx = { doc, page, y: A4[1] - MARGIN, font, bold, contentW: A4[0] - MARGIN * 2 };

  {
    const b = lineAt(ctx, 16);
    ctx.page.drawText(safe(heading), { x: MARGIN, y: b, size: 16, font: bold, color: INK });
  }
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + ctx.contentW, y: ctx.y },
    thickness: 1.5,
    color: ACCENT,
  });
  ctx.y -= 8;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      ctx.y -= 5;
      continue;
    }
    paragraph(ctx, line, { size: 10, color: INK });
  }
  return doc.save();
}

// ---- Cover letter --------------------------------------------------------

export async function renderLetterPdf(
  cv: CvContent,
  letter: string,
  language: "sv" | "en"
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(A4);
  const ctx: Ctx = { doc, page, y: A4[1] - MARGIN, font, bold, contentW: A4[0] - MARGIN * 2 };

  // Letterhead: name + contact, mirroring the CV for a consistent set.
  {
    const b = lineAt(ctx, 16);
    ctx.page.drawText(safe(cv.name), { x: MARGIN, y: b, size: 16, font: bold, color: INK });
  }
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.location]
    .filter(Boolean)
    .join("   ·   ");
  if (contact) {
    ctx.y -= 1;
    paragraph(ctx, contact, { size: 9, color: MUTED });
  }

  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + ctx.contentW, y: ctx.y },
    thickness: 1.5,
    color: ACCENT,
  });
  ctx.y -= 10;

  // Date, right-aligned.
  const dateStr = new Date().toLocaleDateString(language === "sv" ? "sv-SE" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  {
    const b = lineAt(ctx, 9.5);
    const w = font.widthOfTextAtSize(safe(dateStr), 9.5);
    ctx.page.drawText(safe(dateStr), { x: MARGIN + ctx.contentW - w, y: b, size: 9.5, font, color: MUTED });
  }
  ctx.y -= 8;

  // Body — preserve the model's paragraph breaks, wrap within each.
  const paras = letter.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  paras.forEach((p, i) => {
    if (i > 0) ctx.y -= 8;
    paragraph(ctx, p, { size: 10.5, color: INK });
  });

  return doc.save();
}
