import React, { useEffect, useRef, useState } from "react";
import {
  Database, History, X, FileText, Trash2, ChevronDown, Settings,
} from "lucide-react";
import { AppState } from "../types";
import { cn } from "../lib/utils";
import { deleteResult } from "../lib/api";

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRefresh: () => void;
  onClearHistory: () => Promise<void> | void;
  currentUser?: { role?: string; email?: string } | null;
  onOpenConnection: () => void;
}

const PAGE_SIZE = 8;

/**
 * Barre de contexte compacte pour la vue Analyse — remplace l'ancienne
 * sidebar persistante (base/schéma/config/historique) par une barre fine :
 * base et schéma restent visibles en permanence (l'info qu'on consulte le
 * plus souvent), l'historique et la configuration avancée (fichiers, modèle
 * LLM, structure des tables) s'ouvrent à la demande au lieu d'occuper de
 * l'espace en continu.
 */
export function AnalyseToolbar({ state, setState, onRefresh, onClearHistory, currentUser, onOpenConnection }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");

  const historyRef = useRef<HTMLDivElement>(null);
  const isAdmin = currentUser?.role === "admin";
  const isReady = state.databases.length > 0 && state.selectedDatabase;

  useEffect(() => {
    if (!historyOpen) return;
    const onClick = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [historyOpen]);

  const handleDeleteResult = async (item: AppState["history"][0]) => {
    if (deletingId) return;
    setConfirmDeleteId(null);
    setDeleteError(null);
    setDeletingId(item.id);
    try {
      await deleteResult(item.questionName);
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

  const handleClearHistoryConfirmed = async () => {
    if (clearConfirmText !== "supprimer") return;
    setShowClearConfirm(false);
    setClearConfirmText("");
    setIsClearingHistory(true);
    try { await onClearHistory(); } finally { setIsClearingHistory(false); }
  };

  return (
    <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      {/* Base / Schéma — toujours visibles, c'est le contexte courant */}
      {isReady ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <Database className="w-4 h-4 text-zinc-400 shrink-0" />
          <div className="relative">
            <select
              className="appearance-none bg-transparent text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none cursor-pointer pr-4 max-w-[140px] truncate"
              value={state.selectedDatabase}
              onChange={e => setState({ ...state, selectedDatabase: e.target.value, selectedSchema: "", activeResultId: null, activeResult: null })}
            >
              {state.databases.map(db => <option key={db} value={db}>{db}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          {/* Masqué quand le schéma unique porte le même nom que la base
              (courant en MySQL) — sinon "AMPRIC / AMPRIC" affiche deux fois
              la même info sans rien apporter. */}
          {state.schemas.length > 0 && !(state.schemas.length === 1 && state.schemas[0] === state.selectedDatabase) && (
            <>
              <span className="text-zinc-300 dark:text-zinc-700">/</span>
              <div className="relative">
                <select
                  className="appearance-none bg-transparent text-sm text-zinc-500 dark:text-zinc-400 outline-none cursor-pointer pr-4 max-w-[120px] truncate"
                  value={state.selectedSchema}
                  onChange={e => setState({ ...state, selectedSchema: e.target.value, activeResultId: null, activeResult: null })}
                >
                  {state.schemas.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="text-sm text-zinc-400">Connectez une base pour commencer…</span>
      )}

      <div className="flex-1" />

      {/* Historique — panneau déroulant à la demande */}
      <div className="relative" ref={historyRef}>
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
            historyOpen
              ? "border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white bg-zinc-100 dark:bg-white/10"
              : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] hover:text-zinc-900 dark:hover:text-white"
          )}
        >
          <History className="w-3.5 h-3.5" />
          Historique
          {state.history.length > 0 && (
            <span className="text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-full px-1.5">
              {state.history.length}
            </span>
          )}
        </button>

        {historyOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-900 text-zinc-100 rounded-2xl shadow-xl border border-zinc-800 z-50 max-h-[26rem] overflow-y-auto p-3">
            {deleteError && (
              <div className="mb-2 rounded-md bg-rose-900/40 border border-rose-700/50 px-3 py-2 text-[11px] text-rose-300">
                {deleteError}
              </div>
            )}
            {showClearConfirm && (
              <div className="mb-2 rounded-md bg-zinc-800 border border-zinc-700 p-3 space-y-2">
                <p className="text-[11px] text-zinc-300 leading-snug">
                  Supprime <span className="text-white font-semibold">tout l'historique</span>. Tapez{" "}
                  <span className="font-semibold text-rose-400">supprimer</span> pour confirmer.
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
                    className="flex-1 py-1 rounded text-[11px] font-medium bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 transition-colors"
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
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Historique</span>
              {isAdmin && state.history.length > 0 && !showClearConfirm && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={isClearingHistory}
                  className="text-[11px] text-zinc-600 hover:text-rose-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Effacer
                </button>
              )}
            </div>
            {state.history.length === 0 ? (
              <p className="text-xs text-zinc-600 italic px-1 py-2">Aucune analyse pour l'instant.</p>
            ) : (
              <div className="space-y-0.5">
                {state.history.slice(0, historyPage * PAGE_SIZE).map(item => (
                  <div
                    key={item.id}
                    className={cn(
                      "relative rounded-lg border transition-all group",
                      state.activeResultId === item.id
                        ? "bg-white/10 border-white/10"
                        : "border-transparent hover:bg-white/[0.06]"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setState({ ...state, activeResultId: item.id, activeResult: state.activeResult?.id === item.id ? state.activeResult : null });
                        setHistoryOpen(false);
                      }}
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
        )}
      </div>

      {/* Connexions — tiroir de configuration, accessible sans quitter la vue */}
      <button
        type="button"
        onClick={onOpenConnection}
        title="Connexions"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <Settings className="w-4 h-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
