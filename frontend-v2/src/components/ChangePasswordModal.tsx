import React, { useState } from "react";
import { X, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

interface Props {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: Props) {
  const [oldPassword, setOldPassword]   = useState("");
  const [newPassword, setNewPassword]   = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showOld, setShowOld]           = useState(false);
  const [showNew, setShowNew]           = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState(false);

  const mismatch = confirm && newPassword !== confirm;
  const canSubmit = oldPassword && newPassword.length >= 6 && newPassword === confirm && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du changement");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#C8940A]" />
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Changer le mot de passe</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {success && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Mot de passe mis à jour !
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Ancien mot de passe */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Mot de passe actuel</label>
            <div className="relative">
              <input
                type={showOld ? "text" : "password"}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-3 py-2.5 pr-10 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A]"
                placeholder="••••••••"
                disabled={isLoading || success}
              />
              <button type="button" onClick={() => setShowOld(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nouveau mot de passe */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 rounded-xl px-3 py-2.5 pr-10 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-[#FEF3C7] focus:border-[#C8940A]"
                placeholder="Min. 6 caractères"
                disabled={isLoading || success}
              />
              <button type="button" onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && newPassword.length < 6 && (
              <p className="text-[11px] text-[#C8940A]">Au moins 6 caractères requis</p>
            )}
          </div>

          {/* Confirmation */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-500">Confirmer le nouveau mot de passe</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className={cn(
                "w-full border rounded-xl px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 dark:bg-zinc-800 outline-none focus:ring-2 transition-colors",
                mismatch
                  ? "border-rose-300 focus:ring-rose-200"
                  : "border-zinc-200 dark:border-zinc-700 focus:ring-[#FEF3C7] focus:border-[#C8940A]"
              )}
              placeholder="••••••••"
              disabled={isLoading || success}
            />
            {mismatch && <p className="text-[11px] text-rose-600">Les mots de passe ne correspondent pas</p>}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-[#C8940A] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#A87A08] disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Mise à jour…</>
              : "Mettre à jour"}
          </button>
        </form>
      </div>
    </div>
  );
}
