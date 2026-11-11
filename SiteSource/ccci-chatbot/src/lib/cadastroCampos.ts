// Definição única das perguntas do cadastro.
// O formulário público (pages/Cadastro.tsx), a edição do painel (components/EditRecipientDialog.tsx)
// e o detalhe do cadastro (components/CadastroDetalhe.tsx) leem desta lista, para que as três telas
// mostrem sempre as mesmas perguntas. A API (LambdaFiles/UniconectaApp/UniconectaApp.py) valida os
// mesmos campos e os mesmos valores permitidos: uma mudança aqui precisa ser repetida lá.
import type { CadastroPayload } from "@/lib/api";
import type { SupportRecipient } from "@/components/RecipientTable";

export type SecaoId = "pessoais" | "carona" | "saude" | "familiares";

export type CampoTipo =
  | "text"
  | "textarea"
  | "date"
  | "idade" // calculada a partir da data de nascimento; editável só em cadastros antigos sem data
  | "cep"
  | "simnao"
  | "opcao" // uma opção da lista
  | "multipla" // várias opções da lista
  | "condominio"
  | "pessoas";

export type Opcao = { valor: string; rotulo: string };

export type Campo = {
  key: keyof SupportRecipient & string;
  pergunta: string; // texto completo, igual no cadastro e na edição
  rotulo: string; // nome curto, usado no detalhe do painel
  introducao?: string[]; // parágrafo mostrado antes da pergunta
  ajuda?: string[]; // texto menor mostrado depois da pergunta
  tipo: CampoTipo;
  obrigatorio: boolean; // obrigatório quando o campo está visível
  secao: SecaoId;
  opcoes?: Opcao[];
  placeholder?: string;
  linhas?: number; // altura do Textarea
  visivel?: (form: FormState) => boolean;
  // Sempre na tela, mas só se responde quando ativo (ex.: detalhes da carona só com carro = Sim).
  // Inativo, o campo aparece desabilitado e não é conferido nem enviado.
  ativo?: (form: FormState) => boolean;
  quandoInativo?: string; // aviso mostrado enquanto o campo está desabilitado
};

export type Secao = { id: SecaoId; titulo: string; introducao?: string[] };

// --- Listas de valores (os mesmos da API) ---

// Condomínios da Cognópolis. Lista provisória: a lista completa virá da coordenação.
// Quem não encontrar o seu escolhe "Outro" e escreve o nome.
export const CONDOMINIOS_COGNOPOLIS = ["Campos dos Sonhos", "Vila Conscienthia"];
export const CONDOMINIO_OUTRO = "Outro";

export const VINCULOS: Opcao[] = [
  { valor: "familiar", rotulo: "Familiar" },
  { valor: "companheiro", rotulo: "Companheiro(a)" },
  { valor: "outra", rotulo: "Outra pessoa que reside no mesmo local" },
];

export const CARONA_DISPONIBILIDADE: Opcao[] = [
  { valor: "regular", rotulo: "Regular" },
  { valor: "eventual", rotulo: "Eventual" },
];

export const DIAS_SEMANA: Opcao[] = [
  { valor: "seg", rotulo: "Segunda" },
  { valor: "ter", rotulo: "Terça" },
  { valor: "qua", rotulo: "Quarta" },
  { valor: "qui", rotulo: "Quinta" },
  { valor: "sex", rotulo: "Sexta" },
  { valor: "sab", rotulo: "Sábado" },
  { valor: "dom", rotulo: "Domingo" },
];

export const PERIODOS: Opcao[] = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
];

// --- Valores do formulário ---

export type PessoaForm = { nome: string; telefone: string; vinculo: string };
export type PessoasForm = { tem: "" | "sim" | "nao"; lista: PessoaForm[] };
export type CondominioForm = { opcao: string; outro: string };
export type ValorForm = string | string[] | PessoasForm | CondominioForm;
export type FormState = Record<string, ValorForm>;

export const pessoaVazia = (): PessoaForm => ({ nome: "", telefone: "", vinculo: "" });

const texto = (form: FormState, key: string) => (typeof form[key] === "string" ? (form[key] as string) : "");

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O bairro é a Cognópolis (com ou sem acento, em qualquer parte do texto). */
export const ehCognopolis = (bairro: string | null | undefined) => semAcento(bairro || "").includes("cognopolis");

// --- Seções e perguntas ---

export const SECOES: Secao[] = [
  { id: "pessoais", titulo: "Dados Pessoais" },
  {
    id: "carona",
    titulo: "Carona Solidária",
  },
  {
    id: "saude",
    titulo: "Informações de Saúde e Emergência",
    introducao: [
      "Para garantir a segurança e o bem-estar de todos os voluntários da nossa rede, é importante termos algumas informações básicas sobre sua saúde e contatos em caso de emergência.",
      "As perguntas a seguir são confidenciais e serão utilizadas exclusivamente para oferecer o apoio adequado em situações que envolvam risco à saúde ou necessidade de atendimento urgente.",
      "Contamos com a sua transparência para que possamos agir com agilidade, respeito e responsabilidade, sempre cuidando uns dos outros.",
    ],
  },
  {
    id: "familiares",
    titulo: "Familiares de Referência",
    introducao: [
      "Essa informação é essencial para acionarmos em caso de emergência ou necessidades imprevistas durante atividades do voluntariado.",
    ],
  },
];

const temCarro = (form: FormState) => texto(form, "possui_carro") === "sim";
const CARONA_INATIVA = 'Responda depois de marcar "Sim" na pergunta do carro.';

export const CAMPOS: Campo[] = [
  // Dados Pessoais
  { key: "nome_completo", secao: "pessoais", tipo: "text", obrigatorio: true, pergunta: "Nome Completo", rotulo: "Nome completo" },
  {
    key: "nome_preferido", secao: "pessoais", tipo: "text", obrigatorio: true,
    pergunta: "Nome que gostaria que aparecesse nos chamados (nome resumido)",
    rotulo: "Nome nos chamados",
    ajuda: [
      "Este será o nome utilizado nas solicitações e durante nossos atendimentos.",
      "Informe o nome, apelido ou forma como prefere ser chamado(a) durante os atendimentos.",
    ],
  },
  { key: "data_nascimento", secao: "pessoais", tipo: "date", obrigatorio: true, pergunta: "Data de nascimento", rotulo: "Data de nascimento" },
  {
    key: "idade", secao: "pessoais", tipo: "idade", obrigatorio: false, pergunta: "Idade", rotulo: "Idade",
    ajuda: ["Calculada a partir da data de nascimento."],
  },
  {
    key: "endereco", secao: "pessoais", tipo: "text", obrigatorio: true, pergunta: "Qual o endereço?", rotulo: "Endereço",
    ajuda: ["Coloque o Condomínio ao lado do endereço, para melhor identificação."],
  },
  {
    key: "bairro", secao: "pessoais", tipo: "text", obrigatorio: true, pergunta: "Qual Bairro?", rotulo: "Bairro",
    ajuda: [
      "Importante incluir o bairro para facilitar o mapeamento dos voluntários e otimizar chamados e eventuais chamados assistenciais próximos a você.",
    ],
  },
  {
    key: "condominio", secao: "pessoais", tipo: "condominio", obrigatorio: true,
    pergunta: "Em qual condomínio da Cognópolis você mora?", rotulo: "Condomínio",
    ajuda: ['Se o seu condomínio não estiver na lista, escolha "Outro" e escreva o nome.'],
    visivel: (form) => ehCognopolis(texto(form, "bairro")),
  },
  {
    key: "cep", secao: "pessoais", tipo: "cep", obrigatorio: true, pergunta: "Qual o CEP?", rotulo: "CEP",
    placeholder: "00000-000",
    ajuda: ["Com o CEP, a Rede avisa primeiro os voluntários que moram mais perto de você."],
  },
  { key: "whatsapp", secao: "pessoais", tipo: "text", obrigatorio: true, pergunta: "Número do WhatsApp", rotulo: "WhatsApp", placeholder: "(XX) XXXXX-XXXX" },
  {
    key: "voluntario_ic", secao: "pessoais", tipo: "text", obrigatorio: true, pergunta: "Você é Voluntário de qual IC?", rotulo: "Voluntário IC",
    ajuda: ["O cadastro será validado com a Instituição para manter a segurança dos voluntários."],
  },
  { key: "mora_sozinho", secao: "pessoais", tipo: "simnao", obrigatorio: true, pergunta: "Mora sozinho?", rotulo: "Mora sozinho" },
  {
    key: "pessoas_vinculadas", secao: "pessoais", tipo: "pessoas", obrigatorio: true,
    pergunta: "Você reside com alguma pessoa que não é voluntária, mas que poderá eventualmente necessitar de apoio da Rede?",
    rotulo: "Pessoas que residem com o voluntário",
    introducao: [
      "Para que a Rede de Apoio possa estar preparada para situações que eventualmente envolvam pessoas que residem com você, informe abaixo os dados de quem poderá necessitar de apoio. A pessoa não será cadastrada como voluntária. Essas informações serão utilizadas apenas para facilitar eventual contato e assistência.",
    ],
  },

  // Carona Solidária
  {
    key: "possui_carro", secao: "carona", tipo: "simnao", obrigatorio: true,
    pergunta: "Você possui carro e teria disponibilidade para oferecer caronas a outros voluntários da comunidade?",
    rotulo: "Oferece caronas",
  },
  {
    key: "carona_disponibilidade", secao: "carona", tipo: "opcao", obrigatorio: true, opcoes: CARONA_DISPONIBILIDADE,
    pergunta: "Sua disponibilidade para oferecer caronas seria:", rotulo: "Disponibilidade para caronas",
    ativo: temCarro, quandoInativo: CARONA_INATIVA,
  },
  {
    key: "carona_regiao", secao: "carona", tipo: "text", obrigatorio: false,
    pergunta: "Em qual bairro ou região você poderia oferecer caronas?", rotulo: "Região das caronas",
    ativo: temCarro, quandoInativo: CARONA_INATIVA,
  },
  {
    key: "carona_dias", secao: "carona", tipo: "multipla", obrigatorio: false, opcoes: DIAS_SEMANA,
    pergunta: "Em quais dias da semana?", rotulo: "Dias para caronas",
    ativo: temCarro, quandoInativo: CARONA_INATIVA,
  },
  {
    key: "carona_periodo", secao: "carona", tipo: "multipla", obrigatorio: false, opcoes: PERIODOS,
    pergunta: "Em quais períodos?", rotulo: "Períodos para caronas",
    ativo: temCarro, quandoInativo: CARONA_INATIVA,
  },

  // Saúde e Emergência
  { key: "plano_saude", secao: "saude", tipo: "text", obrigatorio: false, pergunta: "Você possui plano de saúde? Caso positivo, qual?", rotulo: "Plano de saúde" },
  {
    key: "hospital_preferencia", secao: "saude", tipo: "text", obrigatorio: false,
    pergunta: "Se um dia precisar de internação, tem algum hospital que você prefere ou costuma ir?", rotulo: "Hospital de preferência",
  },
  {
    key: "tem_pet", secao: "saude", tipo: "textarea", linhas: 2, obrigatorio: false,
    pergunta: "Tem algum pet que depende de você? Em caso de internação ou dessoma, tem alguém da sua confiança que possa cuidar dele(a)?",
    rotulo: "Pet",
  },
  { key: "cadastro_ubs", secao: "saude", tipo: "text", obrigatorio: false, pergunta: "Possui cadastro na Unidade Básica de Saúde (UBS)?", rotulo: "Cadastro UBS" },
  {
    key: "profissional_saude", secao: "saude", tipo: "text", obrigatorio: false,
    pergunta: "Você tem um(a) profissional de saúde de referência? (Ex.: Clínico Geral, Geriatra, Cardiologista, etc).",
    rotulo: "Profissional de saúde", placeholder: "Nome e Especialidade (se desejar compartilhar)",
  },
  {
    key: "alergia_intolerancia", secao: "saude", tipo: "text", obrigatorio: false,
    pergunta: "Possui algum tipo de alergia ou intolerância alimentar? Caso sim, qual?", rotulo: "Alergias / Intolerâncias",
  },
  {
    key: "tipo_sanguineo", secao: "saude", tipo: "text", obrigatorio: false,
    pergunta: "Você sabe o seu tipo sanguíneo? Caso sim, digite abaixo.", rotulo: "Tipo sanguíneo", placeholder: "Ex.: O+",
  },
  {
    key: "medicacao_continua", secao: "saude", tipo: "textarea", linhas: 3, obrigatorio: false,
    pergunta: "Em caso de emergência, faz uso de alguma medicação contínua?", rotulo: "Medicação contínua",
    ajuda: [
      "Se desejar, informe o nome do(s) medicamento(s). O preenchimento é opcional e essas informações serão utilizadas apenas em situações de emergência, preservando sua confidencialidade.",
    ],
  },

  // Familiares de Referência
  {
    key: "contato_familia", secao: "familiares", tipo: "textarea", linhas: 3, obrigatorio: true,
    pergunta: "Em caso de necessidade, quem devemos acionar na sua família?", rotulo: "Contato familiar",
    ajuda: ["Informe nome completo, grau de parentesco, telefone com DDD. Pode incluir um ou dois contatos se achar necessário."],
  },
  {
    key: "contato_ccci", secao: "familiares", tipo: "textarea", linhas: 3, obrigatorio: true,
    pergunta: "Em caso de necessidade, quem devemos acionar na CCCI?", rotulo: "Contato CCCI",
    ajuda: ["Informe nome completo e telefone com DDD. Pode incluir um ou dois contatos se achar necessário."],
  },
  {
    key: "pessoa_chaves", secao: "familiares", tipo: "text", obrigatorio: false,
    pergunta: "Algum amigo ou familiar tem as chaves da sua casa em caso de urgência? Se desejar compartilhar deixe o nome.",
    rotulo: "Pessoa com chaves",
  },
];

export const camposDaSecao = (secao: SecaoId) => CAMPOS.filter((c) => c.secao === secao);

export const campoVisivel = (campo: Campo, form: FormState) => !campo.visivel || campo.visivel(form);

/** Visível e respondível: só esses campos são conferidos e enviados à API. */
export const campoAtivo = (campo: Campo, form: FormState) =>
  campoVisivel(campo, form) && (!campo.ativo || campo.ativo(form));

// --- Declaração de Ciência e Compromisso (substitui o antigo termo da LGPD) ---

export const DECLARACAO = {
  titulo: "Declaração de Ciência e Compromisso – Rede de Apoio",
  introducao:
    "A Rede de Apoio é uma iniciativa comunitária voltada à conexão, ao acolhimento e ao fortalecimento dos voluntários, por meio da colaboração e do apoio mútuo. Ao concluir este cadastro, declaro que:",
  itens: [
    "Assisti ao vídeo de apresentação e orientação da Rede de Apoio.",
    "Li e compreendi as orientações descritas no Manual de Usabilidade.",
    "Estou ciente da proposta, do funcionamento e dos limites de atuação da Rede de Apoio.",
    "Comprometo-me a respeitar as orientações, agir com responsabilidade, ética, discrição e respeito às pessoas envolvidas.",
    "Estou ciente de que a Rede de Apoio não substitui serviços profissionais, médicos ou de emergência.",
  ],
  privacidade:
    "Também estou ciente de que as informações fornecidas neste cadastro serão utilizadas exclusivamente para a organização, comunicação e funcionamento da Rede de Apoio, com responsabilidade, cuidado e respeito à privacidade dos participantes.",
  final: "Declaro que li, compreendi e estou de acordo com as orientações e os compromissos apresentados acima.",
};

/** Total de caixas da declaração (itens + declaração final); o envio exige todas marcadas. */
export const TOTAL_CAIXAS_DECLARACAO = DECLARACAO.itens.length + 1;

export const LINK_VIDEO = "https://www.youtube.com/watch?v=1RDTkwXRtDQ";
export const LINK_MANUAL = "https://drive.google.com/file/d/10GfopR_j7J0s6qQ9_j5TVCWVvsgB_MFF/view?usp=sharing";

// --- Datas, telefone e CEP ---

const hojeLocal = () => new Date();

/** "AAAA-MM-DD" -> idade em anos completos; null se a data for inválida, futura ou anterior a 1900. */
export const calcularIdade = (iso: string | null | undefined, hoje: Date = hojeLocal()): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
  if (ano < 1900) return null;
  const hojeAno = hoje.getFullYear();
  const hojeMes = hoje.getMonth() + 1;
  const hojeDia = hoje.getDate();
  if (ano > hojeAno || (ano === hojeAno && (mes > hojeMes || (mes === hojeMes && dia > hojeDia)))) return null;
  let idade = hojeAno - ano;
  if (hojeMes < mes || (hojeMes === mes && hojeDia < dia)) idade -= 1;
  return idade;
};

/** Data de hoje em "AAAA-MM-DD" (limite do campo de data). */
export const hojeIso = (hoje: Date = hojeLocal()) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

/** Mesma regra do canonical_phone da API: só dígitos, com DDI 55 quando o número tem DDD. */
export const canonicalPhone = (raw: string | null | undefined): string | null => {
  const digitos = String(raw || "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return null;
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return "55" + digitos;
  return digitos;
};

/** Telefone aceito para as pessoas vinculadas: de 10 a 15 dígitos depois de normalizado (a API usa a mesma regra). */
export const telefoneValido = (raw: string | null | undefined) => {
  const tel = canonicalPhone(raw);
  return !!tel && tel.length >= 10 && tel.length <= 15;
};

/** Mesma regra do canonical_cep da API: 8 dígitos ou null. */
export const canonicalCep = (raw: string | null | undefined): string | null => {
  const digitos = String(raw || "").replace(/\D/g, "");
  return digitos.length === 8 ? digitos : null;
};

export const formatarCep = (cep: string | null | undefined) => {
  const c = canonicalCep(cep);
  return c ? `${c.slice(0, 5)}-${c.slice(5)}` : cep || "";
};

// --- Conversões formulário <-> API ---

export const formularioVazio = (): FormState => {
  const form: FormState = {};
  for (const campo of CAMPOS) {
    if (campo.tipo === "multipla") form[campo.key] = [];
    else if (campo.tipo === "pessoas") form[campo.key] = { tem: "", lista: [pessoaVazia()] };
    else if (campo.tipo === "condominio") form[campo.key] = { opcao: "", outro: "" };
    else form[campo.key] = "";
  }
  return form;
};

/** Cadastro gravado -> valores do formulário de edição. */
export const formularioDoCadastro = (r: SupportRecipient): FormState => {
  const form = formularioVazio();
  const dados = r as unknown as Record<string, unknown>;
  for (const campo of CAMPOS) {
    const valor = dados[campo.key];
    switch (campo.tipo) {
      case "simnao":
        form[campo.key] = valor === true ? "sim" : valor === false ? "nao" : "";
        break;
      case "multipla":
        form[campo.key] = Array.isArray(valor) ? valor.map(String) : [];
        break;
      case "pessoas": {
        const lista = Array.isArray(valor)
          ? (valor as Partial<PessoaForm>[]).map((p) => ({ nome: p.nome || "", telefone: p.telefone || "", vinculo: p.vinculo || "" }))
          : [];
        form[campo.key] = {
          tem: Array.isArray(valor) ? (lista.length > 0 ? "sim" : "nao") : "",
          lista: lista.length > 0 ? lista : [pessoaVazia()],
        };
        break;
      }
      case "condominio": {
        const nome = typeof valor === "string" ? valor : "";
        form[campo.key] = !nome
          ? { opcao: "", outro: "" }
          : CONDOMINIOS_COGNOPOLIS.includes(nome)
            ? { opcao: nome, outro: "" }
            : { opcao: CONDOMINIO_OUTRO, outro: nome };
        break;
      }
      case "cep":
        form[campo.key] = valor ? formatarCep(String(valor)) : "";
        break;
      default:
        form[campo.key] = valor === null || valor === undefined ? "" : String(valor);
    }
  }
  return form;
};

/** Idade a mostrar: calculada da data quando há data; senão o valor digitado (cadastros antigos). */
export const idadeDoFormulario = (form: FormState): number | null => {
  const calculada = calcularIdade(texto(form, "data_nascimento"));
  if (calculada !== null) return calculada;
  const digitada = parseInt(texto(form, "idade"), 10);
  return Number.isFinite(digitada) ? digitada : null;
};

const valorCondominio = (v: CondominioForm) =>
  v.opcao === CONDOMINIO_OUTRO ? v.outro.trim() || null : v.opcao || null;

const valorPreenchido = (campo: Campo, form: FormState): boolean => {
  const valor = form[campo.key];
  switch (campo.tipo) {
    case "multipla":
      return (valor as string[]).length > 0;
    case "pessoas":
      return (valor as PessoasForm).tem !== "";
    case "condominio":
      return valorCondominio(valor as CondominioForm) !== null;
    case "idade":
      return idadeDoFormulario(form) !== null;
    default:
      return texto(form, campo.key).trim() !== "";
  }
};

/** Campo obrigatório e visível ainda vazio (o painel destaca esses campos em cadastros antigos). */
export const campoFaltando = (campo: Campo, form: FormState) =>
  campo.obrigatorio && campoAtivo(campo, form) && !valorPreenchido(campo, form);

export type ErroFormulario = { campo: Campo; mensagem: string };

/**
 * Confere o formulário. No cadastro, todo campo obrigatório visível precisa estar preenchido.
 * Na edição do painel só os formatos são conferidos, porque cadastros antigos não têm os campos novos.
 */
export const validarFormulario = (form: FormState, modo: "cadastro" | "edicao"): ErroFormulario | null => {
  for (const campo of CAMPOS) {
    if (!campoAtivo(campo, form)) continue;
    const valor = form[campo.key];
    if (campo.tipo === "condominio" && modo === "cadastro" && (valor as CondominioForm).opcao === CONDOMINIO_OUTRO && !(valor as CondominioForm).outro.trim()) {
      return { campo, mensagem: "Escreva o nome do condomínio." };
    }
    if (modo === "cadastro" && campoFaltando(campo, form)) {
      return { campo, mensagem: `Responda a pergunta: ${campo.pergunta}` };
    }
    if (campo.tipo === "date" && texto(form, campo.key) && calcularIdade(texto(form, campo.key)) === null) {
      return { campo, mensagem: "Data de nascimento inválida." };
    }
    if (campo.tipo === "cep" && texto(form, campo.key).trim() && !canonicalCep(texto(form, campo.key))) {
      return { campo, mensagem: "CEP inválido: informe os 8 dígitos." };
    }
    if (campo.tipo === "pessoas" && (valor as PessoasForm).tem === "sim") {
      const lista = (valor as PessoasForm).lista;
      if (lista.length === 0) return { campo, mensagem: "Informe ao menos uma pessoa." };
      for (const [i, p] of lista.entries()) {
        const n = lista.length > 1 ? ` (pessoa ${i + 1})` : "";
        if (!p.nome.trim()) return { campo, mensagem: `Informe o nome da pessoa que reside com você${n}.` };
        if (!telefoneValido(p.telefone)) return { campo, mensagem: `Telefone inválido${n}: informe o número com DDD.` };
        if (!VINCULOS.some((v) => v.valor === p.vinculo)) return { campo, mensagem: `Escolha o grau de vínculo${n}.` };
      }
    }
  }
  return null;
};

const textoOuNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** Valores do formulário -> corpo enviado à API (POST /cadastro e PUT /recipients/:id). */
export const paraPayload = (form: FormState): Omit<CadastroPayload, "termo_aceito"> => {
  const payload: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    const visivel = campoAtivo(campo, form);
    const valor = form[campo.key];
    switch (campo.tipo) {
      case "simnao": {
        const v = texto(form, campo.key);
        payload[campo.key] = !visivel || v === "" ? null : v === "sim";
        break;
      }
      case "multipla":
        payload[campo.key] = visivel ? [...(valor as string[])] : [];
        break;
      case "opcao":
        payload[campo.key] = visivel ? textoOuNull(texto(form, campo.key)) : null;
        break;
      case "pessoas": {
        const p = valor as PessoasForm;
        if (p.tem === "") payload[campo.key] = null;
        else if (p.tem === "nao") payload[campo.key] = [];
        else
          payload[campo.key] = p.lista.map((x) => ({
            nome: x.nome.trim(),
            telefone: canonicalPhone(x.telefone) || x.telefone.trim(),
            vinculo: x.vinculo,
          }));
        break;
      }
      case "condominio":
        payload[campo.key] = visivel ? valorCondominio(valor as CondominioForm) : null;
        break;
      case "cep":
        payload[campo.key] = canonicalCep(texto(form, campo.key));
        break;
      case "idade":
        payload[campo.key] = idadeDoFormulario(form);
        break;
      default:
        payload[campo.key] = visivel ? textoOuNull(texto(form, campo.key)) : null;
    }
  }
  return payload as Omit<CadastroPayload, "termo_aceito">;
};

// --- Exibição no painel ---

const rotuloDe = (opcoes: Opcao[] | undefined, valor: string) => opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor;

const formatarData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Texto de um campo no detalhe do painel; null quando vazio. */
export const valorParaExibir = (campo: Campo, r: SupportRecipient): string | null => {
  const valor = (r as unknown as Record<string, unknown>)[campo.key];
  if (valor === null || valor === undefined || valor === "") return null;
  switch (campo.tipo) {
    case "simnao":
      return valor === true ? "Sim" : valor === false ? "Não" : String(valor);
    case "multipla":
      return Array.isArray(valor) && valor.length > 0 ? valor.map((v) => rotuloDe(campo.opcoes, String(v))).join(", ") : null;
    case "opcao":
      return rotuloDe(campo.opcoes, String(valor));
    case "date":
      return formatarData(String(valor));
    case "cep":
      return formatarCep(String(valor));
    case "pessoas":
      if (!Array.isArray(valor)) return null;
      if (valor.length === 0) return "Não";
      return (valor as PessoaForm[])
        .map((p) => `${p.nome} — ${p.telefone} — ${rotuloDe(VINCULOS, p.vinculo)}`)
        .join("\n");
    default:
      return String(valor);
  }
};

/** Campos que aparecem no detalhe de um cadastro gravado (os condicionais só quando se aplicam). */
export const camposDoDetalhe = (r: SupportRecipient) => {
  const form = formularioDoCadastro(r);
  return CAMPOS.filter((c) => campoAtivo(c, form) || valorParaExibir(c, r) !== null).map((campo) => ({
    campo,
    valor: valorParaExibir(campo, r),
    faltando: campoFaltando(campo, form),
  }));
};
