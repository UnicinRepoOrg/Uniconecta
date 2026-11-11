import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  CAMPOS, SECOES, DECLARACAO, TOTAL_CAIXAS_DECLARACAO, CONDOMINIOS_COGNOPOLIS, CONDOMINIO_OUTRO,
  calcularIdade, canonicalPhone, canonicalCep, ehCognopolis, formularioVazio, formularioDoCadastro,
  paraPayload, validarFormulario, camposDoDetalhe, campoVisivel, type FormState, type PessoasForm,
} from "@/lib/cadastroCampos";
import type { SupportRecipient } from "@/components/RecipientTable";

const d = (iso: string) => {
  const [a, m, dia] = iso.split("-").map(Number);
  return new Date(a, m - 1, dia, 12);
};

describe("calcularIdade", () => {
  const hoje = d("2026-11-11");

  it("counts only completed years", () => {
    expect(calcularIdade("1960-11-11", hoje)).toBe(66);
    expect(calcularIdade("1960-11-12", hoje)).toBe(65);
    expect(calcularIdade("1960-10-30", hoje)).toBe(66);
    expect(calcularIdade("1960-12-01", hoje)).toBe(65);
  });

  it("handles a 29 February birthday", () => {
    expect(calcularIdade("2000-02-29", d("2027-02-28"))).toBe(26);
    expect(calcularIdade("2000-02-29", d("2027-03-01"))).toBe(27);
  });

  it("accepts today and rejects future dates", () => {
    expect(calcularIdade("2026-11-11", hoje)).toBe(0);
    expect(calcularIdade("2026-11-12", hoje)).toBeNull();
    expect(calcularIdade("2030-01-01", hoje)).toBeNull();
  });

  it("rejects invalid or malformed dates", () => {
    expect(calcularIdade("1960-02-30", hoje)).toBeNull();
    expect(calcularIdade("1960-13-01", hoje)).toBeNull();
    expect(calcularIdade("11/11/1960", hoje)).toBeNull();
    expect(calcularIdade("1899-12-31", hoje)).toBeNull();
    expect(calcularIdade("", hoje)).toBeNull();
    expect(calcularIdade(null, hoje)).toBeNull();
  });
});

describe("canonicalPhone / canonicalCep", () => {
  it("follows the API rules", () => {
    expect(canonicalPhone("(31) 99000-0000")).toBe("5531990000000");
    expect(canonicalPhone("+55 31 3333-4444")).toBe("553133334444");
    expect(canonicalPhone("")).toBeNull();
    expect(canonicalCep("30140-071")).toBe("30140071");
    expect(canonicalCep("3014-007")).toBeNull();
  });
});

describe("lista de campos", () => {
  it("has unique keys and every field in a known section", () => {
    const keys = CAMPOS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const secoes = new Set(SECOES.map((s) => s.id));
    for (const c of CAMPOS) expect(secoes.has(c.secao)).toBe(true);
  });

  it("asks the new questions with the coordination's wording", () => {
    const pergunta = (key: string) => CAMPOS.find((c) => c.key === key)?.pergunta;
    expect(pergunta("nome_preferido")).toBe("Nome que gostaria que aparecesse nos chamados (nome resumido)");
    expect(pergunta("possui_carro")).toBe(
      "Você possui carro e teria disponibilidade para oferecer caronas a outros voluntários da comunidade?",
    );
    expect(pergunta("pessoas_vinculadas")).toBe(
      "Você reside com alguma pessoa que não é voluntária, mas que poderá eventualmente necessitar de apoio da Rede?",
    );
  });

  it("makes nome_preferido, data_nascimento and cep required", () => {
    for (const key of ["nome_preferido", "data_nascimento", "cep"]) {
      expect(CAMPOS.find((c) => c.key === key)?.obrigatorio).toBe(true);
    }
  });

  it("puts data_nascimento before idade and the carona block before health", () => {
    const keys = CAMPOS.map((c) => c.key);
    expect(keys.indexOf("data_nascimento")).toBeLessThan(keys.indexOf("idade"));
    const ordem = SECOES.map((s) => s.id);
    expect(ordem.indexOf("carona")).toBe(ordem.indexOf("saude") - 1);
  });

  it("keeps the health and family questions in full (the edit dialog shows the same text)", () => {
    const tem_pet = CAMPOS.find((c) => c.key === "tem_pet");
    expect(tem_pet?.tipo).toBe("textarea");
    expect(tem_pet?.pergunta).toMatch(/dessoma/);
    expect(CAMPOS.find((c) => c.key === "medicacao_continua")?.tipo).toBe("textarea");
    expect(CAMPOS.find((c) => c.key === "contato_familia")?.tipo).toBe("textarea");
  });

  it("covers every field the edit dialog used to show", () => {
    const antigos = [
      "nome_completo", "nome_preferido", "idade", "endereco", "bairro", "whatsapp", "voluntario_ic", "mora_sozinho",
      "plano_saude", "hospital_preferencia", "cadastro_ubs", "profissional_saude", "alergia_intolerancia",
      "tipo_sanguineo", "medicacao_continua", "tem_pet", "contato_familia", "contato_ccci", "pessoa_chaves",
    ];
    const keys = CAMPOS.map((c) => c.key);
    for (const k of antigos) expect(keys).toContain(k);
  });

  it("uses the same question list in the signup form and the edit dialog", () => {
    const src = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
    for (const arquivo of ["pages/Cadastro.tsx", "components/EditRecipientDialog.tsx"]) {
      const codigo = src(arquivo);
      expect(codigo).toContain("camposDaSecao(secao.id)");
      expect(codigo).toContain("<CampoCadastro");
    }
  });
});

describe("Declaração de Ciência e Compromisso", () => {
  it("has the five items plus the final declaration and no LGPD wording", () => {
    expect(DECLARACAO.itens).toHaveLength(5);
    expect(TOTAL_CAIXAS_DECLARACAO).toBe(6);
    expect(JSON.stringify(DECLARACAO)).not.toMatch(/LGPD/);
  });
});

const formCompleto = (): FormState => ({
  ...formularioVazio(),
  nome_completo: "Maria Aparecida da Silva",
  nome_preferido: "Maria",
  data_nascimento: "1960-05-20",
  endereco: "Rua A, 1",
  bairro: "Centro",
  cep: "30140-071",
  whatsapp: "(31) 99000-0000",
  voluntario_ic: "CCCI",
  mora_sozinho: "sim",
  possui_carro: "nao",
  contato_familia: "Ana 31 98888-7777",
  contato_ccci: "João 31 97777-6666",
});

describe("validarFormulario e paraPayload", () => {
  it("accepts a complete form and computes the age", () => {
    const form = formCompleto();
    expect(validarFormulario(form, "cadastro")).toBeNull();
    const payload = paraPayload(form);
    expect(payload.idade).toBe(calcularIdade("1960-05-20"));
    expect(payload.cep).toBe("30140071");
    expect(payload.mora_sozinho).toBe(true);
    expect(payload.pessoas_vinculadas).toEqual([]);
    expect(payload.possui_carro).toBe(false);
    expect(payload.carona_dias).toEqual([]);
    expect(payload.condominio).toBeNull();
  });

  it("requires nome_preferido and data_nascimento in the signup form only", () => {
    const form = { ...formCompleto(), nome_preferido: "", data_nascimento: "" };
    expect(validarFormulario(form, "cadastro")?.campo.key).toBe("nome_preferido");
    expect(validarFormulario({ ...form, nome_preferido: "Maria" }, "cadastro")?.campo.key).toBe("data_nascimento");
    expect(validarFormulario(form, "edicao")).toBeNull();
  });

  it("rejects a future birth date even when editing", () => {
    const form = { ...formCompleto(), data_nascimento: "2999-01-01" };
    expect(validarFormulario(form, "edicao")?.mensagem).toMatch(/Data de nascimento/);
  });

  it("asks the condominium only in Cognópolis, with 'Outro' as free text", () => {
    const condominio = CAMPOS.find((c) => c.key === "condominio")!;
    expect(campoVisivel(condominio, formCompleto())).toBe(false);
    expect(ehCognopolis("Cognopolis")).toBe(true);
    expect(ehCognopolis("Bairro Cognópolis, Foz")).toBe(true);
    const form = { ...formCompleto(), bairro: "Cognópolis" };
    expect(campoVisivel(condominio, form)).toBe(true);
    expect(validarFormulario(form, "cadastro")?.campo.key).toBe("condominio");
    expect(paraPayload({ ...form, condominio: { opcao: CONDOMINIOS_COGNOPOLIS[0], outro: "" } }).condominio).toBe(CONDOMINIOS_COGNOPOLIS[0]);
    const outro = { ...form, condominio: { opcao: CONDOMINIO_OUTRO, outro: "" } };
    expect(validarFormulario(outro, "cadastro")?.mensagem).toMatch(/nome do condomínio/);
    expect(paraPayload({ ...form, condominio: { opcao: CONDOMINIO_OUTRO, outro: " Jardim " } }).condominio).toBe("Jardim");
  });

  it("validates the people who live with the volunteer", () => {
    const comPessoas = (p: PessoasForm): FormState => ({ ...formCompleto(), mora_sozinho: "nao", pessoas_vinculadas: p });
    expect(validarFormulario({ ...formCompleto(), mora_sozinho: "nao" }, "cadastro")?.campo.key).toBe("pessoas_vinculadas");
    expect(validarFormulario(comPessoas({ tem: "sim", lista: [{ nome: "Ana", telefone: "123", vinculo: "familiar" }] }), "cadastro")?.mensagem)
      .toMatch(/Telefone inválido/);
    expect(validarFormulario(comPessoas({ tem: "sim", lista: [{ nome: "Ana", telefone: "31 98888-7777", vinculo: "" }] }), "cadastro")?.mensagem)
      .toMatch(/grau de vínculo/);
    const ok = comPessoas({
      tem: "sim",
      lista: [
        { nome: "Ana", telefone: "(31) 98888-7777", vinculo: "familiar" },
        { nome: "Rui", telefone: "31 3333-4444", vinculo: "companheiro" },
      ],
    });
    expect(validarFormulario(ok, "cadastro")).toBeNull();
    expect(paraPayload(ok).pessoas_vinculadas).toEqual([
      { nome: "Ana", telefone: "5531988887777", vinculo: "familiar" },
      { nome: "Rui", telefone: "553133334444", vinculo: "companheiro" },
    ]);
    expect(paraPayload(comPessoas({ tem: "nao", lista: [] })).pessoas_vinculadas).toEqual([]);
  });

  it("sends the carona details only when the volunteer offers rides", () => {
    const form = {
      ...formCompleto(), possui_carro: "sim", carona_disponibilidade: "regular", carona_regiao: "Centro",
      carona_dias: ["seg", "qua"], carona_periodo: ["manha"],
    };
    expect(validarFormulario({ ...form, carona_disponibilidade: "" }, "cadastro")?.campo.key).toBe("carona_disponibilidade");
    const payload = paraPayload(form);
    expect(payload).toMatchObject({ possui_carro: true, carona_disponibilidade: "regular", carona_dias: ["seg", "qua"], carona_periodo: ["manha"] });
    const semCarro = paraPayload({ ...form, possui_carro: "nao" });
    expect(semCarro).toMatchObject({ possui_carro: false, carona_disponibilidade: null, carona_regiao: null, carona_dias: [], carona_periodo: [] });
  });
});

describe("cadastro gravado -> edição e detalhe", () => {
  const antigo = {
    id: "5531990000000", nome_completo: "José", nome_preferido: null, idade: 70, endereco: "Rua B", bairro: "Centro",
    whatsapp: "31990000000", voluntario_ic: "CCCI", mora_sozinho: true, contato_familia: "Ana", contato_ccci: "Rui",
  } as unknown as SupportRecipient;

  it("keeps an old record with only the age valid for editing", () => {
    const form = formularioDoCadastro(antigo);
    expect(form.idade).toBe("70");
    expect(form.mora_sozinho).toBe("sim");
    expect(validarFormulario(form, "edicao")).toBeNull();
    expect(paraPayload(form).idade).toBe(70);
  });

  it("round-trips a new record through the edit form", () => {
    const novo = {
      ...antigo, nome_preferido: "Zé", data_nascimento: "1956-01-02", cep: "30140071", bairro: "Cognópolis",
      condominio: "Condomínio Novo", mora_sozinho: false,
      pessoas_vinculadas: [{ nome: "Ana", telefone: "5531988887777", vinculo: "familiar" }],
      possui_carro: true, carona_disponibilidade: "eventual", carona_regiao: null, carona_dias: ["sab"], carona_periodo: [],
    } as unknown as SupportRecipient;
    const form = formularioDoCadastro(novo);
    expect(form.condominio).toEqual({ opcao: CONDOMINIO_OUTRO, outro: "Condomínio Novo" });
    expect(form.cep).toBe("30140-071");
    expect(validarFormulario(form, "cadastro")).toBeNull();
    const payload = paraPayload(form);
    expect(payload).toMatchObject({
      nome_preferido: "Zé", data_nascimento: "1956-01-02", cep: "30140071", condominio: "Condomínio Novo",
      pessoas_vinculadas: [{ nome: "Ana", telefone: "5531988887777", vinculo: "familiar" }],
      possui_carro: true, carona_disponibilidade: "eventual", carona_dias: ["sab"],
    });
  });

  it("flags required fields missing from an old record in the detail", () => {
    const linhas = camposDoDetalhe(antigo);
    expect(linhas.find((l) => l.campo.key === "nome_preferido")?.faltando).toBe(true);
    expect(linhas.find((l) => l.campo.key === "data_nascimento")?.faltando).toBe(true);
    expect(linhas.find((l) => l.campo.key === "idade")?.valor).toBe("70");
    expect(linhas.find((l) => l.campo.key === "mora_sozinho")?.valor).toBe("Sim");
    // Condicionais que não se aplicam não aparecem.
    expect(linhas.some((l) => l.campo.key === "condominio")).toBe(false);
    expect(linhas.some((l) => l.campo.key === "carona_dias")).toBe(false);
  });
});
