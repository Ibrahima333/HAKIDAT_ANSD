export type LlmErrorInfo = {
  title: string;
  detail: string;
  action?: string;
  actionUrl?: string;
};

export function parseLlmError(message: string): LlmErrorInfo {
  const m = message.toLowerCase();

  // Quota / rate limit
  if (m.includes("quota") || m.includes("resource_exhausted") || m.includes("rate limit") || m.includes("429")) {
    // Les messages backend nomment le provider EN ÉCHEC en premier, puis
    // suggèrent souvent l'autre provider comme alternative plus loin dans la
    // phrase (ex: message Groq qui se termine par "Passez sur Gemini...").
    // Un simple .includes() matcherait alors le mauvais provider selon
    // l'ordre des `if` — on compare donc la position de chaque mot pour
    // identifier celui qui apparaît en premier, le vrai provider en échec.
    const geminiIdx = m.indexOf("gemini");
    const groqIdx = m.indexOf("groq");
    const claudeIdx = m.indexOf("claude");
    const positions = [
      { provider: "gemini", idx: geminiIdx },
      { provider: "groq", idx: groqIdx },
      { provider: "claude", idx: claudeIdx },
    ].filter(p => p.idx !== -1);
    positions.sort((a, b) => a.idx - b.idx);
    const failingProvider = positions[0]?.provider;

    if (failingProvider === "gemini") return {
      title: "Quota Gemini épuisé",
      detail: "Vous avez atteint la limite de requêtes gratuites Gemini pour aujourd'hui.",
      action: "Passer sur Groq (gratuit)",
      actionUrl: undefined,
    };
    if (failingProvider === "groq") return {
      title: "Quota Groq atteint",
      detail: "Limite de tokens Groq atteinte. Réessayez dans quelques minutes ou changez de provider.",
      action: "Voir les quotas Groq",
      actionUrl: "https://console.groq.com",
    };
    if (failingProvider === "claude") return {
      title: "Limite Claude atteinte",
      detail: "Trop de requêtes envoyées. Attendez quelques secondes et réessayez.",
    };
    return {
      title: "Limite de requêtes atteinte",
      detail: "Attendez quelques minutes et réessayez, ou changez de provider dans les Paramètres.",
    };
  }

  // Clé invalide
  if (m.includes("invalid") && m.includes("api key") || m.includes("api_key_invalid") || m.includes("clé api") && m.includes("invalide")) {
    return {
      title: "Clé API invalide",
      detail: "La clé API configurée est incorrecte ou expirée. Vérifiez-la dans les Paramètres → Modèle LLM.",
    };
  }

  // Pas de crédits (Claude)
  if (m.includes("credit balance") || m.includes("billing") || m.includes("purchase credits")) {
    return {
      title: "Solde insuffisant (Claude)",
      detail: "Votre compte Anthropic n'a plus de crédits API.",
      action: "Recharger sur console.anthropic.com",
      actionUrl: "https://console.anthropic.com",
    };
  }

  // Clé non configurée
  if (m.includes("non configurée") || m.includes("not configured") || m.includes("clé api") && m.includes("non")) {
    return {
      title: "Provider non configuré",
      detail: "Aucune clé API n'est renseignée pour ce provider. Configurez-la dans les Paramètres → Modèle LLM.",
    };
  }

  // Accès refusé
  if (m.includes("403") || m.includes("permission") || m.includes("accès refusé") || m.includes("access denied")) {
    return {
      title: "Accès refusé",
      detail: "Votre clé API n'a pas les permissions nécessaires. Vérifiez qu'elle est active.",
    };
  }

  // Timeout / connexion
  if (m.includes("timeout") || m.includes("deadline") || m.includes("connexion") || m.includes("urlopen error")) {
    return {
      title: "Problème de connexion",
      detail: "Impossible de joindre le service IA. Vérifiez votre connexion internet et réessayez.",
    };
  }

  // Réponse vide
  if (m.includes("réponse vide") || m.includes("empty")) {
    return {
      title: "Réponse vide",
      detail: "Le modèle n'a pas retourné de réponse. Reformulez votre question ou réessayez.",
    };
  }

  // Erreur générique
  return {
    title: "Erreur du modèle IA",
    detail: message.length > 200 ? message.slice(0, 200) + "…" : message,
  };
}

export function isLlmError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("gemini") || m.includes("groq") || m.includes("claude") ||
    m.includes("quota") || m.includes("api key") || m.includes("clé api") ||
    m.includes("llm") || m.includes("crédit") || m.includes("credit") ||
    m.includes("provider") || m.includes("anthropic") || m.includes("génération sql")
  );
}
