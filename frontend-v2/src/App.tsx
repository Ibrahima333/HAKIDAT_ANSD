import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { HakiLoader } from "./components/HakiLoader";
import { useTheme } from "./lib/useTheme";
import { AnalyseToolbar } from "./components/AnalyseToolbar";
import { NavSidebar, MobileNavToggle, ViewId } from "./components/NavSidebar";
import { ChatArea } from "./components/ChatArea";
import { PipelineInput } from "./components/PipelineInput";
import { Login } from "./components/Login";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { ConnectionModal } from "./components/ConnectionModal";
import { AppState } from "./types";
import { clearHistory, fetchConfig, fetchHistory, fetchResult } from "./lib/api";
import { clearAuth, getUser, isAuthenticated } from "./lib/auth";

// Chargement différé — ces vues ne sont chargées que si l'utilisateur y accède
const Dashboard    = lazy(() => import("./components/Dashboard").then(m => ({ default: m.Dashboard })));
const QuickChat    = lazy(() => import("./components/QuickChat").then(m => ({ default: m.QuickChat })));
const Alerts       = lazy(() => import("./components/Alerts").then(m => ({ default: m.Alerts })));
// AdminPanel : chargé uniquement pour les admins (code splitting par rôle)
const AdminPanel   = lazy(() => import("./components/AdminPanel").then(m => ({ default: m.AdminPanel })));
const Help         = lazy(() => import("./components/Help").then(m => ({ default: m.Help })));

function ViewLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <HakiLoader size={72} />
    </div>
  );
}

function FadeIn({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 flex flex-col overflow-hidden animate-fade-in">{children}</div>;
}

export default function App() {
  const [authed, setAuthed]       = useState(() => isAuthenticated());
  const [currentUser, setCurrentUser] = useState(() => getUser());
  const [view, setView] = useState<ViewId>("chat");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Repli de la sidebar (desktop) — mémorisé pour retrouver son état au retour.
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem("hakidata_nav_collapsed") === "1"
  );
  useEffect(() => {
    localStorage.setItem("hakidata_nav_collapsed", navCollapsed ? "1" : "0");
  }, [navCollapsed]);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashFading, setSplashFading]   = useState(false);
  const { dark, toggle: toggleTheme } = useTheme();

  // Déconnexion automatique si le backend répond 401
  useEffect(() => {
    const handler = () => { setAuthed(false); setCurrentUser(null); setView("chat"); };
    window.addEventListener("auth:logout", handler);
    return () => window.removeEventListener("auth:logout", handler);
  }, []);
  const activeResultRequestRef = useRef<string | null>(null);
  const [state, setState] = useState<AppState>({
    databases: [],
    schemas: [],
    providers: [],
    selectedDatabase: "",
    selectedSchema: "",
    selectedProvider: (localStorage.getItem("hakidata_provider") as string) || "gemini",
    overwriteExisting: false,
    history: [],
    activeResultId: null,
    activeResult: null,
    isLoading: false,
    isBootstrapping: true,
    errorMessage: null,
    insertText: null,
  });

  const refreshConfiguration = useCallback(async (preserveSelection = true) => {
    const [config, history] = await Promise.all([fetchConfig(), fetchHistory()]);

    setState((prev) => {
      // Ne jamais auto-sélectionner l'historique — uniquement si l'utilisateur clique dessus
      const nextActiveResultId = preserveSelection && prev.activeResultId
        ? prev.activeResultId
        : null;

      return {
        ...prev,
        databases: config.databases,
        schemas: config.schemas,
        providers: config.providers,
        selectedDatabase: preserveSelection && prev.selectedDatabase && config.databases.includes(prev.selectedDatabase)
          ? prev.selectedDatabase
          : config.selectedDatabase,
        selectedSchema: preserveSelection && prev.selectedSchema && config.schemas.includes(prev.selectedSchema)
          ? prev.selectedSchema
          : config.selectedSchema,
        // Le provider vient toujours du localStorage — jamais du backend
        selectedProvider: localStorage.getItem("hakidata_provider") || prev.selectedProvider || config.selectedProvider,
        history,
        activeResultId: nextActiveResultId,
        activeResult: prev.activeResult?.id === nextActiveResultId ? prev.activeResult : null,
        errorMessage: null,
      };
    });
  }, []);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;

    async function bootstrap() {
      try {
        await refreshConfiguration(false);
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isBootstrapping: false,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          isBootstrapping: false,
          errorMessage: error instanceof Error ? error.message : "Impossible de charger l'application.",
        }));
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshConfiguration, authed]);

  useEffect(() => {
    if (!state.selectedDatabase) {
      return;
    }

    let cancelled = false;

    async function refreshSchemas() {
      try {
        const config = await fetchConfig(state.selectedDatabase);
        if (cancelled) {
          return;
        }

        setState((prev) => {
          const selectedSchema = config.schemas.includes(prev.selectedSchema)
            ? prev.selectedSchema
            : (config.selectedSchema || config.schemas[0] || "");

          return {
            ...prev,
            schemas: config.schemas,
            selectedSchema,
            errorMessage: prev.errorMessage,
          };
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          errorMessage: error instanceof Error ? error.message : "Impossible de récupérer les schémas.",
        }));
      }
    }

    void refreshSchemas();
    return () => {
      cancelled = true;
    };
  }, [state.selectedDatabase]);

  useEffect(() => {
    if (!state.activeResultId) {
      return;
    }
    if (state.activeResult?.id === state.activeResultId) {
      return;
    }
    if (activeResultRequestRef.current === state.activeResultId) {
      return;
    }

    let cancelled = false;
    activeResultRequestRef.current = state.activeResultId;

    async function loadActiveResult() {
      try {
        const result = await fetchResult(state.activeResultId as string);
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          activeResult: result,
          errorMessage: null,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setState((prev) => ({
          ...prev,
          errorMessage: error instanceof Error ? error.message : "Impossible de charger le résultat sélectionné.",
        }));
      } finally {
        activeResultRequestRef.current = null;
      }
    }

    void loadActiveResult();
    return () => {
      cancelled = true;
      activeResultRequestRef.current = null;
    };
  }, [state.activeResultId, state.activeResult]);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setState((prev) => ({
      ...prev,
      history: [],
      activeResultId: null,
      activeResult: null,
      errorMessage: null,
    }));
  }, []);

  function handleLogout() {
    clearAuth();
    setAuthed(false);
    setCurrentUser(null);
    setView("chat");
  }

  if (!authed) {
    return (
      <Login onLogin={() => {
        setAuthed(true);
        setCurrentUser(getUser());
        setSplashVisible(true);
        setSplashFading(false);
        setTimeout(() => setSplashFading(true), 2000);
        setTimeout(() => setSplashVisible(false), 2500);
      }} />
    );
  }

  if (splashVisible) {
    return (
      <div className={`flex h-screen items-center justify-center bg-white dark:bg-zinc-950 ${splashFading ? "animate-fade-out" : "animate-fade-in"}`}>
        <HakiLoader size={120} label="Chargement de votre espace…" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#111113] font-sans text-zinc-900 dark:text-zinc-100 overflow-hidden animate-fade-in">
      <NavSidebar
        view={view}
        setView={setView}
        isAdmin={currentUser?.role === "admin"}
        userEmail={currentUser?.email}
        onChangePassword={() => setShowChangePassword(true)}
        onLogout={handleLogout}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        isDark={dark}
        onToggleTheme={toggleTheme}
        collapsed={navCollapsed}
        onToggleCollapsed={() => setNavCollapsed(c => !c)}
      />

      <main className="relative flex-1 flex flex-col overflow-hidden min-w-0 bg-white dark:bg-zinc-950 rounded-l-3xl">
        {/* Clin d'œil discret à la page de connexion — même image, en filigrane, sur toute l'app */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.12] grayscale"
          style={{
            backgroundImage: "url('/bg-opt.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center top",
          }}
        />
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          {/* Barre mobile : hamburger nav */}
          <div className="md:hidden shrink-0 flex items-center gap-2 h-14 px-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <MobileNavToggle onOpen={() => setMobileNavOpen(true)} />
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 ml-1">
              {{ chat: "Analyse", quickchat: "Chat IA", dashboard: "Dashboard", alerts: "Alertes", help: "Aide", admin: "Admin" }[view]}
            </span>
          </div>

          {/* Contenu selon la vue */}
          {view === "chat" && (
            <div className="flex-1 flex flex-col relative overflow-hidden">
              <AnalyseToolbar
                state={state}
                setState={setState}
                onRefresh={() => void refreshConfiguration(true)}
                onClearHistory={() => void handleClearHistory()}
                currentUser={currentUser}
                onOpenConnection={() => setShowConnectionModal(true)}
              />
              <ChatArea state={state} />
              <PipelineInput state={state} setState={setState} />
            </div>
          )}
          <Suspense fallback={<ViewLoader />}>
            {view === "quickchat" && (
              <FadeIn>
                <QuickChat
                  database={state.selectedDatabase}
                  schema={state.selectedSchema}
                  provider={state.selectedProvider}
                />
              </FadeIn>
            )}
            {view === "dashboard" && <FadeIn><Dashboard /></FadeIn>}
            {view === "alerts"    && <FadeIn><Alerts /></FadeIn>}
            {view === "help"      && <FadeIn><Help /></FadeIn>}
            {view === "admin"     && <FadeIn><AdminPanel /></FadeIn>}
          </Suspense>
        </div>
      </main>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {showConnectionModal && (
        <ConnectionModal
          state={state}
          setState={setState}
          onRefresh={() => void refreshConfiguration(true)}
          onClose={() => setShowConnectionModal(false)}
        />
      )}
    </div>
  );
}
