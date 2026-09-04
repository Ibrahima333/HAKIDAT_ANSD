import React, { useEffect, useRef, useState } from "react";
import { PipelineResult } from "../types";
import { Download, FileDown, Loader2,
         Pin, PinOff, ClipboardList, FilePlus2, FileType2, RotateCcw } from "lucide-react";
import {
  TableCellsIcon, CodeBracketIcon, ChartBarIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon,
  DocumentTextIcon, ScaleIcon, Square3Stack3DIcon,
} from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { buildArtifactUrl, pinUserChart, unpinUserChart, pinUserKpi, unpinUserKpi, fetchUserKpis, regenViz, generateReport } from "../lib/api";
import { exportReportToPdf } from "../lib/exportPdf";
import { exportReportToWord } from "../lib/exportWord";
import { getChatExportCount, clearChatExport } from "../lib/chatExport";
import { isChartInReport, toggleReportChart, getReportChartCount, clearReportCharts } from "../lib/reportCharts";
import { formatKpiValue, formatKpiValueCompact } from "../lib/kpi";

interface ResultTabsProps {
  result: PipelineResult;
}

type TabType = "results" | "sql" | "chart" | "kpis" | "report";

/** Calcule les métriques (total, moy, min, max) pour chaque colonne numérique */
function computeKpiMetrics(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const metrics: {
    column: string;
    total: number | null;
    avg: number | null;
    min: number | null;
    max: number | null;
  }[] = [];

  for (const col of cols) {
    const nums = rows
      .map(r => Number(r[col]))
      .filter(n => !isNaN(n) && isFinite(n));

    if (nums.length === 0) continue;

    const total = nums.reduce((a, b) => a + b, 0);
    metrics.push({
      column: col,
      total,
      avg:  total / nums.length,
      min:  Math.min(...nums),
      max:  Math.max(...nums),
    });
  }
  return metrics;
}

export function ResultTabs({ result }: ResultTabsProps) {
  const [activeTab, setActiveTab]       = useState<TabType>("results");
  const [isExportingPdf, setIsExportingPdf]   = useState(false);
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [showExportMenu, setShowExportMenu]   = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned]             = useState(false);
  const [isPinning, setIsPinning]       = useState(false);
  const [pinError, setPinError]         = useState<string | null>(null);
  const [chatExportCount, setChatExportCount] = useState(() => getChatExportCount());
  const [chartInReport, setChartInReport]   = useState(() => isChartInReport(result.id));
  const [reportChartCount, setReportChartCount] = useState(() => getReportChartCount());
  // kpiPinned : map de "colonne__metric" → boolean
  const [pinnedKpis, setPinnedKpis]     = useState<Record<string, boolean>>({});
  const [localChartHtml, setLocalChartHtml] = useState<string>(result.chartHtml);
  const [localVizType, setLocalVizType]     = useState<string | null | undefined>(result.vizType);
  const [localVizAlts, setLocalVizAlts]     = useState<string[]>(result.vizAlternatives ?? []);
  const [regenLoading, setRegenLoading]     = useState<string | null>(null);
  const [regenError, setRegenError]         = useState<string | null>(null);
  // Type/HTML d'origine — conservés pour permettre de revenir au graphique
  // de base après avoir prévisualisé une suggestion "Voir aussi" (le backend
  // ne renvoie plus d'alternative une fois un type forcé, donc sans ceci il
  // n'y a plus aucun moyen de revenir en arrière).
  const [originalChartHtml, setOriginalChartHtml] = useState<string>(result.chartHtml);
  const [originalVizType, setOriginalVizType]     = useState<string | null | undefined>(result.vizType);
  const [originalVizAlts, setOriginalVizAlts]     = useState<string[]>(result.vizAlternatives ?? []);
  // Type effectivement épinglé au dashboard — distinct du type prévisualisé
  // localement : une prévisualisation ("Voir aussi") ne doit plus mettre à
  // jour le dashboard automatiquement, seul un ré-épinglage explicite le fait.
  const [pinnedVizType, setPinnedVizType]   = useState<string | null | undefined>(null);
  // Rapport Insights — généré à la demande (économie de quota LLM) : vide
  // tant que l'utilisateur n'a pas ouvert l'onglet "Rapport".
  const [localReport, setLocalReport]       = useState<string>(result.report ?? "");
  const [reportLoading, setReportLoading]   = useState(false);
  const [reportError, setReportError]       = useState<string | null>(null);

  const kpiMetrics = computeKpiMetrics(result.csvData);

  // Fermer le menu export si on clique en dehors
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  useEffect(() => {
    setPinned(false);
    setPinnedKpis({});
    setLocalChartHtml(result.chartHtml);
    setLocalVizType(result.vizType);
    setLocalVizAlts(result.vizAlternatives ?? []);
    setOriginalChartHtml(result.chartHtml);
    setOriginalVizType(result.vizType);
    setOriginalVizAlts(result.vizAlternatives ?? []);
    setPinnedVizType(null);
    setRegenError(null);
    setChartInReport(isChartInReport(result.id));
    setLocalReport(result.report ?? "");
    setReportError(null);

    // Retrouve les KPIs déjà épinglés pour ce résultat — sans ça le bouton
    // "Épingler" oublie l'état à chaque changement de résultat ou rechargement,
    // alors que le KPI reste bien présent côté dashboard/backend.
    let cancelled = false;
    const prefix = `${result.id}__`;
    fetchUserKpis()
      .then(({ kpis }) => {
        if (cancelled) return;
        const next: Record<string, boolean> = {};
        for (const kpi of kpis) {
          if (typeof kpi.id !== "string" || !kpi.id.startsWith(prefix)) continue;
          const rest = kpi.id.slice(prefix.length);
          const sepIndex = rest.lastIndexOf("__");
          if (sepIndex === -1) continue;
          const column = rest.slice(0, sepIndex);
          const metric = rest.slice(sepIndex + 2);
          next[`${column}__${metric}`] = true;
        }
        setPinnedKpis(next);
      })
      .catch(() => { /* silencieux — l'état non résolu retombe sur "non épinglé" */ });

    return () => { cancelled = true; };
  }, [result.id]);

  const pinCurrentChart = async () => {
    await pinUserChart({
      id:           result.id.slice(0, 200),
      questionName: result.questionName,
      questionText: result.questionText,
      pinnedAt:     Date.now(),
      // Snapshot figé du graphique actuellement affiché — le dashboard sert
      // cette copie plutôt que de pointer vers le fichier partagé de
      // l'analyse, sans quoi une simple prévisualisation ("Voir aussi")
      // écraserait silencieusement le graphique déjà épinglé.
      chartHtml:    localChartHtml,
      // Nécessaires pour permettre un rafraîchissement dynamique optionnel
      // (bouton "Surveiller") depuis le dashboard, sans dépendre des
      // fichiers sur disque qui disparaissent après "Vider l'historique".
      sqlQuery:     result.sql,
      databaseName: result.databaseName,
    });
    setPinned(true);
    setPinnedVizType(localVizType);
  };

  const handleRegenViz = async (chartType: string) => {
    setRegenLoading(chartType);
    setRegenError(null);
    try {
      const updated = await regenViz({
        questionName: result.questionName,
        chartType,
        providerName: result.providerName,
      });
      setLocalChartHtml(updated.chartHtml);
      setLocalVizType(updated.vizType ?? chartType);
      setLocalVizAlts(updated.vizAlternatives ?? []);
      // Prévisualiser un autre type de graphique ne touche plus jamais le
      // dashboard — seul un clic explicite sur "Épingler"/"Mettre à jour"
      // pousse le changement. Voir pinCurrentChart().
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Erreur lors de la régénération.");
    } finally {
      setRegenLoading(null);
    }
  };

  const handleRevertToOriginal = () => {
    setLocalChartHtml(originalChartHtml);
    setLocalVizType(originalVizType);
    setLocalVizAlts(originalVizAlts);
    setRegenError(null);
  };

  const handleGenerateReport = async () => {
    if (reportLoading || localReport) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const updated = await generateReport({
        questionName: result.questionName,
        providerName: result.providerName,
      });
      setLocalReport(updated.report ?? "");
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Erreur lors de la génération du rapport.");
    } finally {
      setReportLoading(false);
    }
  };

  // Génère le rapport automatiquement à la première ouverture de l'onglet
  // "Rapport" — pas avant, pour économiser l'appel LLM tant que personne ne
  // le consulte.
  useEffect(() => {
    if (activeTab === "report" && !localReport && !reportLoading) {
      void handleGenerateReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, localReport]);

  const handlePinChart = async () => {
    setIsPinning(true);
    setPinError(null);
    try {
      if (pinned) {
        await unpinUserChart(result.id);
        setPinned(false);
        setPinnedVizType(null);
      } else {
        await pinCurrentChart();
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Erreur lors de l'épinglage");
    } finally {
      setIsPinning(false);
    }
  };

  const handlePinKpi = async (
    column: string,
    metric: "total" | "avg" | "min" | "max",
    value: number
  ) => {
    const key = `${column}__${metric}`;
    const { formatted } = formatKpiValue(value);
    const metricLabels = { total: "Total", avg: "Moyenne", min: "Minimum", max: "Maximum" };
    const kpiId = `${result.id}__${column}__${metric}`;

    if (pinnedKpis[key]) {
      await unpinUserKpi(kpiId);
      setPinnedKpis(p => ({ ...p, [key]: false }));
    } else {
      await pinUserKpi({
        id: kpiId,
        questionText: `${metricLabels[metric]} de ${column} — ${result.questionText}`,
        questionName: result.questionName,
        columnName:   `${metricLabels[metric]} · ${column}`,
        value:        formatted,
        rawValue:     value,
        database:     result.databaseName,
        schema:       result.schemaName,
        provider:     result.providerName,
        pinnedAt:     Date.now(),
        lastUpdated:  Date.now(),
        sqlQuery:     result.sql ?? null,
      });
      setPinnedKpis(p => ({ ...p, [key]: true }));
    }
  };

  const handleDownload = (artifactPath: string) => {
    window.open(buildArtifactUrl(artifactPath), "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const onFocus = () => setChatExportCount(getChatExportCount());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const handleToggleReportChart = () => {
    const added = toggleReportChart({
      id: result.id,
      questionText: result.questionText,
      questionName: result.questionName,
      chartHtml: localChartHtml,
      vizType: localVizType ?? null,
      addedAt: Date.now(),
    });
    setChartInReport(added);
    setReportChartCount(getReportChartCount());
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      // `result.report` peut être vide côté prop — le rapport est généré à
      // la demande et vit dans `localReport` tant que le parent n'est pas
      // rechargé. Sans ce merge, l'export produirait une section Insights vide.
      await exportReportToPdf({ ...result, report: localReport });
      clearChatExport();
      setChatExportCount(0);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportWord = async () => {
    setIsExportingWord(true);
    try {
      await exportReportToWord({ ...result, report: localReport });
    } finally {
      setIsExportingWord(false);
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "results", label: "Résultats", icon: <TableCellsIcon      className="w-4 h-4" /> },
    { id: "sql",     label: "SQL",       icon: <CodeBracketIcon     className="w-4 h-4" /> },
    { id: "chart",   label: "Graphique", icon: <ChartBarIcon        className="w-4 h-4" /> },
    { id: "kpis",    label: "KPIs",      icon: <ArrowTrendingUpIcon className="w-4 h-4" /> },
    { id: "report",  label: "Rapport",   icon: <DocumentTextIcon    className="w-4 h-4" /> },
  ];

  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center gap-6 px-4 bg-white dark:bg-zinc-900 border-b border-stone-200 dark:border-zinc-800">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative flex items-center gap-1.5 py-3 text-[13px] font-medium transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "text-[#C8940A]"
                : "text-stone-500 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-300"
            )}
          >
            {tab.icon}
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-[#C8940A]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">

        {/* ── Results ───────────────────────────────────────── */}
        {activeTab === "results" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-stone-500 dark:text-zinc-500">
                {result.csvData.length} ligne{result.csvData.length > 1 ? "s" : ""}
                {result.csvData.length > 0 && <> · {Object.keys(result.csvData[0]).length} colonnes</>}
              </p>
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.csv)}
                className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-zinc-300 bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            {result.csvData.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-950 px-6 py-10 text-center">
                <p className="text-sm text-stone-500 dark:text-zinc-400">Aucune ligne retournée.</p>
                {result.metadata.empty_reason ? (
                  <p className="mt-2 text-sm text-stone-600 dark:text-zinc-300">
                    {result.metadata.empty_reason}
                    <span className="block mt-1 text-xs text-stone-400 dark:text-zinc-500">
                      Ajoutez des données à cette base pour obtenir des résultats.
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-stone-400 dark:text-zinc-500">
                    Vos données ne contiennent aucune ligne correspondant à cette question.
                  </p>
                )}
              </div>
            ) : (
              <div className="border border-stone-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-stone-600">
                    <thead className="text-[11px] text-stone-500 dark:text-zinc-400 uppercase tracking-wide bg-stone-100 dark:bg-zinc-950 border-b border-stone-200 dark:border-zinc-800">
                      <tr>
                        {Object.keys(result.csvData[0] || {}).map(key => (
                          <th key={key} className="px-4 py-2 font-semibold">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.csvData.map((row, i) => (
                        <tr key={i} className={cn(
                          "border-b border-stone-100 dark:border-zinc-800 last:border-0 hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors",
                          i % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-stone-50/60 dark:bg-zinc-900/40"
                        )}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-4 py-2 whitespace-nowrap text-zinc-800 dark:text-zinc-100 text-[13px]">
                              {val === null || val === undefined ? "—" : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SQL ───────────────────────────────────────────── */}
        {activeTab === "sql" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.sql)}
                className="flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-zinc-300 bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> SQL
              </button>
            </div>
            <div className="bg-stone-950 dark:bg-black rounded-xl p-4 overflow-x-auto border border-stone-800">
              <pre className="text-sm text-stone-50 font-mono leading-relaxed">
                <code>{result.sql}</code>
              </pre>
            </div>
          </div>
        )}

        {/* ── Chart ─────────────────────────────────────────── */}
        {activeTab === "chart" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => void handlePinChart()}
                  disabled={isPinning}
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60",
                    pinned
                      ? "bg-[#C8940A] text-white border-[#C8940A] hover:bg-[#A87A08]"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-[#C8940A] hover:text-[#C8940A]"
                  )}
                >
                  {isPinning
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  {isPinning ? "Épinglage…" : pinned ? "Épinglé ✓" : "Épingler au dashboard"}
                </button>
                {pinned && pinnedVizType !== localVizType && (
                  <button
                    type="button"
                    onClick={() => void pinCurrentChart()}
                    disabled={isPinning}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#C8940A] hover:underline disabled:opacity-60"
                    title="Le graphique épinglé au dashboard diffère de celui-ci — mettre à jour"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Mettre à jour le dashboard
                  </button>
                )}
              <button
                type="button"
                onClick={() => handleDownload(result.artifactUrls.chart)}
                className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <Download className="w-4 h-4" /> HTML
              </button>
            </div>
            {pinError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{pinError}</p>
            )}
            </div>
            {(localVizType || localVizAlts.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {localVizType && (
                  <span className="inline-flex items-center gap-1 bg-[#FEF3C7] border border-[#FEF3C7] text-[#A87A08] rounded-full px-2.5 py-1 font-medium">
                    <ChartBarIcon className="w-3 h-3" /> {localVizType}
                  </span>
                )}
                {localVizType !== originalVizType && (
                  <button
                    type="button"
                    disabled={regenLoading !== null}
                    onClick={handleRevertToOriginal}
                    className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-[#FEF3C7] hover:border-[#FEF3C7] hover:text-[#A87A08] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-full px-2.5 py-1 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Revenir au graphique de base"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {originalVizType ?? "Original"}
                  </button>
                )}
                {localVizAlts.length > 0 && (
                  <>
                    <span className="text-zinc-400">Voir aussi :</span>
                    {localVizAlts.map(alt => (
                      <button
                        key={alt}
                        type="button"
                        disabled={regenLoading !== null}
                        onClick={() => void handleRegenViz(alt)}
                        className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-[#FEF3C7] hover:border-[#FEF3C7] hover:text-[#A87A08] border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-full px-2.5 py-1 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {regenLoading === alt ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        {alt}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
            {regenError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{regenError}</p>
            )}
            <div className="bg-stone-50 dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 rounded-xl p-3 h-[420px] flex items-center justify-center">
              {regenLoading ? (
                <div className="flex flex-col items-center gap-3 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Génération du graphique en cours…</span>
                </div>
              ) : localChartHtml ? (
                <iframe
                  title={`${result.questionName}-chart`}
                  srcDoc={localChartHtml}
                  sandbox="allow-scripts"
                  className="h-full w-full rounded-lg border border-stone-200 dark:border-zinc-700 bg-white"
                />
              ) : (
                <div className="text-sm text-stone-500 dark:text-zinc-400">Aucun graphique généré.</div>
              )}
            </div>
          </div>
        )}

        {/* ── KPIs ──────────────────────────────────────────── */}
        {activeTab === "kpis" && (
          <div className="space-y-4">
            {kpiMetrics.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-900 px-6 py-12 text-center">
                <ArrowTrendingUpIcon className="w-8 h-8 text-stone-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-stone-500">Aucune colonne numérique détectée</p>
                <p className="text-xs text-stone-400 dark:text-zinc-500 mt-1">Les KPIs sont calculés automatiquement sur les colonnes numériques du résultat.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-stone-500">
                  {kpiMetrics.length} colonne{kpiMetrics.length > 1 ? "s" : ""} numérique{kpiMetrics.length > 1 ? "s" : ""} détectée{kpiMetrics.length > 1 ? "s" : ""} ·
                  {" "}{result.csvData.length} ligne{result.csvData.length > 1 ? "s" : ""}. Cliquez sur une carte pour l'épingler au dashboard.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {kpiMetrics.flatMap(m => (
                    [
                      { key: "total", label: "Total",   value: m.total, Icon: Square3Stack3DIcon    },
                      { key: "avg",   label: "Moyenne", value: m.avg,   Icon: ScaleIcon              },
                      { key: "min",   label: "Minimum", value: m.min,   Icon: ArrowTrendingDownIcon  },
                      { key: "max",   label: "Maximum", value: m.max,   Icon: ArrowTrendingUpIcon    },
                    ] as { key: "total"|"avg"|"min"|"max"; label: string; value: number | null; Icon: typeof ScaleIcon }[]
                  ).map(({ key, label, value, Icon }) => {
                    if (value === null) return null;
                    const { formatted, full } = formatKpiValueCompact(value);
                    const pinKey = `${m.column}__${key}`;
                    const isPinned = pinnedKpis[pinKey];

                    return (
                      <div
                        key={pinKey}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow"
                      >
                        {/* En-tête : icône + titre + épingler */}
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-stone-600 dark:text-zinc-300">
                            <Icon className="w-4 h-4" strokeWidth={1.75} />
                          </span>
                          <p
                            className="flex-1 min-w-0 text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wide truncate"
                            title={`${label} · ${m.column}`}
                          >
                            {label} · {m.column}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handlePinKpi(m.column, key, value)}
                            title={isPinned ? "Retirer du dashboard" : "Épingler au dashboard"}
                            className={cn(
                              "p-1 rounded shrink-0 transition-colors",
                              isPinned
                                ? "text-[#A87A08]"
                                : "text-zinc-400 hover:text-[#C8940A] hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            )}
                          >
                            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Valeur principale */}
                        <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 leading-none truncate" title={full}>
                          {formatted}
                        </p>
                      </div>
                    );
                  }))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Report ────────────────────────────────────────── */}
        {activeTab === "report" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-stone-700 dark:text-zinc-300">Insights &amp; Actions</h3>
                {reportChartCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      clearReportCharts();
                      setReportChartCount(0);
                      setChartInReport(false);
                    }}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-500 border border-zinc-200 dark:border-zinc-700 hover:border-rose-300 rounded-lg px-2 py-1 transition-colors"
                    title="Réinitialiser les graphiques du rapport"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Réinitialiser
                  </button>
                )}
              </div>
              {/* Bouton export unique avec menu déroulant */}
              <div ref={exportMenuRef} className="relative flex flex-col items-end gap-1.5">
                {/* Badges */}
                {(chatExportCount + reportChartCount) > 0 && !isExportingPdf && !isExportingWord && (
                  <div className="flex items-center gap-2 text-[11px]">
                    {chatExportCount > 0 && (
                      <span className="flex items-center gap-1 text-[#C8940A]">
                        <ClipboardList className="w-3 h-3" />
                        {chatExportCount} chat
                      </span>
                    )}
                    {reportChartCount > 0 && (
                      <span className="flex items-center gap-1 text-[#C8940A]">
                        <FilePlus2 className="w-3 h-3" />
                        {reportChartCount} graphique{reportChartCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                {/* Bouton principal */}
                <button
                  type="button"
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={isExportingPdf || isExportingWord || reportLoading || !localReport}
                  className="relative flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-200 bg-zinc-100 dark:bg-white/[0.06] hover:bg-zinc-200 dark:hover:bg-white/10 disabled:opacity-60 px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 transition-colors"
                >
                  {isExportingPdf
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Capture PDF…</>
                    : isExportingWord
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Génération Word…</>
                    : <><Download className="w-4 h-4" />Télécharger le rapport</>}
                  {(chatExportCount + reportChartCount) > 0 && !isExportingPdf && !isExportingWord && (
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-[#C8940A] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {chatExportCount + reportChartCount}
                    </span>
                  )}
                </button>

                {/* Menu déroulant */}
                {showExportMenu && !isExportingPdf && !isExportingWord && (
                  <div className="absolute top-full mt-2 right-0 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl overflow-hidden min-w-[200px]">
                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); void handleExportPdf(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-rose-50 dark:hover:bg-rose-950 hover:text-rose-700 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                        <FileDown className="w-4 h-4 text-rose-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">Format PDF</p>
                        <p className="text-[11px] text-zinc-400">Mise en page fixe</p>
                      </div>
                    </button>
                    <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
                    <button
                      type="button"
                      onClick={() => { setShowExportMenu(false); void handleExportWord(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <FileType2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">Format Word</p>
                        <p className="text-[11px] text-zinc-400">Modifiable (.docx)</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
            {reportLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 py-16">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Génération du rapport en cours…</span>
              </div>
            ) : reportError ? (
              <div className="flex flex-col items-center gap-3 text-center py-12">
                <p className="text-sm text-rose-600 dark:text-rose-400">{reportError}</p>
                <button
                  type="button"
                  onClick={() => void handleGenerateReport()}
                  className="text-xs font-semibold text-[#C8940A] hover:underline"
                >
                  Réessayer
                </button>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={localReport ? "loaded" : "empty"}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="prose prose-slate prose-sm max-w-none bg-stone-50 dark:bg-zinc-950 border border-stone-200 dark:border-zinc-800 rounded-xl p-5"
                >
                  <Markdown>{localReport}</Markdown>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
