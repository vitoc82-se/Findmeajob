import { extractText, getDocumentProxy } from "unpdf";

// Extract plain text from a PDF's bytes, entirely in memory. The caller passes
// an ArrayBuffer from the upload; nothing is written to disk. unpdf is a
// serverless-friendly wrapper over pdf.js (no filesystem, no native canvas),
// so it runs fine on Vercel's Node runtime.
export async function extractPdfText(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  // mergePages:true -> `text` is a single string of the whole document.
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}
