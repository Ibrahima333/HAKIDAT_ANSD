import React, { useState } from "react";
import { Database, LayoutTemplate, RefreshCw, History, FileText, Trash2, X, Moon, Sun } from "lucide-react";
import { AppState } from "../types";
import { cn } from "../lib/utils";
import { deleteResult } from "../lib/api";
import LLMModelConfig from "./LLMModelConfig";
import { SchemaExplorer } from "./SchemaExplorer";
import { FileUpload } from "./FileUpload";
import { HakiDataWordmark } from "./HakiDataWordmark";

/** Logo HakiData : bulle + barres (variante icône seule — le texte du logo
    complet devient illisible en dessous de ~70px, voir hakidata-icon.svg) */
function HakiDataLogo() {
  return (
    <img src="/hakidata-icon.svg" alt="HakiData" style={{ width: 44, height: 44, objectFit: "contain" }} />
  );
}

interface SidebarProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRefresh: () => void;
  onClearHistory: () => Promise<void> | void;
  currentUser?: { role?: string; email?: string } | null;
  isDark?: boolean;
  onToggleTheme?: () => void;
}

const PAGE_SIZE = 5;

export function Sidebar({ state, setState, onRefresh, onClearHistory, currentUser, isDark, onToggleTheme }: SidebarProps) {
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const [activeUpload, setActiveUpload] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const isAdmin = currentUser?.role === "admin";

  const handleDeleteResult = async (item: AppState["history"][0]) => {
    if (deletingId) return;
    setConfirmDeleteId(null);
    setDeleteError(null);
    setDeletingId(item.id);

    try {
      await deleteResult(item.questionName);
      // Suppression réussie → retirer de l'UI
      setState(prev => ({
        ...prev,
        history: prev.history.filter(h => h.id !== item.id),
        activeResultId: prev.activeResultId === item.id ? null : prev.activeResultId,
        activeResult: prev.activeResult?.id === item.id ? null : prev.activeResult,
      }));
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  const isReady = state.databases.length > 0 && state.selectedDatabase;

  const handleClearHistoryConfirmed = async () => {
    if (clearConfirmText !== "supprimer") return;
    setShowClearConfirm(false);
    setClearConfirmText("");
    setIsClearingHistory(true);
    try { await onClearHistory(); } finally { setIsClearingHistory(false); }
  };

  return (
    <aside className="w-72 bg-zinc-900 flex flex-col h-full text-zinc-100">

      {/* Logo */}
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* Nom sous l'icone plutot qu'a cote : le texte du logo complet
              devient illisible en dessous de ~70px (voir hakidata-icon.svg). */}
          <div className="flex flex-col items-center justify-center shrink-0 leading-none gap-1">
            <HakiDataLogo />
            <HakiDataWordmark size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-zinc-500">Interrogez vos données</p>
          </div>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors shrink-0"
              title={isDark ? "Mode clair" : "Mode sombre"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Configuration */}
        <div className="p-4 space-y-3 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Config</span>
            <button onClick={onRefresh} className="text-zinc-600 hover:text-zinc-300 transition-colors" title="Actualiser">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <FileUpload
            activeUpload={activeUpload}
            onActivate={name => {
              setActiveUpload(name);
              // Injecter le fichier comme base active dans l'état global
              if (name) {
                setState(prev => ({
                  ...prev,
                  selectedDatabase: name,
                  selectedSchema: "",
                  databases: prev.databases.includes(name)
                    ? prev.databases
                    : [name, ...prev.databases.filter(d => d !== name)],
                }));
              }
              void onRefresh();
            }}
          />
          <LLMModelConfig onProviderChange={p => setState(prev => ({ ...prev, selectedProvider: p }))} />
        </div>

        {/* Cible */}
        {isReady && (
          <div className="p-4 space-y-3 border-b border-zinc-800">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cible</span>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Base
                </label>
                <select
                  className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md p-2.5 outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                  value={state.selectedDatabase}
                  onChange={e => setState({ ...state, selectedDatabase: e.target.value, selectedSchema: "", activeResultId: null, activeResult: null })}
                >
                  {state.databases.map(db => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>
              {state.schemas.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <LayoutTemplate className="w-3.5 h-3.5" /> Schéma
                  </label>
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded-md p-2.5 outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all"
                    value={state.selectedSchema}
                    onChange={e => setState({ ...state, selectedSchema: e.target.value, activeResultId: null, activeResult: null })}
                  >
                    {state.schemas.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
            <SchemaExplorer
              database={state.selectedDatabase}
              schema={state.selectedSchema}
              onInsert={text => setState(prev => ({ ...prev, insertText: text }))}
            />
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative shrink-0">
                <input type="checkbox" className="sr-only"
                  checked={state.overwriteExisting}
                  onChange={e => setState({ ...state, overwriteExisting: e.target.checked })} />
                <div className={cn("block w-8 h-4 rounded-full transition-colors", state.overwriteExisting ? "bg-[#C8940A]" : "bg-zinc-700")} />
                <div className={cn("absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform shadow-sm", state.overwriteExisting ? "translate-x-4" : "")} />
              </div>
              <span className="text-[11px] text-zinc-600 group-hover:text-zinc-400 transition-colors">Écraser les résultats existants</span>
            </label>
          </div>
        )}

        {/* Historique */}
        <div className="p-4 space-y-2">
          {deleteError && (
            <div className="rounded-md bg-rose-900/40 border border-rose-700/50 px-3 py-2 text-[11px] text-rose-300 flex items-start gap-1.5">
              <span className="shrink-0">⚠</span>
              <span>{deleteError}</span>
            </div>
          )}
          {showClearConfirm && (
            <div className="rounded-md bg-zinc-800 border border-zinc-700 p-3 space-y-2">
              <p className="text-[11px] text-zinc-300 leading-snug">
                Cette action supprime <span className="text-white font-semibold">tout l'historique</span> de façon irréversible.<br />
                Tapez <span className="font-semibold text-rose-400">supprimer</span> pour confirmer.
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void handleClearHistoryConfirmed(); if (e.key === "Escape") { setShowClearConfirm(false); setClearConfirmText(""); } }}
                placeholder="supprimer"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-600 text-zinc-100 text-xs rounded px-2 py-1.5 outline-none focus:border-rose-500 placeholder:text-zinc-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleClearHistoryConfirmed()}
                  disabled={clearConfirmText !== "supprimer" || isClearingHistory}
                  className="flex-1 py-1 rounded text-[11px] font-medium bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isClearingHistory ? "Suppression…" : "Confirmer"}
                </button>
                <button
                  onClick={() => { setShowClearConfirm(false); setClearConfirmText(""); }}
                  className="flex-1 py-1 rounded text-[11px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Historique
            </span>
            {isAdmin && state.history.length > 0 && !showClearConfirm && (
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={isClearingHistory}
                className="text-[11px] text-zinc-600 hover:text-rose-400 flex items-center gap-1 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {isClearingHistory ? "…" : "Effacer"}
              </button>
            )}
          </div>
          {state.history.length === 0 ? (
            <p className="text-xs text-zinc-600 italic">Aucune analyse pour l'instant.</p>
          ) : (
            <div className="space-y-0.5">
              {state.history.slice(0, historyPage * PAGE_SIZE).map(item => (
                <div
                  key={item.id}
                  className={cn(
                    "relative rounded-lg border transition-all group",
                    state.activeResultId === item.id
                      ? "bg-white/10 border-white/10"
                      : "border-transparent hover:bg-zinc-800"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setState({ ...state, activeResultId: item.id, activeResult: state.activeResult?.id === item.id ? state.activeResult : null })}
                    className="w-full text-left px-3 py-2.5 pr-7"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", state.activeResultId === item.id ? "text-white" : "text-zinc-600 group-hover:text-zinc-400")} />
                      <div className="min-w-0">
                        <p className={cn("text-xs font-medium leading-snug line-clamp-2", state.activeResultId === item.id ? "text-white" : "text-zinc-400 group-hover:text-zinc-200")}>
                          {item.questionText || item.questionName}
                        </p>
                        <span className="text-[10px] text-zinc-600 mt-0.5 block">{item.databaseName}</span>
                      </div>
                    </div>
                  </button>
                  {confirmDeleteId !== item.id && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(item.id); }}
                      disabled={deletingId === item.id}
                      className="absolute right-1.5 top-2 p-1 rounded text-zinc-600 hover:text-rose-400 hover:bg-zinc-700 transition-all"
                      title="Supprimer cette analyse"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {confirmDeleteId === item.id && (
                    <div className="px-3 pb-2.5 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                      <span className="text-[10px] text-zinc-500 flex-1">Supprimer ?</span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteResult(item)}
                        disabled={deletingId === item.id}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                      >
                        {deletingId === item.id ? "…" : "Oui"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                      >
                        Non
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {state.history.length > historyPage * PAGE_SIZE && (
                <button
                  type="button"
                  onClick={() => setHistoryPage(p => p + 1)}
                  className="w-full mt-1 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  Voir plus ({state.history.length - historyPage * PAGE_SIZE} restantes)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
