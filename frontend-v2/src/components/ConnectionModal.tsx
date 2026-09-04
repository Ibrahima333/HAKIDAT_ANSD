import React, { useRef, useState } from "react";
import { Database, LayoutTemplate, Loader2, SlidersHorizontal, X } from "lucide-react";
import { AppState } from "../types";
import { cn } from "../lib/utils";
import LLMModelConfig, { LLMModelConfigHandle } from "./LLMModelConfig";
import { SchemaExplorer } from "./SchemaExplorer";
import { FileUpload } from "./FileUpload";

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  onRefresh: () => void;
  onClose: () => void;
}

/** Panneau "Connexions" — formulaire à plat (source de données, modèle IA,
 * schéma, paramètres avancés), un seul bouton "Enregistrer". Tiroir ancré à
 * droite (comme Supabase/Vercel/Linear) et déclenché depuis l'icône ⚙️ de la
 * sidebar, accessible depuis n'importe quelle vue. */
export function ConnectionModal({ state, setState, onRefresh, onClose }: Props) {
  const [activeUpload, setActiveUpload] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const llmRef = useRef<LLMModelConfigHandle>(null);
  const isReady = state.databases.length > 0 && state.selectedDatabase;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await llmRef.current?.save();
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      {/* Voile léger — laisse deviner le contenu derrière, ne bloque pas visuellement */}
      <div className="absolute inset-0 bg-black/20 animate-overlay-fade-in" />
      <div
        className="absolute inset-y-0 right-0 w-full max-w-[380px] bg-[#111113] text-zinc-300 shadow-2xl animate-slide-in-right flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-16 shrink-0 border-b border-white/[0.06]">
          <h3 className="text-[13px] font-bold text-white">Configuration</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-5 space-y-6">
          {/* Source de données : base existante ou fichier importé */}
          <div className="space-y-3">
            <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest">Source de données</span>

            {state.databases.length > 0 && (
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 shrink-0 text-zinc-500" />
                <select
                  className="flex-1 min-w-0 bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-[13px] rounded-lg p-2 outline-none focus:ring-2 focus:ring-amber-500"
                  value={state.selectedDatabase}
                  onChange={e => setState({ ...state, selectedDatabase: e.target.value, selectedSchema: "", activeResultId: null, activeResult: null })}
                >
                  {state.databases.map(db => <option key={db} value={db}>{db}</option>)}
                </select>
              </div>
            )}

            <FileUpload
              activeUpload={activeUpload}
              onActivate={name => {
                setActiveUpload(name);
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
          </div>

          {/* Modèle IA */}
          <div className="space-y-3 pt-1 border-t border-white/[0.06]">
            <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest">Modèle IA</span>
            <LLMModelConfig
              ref={llmRef}
              onProviderChange={p => setState(prev => ({ ...prev, selectedProvider: p }))}
            />
          </div>

          {/* Schéma */}
          {isReady && (
            <div className="space-y-3 pt-1 border-t border-white/[0.06]">
              <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" /> Schéma — {state.selectedDatabase}
              </span>
              <SchemaExplorer
                database={state.selectedDatabase}
                schema={state.selectedSchema}
                onInsert={text => setState(prev => ({ ...prev, insertText: text }))}
              />
            </div>
          )}

          {/* Paramètres avancés */}
          {isReady && (
            <div className="space-y-3 pt-1 border-t border-white/[0.06] pb-2">
              <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Paramètres avancés
              </span>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={state.overwriteExisting}
                    onChange={e => setState({ ...state, overwriteExisting: e.target.checked })}
                  />
                  <div className={cn("block w-8 h-4 rounded-full transition-colors", state.overwriteExisting ? "bg-amber-500" : "bg-zinc-700")} />
                  <div className={cn("absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform shadow-sm", state.overwriteExisting ? "translate-x-4" : "")} />
                </div>
                <span className="text-[10.5px] text-zinc-500 group-hover:text-zinc-300 transition-colors">Écraser les résultats existants</span>
              </label>
            </div>
          )}
        </div>

        {/* Action unique — sauvegarde et referme le tiroir */}
        <div className="shrink-0 p-5 mt-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 bg-amber-500/15 border border-amber-500/25 hover:bg-amber-500/25 disabled:opacity-50 text-white text-[13px] font-semibold py-2.5 rounded-lg transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
