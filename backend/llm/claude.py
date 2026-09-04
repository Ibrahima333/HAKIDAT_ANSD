"""Provider LLM Anthropic Claude (backend Agentic BI).

Utilise urllib (sans dépendance externe) pour appeler l'API Anthropic Messages.
La clé API est lue depuis le gestionnaire de configuration LLM
(runtime ou variable d'environnement ANTHROPIC_API_KEY).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class ClaudeProvider(LLMProvider):
    """Provider LLM utilisant l'API Anthropic Claude."""

    name = "claude"

    def generate(self, prompt: str) -> GenerationResult:
        from backend.llm_config import LLMConfigManager

        api_key = LLMConfigManager.instance().get_api_key("claude")
        if not api_key:
            raise LLMProviderError(
                "Clé API Claude non configurée. Renseignez-la via l'interface ou ANTHROPIC_API_KEY."
            )

        payload = {
            "model": CLAUDE_DEFAULT_MODEL,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        data = json.dumps(payload).encode()

        req = urllib.request.Request(
            ANTHROPIC_API_URL,
            data=data,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                result = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            body = exc.read().decode(errors="replace")
            if exc.code == 401:
                raise LLMProviderError(
                    "Clé API Claude invalide. Vérifiez-la dans Paramètres → Modèle LLM."
                ) from exc
            if exc.code == 429:
                raise LLMProviderError(
                    "⏱ Quota Claude atteint. Attendez quelques minutes ou passez sur Groq."
                ) from exc
            if exc.code == 403:
                raise LLMProviderError(
                    "Accès refusé par Anthropic. Vérifiez que votre clé API est active."
                ) from exc
            raise LLMProviderError(f"Erreur Claude ({exc.code}) : {body[:200]}") from exc
        except urllib.error.URLError as exc:
            raise LLMProviderError(
                "Impossible de joindre l'API Claude. Vérifiez votre connexion internet."
            ) from exc

        try:
            text = result["content"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise LLMProviderError(f"Réponse Claude inattendue : {result}") from exc

        if not text.strip():
            raise LLMProviderError("Claude a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
