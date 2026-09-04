import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { cn } from "../lib/utils";
import { testLlmConfig, fetchLlmConfig, saveLlmConfig } from "../lib/api";
import { getUser } from "../lib/auth";
import { ProviderIcon } from "./ProviderIcons";

type Provider = "gemini" | "groq" | "claude";
const STORAGE_KEY = "hakidata_provider";

const PROVIDER_LABELS: Record<Provider, string> = {
  gemini: "Gemini",
  groq: "Groq",
  claude: "Claude",
};

/** Nom du champ du formulaire correspondant à chaque fournisseur. */
const KEY_FIELD: Record<Provider, keyof Form> = {
  gemini: "gemini_api_key",
  groq: "groq_api_key",
  claude: "claude_api_key",
};

const KEY_PLACEHOLDER: Record<Provider, string> = {
  gemini: "AIza…",
  groq: "gsk_…",
  claude: "sk-ant-…",
};

/** Où récupérer la clé — affiché sous le champ de saisie. */
const KEY_SOURCE: Record<Provider, string> = {
  gemini: "aistudio.google.com",
  groq: "api.groq.com",
  claude: "console.anthropic.com",
};

type Form = { gemini_api_key: string; groq_api_key: string; claude_api_key: string };
type Props = { onProviderChange?: (provider: string) => void };

/** Méthode exposée au parent (ConnectionModal) : un seul bouton "Enregistrer"
 * global déclenche la sauvegarde de la clé en cours d'édition ici, plutôt
 * qu'un bouton "Tester & Enregistrer" propre à ce bloc. */
export interface LLMModelConfigHandle {
  save: () => Promise<void>;
}

const LLMModelConfig = forwardRef<LLMModelConfigHandle, Props>(function LLMModelConfig({ onProviderChange }, ref) {
  const isAdmin = getUser()?.role === "admin";

  const [provider, setProvider] = useState<Provider>(
    () => (localStorage.getItem(STORAGE_KEY) as Provider) ?? "gemini"
  );
  const [form, setForm] = useState<Form>({ gemini_api_key: "", groq_api_key: "", claude_api_key: "" });
  // true si la clé est déjà configurée en base (masquée côté backend)
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [groqConfigured, setGroqConfigured]     = useState(false);
  const [claudeConfigured, setClaudeConfigured] = useState(false);
  const [editingKey, setEditingKey] = useState<"gemini" | "groq" | "claude" | null>(null);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { onProviderChange?.(provider); }, [provider, onProviderChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchLlmConfig();
        if (cancelled) return;
        if (isAdmin) {
          // Les clés retournées sont masquées ("***") — on détecte juste si elles existent
          const gConfigured = Boolean(cfg.config?.gemini_api_key);
          const rConfigured = Boolean(cfg.config?.groq_api_key);
          const cConfigured = Boolean(cfg.config?.claude_api_key);
          setGeminiConfigured(gConfigured);
          setGroqConfigured(rConfigured);
          setClaudeConfigured(cConfigured);
          if (gConfigured || rConfigured || cConfigured) setConnected(true);
        } else {
          setAvailableProviders(cfg.availableProviders ?? []);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const switchProvider = (p: Provider) => {
    setProvider(p);
    setStatus(null);
    setConnected(null);
    localStorage.setItem(STORAGE_KEY, p);
    onProviderChange?.(p);
  };

  const currentKey = form[KEY_FIELD[provider]];

  const isConfigured = provider === "gemini" ? geminiConfigured
    : provider === "groq" ? groqConfigured
    : claudeConfigured;

  const handleSave = async () => {
    // Rien à faire si aucune nouvelle clé n'a été saisie pour ce fournisseur.
    if (!currentKey) return;
    setStatus(null);
    const payload = provider === "gemini" ? { gemini_api_key: form.gemini_api_key }
      : provider === "groq" ? { groq_api_key: form.groq_api_key }
      : { claude_api_key: form.claude_api_key };
    try {
      const result = await testLlmConfig(payload);
      const ok = Boolean(result.success);
      setConnected(ok);
      setStatus({ ok, message: result.message });
      if (ok) {
        await saveLlmConfig(payload);
        if (provider === "gemini") setGeminiConfigured(true);
        if (provider === "groq")   setGroqConfigured(true);
        if (provider === "claude") setClaudeConfigured(true);
        setEditingKey(null);
        setForm({ gemini_api_key: "", groq_api_key: "", claude_api_key: "" });
      }
    } catch (err) {
      setConnected(false);
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Test échoué" });
    }
  };

  useImperativeHandle(ref, () => ({ save: handleSave }));

  const providerLabel = PROVIDER_LABELS[provider];

  // ── Vue USER : sélecteur simple ──────────────────────────────────────────────
  if (!isAdmin) {
    const providers: Provider[] = (availableProviders.length > 0
      ? availableProviders
      : ["gemini", "groq", "claude"]) as Provider[];

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ProviderIcon provider={provider} className="w-4 h-4 shrink-0 text-zinc-500" />
          <div className="flex-1 min-w-0">
            <span className="text-[12px] text-zinc-300">{providerLabel} sélectionné</span>
          </div>
          <Lock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
        </div>

        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          <Lock className="w-3 h-3" />
          Clés API configurées par l'administrateur
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {providers.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => switchProvider(p as Provider)}
              className={cn(
                "flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg text-[11px] font-medium transition-colors",
                provider === p ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <ProviderIcon provider={p} className={cn("w-4 h-4", provider === p ? "text-white" : "text-zinc-400")} />
              <span className="truncate max-w-full">{PROVIDER_LABELS[p as Provider]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Vue ADMIN : formulaire complet ───────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider} className={cn("w-4 h-4 shrink-0",
          connected === true  ? "text-emerald-500" :
          connected === false ? "text-rose-500" :
          "text-zinc-500"
        )} />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] text-zinc-300">
            {connected === true  ? `${providerLabel} connecté` :
             connected === false ? `${providerLabel} — échec` :
             "Non configuré"}
          </span>
        </div>
        {connected === true  && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
        {connected === false && <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(["gemini", "groq", "claude"] as Provider[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => switchProvider(p)}
            className={cn(
              "flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg text-[11px] font-medium transition-colors",
              provider === p ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <ProviderIcon provider={p} className={cn("w-4 h-4", provider === p ? "text-white" : "text-zinc-400")} />
            <span className="truncate max-w-full">{PROVIDER_LABELS[p]}</span>
          </button>
        ))}
      </div>

      {/* Clé API — repliée par défaut, le champ n'apparaît qu'au clic sur
          "Modifier" / "Configurer" : évite d'afficher en permanence un champ
          de saisie inutile quand la clé est déjà en place. */}
      {editingKey === provider ? (
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-zinc-400">{providerLabel} API Key</label>
          <input
            type="password"
            className="w-full bg-zinc-900/60 border border-zinc-700 text-zinc-100 text-[13px] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-amber-500"
            value={currentKey}
            onChange={e => setForm(f => ({ ...f, [KEY_FIELD[provider]]: e.target.value }))}
            placeholder={KEY_PLACEHOLDER[provider]}
            autoComplete="off"
            autoFocus
          />
          <p className="text-[10.5px] text-zinc-600">{KEY_SOURCE[provider]}</p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isConfigured && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />}
          <span className="text-[11px] text-zinc-500 flex-1">
            {isConfigured ? "Clé API configurée" : "Aucune clé API"}
          </span>
          <button
            type="button"
            onClick={() => setEditingKey(provider)}
            className="text-[11px] text-zinc-400 hover:text-white transition-colors"
          >
            {isConfigured ? "Modifier" : "Configurer"}
          </button>
        </div>
      )}

      {status && (
        <div className={cn(
          "flex items-start gap-2 px-1 py-1 text-[11px]",
          status.ok ? "text-emerald-400/80" : "text-rose-400/80"
        )}>
          {status.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          {status.message}
        </div>
      )}
    </div>
  );
});

export default LLMModelConfig;
