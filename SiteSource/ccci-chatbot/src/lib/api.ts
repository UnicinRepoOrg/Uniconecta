// Cliente da API JSON (Lambda DynamoDB via CloudFront). Sem Supabase.
// Mesma origem do CloudFront -> base relativa /behavior-dev (sem CORS).
import { getToken, clearToken } from "@/lib/auth";
import type { SupportRecipient } from "@/components/RecipientTable";

const BASE = (import.meta.env.VITE_API_BASE as string) || "/behavior-dev";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean };

const request = async <T>(path: string, opts: RequestOptions = {}): Promise<T> => {
  const { method = "GET", body, auth = false } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (auth && res.status === 401) clearToken();
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError((data && data.error) || `Erro ${res.status}`, res.status);
  return data as T;
};

export type CadastroPayload = {
  nome_completo: string; nome_preferido: string | null; idade: number; endereco: string; bairro: string;
  whatsapp: string; voluntario_ic: string; mora_sozinho: boolean;
  plano_saude: string | null; hospital_preferencia: string | null; tem_pet: string | null;
  cadastro_ubs: string | null; contato_familia: string; contato_ccci: string;
  pessoa_chaves: string | null; profissional_saude: string | null;
  alergia_intolerancia: string | null; tipo_sanguineo: string | null; medicacao_continua: string | null;
};

export const login = (email: string, password: string) =>
  request<{ token: string; expires_at: number }>("/auth/login", { method: "POST", body: { email, password } });

export const createRecipient = (payload: CadastroPayload) =>
  request<{ id: string; status: string }>("/cadastro", { method: "POST", body: payload });

export const getRecipients = () =>
  request<{ recipients: SupportRecipient[] }>("/recipients", { auth: true }).then((r) => r.recipients);

export const updateRecipient = (id: string, data: Partial<SupportRecipient>) =>
  request<SupportRecipient>(`/recipients/${id}`, { method: "PUT", body: data, auth: true });

export const updateStatus = (id: string, status: string) =>
  request<SupportRecipient>(`/recipients/${id}`, { method: "PATCH", body: { status }, auth: true });

// Refaz a consulta ao ICnet e devolve o cadastro com o resultado gravado.
export const checkIcnet = (id: string) =>
  request<SupportRecipient>(`/recipients/${id}/icnet`, { method: "POST", auth: true });

export const deleteRecipient = (id: string) =>
  request<{ ok: boolean }>(`/recipients/${id}`, { method: "DELETE", auth: true });

// Estágio que atende o site (dev, prod) e a versão blue/green dele ("2" em prod-2; null no dev).
export const getStageVersion = () =>
  request<{ stage: string | null; version: string | null }>("/version");
