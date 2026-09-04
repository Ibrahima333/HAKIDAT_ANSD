"""Fabrique de providers LLM (backend Agentic BI).

Ce module expose les fonctions pour instancier le bon provider LLM
selon le nom demandé, et pour générer du texte avec gestion d'erreur centralisée.
"""

from __future__ import annotations

from backend.llm.base import GenerationResult, LLMProviderError
from backend.llm.groq import GroqProvider
from backend.llm.gemini import GeminiProvider
from backend.llm.claude import ClaudeProvider


def normalize_provider_name(provider_name: str | None) -> str:
    """Normalise le nom du provider : minuscules, sans espaces, "gemini" par défaut."""
    if not provider_name:
        return "gemini"
    return provider_name.strip().lower()


def get_provider(provider_name: str | None):
    """Retourne une instance du provider LLM correspondant au nom donné.

    Args:
        provider_name: "gemini" ou "groq" (insensible à la casse)

    Returns:
        Instance de GeminiProvider ou GroqProvider
    """
    normalized_name = normalize_provider_name(provider_name)
    if normalized_name == "groq":
        return GroqProvider()
    if normalized_name == "claude":
        return ClaudeProvider()
    # Gemini est le provider par défaut
    return GeminiProvider()


def generate_with_fallback(prompt: str, provider_name: str | None = "gemini") -> GenerationResult:
    """Génère du texte avec le provider choisi — sans basculement silencieux.

    Contrairement à son nom, cette fonction n'implémente pas de fallback automatique.
    Si le provider échoue, l'exception LLMProviderError est propagée directement.

    Args:
        prompt: texte d'instruction à envoyer au modèle
        provider_name: nom du provider à utiliser ("gemini" ou "groq")

    Returns:
        GenerationResult contenant le texte généré et les métadonnées

    Raises:
        LLMProviderError: si le provider échoue
    """
    requested_provider = normalize_provider_name(provider_name)
    provider = get_provider(requested_provider)

    # Génération et enrichissement du résultat avec le provider demandé
    result = provider.generate(prompt)
    result.requested_provider = requested_provider
    return result
