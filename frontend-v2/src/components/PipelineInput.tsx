import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, Square, Clock, ExternalLink, Settings, Database } from "lucide-react";
import { AppState } from "../types";
import { runPipeline } from "../lib/api";
import { cn } from "../lib/utils";
import { parseLlmError, isLlmError } from "../lib/llmErrors";

interface PipelineInputProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export function PipelineInput({ state, setState }: PipelineInputProps) {
  const [question, setQuestion] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [lastDuration, setLastDuration] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.insertText) {
      setQuestion(prev => prev ? `${prev} ${state.insertText}` : state.insertText!);
      setState(prev => ({ ...prev, insertText: null }));
    }
  }, [state.insertText]);

  const isReady = state.databases.length > 0 && state.selectedDatabase && !state.isBootstrapping;
  const canSubmit = isReady && question.trim() && !state.isLoading;

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    stopTimer();
    setState(prev => ({ ...prev, isLoading: false, errorMessage: "Analyse annulée." }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLastDuration(null);
    setState(prev => ({ ...prev, isLoading: true, errorMessage: null }));
    startTimer();

    const t0 = Date.now();
    try {
      const result = await runPipeline({
        questionText: question, artifactName: "",
        databaseName: state.selectedDatabase, schemaName: state.selectedSchema,
        providerName: state.selectedProvider, overwriteExisting: state.overwriteExisting,
      }, controller.signal);

      const duration = Math.round((Date.now() - t0) / 1000);
      stopTimer();
      setLastDuration(duration);
      setState(prev => ({
        ...prev, isLoading: false,
        history: [
          { id: result.id, questionName: result.questionName, questionText: result.questionText,
            databaseName: result.databaseName, schemaName: result.schemaName,
            providerName: result.providerName, timestamp: result.timestamp },
          ...prev.history.filter(h => h.id !== result.id),
        ],
        activeResultId: result.id, activeResult: result, errorMessage: null,
      }));
      setQuestion("");
    } catch (error) {
      stopTimer();
      if ((error as any)?.name === "AbortError") return;
      setState(prev => ({ ...prev, isLoading: false, errorMessage: error instanceof Error ? error.message : "Echec de l'analyse." }));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); void handleSubmit(e as any); }
  };

  function formatTime(s: number) {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${s % 60}s`;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0">
      {/* Voile de transition au-dessus de la barre : atténue le contenu qui
          défile dessous sans jamais laisser du texte lisible se superposer
          à la zone de saisie elle-même (fond opaque en dessous). */}
      <div className="h-10 bg-gradient-to-t from-white dark:from-zinc-950 to-transparent pointer-events-none" />
      <div className="bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.06)] pt-4 pb-5 px-6">
      <div className="max-w-3xl mx-auto space-y-2">
        {state.errorMessage && !state.isLoading && (() => {
          const isLlm = isLlmError(state.errorMessage!);
          const info = isLlm ? parseLlmError(state.errorMessage!) : null;
          return (
            <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl px-4 py-3 text-sm text-rose-700 dark:text-rose-300 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {info ? (
                  <>
                    <p className="font-semibold">{info.title}</p>
                    <p className="text-xs mt-0.5 text-rose-600 dark:text-rose-400">{info.detail}</p>
                    {info.action && (
                      <div className="flex items-center gap-3 mt-2">
                        {info.actionUrl ? (
                          <a href={info.actionUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300 underline hover:no-underline">
                            <ExternalLink className="w-3 h-3" />{info.action}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            <Settings className="w-3 h-3" />Paramètres → Modèle LLM
                          </span>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <span>{state.errorMessage}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setState(prev => ({ ...prev, errorMessage: null }))}
                className="text-rose-400 hover:text-rose-600 text-xs shrink-0 mt-0.5"
              >✕</button>
            </div>
          );
        })()}
        {!isReady && !state.isBootstrapping && (
          <div className="flex items-center justify-center gap-2 bg-amber-50 dark:bg-amber-500/[0.06] border border-amber-100 dark:border-amber-500/10 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Database className="w-3.5 h-3.5 shrink-0" />
            Configurez d'abord votre base dans la sidebar
          </div>
        )}
        <form onSubmit={handleSubmit} className={cn(
          "bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-xl overflow-hidden transition-all",
          canSubmit || question.trim() ? "border-[#C8940A] ring-2 ring-amber-100" : "border-zinc-300"
        )}>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? `Posez une question sur ${state.selectedDatabase}…` : "Connectez une base pour commencer…"}
            className="w-full resize-none outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 text-[15px] p-4 min-h-[72px] max-h-40 bg-white dark:bg-zinc-900"
            disabled={!isReady || state.isLoading}
          />
          <div className="flex items-center justify-between px-4 pb-3 gap-3 bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              {state.selectedDatabase && state.selectedSchema && (
                <code className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-600 dark:text-zinc-400">
                  {state.selectedDatabase} / {state.selectedSchema}
                </code>
              )}
              {state.isLoading && (
                <span className="flex items-center gap-1 text-[#C8940A] font-medium">
                  <Clock className="w-3 h-3" />
                  {formatTime(elapsed)}
                </span>
              )}
              {!state.isLoading && lastDuration !== null && (
                <span className="flex items-center gap-1 text-zinc-400">
                  <Clock className="w-3 h-3" />
                  {formatTime(lastDuration)}
                </span>
              )}
            </div>
            {state.isLoading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-100 text-rose-600 hover:bg-rose-200 transition-all"
                title="Annuler"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                  canSubmit ? "bg-[#C8940A] text-white hover:bg-[#A87A08]" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                )}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
