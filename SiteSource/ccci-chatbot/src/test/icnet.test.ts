import { describe, expect, it } from "vitest";
import { compareNames, icnetSituation } from "@/lib/icnet";
import type { SupportRecipient } from "@/components/RecipientTable";

const recipient = (fields: Partial<SupportRecipient>) => ({ nome_completo: "Maria Aparecida da Silva", ...fields }) as SupportRecipient;

describe("compareNames", () => {
  it("returns null while the ICnet returns no name", () => {
    expect(compareNames("Maria Silva", undefined)).toBeNull();
    expect(compareNames("Maria Silva", [])).toBeNull();
  });

  it("ignores accents, case and particles", () => {
    expect(compareNames("José da Conceição", ["JOSE CONCEICAO"])).toBe("confere");
  });

  it("accepts a shortened name with the same first name", () => {
    expect(compareNames("Maria Silva", ["Maria Aparecida da Silva"])).toBe("parecido");
    expect(compareNames("Maria Aparecida da Silva", ["Maria Silva"])).toBe("parecido");
    expect(compareNames("Pedro Henrique Lima", ["Pedro H. Lima"])).toBe("parecido");
  });

  it("flags a different person", () => {
    expect(compareNames("Maria Silva", ["João Pereira"])).toBe("diferente");
    expect(compareNames("Maria Silva", ["Ana Maria Silva"])).toBe("diferente");
  });

  it("uses the best of several names", () => {
    expect(compareNames("Maria Silva", ["João Pereira", "Maria Silva"])).toBe("confere");
  });
});

describe("icnetSituation", () => {
  it("covers every state", () => {
    expect(icnetSituation(recipient({})).label).toBe("Não consultado");
    expect(icnetSituation(recipient({ icnet_erro: "O ICnet não respondeu." })).label).toBe("Falha na consulta");
    const at = "2026-11-09T12:00:00+00:00";
    expect(icnetSituation(recipient({ icnet_consultado_em: at, icnet_ativo: true, icnet_voluntario: true })).label).toBe("Voluntário ativo");
    expect(icnetSituation(recipient({ icnet_consultado_em: at, icnet_ativo: false, icnet_voluntario: true })).label).toBe("Voluntário inativo");
    expect(icnetSituation(recipient({ icnet_consultado_em: at, icnet_ativo: false, icnet_voluntario: false })).label).toBe("Não encontrado");
  });

  it("keeps the last result when a later check fails", () => {
    const r = recipient({ icnet_consultado_em: "2026-11-09T12:00:00+00:00", icnet_ativo: true, icnet_erro: "O ICnet não respondeu." });
    expect(icnetSituation(r).label).toBe("Voluntário ativo");
  });
});
