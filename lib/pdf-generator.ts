import { jsPDF } from "jspdf";

type Token = { text: string; bold: boolean };

const CCB_GREEN: [number, number, number] = [26, 58, 42]; // #1a3a2a
const TEXT_COLOR: [number, number, number] = [31, 41, 55];
const MUTED_COLOR: [number, number, number] = [120, 120, 120];
const BORDER_COLOR: [number, number, number] = [220, 220, 220];
const ROW_ALT_COLOR: [number, number, number] = [240, 245, 240]; // #f0f5f0

const MARGIN = 20;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 24;

const FONT_NORMAL = 11;
const FONT_SUBTITLE = 13;
const FONT_TITLE = 16;
const LINE_HEIGHT = 6;

function splitInlineBold(line: string): Token[] {
  return line
    .split(/\*\*(.+?)\*\*/g)
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((t) => t.text.length > 0);
}

function wordsFromTokens(tokens: Token[]): Token[] {
  const words: Token[] = [];
  for (const t of tokens) {
    for (const w of t.text.split(/\s+/).filter(Boolean)) words.push({ text: w, bold: t.bold });
  }
  return words;
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

class PdfWriter {
  doc: jsPDF;
  y: number;
  dense: boolean;

  constructor(dense = false) {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.y = MARGIN;
    this.dense = dense;
  }

  private ensureSpace(lineHeight: number) {
    if (this.y + lineHeight > BOTTOM_LIMIT) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  private wrappedLine(words: Token[], startX: number, fontSize: number, lineHeight: number) {
    this.doc.setFontSize(fontSize);
    let x = startX;
    let started = false;
    this.ensureSpace(lineHeight);
    for (const w of words) {
      this.doc.setFont("helvetica", w.bold ? "bold" : "normal");
      const wordWidth = this.doc.getTextWidth(`${w.text} `);
      if (x + wordWidth > MARGIN + CONTENT_W && started) {
        this.y += lineHeight;
        this.ensureSpace(lineHeight);
        x = startX;
        started = false;
      }
      this.doc.setTextColor(...(w.bold ? CCB_GREEN : TEXT_COLOR));
      this.doc.text(w.text, x, this.y);
      x += wordWidth;
      started = true;
    }
    this.y += lineHeight;
  }

  paragraph(line: string) {
    this.wrappedLine(wordsFromTokens(splitInlineBold(line)), MARGIN, FONT_NORMAL, LINE_HEIGHT);
  }

  bullet(line: string) {
    this.doc.setFontSize(FONT_NORMAL);
    this.doc.setFont("helvetica", "normal");
    this.ensureSpace(LINE_HEIGHT);
    this.doc.setTextColor(...CCB_GREEN);
    this.doc.text("•", MARGIN + 1, this.y);
    this.wrappedLine(wordsFromTokens(splitInlineBold(line)), MARGIN + 6, FONT_NORMAL, LINE_HEIGHT);
  }

  heading(text: string, level: 1 | 2 | 3) {
    const sizes = { 1: FONT_TITLE, 2: FONT_SUBTITLE, 3: FONT_SUBTITLE };
    const gapBefore = { 1: 7, 2: 5.5, 3: 4.5 };
    const lineHeight = { 1: 8.5, 2: 7, 3: 7 };
    this.y += gapBefore[level];
    this.ensureSpace(lineHeight[level]);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(sizes[level]);
    this.doc.setTextColor(...CCB_GREEN);
    this.doc.text(text.replace(/\*\*/g, ""), MARGIN, this.y);
    this.y += lineHeight[level];
  }

  hr() {
    this.y += 2;
    this.ensureSpace(4);
    this.doc.setDrawColor(...BORDER_COLOR);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 4;
  }

  spacer(h: number) {
    this.y += h;
  }

  table(rows: string[][]) {
    if (!rows.length) return;
    const cols = rows[0].length;
    const colWidth = CONTENT_W / cols;
    const cellPadding = this.dense ? 0.8 : 1.5;
    const lineHeight = this.dense ? 3.6 : 4.5;
    const fontSize = this.dense ? 8 : 9;

    this.doc.setFontSize(fontSize);
    rows.forEach((row, rIdx) => {
      this.doc.setFont("helvetica", rIdx === 0 ? "bold" : "normal");
      const cellLines = row.map((cell) => this.doc.splitTextToSize(cell, colWidth - cellPadding * 2) as string[]);
      const maxLines = Math.max(...cellLines.map((l) => l.length), 1);
      const rowHeight = maxLines * lineHeight + cellPadding * 2;
      this.ensureSpace(rowHeight);

      let x = MARGIN;
      row.forEach((_, cIdx) => {
        if (rIdx === 0) {
          this.doc.setFillColor(...CCB_GREEN);
          this.doc.setTextColor(255, 255, 255);
        } else {
          if (rIdx % 2 === 0) this.doc.setFillColor(...ROW_ALT_COLOR);
          else this.doc.setFillColor(255, 255, 255);
          this.doc.setTextColor(...TEXT_COLOR);
        }
        this.doc.setDrawColor(...BORDER_COLOR);
        this.doc.rect(x, this.y, colWidth, rowHeight, "FD");
        this.doc.text(cellLines[cIdx], x + cellPadding, this.y + cellPadding + (this.dense ? 2.4 : 3));
        x += colWidth;
      });
      this.y += rowHeight;
    });
    this.doc.setTextColor(...TEXT_COLOR);
  }
}

/**
 * Estándar de PDF de la Escuela de Golf CCB. Toda generación de PDF de la app
 * (notas, programación, análisis de Paco, reportes) pasa por esta función.
 */
export function generateCCBPdf(markdown: string, options?: { documentName?: string; filenamePrefix?: string; dense?: boolean }) {
  const writer = new PdfWriter(!!options?.dense);
  const doc = writer.doc;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_TITLE);
  doc.setTextColor(...CCB_GREEN);
  doc.text("Escuela de Golf CCB", MARGIN, 20);

  doc.setDrawColor(...CCB_GREEN);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 25, PAGE_W - MARGIN, 25);

  const fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  if (options?.documentName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SUBTITLE);
    doc.setTextColor(...TEXT_COLOR);
    doc.text(options.documentName, MARGIN, 33);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  doc.text(`Generado el ${fecha}`, PAGE_W - MARGIN, 33, { align: "right" });

  writer.y = options?.documentName ? 42 : 34;

  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i].trimEnd())) {
        tableLines.push(lines[i].trimEnd());
        i++;
      }
      writer.table(tableLines.filter((l) => !isTableSeparator(l)).map(parseTableRow));
      writer.spacer(4);
      continue;
    }
    if (/^###\s+/.test(line)) {
      writer.heading(line.replace(/^###\s+/, ""), 3);
    } else if (/^##\s+/.test(line)) {
      writer.heading(line.replace(/^##\s+/, ""), 2);
    } else if (/^#\s+/.test(line)) {
      writer.heading(line.replace(/^#\s+/, ""), 1);
    } else if (/^\s*[-*]\s+/.test(line)) {
      writer.bullet(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^\s*\d+\.\s+/.test(line)) {
      writer.bullet(line.replace(/^\s*\d+\.\s+/, ""));
    } else if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      writer.hr();
    } else if (line.trim().length === 0) {
      writer.spacer(3);
    } else {
      writer.paragraph(line);
    }
    i++;
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...CCB_GREEN);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PAGE_H - 16, PAGE_W - MARGIN, PAGE_H - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("Paco — Asesor de Golf CCB", MARGIN, PAGE_H - 10);
    doc.text(`Página ${p} de ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const nameSource = options?.filenamePrefix ?? options?.documentName;
  const slug = nameSource ? `-${nameSource.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "";
  doc.save(`CCB${slug}-${fileDate}.pdf`);
}

export function shouldOfferPdf(content: string): boolean {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 300 || /^##\s+/m.test(content);
}
