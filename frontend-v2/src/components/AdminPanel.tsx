import React, { useEffect, useState } from "react";
import { UserPlus, Trash2, PowerOff, Power, RefreshCw, ClipboardList, Users, KeyRound, Eye, EyeOff, Database, Search, Check } from "lucide-react";
import {
  apiFetch,
  createDbConnections,
  deleteDbConnection,
  discoverDatabases,
  fetchDbConnections,
  setDbConnectionAccess,
  type DbConnection,
} from "../lib/api";
import { HakiLoader } from "./HakiLoader";
import { cn } from "../lib/utils";

interface User {
  id:         number;
  email:      string;
  role:       "admin" | "user";
  is_active:  number;
  created_at: string;
}

interface AuditLog {
  id:            number;
  user_email:    string;
  question_text: string;
  database_name: string;
  rows_returned: number;
  status:        string;
  error_message: string | null;
  created_at:    string;
}

const EMPTY_CREDS = { db_type: "mysql", host: "localhost", port: 3306, user: "", password: "" };

export function AdminPanel() {
  const [tab, setTab] = useState<"users" | "databases" | "audit">("users");

  // ── Bases de données ───────────────────────────────────────────────────────
  const [connections, setConnections]   = useState<DbConnection[]>([]);
  const [dbLoading, setDbLoading]       = useState(false);
  const [dbError, setDbError]           = useState<string | null>(null);
  const [creds, setCreds]               = useState(EMPTY_CREDS);
  const [showDbPassword, setShowDbPassword] = useState(false);
  const [discovered, setDiscovered]     = useState<string[] | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState<string[]>([]);
  const [picked, setPicked]             = useState<Set<string>>(new Set());
  const [discovering, setDiscovering]   = useState(false);
  const [registering, setRegistering]   = useState(false);
  const [expandedConn, setExpandedConn] = useState<number | null>(null);

  async function loadConnections() {
    setDbLoading(true);
    setDbError(null);
    try {
      const data = await fetchDbConnections();
      setConnections(data.connections);
    } catch (e: any) {
      setDbError(e.message ?? "Erreur lors du chargement");
    } finally {
      setDbLoading(false);
    }
  }

  useEffect(() => { if (tab === "databases") void loadConnections(); }, [tab]);

  async function handleDiscover() {
    setDiscovering(true);
    setDbError(null);
    setDiscovered(null);
    setPicked(new Set());
    try {
      const data = await discoverDatabases(creds);
      setDiscovered(data.databases);
      setAlreadyRegistered(data.registered);
      if (data.databases.length === 0) setDbError("Aucune base trouvée sur ce serveur.");
    } catch (e: any) {
      setDbError(e.message ?? "Connexion impossible");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleRegister() {
    if (picked.size === 0) return;
    setRegistering(true);
    setDbError(null);
    try {
      const res = await createDbConnections({ ...creds, databases: [...picked] });
      if (res.failed.length > 0) {
        setDbError(res.failed.map(f => `${f.database} : ${f.error}`).join(" · "));
      }
      if (res.created.length > 0) {
        setDiscovered(null);
        setPicked(new Set());
        setCreds(EMPTY_CREDS);
      }
      await loadConnections();
    } catch (e: any) {
      setDbError(e.message ?? "Erreur lors de l'enregistrement");
    } finally {
      setRegistering(false);
    }
  }

  async function handleDeleteConnection(conn: DbConnection) {
    if (!confirm(
      `Retirer la base « ${conn.name} » ?\n\nLes utilisateurs perdront l'accès. ` +
      `La base elle-même n'est pas supprimée.`
    )) return;
    try {
      await deleteDbConnection(conn.id);
      await loadConnections();
    } catch (e: any) {
      setDbError(e.message ?? "Erreur lors de la suppression");
    }
  }

  async function toggleUserAccess(conn: DbConnection, userId: number) {
    const next = conn.userIds.includes(userId)
      ? conn.userIds.filter(id => id !== userId)
      : [...conn.userIds, userId];
    // Mise à jour optimiste : le toggle réagit immédiatement
    setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, userIds: next } : c));
    try {
      await setDbConnectionAccess(conn.id, next);
    } catch (e: any) {
      setDbError(e.message ?? "Erreur lors de la mise à jour des accès");
      await loadConnections();
    }
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  const [users, setUsers]       = useState<User[]>([]);
  const [maxUsers, setMaxUsers] = useState<number>(100);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ── Audit ──────────────────────────────────────────────────────────────────
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError]     = useState<string | null>(null);
  const [filterUser, setFilterUser]   = useState("");

  async function loadLogs() {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const data = await apiFetch("/api/admin/audit?limit=500");
      setLogs(data.logs);
    } catch (e: any) {
      setLogsError(e.message ?? "Erreur");
    } finally {
      setLogsLoading(false);
    }
  }

  useEffect(() => { if (tab === "audit") void loadLogs(); }, [tab]);

  // Formulaire création
  const [newEmail, setNewEmail]       = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole]         = useState<"user" | "admin">("user");
  const [creating, setCreating]       = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);

  function validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/auth/users");
      setUsers(data.users);
      if (data.maxUsers) setMaxUsers(data.maxUsers);
    } catch (e: any) {
      setError(e.message ?? "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!validateEmail(newEmail)) {
      setCreateError("Adresse email invalide. Vérifiez le format (ex : prenom@entreprise.com).");
      return;
    }
    if (newPassword.trim().length < 6) {
      setCreateError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setCreating(true);
    try {
      await apiFetch("/api/auth/users", {
        method: "POST",
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      setNewEmail(""); setNewPassword(""); setNewRole("user");
      setShowForm(false);
      await loadUsers();
    } catch (e: any) {
      setCreateError(e.message ?? "Erreur");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(user: User) {
    await apiFetch(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
    });
    await loadUsers();
  }

  async function handleDelete(user: User) {
    if (!confirm(`Supprimer définitivement ${user.email} ?`)) return;
    await apiFetch(`/api/auth/users/${user.id}`, { method: "DELETE" });
    await loadUsers();
  }

  async function handleResetPassword(user: User) {
    const newPassword = prompt(`Nouveau mot de passe pour ${user.email} :`);
    if (!newPassword || newPassword.trim().length < 6) {
      if (newPassword !== null) alert("Le mot de passe doit faire au moins 6 caractères.");
      return;
    }
    try {
      await apiFetch(`/api/auth/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ new_password: newPassword.trim() }),
      });
      alert(`Mot de passe de ${user.email} réinitialisé.`);
    } catch (e: any) {
      alert(`Erreur : ${e.message}`);
    }
  }

  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PAGE_SIZE = 10;

  const filteredLogs = filterUser
    ? logs.filter(l => l.user_email?.toLowerCase().includes(filterUser.toLowerCase()))
    : logs;

  const pagedLogs     = filteredLogs.slice(0, auditPage * AUDIT_PAGE_SIZE);
  const hasMoreLogs   = filteredLogs.length > auditPage * AUDIT_PAGE_SIZE;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">

        {/* Onglets */}
        <div className="flex gap-1 mb-6 border-b border-slate-200 dark:border-zinc-800">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "users" ? "border-[#C8940A] text-[#A87A08]" : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 dark:hover:text-zinc-200"
            }`}
          >
            <Users className="w-4 h-4" /> Utilisateurs
          </button>
          <button
            onClick={() => setTab("databases")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "databases" ? "border-[#C8940A] text-[#A87A08]" : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200"
            }`}
          >
            <Database className="w-4 h-4" /> Bases de données
          </button>
          <button
            onClick={() => setTab("audit")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "audit" ? "border-[#C8940A] text-[#A87A08]" : "border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 dark:hover:text-zinc-200"
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Audit
          </button>
        </div>

        {/* ── Onglet Bases de données ─────────────────────────────────────────── */}
        {tab === "databases" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Bases de données</h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
                  {connections.length} base{connections.length > 1 ? "s" : ""} enregistrée{connections.length > 1 ? "s" : ""}
                  {" · Les utilisateurs n'ont accès qu'aux bases que vous leur attribuez"}
                </p>
              </div>
              <button
                onClick={() => void loadConnections()}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
                title="Rafraîchir"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Formulaire de découverte serveur */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 mb-4">
              <h2 className="font-semibold text-slate-800 dark:text-zinc-200 text-sm mb-3">
                Ajouter des bases depuis un serveur
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Type</label>
                  <select
                    value={creds.db_type}
                    onChange={e => {
                      const db_type = e.target.value;
                      setCreds(c => ({ ...c, db_type, port: db_type === "mysql" ? 3306 : 5432 }));
                      setDiscovered(null);
                    }}
                    className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                  >
                    <option value="mysql">MySQL</option>
                    <option value="postgresql">PostgreSQL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Hôte</label>
                  <input
                    type="text" value={creds.host}
                    onChange={e => { setCreds(c => ({ ...c, host: e.target.value })); setDiscovered(null); }}
                    className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Port</label>
                  <input
                    type="number" value={creds.port}
                    onChange={e => { setCreds(c => ({ ...c, port: Number(e.target.value) })); setDiscovered(null); }}
                    className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Utilisateur</label>
                  <input
                    type="text" value={creds.user}
                    onChange={e => { setCreds(c => ({ ...c, user: e.target.value })); setDiscovered(null); }}
                    className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showDbPassword ? "text" : "password"}
                      value={creds.password}
                      onChange={e => { setCreds(c => ({ ...c, password: e.target.value })); setDiscovered(null); }}
                      className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowDbPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
                    >
                      {showDbPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => void handleDiscover()}
                  disabled={discovering || !creds.host || !creds.user}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#C8940A] hover:bg-[#A87A08] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Search className="w-4 h-4" />
                  {discovering ? "Recherche…" : "Découvrir les bases"}
                </button>
              </div>

              {/* Bases découvertes */}
              {discovered && discovered.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mb-2">
                    Sélectionnez les bases à rendre disponibles dans HakiData :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {discovered.map(db => {
                      const isRegistered = alreadyRegistered.includes(db);
                      const isPicked = picked.has(db);
                      return (
                        <button
                          key={db}
                          disabled={isRegistered}
                          onClick={() => setPicked(prev => {
                            const next = new Set(prev);
                            next.has(db) ? next.delete(db) : next.add(db);
                            return next;
                          })}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                            isRegistered
                              ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 border-slate-200 dark:border-zinc-700 cursor-not-allowed"
                              : isPicked
                                ? "bg-[#C8940A] text-white border-[#C8940A]"
                                : "bg-white dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-300 dark:border-zinc-600 hover:border-[#C8940A]"
                          )}
                          title={isRegistered ? "Déjà enregistrée" : undefined}
                        >
                          {isPicked && <Check className="w-3 h-3" />}
                          {db}
                          {isRegistered && " ✓"}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={() => void handleRegister()}
                      disabled={registering || picked.size === 0}
                      className="px-4 py-2 bg-[#C8940A] hover:bg-[#A87A08] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {registering ? "Enregistrement…" : `Enregistrer ${picked.size} base${picked.size > 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {dbError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{dbError}</div>
            )}

            {/* Liste des connexions */}
            {dbLoading ? (
              <div className="flex justify-center py-12"><HakiLoader size={64} /></div>
            ) : connections.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl py-12 text-center">
                <Database className="w-8 h-8 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-zinc-400">Aucune base enregistrée</p>
                <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                  Renseignez un serveur ci-dessus pour commencer
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map(conn => {
                  // Les admins accèdent à tout via leur rôle : on ne compte que
                  // les comptes réellement listés dans le panneau d'attribution.
                  const grantable = users.filter(u => u.role !== "admin");
                  const grantedCount = grantable.filter(u => conn.userIds.includes(u.id)).length;
                  return (
                  <div key={conn.id} className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Database className="w-4 h-4 text-[#C8940A] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 dark:text-zinc-200 text-sm truncate">{conn.name}</p>
                        <p
                          className="text-xs text-slate-500 dark:text-zinc-400 truncate"
                          title={`${conn.db_type} · ${conn.host}:${conn.port} · ${conn.user}`}
                        >
                          {conn.db_type} · {conn.host}:{conn.port} · {conn.user}
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedConn(expandedConn === conn.id ? null : conn.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                          grantedCount > 0
                            ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100"
                            : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                        )}
                      >
                        <Users className="w-3.5 h-3.5" />
                        {grantedCount === 0
                          ? "Aucun accès"
                          : `${grantedCount} utilisateur${grantedCount > 1 ? "s" : ""}`}
                      </button>
                      <button
                        onClick={() => void handleDeleteConnection(conn)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                        title="Retirer cette base"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Attribution des accès */}
                    {expandedConn === conn.id && (
                      <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                          Accès à « {conn.name} »
                        </p>
                        {grantable.length === 0 ? (
                          <p className="text-xs text-slate-400 dark:text-zinc-500 py-2">
                            Aucun utilisateur non-admin. Les administrateurs ont accès à toutes les bases.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {grantable.map(user => {
                              const granted = conn.userIds.includes(user.id);
                              return (
                                <label
                                  key={user.id}
                                  className="flex items-center gap-2.5 py-1.5 cursor-pointer group"
                                >
                                  <div className="relative shrink-0">
                                    <input
                                      type="checkbox" className="sr-only"
                                      checked={granted}
                                      onChange={() => void toggleUserAccess(conn, user.id)}
                                    />
                                    <div className={cn(
                                      "block w-9 h-5 rounded-full transition-colors",
                                      granted ? "bg-[#C8940A]" : "bg-slate-300 dark:bg-zinc-700"
                                    )} />
                                    <div className={cn(
                                      "absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform shadow-sm",
                                      granted && "translate-x-4"
                                    )} />
                                  </div>
                                  <span className={cn(
                                    "text-sm transition-colors",
                                    granted
                                      ? "text-slate-800 dark:text-zinc-200 font-medium"
                                      : "text-slate-500 dark:text-zinc-400"
                                  )}>
                                    {user.email}
                                  </span>
                                  {!user.is_active && (
                                    <span className="text-[10px] bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full">
                                      désactivé
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Onglet Audit ───────────────────────────────────────────────────── */}
        {tab === "audit" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Journal d'audit</h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-0.5">{filteredLogs.length} entrée{filteredLogs.length > 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={filterUser}
                  onChange={e => { setFilterUser(e.target.value); setAuditPage(1); }}
                  placeholder="Filtrer par email…"
                  className="border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                />
                <button onClick={() => void loadLogs()} className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {logsError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{logsError}</div>}

            {logsLoading ? (
              <div className="flex justify-center py-12"><HakiLoader size={64} /></div>
            ) : (
              <>
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Utilisateur</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Question</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">Base</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide whitespace-nowrap">Lignes</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {filteredLogs.length === 0 ? (
                        <tr><td colSpan={6} className="text-center py-10 text-slate-400 dark:text-zinc-500 text-sm">Aucune entrée</td></tr>
                      ) : pagedLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800">
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{log.created_at?.slice(0, 16).replace("T", " ")}</td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300 text-xs">{log.user_email}</td>
                          <td className="px-4 py-3 text-slate-800 dark:text-zinc-200 max-w-xs">
                            <span className="line-clamp-2 text-xs" title={log.question_text}>{log.question_text}</span>
                            {log.status === "error" && log.error_message && (
                              <span className="text-[10px] text-red-500 block mt-0.5 line-clamp-1">{log.error_message}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">{log.database_name}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-zinc-400 text-right">{log.rows_returned ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              log.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}>
                              {log.status === "success" ? "OK" : "Erreur"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                {hasMoreLogs && (
                  <button
                    onClick={() => setAuditPage(p => p + 1)}
                    className="flex-1 py-2.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl transition-colors"
                  >
                    Voir plus ({filteredLogs.length - auditPage * AUDIT_PAGE_SIZE} restantes)
                  </button>
                )}
                {auditPage > 1 && (
                  <button
                    onClick={() => setAuditPage(1)}
                    className="flex-1 py-2.5 text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl transition-colors"
                  >
                    Réduire
                  </button>
                )}
              </div>
              </>
            )}
          </div>
        )}

        {/* ── Onglet Utilisateurs ─────────────────────────────────────────── */}
        {tab === "users" && <>
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-zinc-100">Gestion des utilisateurs</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-slate-500 dark:text-zinc-400">{users.length} / {maxUsers} utilisateur{maxUsers > 1 ? "s" : ""}</p>
              {users.length >= maxUsers && (
                <span className="text-xs bg-amber-100 text-[#A87A08] border border-[#FEF3C7] px-2 py-0.5 rounded-full font-medium">
                  Limite atteinte
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void loadUsers()}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 dark:hover:bg-zinc-700 transition-colors"
              title="Rafraîchir"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => users.length < maxUsers && setShowForm(!showForm)}
              disabled={users.length >= maxUsers}
              title={users.length >= maxUsers ? `Limite de ${maxUsers} utilisateurs atteinte` : "Créer un utilisateur"}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                users.length >= maxUsers
                  ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed"
                  : "bg-[#C8940A] hover:bg-[#A87A08] text-white"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Nouvel utilisateur
            </button>
          </div>
        </div>

        {/* Formulaire création */}
        {showForm && (
          <form onSubmit={handleCreate} noValidate className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 mb-4 space-y-3">
            <h2 className="font-semibold text-slate-800 dark:text-zinc-200 text-sm">Créer un compte</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Email</label>
                <input
                  type="text" value={newEmail} onChange={e => { setNewEmail(e.target.value); setCreateError(null); }}
                  placeholder="prenom.nom@entreprise.com"
                  className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword} onChange={e => { setNewPassword(e.target.value); setCreateError(null); }}
                    placeholder="6 caractères minimum"
                    className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-zinc-400 mb-1">Rôle</label>
                <select
                  value={newRole} onChange={e => setNewRole(e.target.value as "user" | "admin")}
                  className="w-full border border-slate-300 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8940A]"
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
            {createError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-red-700 text-sm">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{createError}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setCreateError(null); }}
                className="px-3 py-1.5 text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200">
                Annuler
              </button>
              <button type="submit" disabled={creating}
                className="px-4 py-1.5 bg-[#C8940A] hover:bg-[#A87A08] disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        )}

        {/* Erreur chargement */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
        )}

        {/* Liste des users */}
        {loading ? (
          <div className="text-center py-12 text-slate-400 dark:text-zinc-500 text-sm">Chargement…</div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Rôle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wide">Créé le</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {users.map(user => (
                  <tr key={user.id} className={`${!user.is_active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-zinc-200">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-amber-100 text-[#A87A08]"
                          : "bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300"
                      }`}>
                        {user.role === "admin" ? "Admin" : "Utilisateur"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        {user.is_active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-zinc-400 text-xs">{user.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => void handleResetPassword(user)}
                          className="p-1.5 rounded-md text-slate-400 dark:text-zinc-500 hover:text-[#C8940A] hover:bg-[#FEF3C7]"
                          title="Réinitialiser le mot de passe"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void toggleActive(user)}
                          className="p-1.5 rounded-md text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100"
                          title={user.is_active ? "Désactiver" : "Réactiver"}
                        >
                          {user.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => void handleDelete(user)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>}
      </div>
    </div>
  );
}
