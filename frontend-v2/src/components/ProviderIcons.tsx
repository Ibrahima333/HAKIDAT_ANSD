import React, { useId } from "react";

/** Icônes officielles des fournisseurs LLM — tracés réels (Google Gemini,
 * Anthropic, Groq), rendus dans leurs couleurs de marque officielles. */

export function GeminiIcon({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <title>Google Gemini</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
    </svg>
  );
}

export function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#D97757" className={className} xmlns="http://www.w3.org/2000/svg">
      <title>Anthropic (Claude)</title>
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

export function GroqIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 33 33" fill="#F55036" className={className} xmlns="http://www.w3.org/2000/svg">
      <title>Groq</title>
      <path d="m18.445 4.406-9.468 13.74 7.341.665-1.69 9.578 9.469-13.74-7.342-.664 1.69-9.579Z" />
    </svg>
  );
}

export function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  if (provider === "gemini") return <GeminiIcon className={className} />;
  if (provider === "claude") return <ClaudeIcon className={className} />;
  if (provider === "groq") return <GroqIcon className={className} />;
  return null;
}
