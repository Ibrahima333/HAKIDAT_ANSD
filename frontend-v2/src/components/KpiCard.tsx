import React, { useEffect, useRef, useState } from "react";
import { RefreshCw, Database, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CubeIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";
import { KpiItem } from "../types";
import { formatKpiValue, formatKpiValueCompact, computeDelta, parseAggregateKpiId, aggregateColumn } from "../lib/kpi";
import { refreshKpi, unpinUserKpi, pinUserKpi } from "../lib/api"; // pinUserKpi used in handleRefresh

interface Props {
  item: KpiItem;
  onUpdate: (items: KpiItem[]) => void;
  dbUnavailable?: boolean;
}

export function KpiCard({ item, onUpdate, dbUnavailable = false }: Props) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const data = await refreshKpi(item.id);
      if (!data.values || Object.keys(data.values).length === 0) {
        setError("Aucun résultat retourné");
        return;
      }
      // KPI dérivé (Max/Min/Total/Moyenne) : recalcule sur toutes les lignes —
      // une seule ligne ne suffit pas à retrouver le bon agrégat.
      const agg = parseAggregateKpiId(item.id);
      const raw = agg
        ? aggregateColumn(data.rows ?? [], agg.column, agg.metric)
        : (() => {
            const matchedKey = Object.keys(data.values).find(
              k => k.toLowerCase() === item.columnName.toLowerCase()
            );
            return matchedKey
              ? data.values[matchedKey]
              : Object.values(data.values).find(v => typeof v === "number") ?? Object.values(data.values)[0];
          })();
      const { formatted, numeric } = formatKpiValue(raw);

      // Si la valeur d'origine était numérique et la nouvelle ne l'est pas → erreur
      if (item.rawValue !== null && numeric === null) {
        setError(`Valeur inattendue : "${formatted}". La valeur précédente a été conservée.`);
        return;
      }

      const updated = await pinUserKpi({
        ...item,
        previousValue: item.rawValue,
        rawValue: numeric,
        value: formatted,
        lastUpdated: Date.now(),
      });
      onUpdate(updated.kpis as KpiItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRemove = async () => {
    const data = await unpinUserKpi(item.id);
    onUpdate(data.kpis as KpiItem[]);
  };

  const delta = computeDelta(item.rawValue, item.previousValue);
  const lastUpdatedLabel = new Date(item.lastUpdated).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const displayValue = item.rawValue !== null ? formatKpiValueCompact(item.rawValue).formatted : item.value;

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow relative">

      {/* En-tête : icône + titre + menu */}
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-stone-600 dark:text-zinc-300">
          <CubeIcon className="w-4 h-4" strokeWidth={1.75} />
        </span>
        <p
          className="flex-1 min-w-0 text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wide truncate"
          title={item.questionText}
        >
          {item.columnName}
        </p>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(v => !v)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            title="Options"
          >
            <EllipsisVerticalIcon className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden min-w-[140px]">
              <button
                type="button"
                onClick={() => { setShowMenu(false); void handleRefresh(); }}
                disabled={isRefreshing}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} /> Rafraîchir
              </button>
              <button
                type="button"
                onClick={() => { setShowMenu(false); void handleRemove(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors"
              >
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Valeur principale */}
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <p
          className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 leading-none shrink-0 truncate max-w-full"
          title={item.value}
        >
          {displayValue}
        </p>
        {/* Delta automatique */}
        {delta !== null && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md shrink-0",
            delta > 0
              ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400"
              : delta < 0
              ? "text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400"
              : "text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
          )}>
            {delta > 0
              ? <TrendingUp className="w-3 h-3" />
              : delta < 0
              ? <TrendingDown className="w-3 h-3" />
              : <Minus className="w-3 h-3" />}
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </div>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-[11px] text-rose-600 bg-rose-50 rounded px-2 py-1">{error}</p>
      )}

      {/* Pied : base + date */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
          <Database className="w-3 h-3" />
          {item.database}
          <span
            title={dbUnavailable ? "Base de données inaccessible" : "Base de données connectée"}
            className={`w-1.5 h-1.5 rounded-full ${dbUnavailable ? "bg-rose-400" : "bg-emerald-400"}`}
          />
        </div>
        <p className="text-[10px] text-zinc-400">{lastUpdatedLabel}</p>
      </div>
    </div>
  );
}
