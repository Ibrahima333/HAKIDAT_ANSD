/**
 * Utilitaires KPI — formatage et calcul delta.
 * Le stockage/CRUD est géré via le backend (/api/user/kpis).
 */

/** Formate un nombre brut pour l'affichage (séparateurs milliers, décimales) */
export function formatKpiValue(raw: unknown): { formatted: string; numeric: number | null } {
  if (raw === null || raw === undefined || raw === "") {
    return { formatted: "—", numeric: null };
  }
  const n = Number(raw);
  if (isNaN(n)) {
    return { formatted: String(raw), numeric: null };
  }
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(n);
  return { formatted, numeric: n };
}

/**
 * Version compacte d'une valeur KPI pour l'affichage en carte (1,2 M au lieu de
 * 1 234 567) — la valeur complète reste disponible via l'attribut `full` pour un
 * tooltip, afin de ne jamais perdre l'information exacte.
 */
export function formatKpiValueCompact(raw: unknown): { formatted: string; full: string; numeric: number | null } {
  const { formatted: full, numeric } = formatKpiValue(raw);
  if (numeric === null) {
    return { formatted: full, full, numeric };
  }
  const formatted = new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(numeric);
  return { formatted, full, numeric };
}

/** Calcule le delta % entre deux valeurs */
export function computeDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

type AggMetric = "total" | "avg" | "min" | "max";
const AGG_METRICS: ReadonlySet<string> = new Set(["total", "avg", "min", "max"]);

/**
 * Détecte si un id de KPI suit le format `${resultId}__${column}__${metric}`,
 * utilisé pour les KPIs dérivés d'un résultat multi-lignes (ex : Max de nombre_de_patients
 * sur une analyse groupée par spécialité). Retourne null pour un KPI simple (1 valeur),
 * dont l'id ne suit pas ce format.
 */
export function parseAggregateKpiId(kpiId: string): { column: string; metric: AggMetric } | null {
  const parts = kpiId.split("__");
  if (parts.length !== 3) return null;
  const [, column, metric] = parts;
  if (!AGG_METRICS.has(metric)) return null;
  return { column, metric: metric as AggMetric };
}

/**
 * Recalcule un agrégat (total/moyenne/min/max) sur une colonne à partir des lignes
 * brutes d'un résultat. Utilisé au rafraîchissement d'un KPI dérivé : le backend ne
 * peut pas savoir seul quel agrégat afficher, donc on le recalcule ici côté client.
 */
export function aggregateColumn(
  rows: Record<string, unknown>[],
  column: string,
  metric: AggMetric
): number | null {
  const nums = rows
    .map(r => Number(r[column]))
    .filter(n => !isNaN(n) && isFinite(n));
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  switch (metric) {
    case "total": return total;
    case "avg":   return total / nums.length;
    case "min":   return Math.min(...nums);
    case "max":   return Math.max(...nums);
  }
}
