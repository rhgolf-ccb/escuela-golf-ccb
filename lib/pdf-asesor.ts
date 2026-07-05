import { jsPDF } from "jspdf";

type Token = { text: string; bold: boolean };

const CCB_GREEN: [number, number, number] = [26, 58, 42];
const TEXT_COLOR: [number, number, number] = [31, 41, 55];
const MUTED_COLOR: [number, number, number] = [120, 120, 120];
const BORDER_COLOR: [number, number, number] = [220, 220, 220];

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 20;

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

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4" });
    this.y = MARGIN;
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
      this.doc.setTextColor(...TEXT_COLOR);
      this.doc.text(w.text, x, this.y);
      x += wordWidth;
      started = true;
    }
    this.y += lineHeight;
  }

  paragraph(line: string) {
    this.wrappedLine(wordsFromTokens(splitInlineBold(line)), MARGIN, 10.5, 5.5);
  }

  bullet(line: string) {
    this.doc.setFontSize(10.5);
    this.doc.setFont("helvetica", "normal");
    this.ensureSpace(5.5);
    this.doc.setTextColor(...CCB_GREEN);
    this.doc.text("•", MARGIN + 1, this.y);
    this.wrappedLine(wordsFromTokens(splitInlineBold(line)), MARGIN + 6, 10.5, 5.5);
  }

  heading(text: string, level: 1 | 2 | 3) {
    const sizes = { 1: 16, 2: 13.5, 3: 11.5 };
    const gapBefore = { 1: 6, 2: 5, 3: 3.5 };
    const lineHeight = { 1: 8, 2: 7, 3: 6 };
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
    const cellPadding = 1.5;
    const lineHeight = 4.2;

    this.doc.setFontSize(9);
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
          const shade = rIdx % 2 === 0 ? 245 : 255;
          this.doc.setFillColor(shade, rIdx % 2 === 0 ? 247 : 255, rIdx % 2 === 0 ? 244 : 255);
          this.doc.setTextColor(...TEXT_COLOR);
        }
        this.doc.setDrawColor(...BORDER_COLOR);
        this.doc.rect(x, this.y, colWidth, rowHeight, "FD");
        this.doc.text(cellLines[cIdx], x + cellPadding, this.y + cellPadding + 3);
        x += colWidth;
      });
      this.y += rowHeight;
    });
    this.doc.setTextColor(...TEXT_COLOR);
  }
}

export function generateAsesorPdf(markdown: string, studentName?: string) {
  const writer = new PdfWriter();
  const doc = writer.doc;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...CCB_GREEN);
  doc.text("Escuela de Golf CCB", MARGIN, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED_COLOR);
  const fecha = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" });
  const subtitulo = studentName ? `${studentName} · Generado el ${fecha}` : `Generado el ${fecha}`;
  doc.text(subtitulo, MARGIN, 26);

  doc.setDrawColor(...CCB_GREEN);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 30, PAGE_W - MARGIN, 30);
  writer.y = 40;

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
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED_COLOR);
    doc.text("Paco — Asesor de Golf", MARGIN, PAGE_H - 9);
    doc.text(`Página ${p} de ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 9, { align: "right" });
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const slug = studentName ? `-${studentName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "";
  doc.save(`Paco${slug}-${fileDate}.pdf`);
}

export function shouldOfferPdf(content: string): boolean {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  return wordCount > 300 || /^##\s+/m.test(content);
}
