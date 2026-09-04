import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pin, X, Maximize2, Minimize2, BarChart2, GripVertical, TrendingUp, RefreshCw, FilePlus2, FileCheck2, Radar } from "lucide-react";
import { DashboardItem, KpiItem } from "../types";
import {
  buildArtifactUrl, fetchUserDashboard, unpinUserChart, fetchUserKpis, refreshKpi, pinUserKpi,
  setChartWatched, refreshChart,
} from "../lib/api";
import { KpiCard } from "./KpiCard";
import { CrossfadeIframe } from "./CrossfadeIframe";
import { cn } from "../lib/utils";
import { formatKpiValue, parseAggregateKpiId, aggregateColumn } from "../lib/kpi";
import { isChartInReport, toggleReportChart } from "../lib/reportCharts";

const AUTO_REFRESH_MS = 60_000; // rafraîchissement automatique toutes les 60 s

/**
 * Détermine la valeur brute d'un KPI après rafraîchissement.
 * - KPI dérivé (Max/Min/Total/Moyenne d'un résultat multi-lignes) : recalcule
 *   l'agrégat sur toutes les lignes renvoyées — une seule ligne ne suffit pas.
 * - KPI simple (1 valeur) : cherche la colonne d'origine par nom, insensible à la casse.
 */
function resolveRefreshedValue(
  kpi: KpiItem,
  data: { values: Record<string, unknown>; rows: Record<string, unknown>[] }
): unknown {
  const agg = parseAggregateKpiId(kpi.id);
  if (agg) return aggregateColumn(data.rows ?? [], agg.column, agg.metric);
  const matchedKey = Object.keys(data.values).find(
    k => k.toLowerCase() === kpi.columnName.toLowerCase()
  );
  return matchedKey ? data.values[matchedKey] : Object.values(data.values)[0];
}

export function Dashboard() {
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [reportSet, setReportSet] = useState<Set<string>>(new Set());
  const [unavailableKpis, setUnavailableKpis] = useState<Set<string>>(new Set());
  const [refreshingCharts, setRefreshingCharts] = useState<Set<string>>(new Set());
  const dragId = useRef<string | null>(null);
  const dragOver = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    const [dashData, kpiData] = await Promise.all([
      fetchUserDashboard(),
      fetchUserKpis(),
    ]);
    const dashItems = dashData.dashboard as DashboardItem[];
    setItems(dashItems);
    setKpis(kpiData.kpis as KpiItem[]);
    // Sync état "dans le rapport" depuis localStorage
    setReportSet(new Set(dashItems.filter(i => isChartInReport(i.id)).map(i => i.id)));
  }, []);

  const handleToggleReport = useCallback((e: React.MouseEvent, item: DashboardItem) => {
    e.stopPropagation();
    const added = toggleReportChart({
      id: item.id,
      questionText: item.questionText,
      questionName: item.questionName,
      chartHtml: "",
      chartUrl: item.chartUrl ? buildArtifactUrl(item.chartUrl) : undefined,
      vizType: null,
      addedAt: Date.now(),
    });
    setReportSet(prev => {
      const next = new Set(prev);
      added ? next.add(item.id) : next.delete(item.id);
      return next;
    });
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Auto-refresh : re-exécute le SQL de chaque KPI toutes les 60 s
  useEffect(() => {
    const tick = async () => {
      const kpiData = await fetchUserKpis();
      const current = kpiData.kpis as KpiItem[];
      if (current.length === 0) return;
      const failed = new Set<string>();
      const results = await Promise.allSettled(
        current.map(async kpi => {
          try {
            const data = await refreshKpi(kpi.id);
            if (!data.values || Object.keys(data.values).length === 0) return kpi;
            const raw = resolveRefreshedValue(kpi, data);
            const { formatted, numeric } = formatKpiValue(raw);
            return { ...kpi, previousValue: kpi.rawValue, rawValue: numeric, value: formatted, lastUpdated: Date.now() };
          } catch {
            failed.add(kpi.id); // DB inaccessible — on marque ce KPI
            return kpi;
          }
        })
      );
      setUnavailableKpis(failed);
      const updated = results.map((r, i) => r.status === "fulfilled" ? r.value : current[i]);
      // Persiste TOUS les KPIs mis à jour en base (séquentiellement)
      if (updated.length > 0) {
        try {
          let lastResponse: { kpis: KpiItem[] } | null = null;
          for (const kpi of updated) {
            lastResponse = await pinUserKpi(kpi) as { kpis: KpiItem[] };
          }
          if (lastResponse) setKpis(lastResponse.kpis);
          else setKpis(updated as KpiItem[]);
        } catch {
          setKpis(updated as KpiItem[]);
        }
      }
    };
    void tick(); // exécution immédiate au montage
    const interval = setInterval(() => void tick(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh des graphiques "surveillés" uniquement — opt-in par
  // graphique (bouton Surveiller) pour ne pas imposer à chaque graphique
  // épinglé le coût d'une ré-exécution SQL + régénération HTML toutes les
  // 60 s. Contrairement aux KPIs, pas d'exécution immédiate au montage :
  // le rafraîchissement est plus coûteux (subprocess de rendu du graphique).
  const itemsRef = useRef<DashboardItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    const tick = async () => {
      const watchedIds = itemsRef.current.filter(i => i.watched).map(i => i.id);
      if (watchedIds.length === 0) return;
      setRefreshingCharts(new Set(watchedIds));
      try {
        await Promise.allSettled(watchedIds.map(id => refreshChart(id)));
        const { dashboard } = await fetchUserDashboard();
        const byId = new Map((dashboard as DashboardItem[]).map(d => [d.id, d]));
        setItems(cur => cur.map(item => {
          const fresh = byId.get(item.id);
          return fresh ? { ...item, chartUrl: fresh.chartUrl, pinnedAt: fresh.pinnedAt, watched: fresh.watched } : item;
        }));
      } finally {
        setRefreshingCharts(new Set());
      }
    };
    const interval = setInterval(() => void tick(), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    if (isRefreshingAll) return;
    setIsRefreshingAll(true);
    try {
      // Recharge d'abord la liste à jour depuis le serveur
      const kpiData = await fetchUserKpis();
      const currentKpis = kpiData.kpis as KpiItem[];
      // Ré-exécute chaque KPI en parallèle
      const results = await Promise.allSettled(
        currentKpis.map(async kpi => {
          const data = await refreshKpi(kpi.id);
          if (!data.values || Object.keys(data.values).length === 0) return kpi;
          const raw = resolveRefreshedValue(kpi, data);
          const { formatted, numeric } = formatKpiValue(raw);
          return { ...kpi, previousValue: kpi.rawValue, rawValue: numeric, value: formatted, lastUpdated: Date.now() };
        })
      );
      const updated = results.map((r, i) => r.status === "fulfilled" ? r.value : currentKpis[i]);
      // Sauvegarde le dernier KPI pour mettre à jour la liste côté serveur
      if (updated.length > 0) {
        const last = await pinUserKpi(updated[updated.length - 1]);
        setKpis(last.kpis as KpiItem[]);
      } else {
        setKpis(updated);
      }
    } finally {
      setIsRefreshingAll(false);
    }
  }, [isRefreshingAll]);

  /* ── Drag & Drop reorder ─────────────────────────────── */
  const onDragStart = (id: string) => { dragId.current = id; };
  const onDragEnter = (id: string) => { dragOver.current = id; };
  const onDragEnd   = () => {
    if (!dragId.current || !dragOver.current || dragId.current === dragOver.current) return;
    const arr = [...items];
    const from = arr.findIndex(i => i.id === dragId.current);
    const to   = arr.findIndex(i => i.id === dragOver.current);
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setItems(arr);
    dragId.current = null;
    dragOver.current = null;
  };

  /* ── Actions ─────────────────────────────────────────── */
  const handleRemove = useCallback(async (id: string) => {
    const data = await unpinUserChart(id);
    setItems(data.dashboard as DashboardItem[]);
  }, []);

  const handleToggleSize = useCallback((id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, w: item.w === 6 ? 12 : 6 } : item
    ));
  }, []);

  const handleToggleWatch = useCallback(async (id: string, next: boolean) => {
    try {
      const data = await setChartWatched(id, next);
      setItems(data.dashboard as DashboardItem[]);
    } catch {
      // L'état affiché reste inchangé — l'utilisateur peut réessayer.
    }
  }, []);

  /* ── Empty state ─────────────────────────────────────── */
  if (items.length === 0 && kpis.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
        <div className="w-16 h-16 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-6">
          <BarChart2 className="w-7 h-7 text-zinc-300" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Tableau de bord vide</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
          Épinglez des graphiques ou des KPIs depuis vos analyses.
        </p>
        <div className="mt-5 flex flex-col gap-2 items-center">
          <div className="flex items-center gap-2 text-xs text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2">
            <Pin className="w-3.5 h-3.5" />
            Bouton "Épingler" dans l'onglet Chart
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Bouton "Épingler comme KPI" dans l'onglet Results (1 valeur)
          </div>
        </div>
      </div>
    );
  }

  /* ── Dashboard grid ──────────────────────────────────── */
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Tableau de bord</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {kpis.length > 0 && `${kpis.length} KPI${kpis.length > 1 ? "s" : ""} · `}
            {items.length} graphique{items.length > 1 ? "s" : ""} · Glissez pour réorganiser
          </p>
        </div>
        {kpis.length > 0 && (
          <button
            onClick={() => void handleRefreshAll()}
            disabled={isRefreshingAll}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-white/[0.06] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
            title="Mettre à jour tous les KPIs"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefreshingAll && "animate-spin")} />
            {isRefreshingAll ? "Mise à jour…" : "Tout rafraîchir"}
          </button>
        )}
      </div>

      {/* ── Section KPIs ───────────────────────────────────── */}
      {kpis.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">KPIs</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {kpis.map(kpi => (
              <KpiCard key={kpi.id} item={kpi} onUpdate={setKpis} dbUnavailable={unavailableKpis.has(kpi.id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Graphiques ─────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Graphiques</h3>
        </div>
      )}

      {/* Grille 12 colonnes */}
      <div className="grid grid-cols-12 gap-3 auto-rows-auto">
        {items.map(item => (
          <div
            key={item.id}
            draggable
            onDragStart={() => onDragStart(item.id)}
            onDragEnter={() => onDragEnter(item.id)}
            onDragEnd={onDragEnd}
            onDragOver={e => e.preventDefault()}
            className={cn(
              "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col transition-shadow hover:shadow-md",
              item.w === 12 ? "col-span-12" : "col-span-12 md:col-span-6"
            )}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 shrink-0">
              <span className="cursor-grab active:cursor-grabbing text-zinc-300 hover:text-zinc-500">
                <GripVertical className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.questionText}</p>
                <p className="text-[10px] text-zinc-400">{item.database}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => void handleToggleWatch(item.id, !item.watched)}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    item.watched
                      ? "text-[#C8940A] bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                      : "text-zinc-400 hover:text-[#C8940A] hover:bg-amber-50 dark:hover:bg-amber-500/10"
                  )}
                  title={item.watched ? "Rafraîchissement automatique activé (toutes les 60s)" : "Activer le rafraîchissement automatique"}
                >
                  <Radar className={cn("w-3.5 h-3.5", refreshingCharts.has(item.id) && "animate-pulse")} />
                </button>
                <button
                  onClick={(e) => handleToggleReport(e, item)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={cn(
                    "p-1.5 rounded transition-colors",
                    reportSet.has(item.id)
                      ? "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                      : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50"
                  )}
                  title={reportSet.has(item.id) ? "Retirer du rapport" : "Ajouter au rapport"}
                >
                  {reportSet.has(item.id)
                    ? <FileCheck2 className="w-3.5 h-3.5" />
                    : <FilePlus2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleToggleSize(item.id)}
                  className="p-1.5 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
                  title={item.w === 6 ? "Pleine largeur" : "Demi largeur"}
                >
                  {item.w === 6
                    ? <Maximize2 className="w-3.5 h-3.5" />
                    : <Minimize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => void handleRemove(item.id)}
                  className="p-1.5 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                  title="Retirer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Graphique Plotly — chargé via URL pour ne pas saturer localStorage.
                CrossfadeIframe évite le flash blanc au rafraîchissement (nouvelle
                page chargée en arrière-plan puis fondu, plutôt que de vider
                l'iframe visible pendant le chargement). */}
            <div className="h-80">
              {item.chartUrl ? (
                <CrossfadeIframe
                  title={`dash-${item.id}`}
                  // `pinnedAt` en query param force le rechargement quand le
                  // graphique est re-épinglé (changement de type, rafraîchissement)
                  // — sans ça, l'URL de l'artefact ne change jamais.
                  src={`${buildArtifactUrl(item.chartUrl)}?v=${item.pinnedAt}`}
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                  Aucun graphique
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
