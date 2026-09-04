"""Classes de base pour les providers LLM (backend Agentic BI).

Ce module définit les abstractions communes à tous les providers :
- :class:`GenerationResult` : résultat d'une génération de texte
- :class:`LLMProviderError` : exception levée en cas d'échec
- :class:`LLMProvider` : classe abstraite à implémenter par chaque provider
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class GenerationResult:
    """Résultat d'une génération de texte par un provider LLM.

    Attributs :
        text              : texte généré par le modèle
        provider_name     : nom du provider qui a effectivement répondu
        stdout            : sortie standard capturée (si applicable)
        stderr            : sortie d'erreur capturée (si applicable)
        requested_provider: provider demandé par l'appelant
        used_fallback     : True si un provider de secours a été utilisé
        fallback_reason   : raison du basculement vers le provider de secours
        warnings          : liste de messages d'avertissement non bloquants
    """
    text: str
    provider_name: str
    stdout: str = ""
    stderr: str = ""
    requested_provider: str = "gemini"
    used_fallback: bool = False
    fallback_reason: str = ""
    warnings: list[str] = field(default_factory=list)


class LLMProviderError(RuntimeError):
    """Levée quand un provider LLM ne peut pas générer une réponse valide."""


class LLMProvider(ABC):
    """Classe abstraite définissant l'interface commune à tous les providers LLM."""

    name = "base"

    @abstractmethod
    def generate(self, prompt: str) -> GenerationResult:
        """Génère du texte à partir d'un prompt.

        Args:
            prompt: texte d'instruction envoyé au modèle

        Returns:
            GenerationResult contenant le texte généré et les métadonnées

        Raises:
            LLMProviderError: si la génération échoue
        """
