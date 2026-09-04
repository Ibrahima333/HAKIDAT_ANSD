import React, { useEffect, useRef, useState } from "react";
import {
  Bell, BellOff, Plus, Trash2, ToggleLeft, ToggleRight,
  AlertTriangle, X, ChevronDown, TrendingUp, TrendingDown, Minus, CheckCircle, Mail,
} from "lucide-react";

interface SelectOption { value: string | number; label: string }
function CustomSelect({ value, onChange, options, placeholder }: {
  value: string | number;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => String(o.value) === String(value));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A] transition-all"
      >
        <span className={selected ? "" : "text-zinc-400"}>
          {selected ? selected.label : (placeholder ?? "— Sélectionner —")}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg overflow-auto max-h-52 py-1">
          {placeholder && (
            <li
              className="px-3 py-2 text-sm text-zinc-400 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700"
              onMouseDown={() => { onChange(""); setOpen(false); }}
            >
              {placeholder}
            </li>
          )}
          {options.map(o => (
            <li
              key={o.value}
              onMouseDown={() => { onChange(String(o.value)); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700 ${String(o.value) === String(value) ? "text-[#C8940A] font-medium" : "text-zinc-900 dark:text-zinc-100"}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
import { getToken } from "../lib/auth";

const INTERVALS = [
  { value: 15,   label: "Toutes les 15 minutes" },
  { value: 30,   label: "Toutes les 30 minutes" },
  { value: 60,   label: "Toutes les heures" },
  { value: 120,  label: "Toutes les 2 heures" },
  { value: 360,  label: "Toutes les 6 heures" },
  { value: 1440, label: "Une fois par jour" },
];

interface Alert {
  id: number;
  name: string;
  kpi_id: string;
  kpi_name: string;
  operator: string;
  threshold: number;
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
  check_interval_minutes: number;
}

interface Kpi {
  id: string;
  questionName: string;
  rawValue: number | null;
  value: string;
  database: string;
}

const API = "/api/alerts";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

const OPERATORS = [
  { value: "<",  label: "est inférieur à",         icon: <TrendingDown className="w-3.5 h-3.5" /> },
  { value: ">",  label: "est supérieur à",          icon: <TrendingUp   className="w-3.5 h-3.5" /> },
  { value: "<=", label: "inférieur ou égal à",      icon: <TrendingDown className="w-3.5 h-3.5" /> },
  { value: ">=", label: "supérieur ou égal à",      icon: <TrendingUp   className="w-3.5 h-3.5" /> },
  { value: "=",  label: "est égal à",               icon: <Minus        className="w-3.5 h-3.5" /> },
];

const OP_LABEL: Record<string, string> = Object.fromEntries(OPERATORS.map(o => [o.value, o.label]));

export function Alerts() {
  const [alerts, setAlerts]       = useState<Alert[]>([]);
  const [kpis, setKpis]           = useState<Kpi[]>([]);
  const [uploadDbs, setUploadDbs] = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");
  const [form, setForm]           = useState({
    name: "", kpi_id: "", operator: "<", threshold: "", email: "",
    check_interval_minutes: 30,
  });
  const [success, setSuccess]     = useState(false);
  const [lastEmail, setLastEmail] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [aRes, kRes, uRes] = await Promise.all([
      fetch(API,               { headers: authHeaders() }),
      fetch("/api/user/kpis",  { headers: authHeaders() }),
      fetch("/api/uploads",    { headers: authHeaders() }),
    ]);
    if (aRes.ok) setAlerts(await aRes.json());
    if (kRes.ok) { const d = await kRes.json(); setKpis(d.kpis ?? []); }
    if (uRes.ok) {
      const d = await uRes.json();
      setUploadDbs(new Set((d.uploads ?? []).map((u: any) => u.name)));
    }
    setLoading(false);
  }

  const selectedKpi = kpis.find(k => k.id === form.kpi_id);
  const isUploadKpi = selectedKpi ? uploadDbs.has(selectedKpi.database) : false;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.kpi_id)        { setError("Sélectionnez un KPI à surveiller"); return; }
    if (isUploadKpi)         { setError("Les alertes ne sont pas disponibles pour les fichiers CSV/Excel uploadés"); return; }
    if (!form.name.trim())   { setError("Donnez un nom à l'alerte"); return; }
    if (form.threshold === "") { setError("Saisissez un seuil numérique"); return; }

    if (!form.email.trim()) { setError("Saisissez l'email de destination"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError("Email invalide"); return; }

    setSaving(true);
    const res = await fetch(API, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name:                   form.name,
        kpi_id:                 form.kpi_id,
        kpi_name:               selectedKpi?.questionName ?? form.kpi_id,
        operator:               form.operator,
        threshold:              parseFloat(form.threshold),
        email:                  form.email,
        check_interval_minutes: form.check_interval_minutes,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setLastEmail(form.email);
      setShowForm(false);
      setSuccess(true);
      setForm({ name: "", kpi_id: "", operator: "<", threshold: "", email: "", check_interval_minutes: 30 });
      load();
      setTimeout(() => setSuccess(false), 5000);
    } else {
      setError("Erreur lors de la création de l'alerte");
    }
  }

  async function handleToggle(id: number) {
    const res = await fetch(`${API}/${id}/toggle`, { method: "PATCH", headers: authHeaders() });
    if (res.ok) setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_active: !a.is_active } : a));
  }

  async function handleDelete(id: number) {
    await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders() });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  return (
    <div className="h-full flex flex-col">
      {/* Barre du haut */}
      <div className="shrink-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] border border-[#FEF3C7] flex items-center justify-center">
            <Bell className="w-4 h-4 text-[#C8940A]" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Alertes automatiques</h1>
            <p className="text-xs text-zinc-400">Recevez un email dès qu'un KPI franchit un seuil — fréquence personnalisable par alerte</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(""); }}
          className="flex items-center gap-1.5 bg-[#C8940A] hover:bg-[#A87A08] text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouvelle alerte
        </button>
      </div>

      {/* Toast confirmation flottant */}
      {success && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 rounded-2xl shadow-xl px-5 py-4 flex items-start gap-3 max-w-sm animate-in slide-in-from-bottom-4">
          <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Alerte créée avec succès !</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Un email sera envoyé à <strong className="text-zinc-700 dark:text-zinc-300">{lastEmail}</strong> dès que la condition est déclenchée.
            </p>
            <p className="text-xs text-[#C8940A] mt-1">
              📬 Vérifiez vos spams si vous ne recevez pas l'email.
            </p>
          </div>
          <button onClick={() => setSuccess(false)} className="text-zinc-300 hover:text-zinc-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">

          {loading ? (
            <div className="text-center text-zinc-400 py-16 text-sm">Chargement…</div>

          ) : alerts.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <BellOff className="w-7 h-7 text-zinc-300" />
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 font-medium">Aucune alerte configurée</p>
              <p className="text-zinc-400 text-sm mt-1 mb-6">
                Créez votre première alerte pour être notifié automatiquement
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 bg-[#C8940A] hover:bg-[#A87A08] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                Créer une alerte
              </button>
            </div>

          ) : (
            <div className="flex flex-col gap-3">
              {alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 flex items-center gap-4 shadow-sm transition-all ${
                    alert.is_active ? "border-zinc-200 dark:border-zinc-800" : "border-zinc-100 dark:border-zinc-900 opacity-60"
                  }`}
                >
                  {/* Icône */}
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                    alert.is_active ? "bg-[#FEF3C7]" : "bg-zinc-100"
                  }`}>
                    <Bell className={`w-4 h-4 ${alert.is_active ? "text-[#C8940A]" : "text-zinc-400"}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{alert.name}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">{alert.kpi_name}</span>
                      {" "}<span className="text-[#C8940A]">{OP_LABEL[alert.operator]}</span>{" "}
                      <span className="font-semibold">{alert.threshold.toLocaleString("fr-FR")}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      🕐 {INTERVALS.find(i => i.value === alert.check_interval_minutes)?.label ?? "Toutes les 30 minutes"}
                      {alert.last_triggered_at && (
                        <span> · Dernière alerte : {new Date(alert.last_triggered_at).toLocaleString("fr-FR")}</span>
                      )}
                    </p>
                  </div>

                  {/* Badge statut */}
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    alert.is_active ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                  }`}>
                    {alert.is_active ? "ACTIVE" : "INACTIVE"}
                  </span>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => handleToggle(alert.id)}
                      title={alert.is_active ? "Désactiver" : "Activer"}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-[#C8940A] hover:bg-[#FEF3C7] transition-colors"
                    >
                      {alert.is_active
                        ? <ToggleRight className="w-4 h-4" />
                        : <ToggleLeft  className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(alert.id)}
                      title="Supprimer"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-md">
            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Nouvelle alerte</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="px-6 py-5 flex flex-col gap-4">

              {/* Nom */}
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">Nom de l'alerte</label>
                <input
                  autoFocus
                  className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A] transition-all"
                  placeholder="Ex : Ventes journalières basses"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* KPI */}
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">KPI à surveiller</label>
                {kpis.length === 0 ? (
                  <div className="bg-[#FEF3C7] border border-[#FEF3C7] rounded-xl p-3 flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 text-[#C8940A] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#A87A08]">
                      Aucun KPI épinglé. Ajoutez des KPIs depuis l'onglet <strong>Dashboard</strong> d'abord.
                    </p>
                  </div>
                ) : (
                  <CustomSelect
                    value={form.kpi_id}
                    onChange={v => setForm(f => ({ ...f, kpi_id: v }))}
                    placeholder="— Sélectionner un KPI —"
                    options={kpis.map(k => ({
                      value: k.id,
                      label: k.questionName + (k.rawValue !== null ? `  (valeur actuelle : ${k.rawValue})` : ""),
                    }))}
                  />
                )}
                {selectedKpi && !isUploadKpi && (
                  <p className="text-[11px] text-zinc-400 mt-1.5 ml-1">
                    Valeur actuelle : <strong className="text-zinc-700 dark:text-zinc-300">{selectedKpi.value || selectedKpi.rawValue}</strong>
                  </p>
                )}
                {isUploadKpi && (
                  <div className="mt-2 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex gap-2 items-start">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-600 dark:text-rose-400">
                      Ce KPI provient d'un fichier CSV ou Excel uploadé. Les alertes ne sont disponibles que pour les bases de données connectées (PostgreSQL, MySQL).
                    </p>
                  </div>
                )}
              </div>

              {/* Condition + Seuil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">Condition</label>
                  <CustomSelect
                    value={form.operator}
                    onChange={v => setForm(f => ({ ...f, operator: v }))}
                    options={OPERATORS.map(op => ({ value: op.value, label: op.label }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">Seuil</label>
                  <input
                    type="number"
                    className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A] transition-all"
                    placeholder="Ex : 5000"
                    value={form.threshold}
                    onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
                  />
                </div>
              </div>

              {/* Email destination */}
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">Email de réception</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A] transition-all"
                    placeholder="Ex : directeur@monentreprise.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1 ml-1">L'alerte sera envoyée depuis alertes.hakidata@gmail.com</p>
              </div>

              {/* Fréquence de vérification */}
              <div>
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 block">
                  Fréquence de vérification
                  <span className="ml-1.5 text-zinc-400 font-normal">(optionnel)</span>
                </label>
                <CustomSelect
                  value={form.check_interval_minutes}
                  onChange={v => setForm(f => ({ ...f, check_interval_minutes: parseInt(v) }))}
                  options={INTERVALS.map(i => ({ value: i.value, label: i.label }))}
                />
              </div>

              {/* Aperçu */}
              {form.kpi_id && form.threshold !== "" && (
                <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                  📧 Vous recevrez un email quand{" "}
                  <strong>{selectedKpi?.questionName}</strong>{" "}
                  <span className="text-[#C8940A] font-medium">{OP_LABEL[form.operator]}</span>{" "}
                  <strong>{parseFloat(form.threshold || "0").toLocaleString("fr-FR")}</strong>
                </div>
              )}

              {error && (
                <p className="flex items-center gap-1.5 text-xs text-rose-500">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                </p>
              )}

              {/* Boutons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving || kpis.length === 0}
                  className="flex-1 bg-[#C8940A] hover:bg-[#A87A08] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? "Création…" : "Créer l'alerte"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 text-sm text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-300 rounded-xl transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
