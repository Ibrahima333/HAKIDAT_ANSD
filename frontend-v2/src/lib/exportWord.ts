import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, ImageRun,
  PageNumber, Footer, Header, PageBreak,
} from "docx";
import { PipelineResult } from "../types";
import { fetchUserKpis } from "./api";
import { getChatExport } from "./chatExport";
import { getReportCharts } from "./reportCharts";
import { KpiItem } from "../types";
import { captureChartAsBlob } from "./exportPdf";

// ── Palette ──────────────────────────────────────────────────────────────────

const C = {
  navy:    "111111",   // quasi-noir pour les titres forts
  indigo:  "333333",   // gris foncé (ex-couleurs d'accent)
  teal:    "333333",
  amber:   "333333",
  rose:    "333333",
  emerald: "333333",
  slate:   "444444",   // corps de texte
  muted:   "888888",   // texte secondaire
  light:   "F5F5F5",   // fond alterné léger
  white:   "FFFFFF",
  ink:     "111111",
} as const;

const FONT = "Segoe UI";
const PAGE_W = 9072;

// ── Utilitaires basiques ─────────────────────────────────────────────────────

function emptyLine(after = 80): Paragraph {
  return new Paragraph({ text: "", spacing: { before: 0, after } });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "  " }),
      new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: C.navy, font: FONT }),
    ],
    border: {
      left:   { color: "333333", size: 28, style: BorderStyle.SINGLE, space: 6 },
      bottom: { color: "CCCCCC", size: 4,  style: BorderStyle.SINGLE, space: 4 },
    },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.light },
    spacing: { before: 440, after: 200 },
  });
}

function resetAccent() { /* no-op — kept for call-site compatibility */ }

// ── Inline markdown → TextRun[] ──────────────────────────────────────────────

function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*_(.+?)_\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[2]) runs.push(new TextRun({ text: m[2], bold: true, italics: true, size: 22, font: FONT, color: C.navy }));
    else if (m[3]) runs.push(new TextRun({ text: m[3], bold: true, size: 22, font: FONT, color: C.navy }));
    else if (m[4]) runs.push(new TextRun({ text: m[4], italics: true, size: 22, font: FONT, color: C.slate }));
    else if (m[5]) runs.push(new TextRun({ text: m[5], font: "Courier New", size: 20, color: C.slate, shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEEEEE" } }));
    else if (m[6]) runs.push(new TextRun({ text: m[6], size: 22, font: FONT, color: C.slate }));
  }
  return runs.length ? runs : [new TextRun({ text, size: 22, font: FONT, color: C.slate })];
}

// ── Markdown → Paragraph[] ───────────────────────────────────────────────────

interface MdOptions {
  bgFill?: string;   // fond coloré pour chaque paragraphe (bulle de chat)
  indentL?: number;  // indentation gauche supplémentaire
}

function mdToParagraphs(md: string, opts: MdOptions = {}): Paragraph[] {
  const { bgFill, indentL = 0 } = opts;
  const shade = bgFill ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: bgFill } } : {};
  const paras: Paragraph[] = [];

  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line) { paras.push(emptyLine(60)); continue; }

    const h3 = line.match(/^### (.+)/);
    if (h3) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: h3[1], bold: true, size: 24, color: C.ink, font: FONT })],
        indent: { left: indentL + 80 },
        spacing: { before: 200, after: 80 },
        ...shade,
      }));
      continue;
    }
    const h2 = line.match(/^## (.+)/);
    if (h2) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: h2[1], bold: true, size: 26, color: C.ink, font: FONT })],
        indent: { left: indentL },
        spacing: { before: 280, after: 100 },
        ...shade,
      }));
      continue;
    }
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: h1[1], bold: true, size: 30, color: C.ink, font: FONT })],
        indent: { left: indentL },
        spacing: { before: 360, after: 140 },
        ...shade,
      }));
      continue;
    }

    const bullet = line.match(/^[-*] (.+)/);
    if (bullet) {
      paras.push(new Paragraph({
        children: [
          new TextRun({ text: "▸  ", size: 22, color: C.slate, font: FONT }),
          ...inlineRuns(bullet[1]),
        ],
        indent: { left: indentL + 180 },
        spacing: { before: 60, after: 60 },
        ...shade,
      }));
      continue;
    }

    const numbered = line.match(/^(\d+)\. (.+)/);
    if (numbered) {
      paras.push(new Paragraph({
        children: [
          new TextRun({ text: `${numbered[1]}.  `, size: 22, bold: true, color: C.slate, font: FONT }),
          ...inlineRuns(numbered[2]),
        ],
        indent: { left: indentL + 180 },
        spacing: { before: 60, after: 60 },
        ...shade,
      }));
      continue;
    }

    paras.push(new Paragraph({
      children: inlineRuns(line),
      indent: { left: indentL },
      spacing: { before: 60, after: 60 },
      ...shade,
    }));
  }
  return paras;
}

// ── Page de couverture ───────────────────────────────────────────────────────

function buildCover(question: string, date: string, db: string, schema: string): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];

  // Bandeau supérieur noir
  blocks.push(new Paragraph({
    children: [
      new TextRun({ text: "  HAKIDATA", bold: true, size: 28, color: C.white, font: FONT }),
      new TextRun({ text: "   ·   RAPPORT D'ANALYSE", size: 22, color: "AAAAAA", font: FONT }),
    ],
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "111111" },
    border: { bottom: { color: "444444", size: 16, style: BorderStyle.SINGLE, space: 0 } },
    spacing: { before: 0, after: 0 },
  }));

  // Titre
  blocks.push(new Paragraph({
    children: [new TextRun({ text: question, bold: true, size: 48, color: C.navy, font: FONT })],
    spacing: { before: 600, after: 200 },
  }));

  // Séparateur
  blocks.push(new Paragraph({
    children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━", size: 22, color: "888888", font: FONT })],
    spacing: { before: 0, after: 320 },
  }));

  // Métadonnées
  const halfW = PAGE_W / 2;
  const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white } as const;
  const metaCell = (label: string, value: string) => new TableCell({
    width: { size: halfW, type: WidthType.DXA },
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    children: [
      new Paragraph({ children: [new TextRun({ text: label, size: 16, color: C.muted, bold: true, font: FONT })], spacing: { after: 40 } }),
      new Paragraph({ children: [new TextRun({ text: value, size: 24, color: C.navy, bold: true, font: FONT })] }),
    ],
  });

  blocks.push(new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [halfW, halfW],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({ children: [metaCell("DATE DE GÉNÉRATION", date), metaCell("BASE DE DONNÉES", db + (schema ? " / " + schema : ""))] })],
  }));

  blocks.push(emptyLine(600));
  blocks.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
  return blocks;
}

// ── Barre de stats ───────────────────────────────────────────────────────────

function buildStatsBar(rows: number, cols: number, ms: number): Table {
  const items = [
    { label: "LIGNES",     value: String(rows), color: C.navy },
    { label: "COLONNES",   value: String(cols), color: C.navy },
    { label: "EXÉCUTION",  value: `${ms} ms`,   color: C.navy },
  ];
  const colW = Math.floor(PAGE_W / 3);
  const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white } as const;

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [colW, colW, colW],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } },
    rows: [new TableRow({
      children: items.map(item => new TableCell({
        width: { size: colW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: C.light },
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
        children: [
          new Paragraph({ children: [new TextRun({ text: item.value, size: 36, bold: true, color: item.color, font: FONT })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 } }),
          new Paragraph({ children: [new TextRun({ text: item.label, size: 16, color: C.muted, bold: true, font: FONT })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        ],
      })),
    })],
  });
}

// ── KPI cards ────────────────────────────────────────────────────────────────

const KPI_COLORS = [C.navy, C.navy, C.navy, C.navy, C.navy];

function buildKpiTable(kpis: KpiItem[]): Table | null {
  if (!kpis.length) return null;
  const count = Math.min(kpis.length, 4);
  const colW  = Math.floor(PAGE_W / count);

  const cells = kpis.slice(0, count).map((k, i) => {
    const accent = KPI_COLORS[i % KPI_COLORS.length];
    return new TableCell({
      width: { size: colW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: C.white },
      borders: {
        top:    { style: BorderStyle.THICK,  size: 16, color: "333333" },
        bottom: { style: BorderStyle.SINGLE, size: 4,  color: "CCCCCC" },
        left:   { style: BorderStyle.SINGLE, size: 4,  color: "CCCCCC" },
        right:  { style: BorderStyle.SINGLE, size: 4,  color: "CCCCCC" },
      },
      children: [
        new Paragraph({ children: [new TextRun({ text: k.columnName.toUpperCase(), size: 15, color: C.slate, bold: true, font: FONT })], indent: { left: 80 }, spacing: { before: 80, after: 60 } }),
        new Paragraph({ children: [new TextRun({ text: k.value, size: 40, bold: true, color: C.navy, font: FONT })], indent: { left: 80 }, spacing: { after: 60 } }),
        new Paragraph({ children: [new TextRun({ text: k.questionText, size: 16, color: C.muted, font: FONT })], indent: { left: 80 }, spacing: { after: 80 } }),
      ],
    });
  });

  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: Array(count).fill(colW),
    rows: [new TableRow({ children: cells })],
  });
}

// ── Tableau de données ───────────────────────────────────────────────────────

function buildDataTable(columns: string[], rows: Record<string, unknown>[]): Table {
  const colW = Math.floor(PAGE_W / columns.length);

  const headerRow = new TableRow({
    tableHeader: true,
    children: columns.map(col => new TableCell({
      width: { size: colW, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: C.navy },
      children: [new Paragraph({ children: [new TextRun({ text: col, bold: true, size: 17, color: C.white, font: FONT })], indent: { left: 60 }, spacing: { before: 60, after: 60 } })],
    })),
  });

  const dataRows = rows.slice(0, 50).map((row, ri) =>
    new TableRow({
      children: columns.map(col => new TableCell({
        width: { size: colW, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: ri % 2 === 0 ? C.white : C.light },
        children: [new Paragraph({ children: [new TextRun({ text: String(row[col] ?? ""), size: 18, font: FONT, color: C.slate })], indent: { left: 60 }, spacing: { before: 40, after: 40 } })],
      })),
    })
  );

  const border = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } as const;
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: Array(columns.length).fill(colW),
    rows: [headerRow, ...dataRows],
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
  });
}

// ── Graphique encadré ────────────────────────────────────────────────────────

function chartParagraph(image: ImageRun): Paragraph {
  const border = { color: "E2E8F0", size: 4, style: BorderStyle.SINGLE, space: 6 } as const;
  return new Paragraph({
    children: [image],
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 240 },
    border: { top: border, bottom: border, left: border, right: border },
  });
}

// ── Message chat avec tableau coloré ────────────────────────────────────────

function buildChatMessage(role: string, time: string, content: string): (Paragraph | Table)[] {
  const isUser  = role === "user";
  const accent  = isUser ? C.indigo  : C.emerald;
  const bgFill  = isUser ? "F5F5F5"  : "EFEFEF";
  const label   = isUser ? "Vous"    : "Analyste";
  const noBorder = { style: BorderStyle.NONE, size: 0, color: C.white } as const;
  const bodyBorder = { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" } as const;

  // Paragraphes du corps avec fond et indentation — construits directement
  const bodyParagraphs = mdToParagraphs(content, { bgFill, indentL: 100 });

  const headerTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: PAGE_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: accent },
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
        children: [new Paragraph({
          children: [
            new TextRun({ text: `  ${label}`, bold: true, size: 19, color: C.white, font: FONT }),
            new TextRun({ text: `   ${time}`, size: 17, color: "DDDDDD", font: FONT }),
          ],
          spacing: { before: 60, after: 60 },
        })],
      })],
    })],
  });

  const bodyTable = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [PAGE_W],
    borders: { top: noBorder, bottom: bodyBorder, left: bodyBorder, right: bodyBorder, insideHorizontal: noBorder, insideVertical: noBorder },
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: PAGE_W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: bgFill },
        borders: { top: noBorder, bottom: bodyBorder, left: bodyBorder, right: bodyBorder },
        children: bodyParagraphs.length ? bodyParagraphs : [new Paragraph({ children: [new TextRun({ text: " " })] })],
      })],
    })],
  });

  return [headerTable, bodyTable, emptyLine(100)];
}

// ── Export principal ─────────────────────────────────────────────────────────

export async function exportReportToWord(result: PipelineResult): Promise<void> {
  resetAccent();
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });
  const meta = result.metadata;
  const chatMessages = getChatExport();
  const extraCharts  = getReportCharts().filter(c => c.id !== result.id);
  const kpisData = await fetchUserKpis().catch(() => ({ kpis: [] }));
  const kpis = kpisData.kpis as KpiItem[];

  // Logo
  let logoImage: ImageRun | null = null;
  try {
    const res = await fetch("/hakidata-logo.svg");
    const blob = await res.blob();
    const pngBlob = await svgToPng(blob, 120, 120);
    const buf = await pngBlob.arrayBuffer();
    logoImage = new ImageRun({ data: buf, transformation: { width: 48, height: 48 }, type: "png" });
  } catch { /* optionnel */ }

  // Graphique principal
  let chartImage: ImageRun | null = null;
  try {
    if (result.chartHtml) {
      const blob = await captureChartAsBlob(result.chartHtml);
      if (blob) {
        const buf = await blob.arrayBuffer();
        chartImage = new ImageRun({ data: buf, transformation: { width: 580, height: 320 }, type: "png" });
      }
    }
  } catch { /* optionnel */ }

  // Graphiques dashboard ajoutés via "Ajouter au rapport"
  const extraChartImages: { title: string; image: ImageRun }[] = [];
  for (const ec of extraCharts) {
    try {
      const blob = ec.chartUrl
        ? await captureChartAsBlob(ec.chartUrl, true)
        : await captureChartAsBlob(ec.chartHtml);
      if (blob) {
        const buf = await blob.arrayBuffer();
        extraChartImages.push({
          title: ec.questionText,
          image: new ImageRun({ data: buf, transformation: { width: 580, height: 300 }, type: "png" }),
        });
      }
    } catch { /* skip */ }
  }

  // ── Construction ─────────────────────────────────────────────────────────

  const children: (Paragraph | Table)[] = [];

  // Couverture
  children.push(...buildCover(result.questionText, date, result.databaseName, result.schemaName ?? ""));

  // Vue d'ensemble
  children.push(sectionTitle("Vue d'ensemble"));
  children.push(buildStatsBar(meta.rows_returned ?? 0, meta.columns?.length ?? 0, meta.execution_time_ms ?? 0));
  children.push(emptyLine());

  // KPIs
  if (kpis.length) {
    children.push(sectionTitle("Indicateurs clés"));
    const kpiTable = buildKpiTable(kpis);
    if (kpiTable) { children.push(kpiTable); children.push(emptyLine()); }
  }

  // Graphique principal
  if (chartImage) {
    children.push(sectionTitle("Visualisation principale"));
    children.push(chartParagraph(chartImage));
  }

  // Graphiques ajoutés depuis le dashboard
  for (const ec of extraChartImages) {
    children.push(sectionTitle(ec.title));
    children.push(chartParagraph(ec.image));
  }

  // Analyse
  if (result.report) {
    children.push(sectionTitle("Analyse et recommandations"));
    children.push(...mdToParagraphs(result.report));
    children.push(emptyLine());
  }

  // Données brutes
  if (result.csvData?.length && meta.columns?.length) {
    const colNames = meta.columns.map((c: { name: string }) => c.name);
    const shown = Math.min(result.csvData.length, 50);
    children.push(sectionTitle(`Données · ${shown} premières lignes`));
    children.push(buildDataTable(colNames, result.csvData));
    children.push(emptyLine());
    if (result.csvData.length > 50) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `… et ${result.csvData.length - 50} lignes supplémentaires non affichées.`, italics: true, size: 18, color: C.muted, font: FONT })],
        spacing: { before: 60, after: 120 },
      }));
    }
  }

  // Discussion chat
  if (chatMessages.length) {
    children.push(sectionTitle("Discussion analytique"));
    for (const msg of chatMessages) {
      const time = new Date(msg.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      children.push(...buildChatMessage(msg.role, time, msg.content));
    }
  }

  // ── Document ─────────────────────────────────────────────────────────────

  const noBorderLine = { color: "E2E8F0", size: 6, style: BorderStyle.SINGLE, space: 4 } as const;

  const doc = new Document({
    creator: "HakiData",
    title: result.questionText,
    description: `Rapport HakiData — ${result.databaseName} — ${date}`,
    styles: {
      default: { document: { run: { font: FONT, size: 22, color: C.slate } } },
    },
    sections: [{
      properties: { page: { margin: { top: 960, bottom: 960, left: 1200, right: 1200 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              ...(logoImage ? [logoImage] : []),
              new TextRun({ text: "  HakiData", bold: true, size: 19, color: C.navy, font: FONT }),
              new TextRun({ text: `    ${result.databaseName}`, size: 17, color: C.muted, font: FONT }),
            ],
            border: { bottom: noBorderLine },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: `HakiData · ${date}    `, size: 17, color: C.muted, font: FONT }),
              new TextRun({ children: [PageNumber.CURRENT], size: 17, color: C.slate, bold: true, font: FONT }),
              new TextRun({ text: " / ", size: 17, color: C.muted, font: FONT }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: C.muted, font: FONT }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: noBorderLine },
          })],
        }),
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rapport-hakidata-${result.questionName}-${new Date().toISOString().slice(0, 10)}.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── SVG → PNG ────────────────────────────────────────────────────────────────

function svgToPng(svgBlob: Blob, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => {
        URL.revokeObjectURL(url);
        b ? resolve(b) : reject(new Error("canvas toBlob failed"));
      }, "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}
