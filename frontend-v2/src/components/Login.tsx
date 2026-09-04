import React, { useState, useEffect, useRef, useCallback } from "react";
import { saveAuth } from "../lib/auth";
import { HakiDataWordmark } from "./HakiDataWordmark";

interface Props {
  onLogin: () => void;
}

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 3000;

export function Login({ onLogin }: Props) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [serverStatus, setServerStatus] = useState<"unknown" | "up" | "starting" | "down">("unknown");
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = "/bg-opt.jpg";
  }, []);
  const retryRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCount = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      try {
        const res = await fetch("/api/health", { signal: AbortSignal.timeout(3000) });
        if (cancelled) return;
        if (res.ok) { failCount.current = 0; setServerStatus("up"); }
        else         { failCount.current++; setServerStatus(failCount.current >= 3 ? "down" : "starting"); }
      } catch {
        if (cancelled) return;
        failCount.current++;
        setServerStatus(failCount.current >= 3 ? "down" : "starting");
      }
    }
    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function validateEmail(value: string) {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setEmailError(valid || !value ? null : "Adresse email invalide");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailError) return;
    setError(null);
    setLoading(true);
    let lastError = "Impossible de joindre le serveur";
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail ?? "Identifiants incorrects");
          setLoading(false);
          return;
        }
        saveAuth(data.token, data.user);
        onLogin();
        return;
      } catch {
        if (attempt < MAX_RETRIES) {
          setError(`Connexion impossible — tentative ${attempt + 1}/${MAX_RETRIES}…`);
          await new Promise(r => { retryRef.current = setTimeout(r, RETRY_DELAY_MS); });
        } else {
          lastError = "Le serveur est inaccessible. Vérifiez que Docker est démarré.";
        }
      }
    }
    setError(lastError);
    setLoading(false);
  }

  const isRetrying = loading && error?.includes("tentative");

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      backgroundColor: "#0f1923",
      backgroundImage: bgLoaded
        ? "url('/bg-opt.jpg')"
        : "url('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAABSgAwAEAAAAAQAAAA0AAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/AABEIAA0AFAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAAkJCQkJCRAJCRAWEBAQFh4WFhYWHiYeHh4eHiYuJiYmJiYmLi4uLi4uLi43Nzc3NzdAQEBAQEhISEhISEhISEj/2wBDAQsMDBIREh8RER9LMyozS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0v/3QAEAAL/2gAMAwEAAhEDEQA/APYpJPKG8kBe5zxWdp2pQagZzF/yykKe5x3+lef3Vq808KrK4FwWzuO7G3J71n3VjDdRpBE80DRgFnR8FsjoeKzeIS3D2D7npc8TNITiofJb0H5164bHZXw3LFf3CqGIA3Z6VJ9j1L/oI3H/AH1XQsZEweGfc//Z')",
      filter: bgLoaded ? "none" : "blur(8px)",
      transition: "filter 0.4s ease",
      backgroundSize: "cover",
      backgroundPosition: "center top",
      position: "relative",
    }}>
      <style>{`
        /* Overlay sombre sur la photo — très discret */
        .login-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(10,18,28,.82) 0%, rgba(10,18,28,.88) 100%);
          pointer-events: none;
        }
        .login-input {
          width: 100% !important; box-sizing: border-box !important;
          background: #f9fafb !important;
          border: 1px solid #d1d5db !important;
          border-radius: 4px !important;
          padding: 9px 12px !important;
          font-size: 14px !important;
          color: #111827 !important;
          outline: none !important;
          transition: border-color .15s, box-shadow .15s !important;
          font-family: inherit !important;
          box-shadow: none !important;
        }
        .login-input::placeholder { color: #9ca3af !important; }
        .login-input:focus {
          border-color: #C8940A !important;
          box-shadow: 0 0 0 3px rgba(200,148,10,.15) !important;
        }
        .login-input.error { border-color: #dc2626 !important; }
        .login-btn {
          width: 100% !important;
          background: #C8940A !important;
          color: #fff !important;
          border: none !important;
          border-radius: 4px !important;
          padding: 10px 16px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: background .15s !important;
          font-family: inherit !important;
          letter-spacing: .01em !important;
        }
        .login-btn:hover:not(:disabled) { background: #A87A08 !important; }
        .login-btn:disabled { opacity: .55 !important; cursor: not-allowed !important; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      {/* Overlay photo */}
      <div className="login-overlay" />

      {/* Point statut serveur — vert/orange/rouge, sans texte */}
      {serverStatus !== "unknown" && (
        <div style={{ position: "fixed", top: "18px", right: "20px", zIndex: 10 }}
             title={serverStatus === "up" ? "Serveur connecté" : serverStatus === "starting" ? "Serveur en démarrage…" : "Serveur inaccessible"}>
          <span style={{
            display: "block", width: "7px", height: "7px", borderRadius: "50%",
            background: serverStatus === "up" ? "#22c55e" : serverStatus === "starting" ? "#f59e0b" : "#ef4444",
            opacity: serverStatus === "up" ? 0.7 : 1,
            animation: serverStatus !== "up" ? "pulse-dot 1.8s ease-in-out infinite" : "none",
          }}/>
        </div>
      )}

      {/* Contenu */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "400px", padding: "0 20px", boxSizing: "border-box" }}>

        {/* Logo — identique à celui du sidebar (icône + wordmark), agrandi pour la page de connexion */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px", marginBottom: "32px" }}>
          <img
            src="/hakidata-icon.svg"
            alt="HakiData"
            style={{ width: "56px", height: "56px", objectFit: "contain" }}
          />
          <HakiDataWordmark size="lg" />
        </div>

        {/* Carte blanche — effet perspective 3D */}
        <div style={{
          background: "#ffffff",
          borderRadius: "3px",
          padding: "36px 32px",
          border: "1px solid rgba(0,0,0,.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,.5), 4px 8px 24px rgba(0,0,0,.2)",
          transform: "perspective(900px) rotateY(10deg) rotateX(3deg)",
          transformOrigin: "center center",
          willChange: "transform",
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                Email Address
              </label>
              <input
                className={`login-input${emailError ? " error" : ""}`}
                type="text"
                value={email}
                onChange={e => { setEmail(e.target.value); validateEmail(e.target.value); }}
                onBlur={e => validateEmail(e.target.value)}
                placeholder="vous@entreprise.com"
                required
                autoFocus
              />
              {emailError && (
                <p style={{ fontSize: "12px", color: "#dc2626", marginTop: "4px" }}>{emailError}</p>
              )}
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="login-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ paddingRight: "38px" }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", padding: "0",
                    color: "#9ca3af", display: "flex", alignItems: "center",
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: "10px 12px", borderRadius: "5px", fontSize: "13px",
                lineHeight: "1.5", marginBottom: "16px",
                background: isRetrying ? "#fffbeb" : "#fef2f2",
                border: `1px solid ${isRetrying ? "#fde68a" : "#fecaca"}`,
                color: isRetrying ? "#92400e" : "#b91c1c",
              }}>
                {error}
              </div>
            )}

            <button className="login-btn" type="submit" disabled={loading}>
              {isRetrying ? "Reconnexion en cours…" : loading ? "Connexion…" : "S'identifier"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: "12px", color: "rgba(255,255,255,.4)", marginTop: "20px" }}>
          Accès réservé aux utilisateurs autorisés
        </p>
      </div>
    </div>
  );
}
