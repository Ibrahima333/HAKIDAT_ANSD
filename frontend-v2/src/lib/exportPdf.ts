/**
 * Export du rapport en PDF — AskData
 *
 * Stratégie :
 * 1. Création d'une iframe temporaire cachée avec le HTML Plotly (result.chartHtml)
 *    → permet la capture même si l'onglet Chart n'est pas actif dans l'UI
 * 2. Attente du chargement de Plotly dans l'iframe (avec timeout 10s)
 * 3. Capture PNG via Plotly.toImage()
 * 4. Génération d'une page HTML stylée avec en-tête, métriques, graphique et insights
 * 5. Ouverture dans une nouvelle fenêtre + window.print() automatique
 */

import { PipelineResult } from "../types";
import { fetchUserKpis } from "./api";
import { getChatExport, ChatExportMessage } from "./chatExport";
import { getReportCharts, ReportChart } from "./reportCharts";
import { KpiItem } from "../types";

/** Convertit le markdown basique en HTML lisible à l'impression */
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
}

/**
 * Capture le graphique Plotly en créant une iframe temporaire cachée.
 * Fonctionne quel que soit l'onglet actif dans l'UI.
 * Retourne une image PNG en base64, ou null si la capture échoue.
 */
/** Version blob (pour Word) — retourne un Blob PNG ou null */
export async function captureChartAsBlob(chartHtmlOrUrl: string, isUrl = false): Promise<Blob | null> {
  let html = chartHtmlOrUrl;
  if (isUrl) {
    try {
      const res = await fetch(chartHtmlOrUrl);
      if (res.ok) html = await res.text();
      else return null;
    } catch { return null; }
  }
  const dataUrl = await captureChart(html);
  if (!dataUrl) return null;
  const res = await fetch(dataUrl);
  return res.blob();
}

async function captureChart(chartHtmlOrUrl: string): Promise<string | null> {
  if (!chartHtmlOrUrl) return null;

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:900px;height:500px;opacity:0;pointer-events:none;";
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    document.body.appendChild(iframe);

    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* déjà supprimé */ }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 12_000);

    iframe.onload = async () => {
      const iWin = iframe.contentWindow as any;

      let tries = 0;
      while (!iWin?.Plotly && tries < 50) {
        await new Promise<void>(r => setTimeout(r, 100));
        tries++;
      }

      if (!iWin?.Plotly) {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
        return;
      }

      await new Promise<void>(r => setTimeout(r, 300));

      const plotDiv = iframe.contentDocument?.querySelector(".js-plotly-plot");
      if (!plotDiv) {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
        return;
      }

      try {
        const imgUrl: string = await iWin.Plotly.toImage(plotDiv, {
          format: "png",
          width: 800,
          height: 420,
        });
        clearTimeout(timeout);
        cleanup();
        resolve(imgUrl);
      } catch {
        clearTimeout(timeout);
        cleanup();
        resolve(null);
      }
    };

    iframe.srcdoc = chartHtmlOrUrl;
  });
}

/** Génère le HTML des KPIs épinglés pour l'inclure dans le PDF */
function renderKpis(kpis: KpiItem[]): string {
  if (kpis.length === 0) return "";
  const cards = kpis.map(k => {
    const delta = k.rawValue !== null && k.previousValue !== null && k.previousValue !== 0
      ? ((k.rawValue - k.previousValue) / Math.abs(k.previousValue)) * 100
      : null;
    const deltaHtml = delta !== null
      ? `<div class="kpi-delta ${delta >= 0 ? "kpi-up" : "kpi-down"}">${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%</div>`
      : "";
    return `
      <div class="kpi-card">
        <div class="kpi-label">${k.columnName}</div>
        <div class="kpi-value">${k.value}</div>
        ${deltaHtml}
        <div class="kpi-source">${k.questionText}</div>
      </div>`;
  }).join("");
  return `<section>
    <h2>KPIs épinglés</h2>
    <div class="kpi-grid">${cards}</div>
  </section>`;
}

/** Génère les sections HTML pour les graphiques supplémentaires */
async function renderExtraCharts(charts: ReportChart[]): Promise<string> {
  if (charts.length === 0) return "";
  const sections = await Promise.all(charts.map(async (c) => {
    const imgUrl = c.chartUrl
      ? await (async () => {
          try { const r = await fetch(c.chartUrl!); if (r.ok) return captureChart(await r.text()); } catch { /* skip */ }
          return null;
        })()
      : await captureChart(c.chartHtml);
    const chartContent = imgUrl
      ? `<img class="chart-img" src="${imgUrl}" alt="Graphique" />`
      : `<p style="font-size:12px;color:#94a3b8;font-style:italic;">Capture indisponible.</p>`;
    return `<section>
      <h2>${c.questionText}</h2>
      ${c.vizType ? `<p style="font-size:11px;color:#C8940A;margin-bottom:10px;">Type : ${c.vizType}</p>` : ""}
      ${chartContent}
    </section>`;
  }));
  return sections.join("\n");
}

/** Génère le HTML d'un échange Chat IA pour l'inclure dans le PDF */
function renderChatMessages(messages: ChatExportMessage[]): string {
  if (messages.length === 0) return "";
  const rows = messages.map(m => {
    const isUser = m.role === "user";
    const time = new Date(m.ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `
      <div class="chat-msg ${isUser ? "chat-user" : "chat-assistant"}">
        <div class="chat-meta">
          <span class="chat-role">${isUser ? "👤 Vous" : "🤖 Data Analyst IA"}</span>
          <span class="chat-time">${time}</span>
        </div>
        <div class="chat-bubble ${isUser ? "bubble-user" : "bubble-assistant"}">
          ${m.content.replace(/\n/g, "<br>")}
        </div>
      </div>`;
  }).join("");
  return `<section>
    <h2>Discussion IA</h2>
    <div class="chat-log">${rows}</div>
  </section>`;
}

/** Génère et ouvre la page d'impression du rapport complet */
export async function exportReportToPdf(result: PipelineResult): Promise<void> {
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });
  const meta = result.metadata;

  const chatMessages = getChatExport();
  const extraCharts = getReportCharts().filter(c => c.id !== result.id);
  const kpisData = await fetchUserKpis().catch(() => ({ kpis: [] }));
  const kpis = kpisData.kpis as KpiItem[];

  // Logo en base64 pour l'embarquer dans le PDF
  const logoB64 = await fetch("/hakidata-logo.svg")
    .then(r => r.blob())
    .then(b => new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(b);
    }))
    .catch(() => "");

  const [chartImageUrl, extraChartsHtml] = await Promise.all([
    captureChart(result.chartHtml),
    renderExtraCharts(extraCharts),
  ]);

  const chartSection = chartImageUrl
    ? `<section>
        <h2>Visualisation</h2>
        <img class="chart-img" src="${chartImageUrl}" alt="Graphique" />
      </section>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Rapport — ${result.questionName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: #0f172a; background: #ffffff;
      padding: 48px 56px; max-width: 960px; margin: 0 auto;
      font-size: 13px; line-height: 1.6;
    }

    /* ── En-tête ────────────────────────────────────────── */
    .cover {
      display: flex; align-items: flex-start; justify-content: space-between;
      border-bottom: 3px solid #1e3a5f; padding-bottom: 24px; margin-bottom: 32px;
    }
    .cover-left { flex: 1; }
    .cover-logo { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; margin-left: 24px; }
    .cover-tag  { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #64748b; margin-bottom: 10px; }
    .cover h1   { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3; margin-bottom: 14px; }
    .cover-meta { display: flex; flex-wrap: wrap; gap: 0; }
    .meta-item  { font-size: 11px; color: #475569; padding-right: 16px; margin-right: 16px; border-right: 1px solid #cbd5e1; }
    .meta-item:last-child { border-right: none; }
    .meta-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #94a3b8; margin-bottom: 1px; }

    /* ── Métriques rapides ──────────────────────────────── */
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 36px; }
    .metric  { background: #f8fafc; padding: 16px 20px; }
    .metric-label { font-size: 9px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
    .metric-value { font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1; }
    .metric-unit  { font-size: 12px; font-weight: 400; color: #94a3b8; margin-left: 3px; }

    /* ── Sections ───────────────────────────────────────── */
    section { margin-bottom: 36px; page-break-inside: avoid; }
    .section-title {
      font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
      color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 6px; margin-bottom: 16px;
    }

    /* ── Graphique ──────────────────────────────────────── */
    .chart-img { width: 100%; border-radius: 6px; border: 1px solid #e2e8f0; display: block; }

    /* ── Insights ───────────────────────────────────────── */
    .prose p  { margin: 0 0 10px; color: #334155; font-size: 13px; line-height: 1.75; }
    .prose h1, .prose h2, .prose h3 { font-weight: 700; color: #0f172a; margin: 18px 0 6px; line-height: 1.3; }
    .prose h1 { font-size: 15px; }
    .prose h2 { font-size: 14px; }
    .prose h3 { font-size: 13px; }
    .prose ul, .prose ol { padding-left: 18px; margin: 0 0 10px; }
    .prose li { margin-bottom: 4px; color: #334155; }
    .prose strong { font-weight: 600; color: #0f172a; }
    .prose em { font-style: italic; color: #475569; }
    .prose code { font-family: "Courier New", monospace; font-size: 11px; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; color: #1e40af; }

    /* ── KPIs ───────────────────────────────────────────── */
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-top: 3px solid #1e3a5f; border-radius: 6px; padding: 14px; }
    .kpi-label { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
    .kpi-value { font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1; margin-bottom: 4px; }
    .kpi-delta { font-size: 11px; font-weight: 600; }
    .kpi-up    { color: #16a34a; }
    .kpi-down  { color: #dc2626; }
    .kpi-source{ font-size: 9px; color: #94a3b8; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ── Discussion analytique ──────────────────────────── */
    .chat-log { display: flex; flex-direction: column; gap: 12px; }
    .chat-msg  { display: flex; flex-direction: column; gap: 3px; }
    .chat-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
    .chat-role { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #64748b; }
    .chat-time { font-size: 10px; color: #94a3b8; }
    .chat-bubble { font-size: 12px; line-height: 1.6; padding: 10px 14px; border-radius: 6px; max-width: 88%; }
    .bubble-user      { background: #1e3a5f; color: #f8fafc; align-self: flex-end; }
    .bubble-assistant { background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; align-self: flex-start; }
    .chat-user      { align-items: flex-end; }
    .chat-assistant { align-items: flex-start; }

    /* ── Pied de page ───────────────────────────────────── */
    .footer {
      margin-top: 48px; padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #94a3b8;
    }
    .footer-brand { font-weight: 700; color: #1e3a5f; letter-spacing: .04em; }

    @media print {
      body { padding: 24px 32px; }
      section { page-break-inside: avoid; }
      @page { margin: 1.5cm; size: A4; }
    }
  </style>
</head>
<body>

  <!-- En-tête -->
  <div class="cover">
    <div class="cover-left">
      <div class="cover-tag">Rapport d'analyse de données</div>
      <h1>${result.questionText}</h1>
      <div class="cover-meta">
        <div class="meta-item">
          <span class="meta-label">Date</span>
          ${date}
        </div>
        <div class="meta-item">
          <span class="meta-label">Base de données</span>
          ${result.databaseName}${result.schemaName ? " / " + result.schemaName : ""}
        </div>
      </div>
    </div>
    ${logoB64 ? `<img class="cover-logo" src="${logoB64}" alt="HakiData" />` : ""}
  </div>

  <!-- Métriques rapides -->
  <div class="metrics">
    <div class="metric">
      <div class="metric-label">Lignes retournées</div>
      <div class="metric-value">${meta.rows_returned ?? 0}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Colonnes analysées</div>
      <div class="metric-value">${meta.columns?.length ?? 0}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Temps d'exécution</div>
      <div class="metric-value">${meta.execution_time_ms ?? 0}<span class="metric-unit">ms</span></div>
    </div>
  </div>

  ${kpis.length > 0 ? `
  <section>
    <div class="section-title">Indicateurs clés</div>
    ${renderKpis(kpis)}
  </section>` : ""}

  ${chartSection ? `
  <section>
    <div class="section-title">Visualisation principale</div>
    ${chartSection.replace(/<section>.*?<h2>.*?<\/h2>/s, "").replace(/<\/section>/, "")}
  </section>` : ""}

  ${extraChartsHtml}

  ${result.report ? `
  <section>
    <div class="section-title">Analyse et recommandations</div>
    <div class="prose">${mdToHtml(result.report)}</div>
  </section>` : ""}

  ${chatMessages.length > 0 ? `
  <section>
    <div class="section-title">Discussion analytique</div>
    ${renderChatMessages(chatMessages).replace(/<section>.*?<h2>.*?<\/h2>/s, "").replace(/<\/section>/, "")}
  </section>` : ""}

  <div class="footer">
    <span class="footer-brand">HakiData</span>
    <span>${result.databaseName} &mdash; ${date}</span>
  </div>

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 600);
    });
  </script>

</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
  }
}
