# HakiData — Guide des fonctionnalités

> Ce document explique ce que HakiData permet de faire, en langage simple.
> Pour l'installation ou les détails techniques, voir le [README](README.md).

---

## En une phrase

HakiData permet de poser des questions à vos données **en français, comme à un collègue**, et d'obtenir aussitôt un tableau, un graphique et une explication — sans écrire une seule ligne de code.

---

## 1. Analyse — poser une question

C'est l'écran principal. Vous tapez une question dans la barre en bas, par exemple :

> « Quels sont nos 5 meilleurs clients ce trimestre ? »
> « Répartition des ventes par région »
> « Commandes en attente depuis plus de 7 jours »

HakiData s'occupe de tout et vous montre le résultat sous quatre angles, dans des onglets :

- **Results** — les données sous forme de tableau, téléchargeables en CSV
- **SQL** — la requête technique générée, si vous voulez vérifier ou la faire relire
- **Chart** — un graphique interactif (courbe, barres, carte…). Si la question porte sur une zone géographique, une carte est générée automatiquement
- **Report** — une synthèse en français avec les points clés et des recommandations

Un chronomètre s'affiche pendant le calcul, et un bouton permet d'annuler une analyse trop longue.

---

## 2. Chat IA — discuter avec vos données

Un deuxième mode de dialogue, pensé pour explorer plutôt que produire un rapport formel. L'assistant connaît la structure de votre base et peut répondre à des questions plus ouvertes, suggérer des pistes d'analyse ou expliquer une tendance.

Les échanges intéressants peuvent être ajoutés en un clic au rapport PDF final.

---

## 3. Dashboard — votre tableau de bord

Chaque utilisateur peut épingler ses résultats préférés pour les garder sous les yeux :

- **Graphiques épinglés** — réorganisables par glisser-déposer, redimensionnables
- **KPIs épinglés** — des chiffres clés (total, moyenne…) affichés en grandes cartes, avec un indicateur de variation (↑ ou ↓) par rapport à la dernière valeur

Les KPIs se mettent à jour automatiquement toutes les minutes, sans avoir à recharger la page.

---

## 4. Alertes — être prévenu automatiquement

Plutôt que de vérifier un chiffre chaque jour, on peut demander à HakiData de surveiller un KPI et d'envoyer un e-mail dès qu'un seuil est franchi.

**Exemple :** être alerté si le stock d'un produit passe sous 50 unités.

L'alerte a trois niveaux de gravité, qui s'aggravent si la situation ne s'améliore pas :

| Niveau | Signification |
|---|---|
| ⚠️ Seuil dépassé | Le seuil vient d'être franchi |
| 🔶 Situation aggravée | L'écart se creuse |
| 🚨 Niveau critique | L'écart est très important |
| ✅ Retour à la normale | Un e-mail confirme quand tout redevient normal |

Un e-mail n'est envoyé **qu'au changement de niveau** — pas de spam à chaque vérification.

> Les alertes fonctionnent uniquement sur des données connectées en direct (une vraie base de données), pas sur un fichier CSV ou Excel importé, puisque ce type de fichier ne change pas tout seul.

---

## 5. Importer un fichier CSV ou Excel

Pas encore de base de données ? Vous pouvez glisser-déposer un fichier `.csv`, `.xlsx` ou `.xls` (jusqu'à 50 Mo) directement dans l'application. Il devient aussitôt interrogeable exactement comme une vraie base de données, avec les mêmes questions en français.

---

## 6. Explorateur de schéma

Dans le panneau de gauche, la liste des tables et colonnes de la base sélectionnée est toujours visible. Cliquer sur une colonne l'insère directement dans la question — pratique pour être précis sans deviner le nom exact d'un champ.

---

## 7. Export PDF

Depuis l'onglet Report, un rapport PDF complet peut être généré en un clic : question posée, graphique, chiffres clés, synthèse, et les échanges de Chat IA que vous avez choisi d'y ajouter. Prêt à être partagé en réunion.

---

## 8. Plusieurs bases de données, avec des accès séparés

HakiData peut être connecté à **plusieurs bases de données à la fois** (MySQL ou PostgreSQL, y compris sur des serveurs différents). C'est l'administrateur qui déclare ces connexions depuis son panneau.

Chaque utilisateur ne voit que les bases auxquelles il a explicitement été autorisé — par défaut, un nouvel utilisateur n'a accès à aucune base tant que l'administrateur ne le décide pas. Cela permet, par exemple, de donner accès aux données commerciales à l'équipe vente sans exposer les données RH.

---

## 9. Comptes et confidentialité

Chaque personne se connecte avec son propre compte. Ce que vous analysez, vos KPIs épinglés et votre tableau de bord **ne sont jamais visibles par un autre utilisateur** — sauf l'administrateur, qui peut consulter le journal d'audit des actions effectuées.

Il n'y a pas d'inscription libre : seul un administrateur peut créer un compte.

---

## 10. Panneau d'administration

Réservé aux administrateurs, accessible depuis le bouton **Admin** en haut à droite. Trois sections :

- **Utilisateurs** — créer des comptes, réinitialiser un mot de passe, désactiver ou supprimer un accès
- **Bases de données** — déclarer les connexions aux bases de l'entreprise et décider qui a accès à quoi (voir section 8)
- **Audit** — historique des actions effectuées dans l'application

---

## 11. Aide intégrée

Un onglet **Aide**, directement dans l'application, reprend les principales actions pas à pas pour un premier usage.

---

*Pour toute question technique (installation, dépannage, architecture), consultez le [README.md](README.md).*
