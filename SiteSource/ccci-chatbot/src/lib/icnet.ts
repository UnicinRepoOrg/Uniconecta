// Resultado da consulta ao ICnet, como o painel o mostra. É informação para o administrador:
// nada aqui aprova ou recusa um cadastro.
import type { SupportRecipient } from "@/components/RecipientTable";

export type IcnetSituation = {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
};

export const icnetSituation = (r: SupportRecipient): IcnetSituation => {
  if (!r.icnet_consultado_em) {
    return r.icnet_erro
      ? { label: "Falha na consulta", variant: "outline" }
      : { label: "Não consultado", variant: "outline" };
  }
  if (r.icnet_ativo) return { label: "Voluntário ativo", variant: "default" };
  if (r.icnet_voluntario) return { label: "Voluntário inativo", variant: "secondary" };
  return { label: "Não encontrado", variant: "destructive" };
};

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

const nameTokens = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !PARTICLES.has(t));

export type NameMatch = "confere" | "parecido" | "diferente";

const compareOne = (a: string, b: string): NameMatch => {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return "diferente";
  if (ta.join(" ") === tb.join(" ")) return "confere";
  // Mesmo primeiro nome e todas as palavras do nome menor no maior: nome abreviado ou sem um sobrenome.
  // Uma inicial ("H") vale pela palavra que começa com ela ("Henrique").
  const same = (x: string, y: string) =>
    x === y || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y));
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (ta[0] === tb[0] && shorter.every((t) => longer.some((u) => same(t, u)))) return "parecido";
  return "diferente";
};

// Compara o nome do cadastro com o(s) nome(s) do ICnet; null quando o ICnet não devolveu nome.
export const compareNames = (cadastro: string, icnetNames: string[] | undefined): NameMatch | null => {
  if (!icnetNames || icnetNames.length === 0) return null;
  const order: NameMatch[] = ["confere", "parecido", "diferente"];
  return icnetNames
    .map((n) => compareOne(cadastro, n))
    .sort((x, y) => order.indexOf(x) - order.indexOf(y))[0];
};

export const NAME_MATCH_LABEL: Record<NameMatch, string> = {
  confere: "O nome confere",
  parecido: "O nome é parecido",
  diferente: "O nome é diferente",
};

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
