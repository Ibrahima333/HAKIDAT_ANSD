import type { PipelineResult, PipelineResultSummary } from "../types";
import { clearAuth, getToken } from "./auth";

function buildUrl(path: string): string {
  const base = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;
  return base ? `${base}${path}` : path;
}

// Messages d'erreur HTTP en francais
const HTTP_ERRORS: Record<number, string> = {
  400: "Requete invalide",
  401: "Session expirée — veuillez vous reconnecter",
  403: "Acces refuse",
  404: "Ressource introuvable",
  422: "Donnees invalides envoyees au serveur",
  429: "Trop de requetes - reessayez dans quelques secondes",
  500: "Erreur interne du serveur",
  502: "Le backend est inaccessible (502)",
  503: "Service temporairement indisponible",
  504: "Delai d'attente depasse (504)",
};

/** Requête authentifiée — ajoute automatiquement le JWT. */
export async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. Verifiez que le backend est demarre.");
  }

  // Token expiré → déconnexion automatique via événement (sans reload)
  if (response.status === 401) {
    clearAuth();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expirée");
  }

  if (!response.ok) {
    const bodyText = await response.text();
    let message = HTTP_ERRORS[response.status] ?? `Erreur ${response.status}`;
    if (bodyText?.trim()) {
      try {
        const payload = JSON.parse(bodyText);
        const detail = payload?.detail ?? payload?.message;
        if (detail) message = String(detail);
      } catch {
        // Corps non-JSON : ne l'utiliser que si ce n'est pas une page d'erreur
        // HTML (ex: 502/503/504 renvoyés par nginx avant même d'atteindre le
        // backend) — sinon l'utilisateur voit le HTML brut de la page d'erreur
        // au lieu du message HTTP_ERRORS déjà prévu pour ce code de statut.
        const looksLikeHtml = /<\s*html|<\s*!doctype/i.test(bodyText);
        if (!looksLikeHtml && bodyText.length < 200) message = bodyText;
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Alias pour la compatibilité interne (routes sans auth — login) */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init);
}

export function buildArtifactUrl(path: string): string {
  return buildUrl(path);
}

export async function fetchConfig(databaseName?: string): Promise<{
  databases: string[];
  schemas: string[];
  providers: string[];
  selectedDatabase: string;
  selectedSchema: string;
  selectedProvider: string;
}> {
  const query = databaseName
    ? `?databaseName=${encodeURIComponent(databaseName)}`
    : "";
  return request(`/api/config${query}`);
}

// ── Connexions aux bases (admin) ──────────────────────────────────────────────

export interface ServerCredentials {
  db_type:  string;
  host:     string;
  port:     number;
  user:     string;
  password: string;
}

export interface DbConnection {
  id:      number;
  name:    string;
  db_type: string;
  host:    string;
  port:    number;
  user:    string;
  schema:  string;
  userIds: number[];
}

export async function discoverDatabases(
  creds: ServerCredentials,
): Promise<{ databases: string[]; registered: string[] }> {
  return request("/api/admin/db-connections/discover", {
    method: "POST",
    body: JSON.stringify(creds),
  });
}

export async function fetchDbConnections(): Promise<{ connections: DbConnection[] }> {
  return request("/api/admin/db-connections");
}

export async function createDbConnections(
  payload: ServerCredentials & { databases: string[] },
): Promise<{ created: string[]; failed: { database: string; error: string }[] }> {
  return request("/api/admin/db-connections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteDbConnection(id: number): Promise<void> {
  await request(`/api/admin/db-connections/${id}`, { method: "DELETE" });
}

export async function setDbConnectionAccess(
  id: number,
  userIds: number[],
): Promise<{ userIds: number[] }> {
  return request(`/api/admin/db-connections/${id}/access`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function refreshKpi(kpiId: string): Promise<{
  columns: string[];
  values: Record<string, unknown>;
  rows: Record<string, unknown>[];
  rowCount: number;
}> {
  return request(`/api/kpi/refresh/${encodeURIComponent(kpiId)}`, {
    method: "POST",
  });
}

export async function fetchHistory(): Promise<PipelineResultSummary[]> {
  const payload = await request<{ history: PipelineResultSummary[] }>(
    "/api/results"
  );
  return payload.history;
}

export async function fetchResult(questionName: string): Promise<PipelineResult> {
  return request(`/api/results/${encodeURIComponent(questionName)}`);
}

export async function clearHistory(): Promise<void> {
  await request("/api/history", { method: "DELETE" });
}

export async function deleteResult(questionName: string): Promise<void> {
  await request(`/api/results/${encodeURIComponent(questionName)}`, { method: "DELETE" });
}

export async function runPipeline(
  payload: {
    questionText: string;
    artifactName: string;
    databaseName: string;
    schemaName: string;
    providerName: string;
    overwriteExisting: boolean;
  },
  signal?: AbortSignal,
): Promise<PipelineResult> {
  return request("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export async function regenViz(payload: {
  questionName: string;
  chartType: string;
  providerName: string;
}): Promise<PipelineResult> {
  return request("/api/pipeline/regen_viz", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateReport(payload: {
  questionName: string;
  providerName: string;
}): Promise<PipelineResult> {
  return request("/api/pipeline/generate_report", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── KPIs (MySQL par user) ─────────────────────────────────────────────────────

export async function fetchUserKpis(): Promise<{ kpis: any[] }> {
  return request("/api/user/kpis");
}

export async function pinUserKpi(kpi: any): Promise<{ kpis: any[] }> {
  return request("/api/user/kpis", { method: "POST", body: JSON.stringify(kpi) });
}

export async function unpinUserKpi(kpiId: string): Promise<{ kpis: any[] }> {
  return request(`/api/user/kpis/${encodeURIComponent(kpiId)}`, { method: "DELETE" });
}

// ── Dashboard (MySQL par user) ────────────────────────────────────────────────

export async function fetchUserDashboard(): Promise<{ dashboard: any[] }> {
  return request("/api/user/dashboard");
}

export async function pinUserChart(item: any): Promise<{ dashboard: any[] }> {
  return request("/api/user/dashboard", { method: "POST", body: JSON.stringify(item) });
}

export async function unpinUserChart(chartId: string): Promise<{ dashboard: any[] }> {
  return request(`/api/user/dashboard/${encodeURIComponent(chartId)}`, { method: "DELETE" });
}

export async function setChartWatched(chartId: string, watched: boolean): Promise<{ dashboard: any[] }> {
  return request(`/api/user/dashboard/${encodeURIComponent(chartId)}/watch`, {
    method: "POST",
    body: JSON.stringify({ watched }),
  });
}

export async function refreshChart(chartId: string): Promise<{ dashboard: any[] }> {
  return request(`/api/user/dashboard/${encodeURIComponent(chartId)}/refresh`, { method: "POST" });
}

export async function fetchLlmConfig(): Promise<{
  config?: { gemini_api_key?: string; groq_api_key?: string; groq_api_url?: string; claude_api_key?: string };
  lastTest?: { success?: boolean; message?: string } | null;
  availableProviders?: string[];
  isAdmin?: boolean;
}> {
  return request("/api/llm-config");
}

export async function testLlmConfig(payload: {
  gemini_api_key?: string;
  groq_api_key?: string;
  groq_api_url?: string;
  claude_api_key?: string;
}): Promise<{ success: boolean; message: string; lastTest?: any }> {
  return request("/api/llm-config/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveLlmConfig(payload: {
  gemini_api_key?: string;
  groq_api_key?: string;
  groq_api_url?: string;
  claude_api_key?: string;
}): Promise<{ success?: boolean; message?: string; config?: any; lastTest?: any }> {
  return request("/api/llm-config/save", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Import CSV / Excel ────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<{
  name: string;
  table: string;
  rows: number;
  columns: string[];
  filename: string;
}> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(buildUrl("/api/upload"), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch {
    throw new Error("Impossible de joindre le serveur.");
  }

  if (response.status === 401) {
    clearAuth();
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Session expirée");
  }
  // 413 : rejeté par nginx (client_max_body_size), qui répond en HTML.
  // Sans ce cas, JSON.parse échoue et l'utilisateur ne voit que « Erreur 413 ».
  if (response.status === 413) {
    throw new Error(
      "Fichier trop volumineux pour le serveur. Réduisez-le ou découpez-le en plusieurs fichiers."
    );
  }
  if (!response.ok) {
    const bodyText = await response.text();
    let message = `Erreur ${response.status}`;
    try { message = JSON.parse(bodyText)?.detail ?? message; } catch { /* noop */ }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchUploads(): Promise<{
  uploads: { name: string; tables: string[]; rows: number; size_kb: number }[];
}> {
  return request("/api/uploads");
}

export async function deleteUpload(name: string): Promise<void> {
  await request(`/api/uploads/${encodeURIComponent(name)}`, { method: "DELETE" });
}




