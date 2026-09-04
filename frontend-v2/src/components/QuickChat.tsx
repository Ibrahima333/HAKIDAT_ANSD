import React, { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Send, Loader2, RotateCcw, Bot, User, MessageCircle, ClipboardList, X } from "lucide-react";
import { cn } from "../lib/utils";
import { apiFetch } from "../lib/api";
import {
  toggleChatMessage,
  isChatMessageSelected,
  getChatExportCount,
  clearChatExport,
  ChatExportMessage,
} from "../lib/chatExport";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface Props {
  database: string;
  schema: string;
  provider: string;
}

const SUGGESTIONS = [
  "Quels sont les KPIs les plus importants à surveiller ?",
  "Quelles tendances dois-je analyser en priorité ?",
  "Comment améliorer les performances commerciales ?",
  "Quels indicateurs montrent un risque potentiel ?",
];

export function QuickChat({ database, schema, provider }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  // Compte les messages sélectionnés pour le rapport (depuis localStorage)
  const [exportCount, setExportCount] = useState(() => getChatExportCount());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll automatique vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      ts: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const data = await apiFetch("/api/chat/message", {
        method: "POST",
        body: JSON.stringify({ message: trimmed, database, schema, provider, history }),
      });
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erreur inconnue";
      const friendly = raw.includes("429") || raw.toLowerCase().includes("quota")
        ? "⚠️ Limite de requêtes atteinte (quota Gemini). Réessaie dans quelques secondes."
        : raw.includes("SQL generation failed") || raw.includes("exit code")
          ? "❌ La génération SQL a échoué. Reformule ta question ou vérifie la connexion à la base."
          : `❌ ${raw}`;
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: friendly,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const reset = () => setMessages([]);

  /** Bascule l'inclusion d'un message dans l'export PDF */
  const handleToggleExport = (msg: Message) => {
    const chatMsg: ChatExportMessage = {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      ts: msg.ts,
    };
    toggleChatMessage(chatMsg);
    setExportCount(getChatExportCount());
  };

  const handleClearExport = () => {
    clearChatExport();
    setExportCount(0);
  };

  // ── État vide ──────────────────────────────────────────────────────────────
  if (!database) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-10">
        <div className="max-w-xs space-y-4">
          <div className="w-14 h-14 rounded-2xl border-2 border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto">
            <MessageCircle className="w-6 h-6 text-zinc-300" />
          </div>
          <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Connectez d'abord une base</h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Le chat analytique utilise votre schéma de base pour contextualiser les réponses.</p>
        </div>
      </div>
    );
  }

  // ── Interface de chat ──────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* En-tête */}
      <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-[#C8940A]" />
          </div>
          <div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Data Analyst IA</span>
            <span className="ml-2 text-xs text-zinc-400">{database}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Nouvelle conversation
            </button>
          )}
        </div>
      </div>

      {/* Bandeau de sélection pour le rapport */}
      {exportCount > 0 && (
        <div className="shrink-0 flex items-center justify-between px-5 py-2 bg-[#FEF3C7] border-b border-[#FEF3C7]">
          <div className="flex items-center gap-2 text-xs text-[#A87A08] font-medium">
            <ClipboardList className="w-3.5 h-3.5" />
            {exportCount} message{exportCount > 1 ? "s" : ""} sélectionné{exportCount > 1 ? "s" : ""} pour le rapport PDF
          </div>
          <button
            onClick={handleClearExport}
            className="flex items-center gap-1 text-xs text-[#C8940A] hover:text-amber-800 transition-colors"
            title="Effacer la sélection"
          >
            <X className="w-3.5 h-3.5" />
            Effacer
          </button>
        </div>
      )}

      {/* Messages */}
      <div className={cn(
        "flex-1 overflow-y-auto px-6 py-5",
        messages.length === 0 && "flex items-center justify-center"
      )}>

        {/* Message d'accueil */}
        {messages.length === 0 ? (
          <div className="w-full max-w-xl mx-auto text-center space-y-6">
            <div className="w-14 h-14 rounded-2xl bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center mx-auto">
              <Bot className="w-7 h-7 text-[#C8940A]" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Data Analyst IA</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
                Je connais le schéma de <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{database}</strong> et peux vous aider à interpréter vos données, identifier des tendances et formuler des recommandations.
              </p>
            </div>

            {/* Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => void send(s)}
                  className="text-sm px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 dark:hover:border-[#C8940A] dark:hover:bg-zinc-900 hover:border-[#C8940A] hover:text-[#A87A08] hover:bg-[#FEF3C7] hover:shadow-sm transition-all"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Aide sur la fonctionnalité */}
            <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
              <ClipboardList className="w-3 h-3" />
              Survolez un message pour l'inclure dans votre rapport PDF
            </p>
          </div>
        ) : (
        <div className="max-w-3xl mx-auto w-full space-y-4">
        {messages.map(msg => {
          const selected = isChatMessageSelected(msg.id);
          return (
            <div
              key={msg.id}
              className={cn("group flex gap-3", msg.role === "user" && "justify-end")}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-[#C8940A]" />
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[75%]">
                <div className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed transition-all",
                  msg.role === "user"
                    ? "bg-zinc-900 text-white rounded-tr-sm whitespace-pre-wrap"
                    : "bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-tl-sm",
                  selected && "ring-2 ring-amber-400 ring-offset-1"
                )}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-zinc max-w-none
                      prose-p:my-1 prose-p:leading-relaxed
                      prose-headings:font-semibold prose-headings:text-zinc-800 dark:prose-headings:text-zinc-200 prose-headings:mt-3 prose-headings:mb-1
                      prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
                      prose-ol:my-1 prose-ol:pl-4
                      prose-strong:font-semibold prose-strong:text-zinc-800 dark:prose-strong:text-zinc-200
                      prose-code:text-[#C8940A] prose-code:bg-[#FEF3C7] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                      prose-pre:bg-zinc-800 prose-pre:text-zinc-100 prose-pre:rounded-lg prose-pre:text-xs
                      prose-blockquote:border-l-amber-300 prose-blockquote:text-zinc-500
                      prose-hr:border-zinc-200">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : msg.content}
                </div>

                {/* Bouton inclure/exclure — visible au survol ou si sélectionné */}
                <div className={cn(
                  "flex transition-opacity",
                  msg.role === "user" ? "justify-end" : "justify-start",
                  selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  <button
                    onClick={() => handleToggleExport(msg)}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-all",
                      selected
                        ? "bg-[#C8940A] text-white border-[#C8940A] hover:bg-[#A87A08]"
                        : "bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-[#C8940A] hover:text-[#C8940A] hover:bg-[#FEF3C7]"
                    )}
                    title={selected ? "Retirer du rapport" : "Ajouter au rapport PDF"}
                  >
                    <ClipboardList className="w-3 h-3" />
                    {selected ? "Dans le rapport ✓" : "Ajouter au rapport"}
                  </button>
                </div>
              </div>

              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-zinc-500" />
                </div>
              )}
            </div>
          );
        })}

        {/* Indicateur de frappe */}
        {isTyping && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-[#C8940A]" />
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
        </div>
        )}
      </div>

      {/* Zone de saisie */}
      <div className="shrink-0 px-6 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className={cn(
          "max-w-3xl mx-auto w-full flex items-end gap-2 border rounded-xl overflow-hidden transition-all bg-white dark:bg-zinc-800",
          isTyping ? "border-zinc-200 dark:border-zinc-700" : "border-zinc-300 dark:border-zinc-600 focus-within:border-[#C8940A] focus-within:ring-2 focus-within:ring-amber-100"
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question business…"
            rows={1}
            className="flex-1 resize-none outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 px-4 py-3 max-h-32 bg-transparent"
            disabled={isTyping}
            style={{ height: "auto" }}
          />
          <button
            onClick={() => void send(input)}
            disabled={!input.trim() || isTyping}
            className={cn(
              "m-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
              input.trim() && !isTyping
                ? "bg-[#C8940A] text-white hover:bg-[#A87A08]"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            )}
          >
            {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-zinc-400 mt-1.5 text-center">
          Entrée pour envoyer · Shift+Entrée pour un saut de ligne · Réponses sans SQL
        </p>
      </div>
    </div>
  );
}
