/**
 * Gestion de l'authentification côté client.
 * Token stocké dans localStorage sous la clé hakidata_token.
 */

const TOKEN_KEY  = "hakidata_token";
const USER_KEY   = "hakidata_user";

export interface AuthUser {
  id:    number;
  email: string;
  role:  "admin" | "user";
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  // Vérifier l'expiration côté client (le backend valide aussi)
  try {
    // JWT utilise base64url (- et _ au lieu de + et /), atob attend du base64 standard
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
