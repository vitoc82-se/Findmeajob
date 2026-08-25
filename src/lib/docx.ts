import { Document, Packer, Paragraph, HeadingLevel } from "docx";

// Turn plain text (with newlines) into a simple .docx buffer. Not fancy
// formatting — a clean, editable document the user can submit or refine.
export async function textToDocx(title: string, text: string): Promise<Buffer> {
  const body = text.split(/\r?\n/).map(
    (line) => new Paragraph({ text: line })
  );
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          ...body,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
