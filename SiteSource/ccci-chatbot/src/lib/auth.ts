// Token JWT do admin no localStorage. Sem Supabase.
const TOKEN_KEY = "ccci_admin_token";

type JwtPayload = { exp?: number; sub?: string; role?: string };

const decodePayload = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
};

export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const isAuthenticated = (): boolean => {
  const token = getToken();
  if (!token) return false;
  const payload = decodePayload(token);
  if (!payload?.exp) return false;
  if (payload.exp * 1000 <= Date.now()) {
    clearToken();
    return false;
  }
  return true;
};
