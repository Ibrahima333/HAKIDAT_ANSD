import { BookOpen, Database, MessageSquare, LayoutDashboard, Bell, Phone, Mail, ChevronDown } from "lucide-react";
import { useState } from "react";

interface Section {
  icon: React.ReactNode;
  title: string;
  steps: { title: string; desc: string }[];
}

const SECTIONS: Section[] = [
  {
    icon: <Database className="w-5 h-5 text-[#C8940A]" />,
    title: "Connecter une base de données",
    steps: [
      { title: "Ouvrir la configuration", desc: "Dans le panneau gauche, cliquez sur « Base de données » pour dérouler le formulaire de connexion." },
      { title: "Remplir les informations", desc: "Saisissez le type (MySQL ou PostgreSQL), l'hôte, le port, le nom de la base, l'utilisateur et le mot de passe." },
      { title: "Tester la connexion", desc: "Cliquez sur « Connecter ». Un message vert confirme que la connexion est établie. En cas d'erreur, vérifiez les identifiants." },
    ],
  },
  {
    icon: <MessageSquare className="w-5 h-5 text-[#C8940A]" />,
    title: "Analyser vos données",
    steps: [
      { title: "Sélectionner la cible", desc: "Dans le panneau gauche, choisissez la base et le schéma à interroger." },
      { title: "Poser votre question", desc: "Dans l'onglet « Analyse », tapez votre question en français dans la barre en bas. Exemple : « Quels sont nos 5 meilleurs clients ? »" },
      { title: "Consulter les résultats", desc: "HakiData génère le SQL, exécute la requête et affiche les données sous forme de tableau, graphique et synthèse." },
      { title: "Épingler un résultat", desc: "Cliquez sur l'icône épingle pour sauvegarder un résultat dans votre Dashboard." },
    ],
  },
  {
    icon: <LayoutDashboard className="w-5 h-5 text-[#C8940A]" />,
    title: "Utiliser le Dashboard",
    steps: [
      { title: "Accéder au tableau de bord", desc: "Cliquez sur l'onglet « Dashboard » en haut de l'écran." },
      { title: "Épingler des KPIs", desc: "Depuis l'onglet Analyse, épinglez un résultat numérique comme KPI. Il apparaît dans la section « KPIs » du Dashboard." },
      { title: "Épingler des graphiques", desc: "Épinglez un résultat avec graphique. Il apparaît dans la section « Graphiques » du Dashboard." },
      { title: "Rafraîchir les données", desc: "Cliquez sur « Tout rafraîchir » pour recalculer tous les KPIs et graphiques avec les données les plus récentes." },
    ],
  },
  {
    icon: <Bell className="w-5 h-5 text-[#C8940A]" />,
    title: "Configurer des alertes automatiques",
    steps: [
      { title: "Épingler un KPI", desc: "Avant de créer une alerte, épinglez d'abord un KPI numérique depuis l'onglet Analyse." },
      { title: "Créer une alerte", desc: "Dans l'onglet « Alertes », cliquez sur « Nouvelle alerte ». Donnez un nom, sélectionnez le KPI, choisissez la condition (ex : > 5000) et saisissez l'email de destination." },
      { title: "Recevoir les notifications", desc: "HakiData vérifie automatiquement selon la fréquence choisie (15 min, 30 min, 1h…). Dès que la condition est déclenchée, un email est envoyé depuis alertes.hakidata@gmail.com." },
      { title: "Vérifier les spams", desc: "Si vous ne recevez pas l'email, vérifiez votre dossier spam et ajoutez alertes.hakidata@gmail.com à vos contacts." },
    ],
  },
];

function AccordionSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
      <button
        onClick={e => { e.preventDefault(); setOpen(o => !o); }}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] flex items-center justify-center shrink-0">
            {section.icon}
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</span>
        </div>
        <ChevronDown
          className="w-4 h-4 text-zinc-400 transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      <div style={{ overflow: "hidden", borderRadius: "0 0 1rem 1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateRows: open ? "1fr" : "0fr",
            transition: "grid-template-rows 0.35s ease",
          }}
        >
          <div style={{ overflow: "hidden", opacity: open ? 1 : 0, transition: "opacity 0.25s ease" }}>
            <div className="px-6 pb-5 border-t border-zinc-100">
              <ol className="mt-4 space-y-4">
                {section.steps.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#C8940A] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{step.title}</p>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Help() {
  return (
    <div className="h-full flex flex-col">
      {/* En-tête */}
      <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-8 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-[#C8940A]" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Aide & Guide d'utilisation</h1>
          <p className="text-xs text-zinc-400">Tout ce qu'il faut savoir pour utiliser HakiData</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6" style={{ overscrollBehavior: "contain" }}>
        <div className="max-w-2xl mx-auto space-y-3">

          {/* Sections accordéon */}
          {SECTIONS.map((s, i) => (
            <AccordionSection key={i} section={s} />
          ))}

          {/* Contact */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-5 mt-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Nous contacter</h2>
            <div className="space-y-3">
              <a
                href="tel:+221782306178"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#FEF3C7] transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] group-hover:bg-[#FEF3C7] flex items-center justify-center shrink-0 transition-colors">
                  <Phone className="w-4 h-4 text-[#C8940A]" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Téléphone / WhatsApp</p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">+221 78 230 61 78</p>
                </div>
              </a>
              <a
                href="mailto:alertes.hakidata@gmail.com"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#FEF3C7] transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] group-hover:bg-[#FEF3C7] flex items-center justify-center shrink-0 transition-colors">
                  <Mail className="w-4 h-4 text-[#C8940A]" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Email</p>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">alertes.hakidata@gmail.com</p>
                </div>
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
