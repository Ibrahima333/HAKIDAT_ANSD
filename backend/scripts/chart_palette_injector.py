"""Garantie serveur du sélecteur de palette de couleurs sur les graphiques.

Le prompt dataviz demande au LLM d'ajouter lui-même un sélecteur Ambre /
Océan / Émeraude / Violet, mais un LLM ne suit pas une consigne à 100 % du
temps (observé en conditions réelles : conforme sur plusieurs générations,
puis complètement omis sur une suivante, sans changement de prompt). Plutôt
que de dépendre uniquement du prompt, on injecte le sélecteur côté serveur,
après génération — indépendant de ce que le LLM a effectivement produit.

Le code injecté détecte lui-même, à l'exécution, le type de trace Plotly
(bar/scatter/line vs pie/treemap vs carte/waterfall/indicator) plutôt que de
supposer une structure fixe, afin de fonctionner quel que soit le script
généré par le LLM.
"""

from __future__ import annotations

import re

# Marqueur unique servant à détecter qu'un switcher est déjà présent
# (le LLM a suivi la consigne du prompt) — dans ce cas, ne pas dupliquer.
_MARKER = "Ambre"

_HELPER_SOURCE = '''
def _hakidata_palette_switcher(fig):
    """Ajoute un sélecteur de palette Ambre/Océan/Émeraude/Violet au graphique.

    Ignore silencieusement les cartes, waterfall et indicateurs (KPI/jauge),
    qui n'ont pas de palette catégorielle à faire varier. N'échoue jamais :
    une erreur ici ne doit jamais empêcher le graphique de s'afficher.
    """
    _P = {
        "Ambre":    ["#C8940A", "#E0B44A", "#8A6205", "#F2CD7A", "#5C4103", "#F9E3B0"],
        "Océan":    ["#2563EB", "#60A5FA", "#1E3A8A", "#93C5FD", "#1E40AF", "#BFDBFE"],
        "Émeraude": ["#059669", "#34D399", "#065F46", "#6EE7B7", "#047857", "#A7F3D0"],
        "Violet":   ["#7C3AED", "#A78BFA", "#4C1D95", "#C4B5FD", "#5B21B6", "#DDD6FE"],
    }
    try:
        if not fig.data or fig.layout.updatemenus:
            return fig
        t0 = fig.data[0].type
        if t0 in ("scattermapbox", "choroplethmapbox", "densitymapbox", "choropleth",
                  "scattergeo", "waterfall", "indicator"):
            return fig
        if t0 in ("pie", "treemap", "sunburst", "funnelarea"):
            labels = fig.data[0].labels if fig.data[0].labels is not None else fig.data[0].values
            n = len(labels)
            def _args(colors, n=n):
                return [{"marker.colors": [[colors[i % len(colors)] for i in range(n)]]}]
            # Beaucoup de parts + labels a l'exterieur = chevauchement illisible.
            fig.update_traces(textposition="inside", textinfo="percent")
        else:
            n_traces = len(fig.data)
            if n_traces == 1:
                tr = fig.data[0]
                pts = tr.x if tr.x is not None else tr.y
                n = len(pts) if pts is not None else 1
                def _args(colors, n=n):
                    vals = [colors[i % len(colors)] for i in range(n)]
                    return [{"marker.color": [vals], "line.color": [vals]}, [0]]
            else:
                idx = list(range(n_traces))
                def _args(colors, idx=idx, n_traces=n_traces):
                    vals = [colors[i % len(colors)] for i in range(n_traces)]
                    return [{"marker.color": vals, "line.color": vals}, idx]
        # type="dropdown" (pas "buttons") : un seul controle compact plutot que
        # 4 boutons qui debordent sur le titre/graphique. margin.t reserve un
        # espace reel en pixels — sans ca, y=1.0 peut chevaucher le graphique
        # selon les proportions du conteneur (observe en conditions reelles).
        fig.update_layout(
            margin=dict(t=70),
            updatemenus=[dict(
                type="dropdown", direction="down", showactive=True, active=0,
                x=1.0, xanchor="right", y=1.0, yanchor="bottom",
                pad=dict(r=5, t=5, b=5),
                buttons=[dict(label=name, method="restyle", args=_args(colors)) for name, colors in _P.items()],
            )],
        )
    except Exception:
        pass
    return fig

'''.lstrip("\n")

_WRITE_HTML_RE = re.compile(r"^([ \t]*)fig\.write_html\(", re.MULTILINE)
_DEF_MAIN_RE = re.compile(r"^def main\(\):", re.MULTILINE)


def needs_palette_switcher(code: str) -> bool:
    """True si le LLM n'a pas déjà ajouté son propre sélecteur."""
    return _MARKER not in code


def inject_palette_switcher(code: str) -> str:
    """Insère le helper et l'appel `fig = _hakidata_palette_switcher(fig)`
    juste avant `fig.write_html(...)`. Retourne le code inchangé si aucune
    des deux ancres attendues n'est trouvée (structure de script inattendue) —
    on préfère un graphique sans sélecteur à un script cassé.
    """
    write_match = _WRITE_HTML_RE.search(code)
    def_match = _DEF_MAIN_RE.search(code)
    if not write_match or not def_match:
        return code

    indent = write_match.group(1)
    code = code[:def_match.start()] + _HELPER_SOURCE + code[def_match.start():]

    # Réinsertion après ajout du helper : recalcule la position de write_html
    write_match = _WRITE_HTML_RE.search(code)
    call_line = f"{indent}fig = _hakidata_palette_switcher(fig)\n"
    code = code[:write_match.start()] + call_line + code[write_match.start():]
    return code
