import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ResumeData } from "../../shared/resume";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;

function sanitize(text: string): string {
  // WinAnsi-safe replacement for common Unicode punctuation
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "\u2022")
    .replace(/[\u2028\u2029]/g, " ")
    // strip anything outside Latin-1 after the above
    .replace(/[^\x09\x0A\x0D\x20-\xFF\u2022]/g, "");
}

export async function buildResumePdf(data: ResumeData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Resume - ${data.owner}`);
  doc.setProducer("GradLaunch");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;
  const size = 10.5;
  const lh = size * 1.45;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };

  const wrap = (text: string, f: typeof font, sz: number, maxW: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(test, sz) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawText = (text: string, opts?: { font?: typeof font; size?: number; gap?: number; color?: [number, number, number] }) => {
    const f = opts?.font ?? font;
    const sz = opts?.size ?? size;
    const lines = wrap(text, f, sz, width);
    for (const line of lines) {
      newPageIfNeeded(lh);
      page.drawText(line, { x: MARGIN, y: y - sz, size: sz, font: f, color: rgb(0.1, 0.12, 0.16) });
      y -= lh;
    }
    if (opts?.gap) y -= opts.gap;
  };

  const sectionHeading = (label: string) => {
    newPageIfNeeded(lh * 2);
    y -= 6;
    page.drawText(label.toUpperCase(), {
      x: MARGIN, y: y - 11, size: 11.5, font: bold, color: rgb(0.09, 0.23, 0.5)
    });
    y -= 16;
    page.drawLine({
      start: { x: MARGIN, y: y + 2 },
      end: { x: MARGIN + width, y: y + 2 },
      thickness: 0.75,
      color: rgb(0.55, 0.63, 0.75)
    });
    y -= 8;
  };

  // Header
  drawText(data.owner.toUpperCase(), { font: bold, size: 20 });
  if (data.headline) drawText(data.headline, { size: 11.5 });
  const contactBits = [data.email, data.phone, data.location].filter(Boolean);
  if (contactBits.length) drawText(contactBits.join("  |  "), { size: 9.5 });
  if (data.links.length) drawText(data.links.join("  |  "), { size: 9.5, gap: 2 });

  if (data.summary) {
    sectionHeading("Summary");
    drawText(data.summary);
  }

  if (data.education.length) {
    sectionHeading("Education");
    for (const ed of data.education) {
      const left = [ed.degree, ed.institution].filter(Boolean).join(" \u2014 ");
      drawText(left + (ed.period ? ` (${ed.period})` : ""), { font: bold, size: 10.5 });
      if (ed.details) drawText(ed.details, { size: 9.5 });
      y -= 2;
    }
  }

  if (data.skills.length) {
    sectionHeading("Skills");
    drawText(data.skills.join("  \u2022  "));
  }

  if (data.experience.length) {
    sectionHeading("Experience");
    for (const ex of data.experience) {
      drawText([ex.role, ex.company].filter(Boolean).join(" \u2014 ") + (ex.period ? ` (${ex.period})` : ""), { font: bold, size: 10.5 });
      for (const b of ex.bullets) {
        newPageIfNeeded(lh);
        page.drawText("\u2022", { x: MARGIN + 2, y: y - size, size, font, color: rgb(0.1, 0.12, 0.16) });
        const lines = wrap(b, font, size, width - 14);
        for (const line of lines) {
          page.drawText(line, { x: MARGIN + 14, y: y - size, size, font, color: rgb(0.1, 0.12, 0.16) });
          y -= lh;
        }
      }
      y -= 3;
    }
  }

  if (data.projects.length) {
    sectionHeading("Projects");
    for (const p of data.projects) {
      drawText([p.name, p.tech].filter(Boolean).join(" | "), { font: bold, size: 10.5 });
      for (const b of p.bullets) {
        newPageIfNeeded(lh);
        page.drawText("\u2022", { x: MARGIN + 2, y: y - size, size, font, color: rgb(0.1, 0.12, 0.16) });
        const lines = wrap(b, font, size, width - 14);
        for (const line of lines) {
          page.drawText(line, { x: MARGIN + 14, y: y - size, size, font, color: rgb(0.1, 0.12, 0.16) });
          y -= lh;
        }
      }
      y -= 3;
    }
  }

  return await doc.save();
}

/** Extracts raw text from a PDF buffer using pdfjs-dist (legacy Node build). */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Run the worker on the main thread (Node has no DOM Worker); pdf.js picks
  // this up via its main-thread worker message handler hook.
  try {
    (globalThis as any).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  } catch {
    /* fall through: some builds resolve the worker themselves */
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false
  }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    const items = content.items as any[];
    for (const it of items) {
      if (typeof it.str !== "string") continue;
      const y = it.transform?.[5] ?? 0;
      if (!it.str) continue;
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      else if (text.length && !text.endsWith("\n")) text += " ";
      text += it.str;
      lastY = y;
    }
    text += "\n\n";
  }
  return { text: text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), pages: doc.numPages };
}
