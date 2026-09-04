import React from "react";
import {
  MessageSquare, MessagesSquare, LayoutDashboard, Bell, HelpCircle, Shield,
  LogOut, KeyRound, Menu, X, Moon, Sun, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cn } from "../lib/utils";
import { HakiDataWordmark } from "./HakiDataWordmark";

export type ViewId = "chat" | "quickchat" | "dashboard" | "alerts" | "help" | "admin";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
}

const ICON_CLS = "w-4 h-4";
const NAV_ITEMS: NavItem[] = [
  { id: "chat",      label: "Analyse",   icon: <MessageSquare className={ICON_CLS} strokeWidth={1.75} /> },
  { id: "quickchat", label: "Chat IA",   icon: <MessagesSquare className={ICON_CLS} strokeWidth={1.75} /> },
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className={ICON_CLS} strokeWidth={1.75} /> },
  { id: "alerts",    label: "Alertes",   icon: <Bell className={ICON_CLS} strokeWidth={1.75} /> },
  { id: "help",      label: "Aide",      icon: <HelpCircle className={ICON_CLS} strokeWidth={1.75} /> },
];

interface Props {
  view: ViewId;
  setView: (v: ViewId) => void;
  isAdmin: boolean;
  userEmail?: string | null;
  onChangePassword: () => void;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  /** Sidebar repliée (desktop uniquement) */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function NavSidebar({
  view, setView, isAdmin, userEmail, onChangePassword, onLogout, mobileOpen, onCloseMobile,
  isDark, onToggleTheme, collapsed = false, onToggleCollapsed,
}: Props) {
  const initial = userEmail?.[0]?.toUpperCase() ?? "?";
  const name = userEmail?.split("@")[0] ?? "utilisateur";

  const body = (
    <div className="flex flex-col h-full w-[260px] bg-[#111113] text-zinc-300">
      {/* Wordmark — logo HakiData inchangé */}
      <div className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-white/[0.06]">
        <img src="/hakidata-icon.svg" alt="HakiData" className="w-9 h-9 object-contain" />
        <HakiDataWordmark />
        {/* Replier la sidebar — desktop uniquement (sur mobile c'est un tiroir) */}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            title="Replier le menu"
            className="ml-auto hidden md:block p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          onClick={onCloseMobile}
          className="ml-auto md:hidden p-1 text-zinc-500 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setView(item.id); onCloseMobile(); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <span className={active ? "text-white" : "text-zinc-400"}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1.5 px-3 text-[10.5px] font-semibold text-zinc-600 uppercase tracking-wider">
              Administration
            </div>
            <button
              type="button"
              onClick={() => { setView("admin"); onCloseMobile(); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors",
                view === "admin"
                  ? "bg-white/10 text-white"
                  : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <span className={view === "admin" ? "text-white" : "text-zinc-400"}>
                <Shield className={ICON_CLS} strokeWidth={1.75} />
              </span>
              Espace admin
            </button>
          </>
        )}
      </nav>

      {/* Footer compte */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[12px] font-bold shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white truncate">{name}</p>
            <p className="text-[11px] text-zinc-500 truncate">{isAdmin ? "Administrateur" : "Utilisateur"}</p>
          </div>
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDark ? "Mode clair" : "Mode sombre"}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onChangePassword}
            title="Changer le mot de passe"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            title="Se déconnecter"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-white/[0.06] transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const collapsedStrip = (
    <div className="flex flex-col h-full w-14 bg-[#111113] items-center py-4 gap-3">
      <img src="/hakidata-icon.svg" alt="HakiData" className="w-8 h-8 object-contain" />
      <button
        type="button"
        onClick={onToggleCollapsed}
        title="Déplier le menu"
        className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
      </button>

      {/* Icônes de navigation — restent visibles même repliée */}
      <nav className="flex-1 flex flex-col items-center gap-1 pt-2 w-full">
        {NAV_ITEMS.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => { setView(item.id); onCloseMobile(); }}
              title={item.label}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
                active
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {item.icon}
            </button>
          );
        })}

        {isAdmin && (
          <button
            type="button"
            onClick={() => { setView("admin"); onCloseMobile(); }}
            title="Espace admin"
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-lg transition-colors mt-1 border-t border-white/[0.06] pt-1",
              view === "admin"
                ? "bg-white/10 text-white"
                : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <Shield className={ICON_CLS} strokeWidth={1.75} />
          </button>
        )}
      </nav>

      {/* Avatar utilisateur */}
      <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-[12px] font-bold shrink-0">
        {initial}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop : la largeur du conteneur s'anime entre 260px et 56px ; les
          deux contenus (déplié/replié) restent à taille fixe et se fondent
          l'un dans l'autre plutôt que de basculer brutalement. */}
      <div
        className={cn(
          "hidden md:block shrink-0 h-full relative overflow-hidden transition-[width] duration-300 ease-in-out",
          collapsed ? "w-14" : "w-[260px]"
        )}
      >
        <div className={cn(
          "absolute inset-0 transition-opacity duration-200",
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
        )}>
          {body}
        </div>
        <div className={cn(
          "absolute inset-0 transition-opacity duration-200",
          collapsed ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
        )}>
          {collapsedStrip}
        </div>
      </div>

      {/* Mobile : tiroir superposé */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative z-10 h-full">{body}</div>
        </div>
      )}
    </>
  );
}

/** Bouton hamburger pour ouvrir le tiroir mobile — utilisé dans la barre du haut mobile. */
export function MobileNavToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="md:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
