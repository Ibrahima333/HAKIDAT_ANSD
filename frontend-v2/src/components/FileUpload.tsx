import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FileSpreadsheet, Trash2, CheckCircle2, AlertCircle,
  Loader2, ChevronDown, ChevronUp, FileUp, Link2, X, Library,
  Search, ArrowLeft, ShieldCheck, ShieldAlert, ExternalLink, Database,
} from "lucide-react";
import { cn } from "../lib/utils";
import { uploadFile, fetchUploads, deleteUpload, apiFetch } from "../lib/api";

/** Une ligne du catalogue ANADS (résultat de recherche). */
interface AnadsSearchRow {
  identifiant: string;
  titre: string;
  acces: string;
  annee_debut: number | null;
  annee_fin: number | null;
}

/** Fiche descriptive complète d'une enquête (métadonnées DDI + condition d'accès). */
interface AnadsFiche {
  idno: string;
  titre: string;
  producteur: string;
  annee_debut: string | number | null;
  annee_fin: string | number | null;
  access_type: string;
  access_label: string;
  access_downloadable: boolean;
  resume: string;
  univers: string;
  couverture_geo: string;
  periode_collecte: { debut: string | null; fin: string | null };
  contact: string;
  url_catalogue: string;
}

/** Fichier attaché à une enquête (microdonnées ou document). */
interface AnadsResource {
  resource_id: string;
  titre: string;
  type: string;
  format: string;
  filename: string;
  extension: string;
  is_microdata: boolean;
  supported: boolean;
  url: string;
}

/**
 * Taille maximale d'un import.
 * Doit rester alignée sur `client_max_body_size` dans frontend/Dockerfile :
 * si nginx est plus strict, l'utilisateur reçoit un 413 sans message clair.
 */
const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Formate une taille en octets de façon lisible (Ko ou Mo). */
function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
}

interface UploadedFile {
  name: string;
  tables: string[];
  rows: number;
  size_kb: number;
}

interface Props {
  /** Appelé quand l'utilisateur active un fichier importé comme source active */
  onActivate: (dbName: string) => void;
  /** Nom du fichier actuellement actif (sqlite db_name), ou "" */
  activeUpload: string;
}

export function FileUpload({ onActivate, activeUpload }: Props) {
  const [files, setFiles]             = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging]   = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Import URL ──────────────────────────────────────────────────────────────
  const [urlValue, setUrlValue]       = useState("");
  const [urlName, setUrlName]         = useState("");
  const [urlLoading, setUrlLoading]   = useState(false);
  const [urlError, setUrlError]       = useState<string | null>(null);
  const [urlSuccess, setUrlSuccess]   = useState<{ name: string; rows: number } | null>(null);

  const isGoogleSheets = urlValue.includes("docs.google.com/spreadsheets");

  const handleUrlImport = async () => {
    if (!urlValue.trim() || urlLoading) return;
    setUrlLoading(true);
    setUrlError(null);
    setUrlSuccess(null);
    try {
      const result = await apiFetch<{ name: string; rows: number; columns: string[] }>("/api/import-url", {
        method: "POST",
        body: JSON.stringify({ url: urlValue.trim(), name: urlName.trim() }),
      });
      setUrlSuccess({ name: result.name, rows: result.rows });
      await load();
      onActivate(result.name);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setUrlLoading(false);
    }
  };

  const handleUrlClear = () => {
    setUrlValue(""); setUrlName(""); setUrlError(null); setUrlSuccess(null);
  };

  // ── ANADS : catalogue → fiche → vérification d'accès → microdonnées ────────
  const [anadsQuery, setAnadsQuery]         = useState("");
  const [anadsSearching, setAnadsSearching] = useState(false);
  const [anadsResults, setAnadsResults]     = useState<AnadsSearchRow[]>([]);
  const [anadsFound, setAnadsFound]         = useState(0);
  const [anadsSearchError, setAnadsSearchError] = useState<string | null>(null);
  const [anadsSearched, setAnadsSearched]   = useState(false);

  // Enquête sélectionnée (fiche descriptive + vérification des conditions d'accès)
  const [selectedIdno, setSelectedIdno]     = useState<string | null>(null);
  const [ficheLoading, setFicheLoading]     = useState(false);
  const [ficheError, setFicheError]         = useState<string | null>(null);
  const [fiche, setFiche]                   = useState<AnadsFiche | null>(null);
  const [resources, setResources]           = useState<AnadsResource[]>([]);

  // Import des microdonnées (une fois l'accès vérifié)
  const [microdataResourceId, setMicrodataResourceId] = useState("");
  const [microdataLoading, setMicrodataLoading]       = useState(false);
  const [microdataError, setMicrodataError]           = useState<string | null>(null);
  const [microdataSuccess, setMicrodataSuccess]       = useState<{ name: string; rows: number } | null>(null);

  // Import du catalogue complet (métadonnées seules, pour parcourir/analyser l'offre)
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError]     = useState<string | null>(null);
  const [catalogSuccess, setCatalogSuccess] = useState<{ name: string; rows: number } | null>(null);

  const handleAnadsSearch = async () => {
    if (anadsSearching) return;
    setAnadsSearching(true);
    setAnadsSearchError(null);
    try {
      const result = await apiFetch<{ rows: AnadsSearchRow[]; found: number }>(
        `/api/anads/search?q=${encodeURIComponent(anadsQuery.trim())}&limit=15`
      );
      setAnadsResults(result.rows);
      setAnadsFound(result.found);
      setAnadsSearched(true);
    } catch (err) {
      setAnadsSearchError(err instanceof Error ? err.message : "Erreur lors de la recherche");
    } finally {
      setAnadsSearching(false);
    }
  };

  const handleSelectEnquete = async (idno: string) => {
    setSelectedIdno(idno);
    setFiche(null);
    setResources([]);
    setFicheError(null);
    setMicrodataError(null);
    setMicrodataSuccess(null);
    setMicrodataResourceId("");
    setFicheLoading(true);
    try {
      const result = await apiFetch<{ fiche: AnadsFiche; resources: AnadsResource[] }>(
        `/api/anads/fiche/${encodeURIComponent(idno)}`
      );
      setFiche(result.fiche);
      setResources(result.resources);
    } catch (err) {
      setFicheError(err instanceof Error ? err.message : "Erreur lors de la récupération de la fiche");
    } finally {
      setFicheLoading(false);
    }
  };

  const handleBackToResults = () => {
    setSelectedIdno(null);
    setFiche(null);
    setResources([]);
    setFicheError(null);
  };

  const handleImportMicrodata = async () => {
    if (!fiche || microdataLoading) return;
    setMicrodataLoading(true);
    setMicrodataError(null);
    setMicrodataSuccess(null);
    try {
      const result = await apiFetch<{ name: string; rows: number }>("/api/import-anads-microdata", {
        method: "POST",
        body: JSON.stringify({ idno: fiche.idno, resource_id: microdataResourceId }),
      });
      setMicrodataSuccess({ name: result.name, rows: result.rows });
      await load();
      onActivate(result.name);
    } catch (err) {
      setMicrodataError(err instanceof Error ? err.message : "Erreur lors de l'import des microdonnées");
    } finally {
      setMicrodataLoading(false);
    }
  };

  const handleImportCatalog = async () => {
    if (catalogLoading) return;
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogSuccess(null);
    try {
      const result = await apiFetch<{ name: string; rows: number }>("/api/import-anads", {
        method: "POST",
        body: JSON.stringify({ query: anadsQuery.trim() }),
      });
      setCatalogSuccess({ name: result.name, rows: result.rows });
      await load();
      onActivate(result.name);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Erreur lors de l'import du catalogue");
    } finally {
      setCatalogLoading(false);
    }
  };

  const microdataResources = resources.filter(r => r.is_microdata);

  const load = async () => {
    try {
      const res = await fetchUploads();
      setFiles(res.uploads);
    } catch { /* silent */ }
  };

  useEffect(() => { void load(); }, []);

  const handleFiles = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const file = incoming[0];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      setError("Format non supporté. Utilisez .csv, .xlsx ou .xls");
      return;
    }
    // Contrôle de taille avant l'envoi : sans cela nginx renvoie un 413 brut,
    // sans message exploitable, après avoir transféré tout le fichier.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `Fichier trop volumineux : ${formatSize(file.size)}. ` +
        `La taille maximale est de ${MAX_UPLOAD_MB} Mo.`
      );
      return;
    }
    setError(null);
    setSuccess(null);
    setIsUploading(true);
    try {
      const res = await uploadFile(file);
      setSuccess(`« ${res.filename} » importé — ${res.rows.toLocaleString()} lignes, ${res.columns.length} colonnes`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'import");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  }, []);

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer « ${name} » ?`)) return;
    try {
      await deleteUpload(name);
      if (activeUpload === name) onActivate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la suppression");
    }
  };

  const handleActivate = (name: string) => {
    setError(null);
    onActivate(name);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className={cn("w-4 h-4 shrink-0", activeUpload ? "text-emerald-500" : "text-zinc-500")} />
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className="font-medium text-zinc-100 text-[12px]">Fichiers CSV / Excel</span>
          <span className="text-[10.5px] text-zinc-500 truncate">
            {activeUpload
              ? `· actif : ${activeUpload}`
              : files.length > 0
              ? `· ${files.length} fichier${files.length > 1 ? "s" : ""}`
              : "· importer un fichier"}
          </span>
        </div>
        {activeUpload && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
      </div>

      <div>
          {/* Zone de dépôt */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !isUploading && inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors",
              isDragging
                ? "border-amber-500/60 bg-amber-500/10"
                : "border-zinc-600 hover:border-amber-500/50 hover:bg-zinc-700/30"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => void handleFiles(e.target.files)}
            />
            {isUploading ? (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            ) : (
              <FileUp className="w-5 h-5 text-zinc-500" />
            )}
            <p className="text-[11px] text-zinc-400 text-center leading-relaxed">
              {isUploading
                ? "Import en cours…"
                : <>Glissez un fichier ici ou <span className="text-amber-400">cliquez pour choisir</span></>}
            </p>
            <p className="text-[9.5px] text-zinc-600">.csv · .xlsx · .xls</p>
          </div>

          {/* Messages */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-rose-950/40 border border-rose-800/50 px-3 py-2 text-[11px] text-rose-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {success && !error && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-950/40 border border-emerald-800/50 px-3 py-2 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {success}
            </div>
          )}

          {/* Liste des fichiers importés */}
          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9.5px] font-semibold text-zinc-500 uppercase tracking-wider px-1">
                Fichiers disponibles
              </p>
              {files.map(f => (
                <div
                  key={f.name}
                  onClick={() => handleActivate(f.name)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors group",
                    activeUpload === f.name
                      ? "bg-amber-500/15 border border-amber-500/30"
                      : "bg-zinc-900/50 border border-zinc-700/50 hover:bg-zinc-700/50"
                  )}
                >
                  <FileSpreadsheet className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    activeUpload === f.name ? "text-amber-400" : "text-zinc-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-[11px] font-semibold truncate",
                      activeUpload === f.name ? "text-white" : "text-zinc-300"
                    )}>
                      {f.name}
                    </p>
                    <p className="text-[9.5px] text-zinc-500">
                      {f.rows.toLocaleString()} lignes · {f.size_kb} Ko
                    </p>
                  </div>
                  {activeUpload === f.name && (
                    <span className="text-[9px] font-bold text-amber-300 shrink-0">ACTIF</span>
                  )}
                  <button
                    type="button"
                    onClick={e => void handleDelete(f.name, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-rose-400 shrink-0"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {files.length === 0 && !isUploading && (
            <p className="text-center text-[10.5px] text-zinc-600 py-1">
              Aucun fichier importé pour l'instant
            </p>
          )}

          {/* ── Import URL ────────────────────────────────────────────── */}
          <div className="border-t border-zinc-700/60 pt-3 space-y-2">
            <p className="text-[9.5px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> Import URL
            </p>

            {urlSuccess ? (
              <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-emerald-400">{urlSuccess.name}</p>
                  <p className="text-[9.5px] text-zinc-500">{urlSuccess.rows} lignes · actif</p>
                </div>
                <button onClick={handleUrlClear} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="url"
                  value={urlValue}
                  onChange={e => { setUrlValue(e.target.value); setUrlError(null); }}
                  placeholder={isGoogleSheets ? "Google Sheets (lien de partage)" : "https://exemple.com/data.csv"}
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-[11px] rounded-md px-2.5 py-2 outline-none focus:ring-1 focus:ring-amber-500 placeholder-zinc-600"
                />
                {isGoogleSheets && (
                  <p className="text-[9.5px] text-amber-300">Feuille doit être publique</p>
                )}
                <input
                  type="text"
                  value={urlName}
                  onChange={e => setUrlName(e.target.value)}
                  placeholder="Nom de la source (optionnel)"
                  className="w-full bg-zinc-900 border border-zinc-700 text-zinc-100 text-[11px] rounded-md px-2.5 py-2 outline-none focus:ring-1 focus:ring-amber-500 placeholder-zinc-600"
                />
                {urlError && (
                  <div className="flex items-start gap-1.5 text-rose-400 text-[9.5px]">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{urlError}</span>
                  </div>
                )}
                <button
                  onClick={() => void handleUrlImport()}
                  disabled={!urlValue.trim() || urlLoading}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-40 text-white text-[11px] font-medium py-1.5 rounded-md transition-colors"
                >
                  {urlLoading
                    ? <><Loader2 className="w-3 h-3 animate-spin" />Import en cours…</>
                    : <><Link2 className="w-3 h-3" />Importer</>}
                </button>
              </div>
            )}
          </div>

          {/* ── ANADS — enquêtes de l'ANSD ───────────────────────────────
              Catalogue → fiche descriptive → choix de l'enquête →
              vérification des conditions d'accès → microdonnées → HakiData */}
          <div className="border-t border-zinc-700/60 pt-3 space-y-2">
            <p className="text-[9.5px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Library className="w-3 h-3" /> ANADS — enquêtes de l'ANSD
            </p>

            {microdataSuccess ? (
              <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-emerald-400">{microdataSuccess.name}</p>
                  <p className="text-[9.5px] text-zinc-500">{microdataSuccess.rows.toLocaleString()} lignes · actif</p>
                </div>
                <button
                  onClick={() => { setMicrodataSuccess(null); handleBackToResults(); }}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : selectedIdno ? (
              /* ── Fiche descriptive + vérification des conditions d'accès ── */
              <div className="space-y-2">
                <button
                  onClick={handleBackToResults}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  <ArrowLeft className="w-3 h-3" /> Retour aux résultats
                </button>

                {ficheLoading && (
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Récupération de la fiche…
                  </div>
                )}

                {ficheError && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-950/40 border border-rose-800/50 px-3 py-2 text-[11px] text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    {ficheError}
                  </div>
                )}

                {fiche && (
                  <div className="rounded-lg bg-zinc-900/50 border border-zinc-700/50 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-zinc-200 leading-snug">{fiche.titre}</p>
                    <p className="text-[9.5px] text-zinc-500">
                      {fiche.producteur} · {fiche.annee_debut}{fiche.annee_fin && fiche.annee_fin !== fiche.annee_debut ? `–${fiche.annee_fin}` : ""}
                    </p>
                    {fiche.resume && (
                      <p className="text-[10px] text-zinc-400 leading-relaxed line-clamp-3">{fiche.resume}</p>
                    )}

                    {/* Vérification des conditions d'accès */}
                    <div className={cn(
                      "flex items-start gap-2 rounded-md px-2.5 py-2 border text-[10.5px]",
                      fiche.access_downloadable
                        ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                        : "bg-amber-950/30 border-amber-800/40 text-amber-300"
                    )}>
                      {fiche.access_downloadable
                        ? <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        : <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                      <div>
                        <p className="font-medium">{fiche.access_label}</p>
                        {!fiche.access_downloadable && (
                          <p className="text-[9.5px] text-amber-400/80 mt-0.5">
                            Microdonnées non téléchargeables automatiquement. Demandez l'accès à
                            l'ANSD ({fiche.contact}) ou consultez{" "}
                            <a href={fiche.url_catalogue} target="_blank" rel="noreferrer"
                               className="underline inline-flex items-center gap-0.5">
                              la fiche ANADS <ExternalLink className="w-2.5 h-2.5" />
                            </a>.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Microdonnées : disponibles uniquement si l'accès le permet */}
                    {fiche.access_downloadable && (
                      <div className="space-y-1.5 pt-1">
                        {microdataResources.length === 0 ? (
                          <p className="text-[9.5px] text-zinc-500">
                            Aucun fichier de microdonnées attaché à cette enquête dans ANADS.
                          </p>
                        ) : (
                          <>
                            <p className="text-[9.5px] font-semibold text-zinc-500 uppercase tracking-wider">
                              Fichiers de microdonnées
                            </p>
                            <div className="space-y-1">
                              {microdataResources.map(r => (
                                <label
                                  key={r.resource_id}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md px-2 py-1.5 border text-[10px] cursor-pointer",
                                    !r.supported && "opacity-40 cursor-not-allowed",
                                    microdataResourceId === r.resource_id
                                      ? "border-amber-500/50 bg-amber-500/10"
                                      : "border-zinc-700/50 hover:bg-zinc-800/60"
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name="microdata-resource"
                                    disabled={!r.supported}
                                    checked={microdataResourceId === r.resource_id}
                                    onChange={() => setMicrodataResourceId(r.resource_id)}
                                    className="shrink-0"
                                  />
                                  <span className="flex-1 min-w-0 truncate text-zinc-300">{r.filename}</span>
                                  <span className="text-[9px] text-zinc-500 uppercase shrink-0">
                                    {r.extension.replace(".", "") || "?"}
                                  </span>
                                </label>
                              ))}
                            </div>

                            {microdataError && (
                              <div className="flex items-start gap-1.5 text-rose-400 text-[9.5px]">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{microdataError}</span>
                              </div>
                            )}

                            <button
                              onClick={() => void handleImportMicrodata()}
                              disabled={microdataLoading}
                              className="w-full flex items-center justify-center gap-1.5 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-40 text-white text-[11px] font-medium py-1.5 rounded-md transition-colors"
                            >
                              {microdataLoading
                                ? <><Loader2 className="w-3 h-3 animate-spin" />Import des microdonnées…</>
                                : <><Database className="w-3 h-3" />
                                    {microdataResourceId ? "Importer ce fichier" : "Importer (meilleur format automatique)"}
                                  </>}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ── Recherche dans le catalogue ── */
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={anadsQuery}
                    onChange={e => setAnadsQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleAnadsSearch(); }}
                    placeholder="emploi, pauvreté, santé… — vide = tout"
                    className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 text-zinc-100 text-[11px] rounded-md px-2.5 py-2 outline-none focus:ring-1 focus:ring-amber-500 placeholder-zinc-600"
                  />
                  <button
                    onClick={() => void handleAnadsSearch()}
                    disabled={anadsSearching}
                    className="shrink-0 flex items-center justify-center gap-1 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-40 text-white text-[11px] font-medium px-3 rounded-md transition-colors"
                  >
                    {anadsSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {anadsSearchError && (
                  <div className="flex items-start gap-1.5 text-rose-400 text-[9.5px]">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>{anadsSearchError}</span>
                  </div>
                )}

                {anadsSearched && !anadsSearchError && (
                  <p className="text-[9.5px] text-zinc-600">
                    {anadsFound} enquête{anadsFound > 1 ? "s" : ""} trouvée{anadsFound > 1 ? "s" : ""}
                    {anadsResults.length < anadsFound ? ` (${anadsResults.length} affichées)` : ""}
                  </p>
                )}

                {anadsResults.length > 0 && (
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {anadsResults.map(r => (
                      <button
                        key={r.identifiant}
                        onClick={() => void handleSelectEnquete(r.identifiant)}
                        className="w-full text-left rounded-md px-2.5 py-1.5 border border-zinc-700/50 hover:border-amber-500/40 hover:bg-zinc-800/60 transition-colors"
                      >
                        <p className="text-[10.5px] text-zinc-300 truncate">{r.titre}</p>
                        <p className="text-[9px] text-zinc-500">
                          {r.annee_debut ?? "—"} · {r.acces}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="pt-1.5 border-t border-zinc-800/80">
                  {catalogSuccess ? (
                    <div className="rounded-lg bg-emerald-900/30 border border-emerald-700/40 px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-emerald-400">{catalogSuccess.name}</p>
                        <p className="text-[9.5px] text-zinc-500">{catalogSuccess.rows} enquêtes · actif</p>
                      </div>
                      <button onClick={() => setCatalogSuccess(null)} className="text-zinc-500 hover:text-zinc-300">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {catalogError && (
                        <div className="flex items-start gap-1.5 text-rose-400 text-[9.5px] mb-1.5">
                          <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{catalogError}</span>
                        </div>
                      )}
                      <button
                        onClick={() => void handleImportCatalog()}
                        disabled={catalogLoading}
                        className="w-full flex items-center justify-center gap-1.5 border border-zinc-700 hover:border-zinc-600 disabled:opacity-40 text-zinc-400 hover:text-zinc-200 text-[10.5px] font-medium py-1.5 rounded-md transition-colors"
                      >
                        {catalogLoading
                          ? <><Loader2 className="w-3 h-3 animate-spin" />Récupération…</>
                          : <><Library className="w-3 h-3" />Importer tout le catalogue (métadonnées)</>}
                      </button>
                      <p className="text-[9px] text-zinc-600 mt-1 leading-relaxed">
                        Toutes les fiches en une table, pour analyser l'offre statistique elle-même.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
