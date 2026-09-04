import { AppState } from "../types";
import { ResultTabs } from "./ResultTabs";
import { BarChart2, Database, Cpu } from "lucide-react";
import { motion } from "motion/react";
import { HakiLoader } from "./HakiLoader";

interface ChatAreaProps { state: AppState; }

export function ChatArea({ state }: ChatAreaProps) {
  const activeResult = state.activeResult;
  const isReady = state.databases.length > 0 && state.selectedDatabase;

  if (state.isBootstrapping) {
    return <div className="flex-1 flex items-center justify-center"><HakiLoader size={72} /></div>;
  }
  if (state.activeResultId && !activeResult) {
    return <div className="flex-1 flex items-center justify-center"><HakiLoader size={72} label="Chargement du résultat…" /></div>;
  }

  if (!activeResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10 pb-52">
        {!isReady ? (
          <div className="max-w-xs space-y-8">
            <div className="mx-auto w-14 h-14 rounded-2xl border-2 border-zinc-200 flex items-center justify-center">
              <BarChart2 className="w-6 h-6 text-zinc-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Bienvenue sur HakiData</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">Connectez votre base et posez vos questions en français.</p>
            </div>
            <div className="text-left space-y-2">
              {[
                "Connectez votre base de données",
                "Configurez votre modèle LLM",
                "Posez une question",
              ].map((label, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200">
                  <div className="w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-zinc-500">{i + 1}</span>
                  </div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">{label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-xs space-y-5">
            <div className="mx-auto flex items-center justify-center">
              <img
                src="/analyse-illustration.png"
                alt=""
                className="w-24 h-24 object-contain"
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">Prêt à analyser</h2>
              <p className="text-sm text-zinc-500">Base : <code className="text-zinc-700 dark:text-zinc-300 font-medium">{state.selectedDatabase}</code></p>
            </div>
            <div className="text-left text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700 space-y-1.5">
              <p className="font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Exemples :</p>
              <p>— Quels sont les 5 meilleurs clients ?</p>
              <p>— Chiffre d'affaires par mois cette année</p>
              <p>— Commandes en attente depuis plus de 7 jours</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-y-auto p-5 pb-48">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="relative max-w-6xl mx-auto">
        {/* En-tête de requête — titre de page, pas une bulle de discussion :
            sépare clairement "ce qui a été demandé" du panneau de résultats
            qui suit, au lieu de les faire ressembler à un même fil de chat. */}
        <div className="pb-3 mb-4 border-b-2 border-zinc-200 dark:border-zinc-800">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
            {activeResult.questionText}
          </h1>
          <div className="mt-1.5 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              {activeResult.databaseName}
              {activeResult.schemaName && activeResult.schemaName !== activeResult.databaseName && (
                <> / {activeResult.schemaName}</>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5" />
              {activeResult.providerName}
            </span>
          </div>
        </div>

        {/* Les erreurs sont affichées dans PipelineInput — pas ici pour éviter le doublon */}
        <ResultTabs result={activeResult} />
      </motion.div>
    </div>
  );
}
