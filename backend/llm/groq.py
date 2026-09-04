"""Provider LLM Groq via l'interface OpenAI-compatible (backend Agentic BI).

Utilise ``urllib`` (sans dépendance externe) pour appeler l'API Groq.
La clé API est lue depuis le gestionnaire de configuration LLM
(runtime ou variable d'environnement GROQ_API_KEY).
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request

from backend.llm.base import GenerationResult, LLMProvider, LLMProviderError

# URL de base Groq (interface compatible OpenAI)
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# Modèle Groq utilisé par défaut pour toutes les générations.
# llama-3.3-70b-versatile a été décommissionné par Groq (404 sur /chat/completions) ;
# gpt-oss-120b est son remplaçant le plus proche en capacité (mêmes ordres de grandeur
# de contexte et de coût), vérifié actif via GET /openai/v1/models.
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"

_WAIT_RE = re.compile(r"try again in (?:(\d+)m)?([\d.]+)s")
# Groq distingue plusieurs compteurs (TPM/RPM par minute, TPD/RPD par jour).
# Un 429 ne veut pas forcément dire "quota du jour épuisé" — le cas le plus
# fréquent en usage normal est une rafale sur la limite PAR MINUTE, qui se
# réinitialise en quelques secondes, pas le lendemain.
_PER_MINUTE_RE = re.compile(r"per minute|/min\b|TPM|RPM", re.IGNORECASE)
_PER_DAY_RE = re.compile(r"per day|/day\b|TPD|RPD", re.IGNORECASE)

# Au-delà de ce délai, on laisse remonter l'erreur plutôt que de faire
# attendre l'utilisateur en silence sur une requête déjà bloquante.
_MAX_AUTO_RETRY_WAIT_SECONDS = 30.0


def _parse_wait_seconds(body: str) -> float | None:
    """Extrait le délai d'attente conseillé par Groq (ex: '23.125s', '1m5.2s')."""
    match = _WAIT_RE.search(body)
    if not match:
        return None
    minutes_str, seconds_str = match.groups()
    minutes = int(minutes_str) if minutes_str else 0
    return minutes * 60 + float(seconds_str)


def _groq_rate_limit_message(body: str) -> str:
    """Construit un message d'erreur fidèle au type de limite réellement
    atteint (par minute vs par jour), au lieu de toujours supposer un
    quota journalier épuisé — Groq renvoie un HTTP 429 pour les deux cas,
    avec des conséquences très différentes pour l'utilisateur (quelques
    secondes d'attente contre le lendemain)."""
    wait_seconds = _parse_wait_seconds(body)
    wait_msg = f" Réessayez dans {wait_seconds:.0f}s." if wait_seconds is not None else ""

    if _PER_MINUTE_RE.search(body) and not _PER_DAY_RE.search(body):
        return (
            f"⏱ Limite Groq de tokens par minute atteinte (rafale de requêtes trop rapprochées, "
            f"pas votre quota du jour).{wait_msg} Cette limite se réinitialise en quelques secondes — "
            f"relancez simplement l'analyse."
        )
    if _PER_DAY_RE.search(body):
        return (
            f"⏱ Quota Groq journalier atteint.{wait_msg} "
            f"Passez sur Gemini dans Paramètres → Modèle LLM, ou attendez la réinitialisation demain."
        )
    # Type de limite non reconnu dans la réponse — rester honnête plutôt que
    # d'affirmer une cause précise qu'on n'a pas pu confirmer.
    return (
        f"⏱ Limite de débit Groq atteinte.{wait_msg} "
        f"Passez sur Gemini dans Paramètres → Modèle LLM si le problème persiste."
    )


class GroqProvider(LLMProvider):
    """Provider LLM utilisant l'API Groq (interface OpenAI-compatible)."""

    name = "groq"

    def generate(self, prompt: str) -> GenerationResult:
        """Génère du texte via l'API Groq.

        Args:
            prompt: texte d'instruction envoyé au modèle

        Returns:
            GenerationResult avec le texte généré

        Raises:
            LLMProviderError: si la clé est manquante, l'API échoue, ou la réponse est vide
        """
        # Import circulaire évité en important à la demande
        from backend.llm_config import LLMConfigManager

        mgr = LLMConfigManager.instance()
        api_key = mgr.get_api_key("groq")

        if not api_key:
            raise LLMProviderError(
                "Clé API Groq non configurée. Renseignez-la via l'interface ou GROQ_API_KEY."
            )

        # URL configurable (utile pour les proxies ou instances privées)
        api_url = mgr.get_api_url("groq") or GROQ_BASE_URL
        endpoint = api_url.rstrip("/") + "/chat/completions"

        # Construction de la requête JSON (format chat OpenAI)
        payload = {
            "model": GROQ_DEFAULT_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,  # Température basse pour des réponses déterministes
        }
        data = json.dumps(payload).encode()

        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (compatible; AgenticBI/1.0)",
            },
        )

        # Une seule tentative de ré-essai automatique : un 429 par minute (TPM)
        # avec un délai d'attente court se résorbe seul en quelques secondes,
        # inutile de faire remonter l'erreur et forcer l'utilisateur à
        # relancer manuellement toute l'analyse pour ça.
        already_retried = False
        while True:
            try:
                # Timeout de 120s pour les prompts longs (génération SQL complexe)
                with urllib.request.urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read())
                break
            except urllib.error.HTTPError as exc:
                body = exc.read().decode(errors="replace")
                if exc.code == 429:
                    is_per_minute = bool(_PER_MINUTE_RE.search(body)) and not _PER_DAY_RE.search(body)
                    wait_seconds = _parse_wait_seconds(body)
                    if (
                        not already_retried
                        and is_per_minute
                        and wait_seconds is not None
                        and wait_seconds <= _MAX_AUTO_RETRY_WAIT_SECONDS
                    ):
                        already_retried = True
                        time.sleep(wait_seconds)
                        continue
                    raise LLMProviderError(_groq_rate_limit_message(body)) from exc
                if exc.code == 401:
                    raise LLMProviderError(
                        "Clé API Groq invalide ou expirée. Vérifiez-la dans Paramètres → Modèle LLM."
                    ) from exc
                if exc.code == 403:
                    raise LLMProviderError(
                        "Accès refusé par Groq. Vérifiez que votre clé API est active sur console.groq.com."
                    ) from exc
                if exc.code == 503 or exc.code == 502:
                    raise LLMProviderError(
                        "Le service Groq est temporairement indisponible. Réessayez dans quelques minutes."
                    ) from exc
                raise LLMProviderError(f"Erreur Groq ({exc.code}) — contactez le support si le problème persiste.") from exc
            except urllib.error.URLError as exc:
                raise LLMProviderError(
                    "Impossible de joindre Groq. Vérifiez votre connexion internet."
                ) from exc

        # Extraction du texte depuis la réponse JSON
        try:
            text = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMProviderError(f"Réponse Groq inattendue : {result}") from exc

        # Vérification que la réponse n'est pas vide
        if not text.strip():
            raise LLMProviderError("Groq a retourné une réponse vide.")

        return GenerationResult(text=text, provider_name=self.name)
