import { useState } from "react";
import { createRecipient, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Rótulo de pergunta em negrito — destaca as perguntas do formulário (item 2).
const Q = ({ className, ...props }: React.ComponentProps<typeof Label>) => (
  <Label className={cn("font-bold", className)} {...props} />
);

const Cadastro = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [aceitouLgpd, setAceitouLgpd] = useState(false);

  const [form, setForm] = useState({
    nome_completo: "",
    nome_preferido: "",
    idade: "",
    endereco: "",
    bairro: "",
    whatsapp: "",
    voluntario_ic: "",
    mora_sozinho: "",
    plano_saude: "",
    hospital_preferencia: "",
    tem_pet: "",
    cadastro_ubs: "",
    contato_familia: "",
    contato_ccci: "",
    pessoa_chaves: "",
    profissional_saude: "",
    alergia_intolerancia: "",
    tipo_sanguineo: "",
    medicacao_continua: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aceitouLgpd) {
      toast({ title: "Atenção", description: "Você precisa aceitar o Termo de Consentimento (LGPD).", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await createRecipient({
        nome_completo: form.nome_completo.trim(),
        nome_preferido: form.nome_preferido.trim() || null,
        idade: parseInt(form.idade),
        endereco: form.endereco.trim(),
        bairro: form.bairro.trim(),
        whatsapp: form.whatsapp.trim(),
        voluntario_ic: form.voluntario_ic.trim(),
        mora_sozinho: form.mora_sozinho === "sim",
        plano_saude: form.plano_saude.trim() || null,
        hospital_preferencia: form.hospital_preferencia.trim() || null,
        tem_pet: form.tem_pet.trim() || null,
        cadastro_ubs: form.cadastro_ubs.trim() || null,
        contato_familia: form.contato_familia.trim(),
        contato_ccci: form.contato_ccci.trim(),
        pessoa_chaves: form.pessoa_chaves.trim() || null,
        profissional_saude: form.profissional_saude.trim() || null,
        alergia_intolerancia: form.alergia_intolerancia.trim() || null,
        tipo_sanguineo: form.tipo_sanguineo.trim() || null,
        medicacao_continua: form.medicacao_continua.trim() || null,
      });
      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof ApiError ? err.message : "Não foi possível enviar o cadastro.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center shadow-lg border-border/50">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="h-16 w-16 text-success mx-auto" />
            <h2 className="text-2xl font-bold font-display text-foreground">
              Cadastro Enviado!
            </h2>
            <p className="text-muted-foreground">
              Agradecemos por se disponibilizar para fazer parte da rede de apoio
              dos voluntários da CCCI. Seu cadastro será validado pela Comissão de
              Voluntariado e avisaremos você sobre a aprovação.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Boas-vindas */}
        <Card className="shadow-lg border-border/50">
          <CardHeader className="text-center pb-2">
            <img
              src="/logo-uniconecta.png"
              alt="UniConecta CCCI — Rede de Apoio para os Voluntários"
              className="mx-auto mb-4 h-24 w-24 object-contain"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <h1 className="text-2xl font-bold font-display text-foreground">
              UniConecta CCCI – Rede de Apoio para os Voluntários da CCCI
            </h1>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>Olá Voluntário!</p>
            <p>Seja muito Bem Vindo(a) a Rede de Apoio dos voluntários da CCCI!</p>
            <p>Agradecemos sua disponibilidade e contribuição!</p>
            <p>
              Por favor, preencha o seu cadastro com as suas informações. Os dados
              serão tratados de forma confidencial e exclusivamente para a gestão do
              voluntariado e para rede de apoio, respeitando as diretrizes da LGPD
              (Lei Geral de Proteção de Dados – Lei nº 13.709/2018).
            </p>
            <p>
              Após o envio, seu cadastro será validado pela Comissão de Voluntariado.
              Assim que estiver tudo certo, avisaremos você sobre a aprovação para
              participar da Rede de Apoio.
            </p>
            <p>
              Clique aqui para baixar o Manual de Usabilidade:{" "}
              <a href="https://bit.ly/3O05753" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                https://bit.ly/3O05753
              </a>
            </p>
            <p>
              Fazer parte da rede é um ato de cuidado com o outro e também com você.
              Sua presença fortalece a rede e amplia nossa capacidade de
              interassistência.
            </p>
            <p className="font-medium text-foreground">Seja bem-vindo(a) à UniConecta CCCI.</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dados Pessoais */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                  Dados Pessoais
                </h2>
                <div className="space-y-2">
                  <Q htmlFor="nome_completo">Nome Completo *</Q>
                  <Input id="nome_completo" value={form.nome_completo} onChange={(e) => update("nome_completo", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="nome_preferido">Como você prefere ser chamado(a)?</Q>
                  <p className="text-sm italic text-muted-foreground">
                    Este será o nome utilizado pelas solicitações e durante nossos atendimentos.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Informe o nome, apelido ou forma como prefere ser chamado(a) durante os atendimentos.
                  </p>
                  <Input id="nome_preferido" value={form.nome_preferido} onChange={(e) => update("nome_preferido", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="idade">Idade *</Q>
                  <Input id="idade" type="number" min={1} max={150} value={form.idade} onChange={(e) => update("idade", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="endereco">
                    Qual o endereço? *
                  </Q>
                  <p className="text-xs text-muted-foreground">
                    Coloque o Condomínio ao lado do endereço, para melhor identificação.
                  </p>
                  <Input id="endereco" value={form.endereco} onChange={(e) => update("endereco", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="bairro">Qual Bairro? *</Q>
                  <p className="text-xs text-muted-foreground">
                    Importante incluir o bairro para facilitar o mapeamento dos voluntários
                    e otimizar chamados e eventuais chamados assistenciais próximos a você.
                  </p>
                  <Input id="bairro" value={form.bairro} onChange={(e) => update("bairro", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="whatsapp">Número do WhatsApp *</Q>
                  <Input id="whatsapp" value={form.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} placeholder="(XX) XXXXX-XXXX" required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="voluntario_ic">Você é Voluntário de qual IC? *</Q>
                  <p className="text-xs text-muted-foreground">
                    O cadastro será validado com a Instituição para manter a segurança dos voluntários.
                  </p>
                  <Input id="voluntario_ic" value={form.voluntario_ic} onChange={(e) => update("voluntario_ic", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Q>Mora sozinho? *</Q>
                  <RadioGroup value={form.mora_sozinho} onValueChange={(v) => update("mora_sozinho", v)} className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="sim" id="mora-sim" />
                      <Label htmlFor="mora-sim" className="font-normal">Sim</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="nao" id="mora-nao" />
                      <Label htmlFor="mora-nao" className="font-normal">Não</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Saúde */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                  Informações de Saúde e Emergência
                </h2>
                <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <p>
                    Para garantir a segurança e o bem-estar de todos os voluntários da
                    nossa rede, é importante termos algumas informações básicas sobre sua
                    saúde e contatos em caso de emergência.
                  </p>
                  <p>
                    As perguntas a seguir são confidenciais e serão utilizadas
                    exclusivamente para oferecer o apoio adequado em situações que
                    envolvam risco à saúde ou necessidade de atendimento urgente.
                  </p>
                  <p>
                    Contamos com a sua transparência para que possamos agir com
                    agilidade, respeito e responsabilidade, sempre cuidando uns dos
                    outros.
                  </p>
                </div>

                <div className="space-y-2">
                  <Q htmlFor="plano_saude">Você possui plano de saúde? Caso positivo, qual?</Q>
                  <Input id="plano_saude" value={form.plano_saude} onChange={(e) => update("plano_saude", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="hospital_preferencia">
                    Se um dia precisar de internação, tem algum hospital que você prefere ou costuma ir?
                  </Q>
                  <Input id="hospital_preferencia" value={form.hospital_preferencia} onChange={(e) => update("hospital_preferencia", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="tem_pet">
                    Tem algum pet que depende de você? Em caso de internação ou dessoma,
                    tem alguém da sua confiança que possa cuidar dele(a)?
                  </Q>
                  <Textarea id="tem_pet" value={form.tem_pet} onChange={(e) => update("tem_pet", e.target.value)} rows={2} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="cadastro_ubs">Possui cadastro na Unidade Básica de Saúde (UBS)?</Q>
                  <Input id="cadastro_ubs" value={form.cadastro_ubs} onChange={(e) => update("cadastro_ubs", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="profissional_saude">
                    Você tem um(a) profissional de saúde de referência? (Ex.: Clínico Geral, Geriatra, Cardiologista, etc).
                  </Q>
                  <Input id="profissional_saude" value={form.profissional_saude} onChange={(e) => update("profissional_saude", e.target.value)} placeholder="Nome e Especialidade (se desejar compartilhar)" />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="alergia_intolerancia">
                    Possui algum tipo de alergia ou intolerância alimentar? Caso sim, qual?
                  </Q>
                  <Input id="alergia_intolerancia" value={form.alergia_intolerancia} onChange={(e) => update("alergia_intolerancia", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="tipo_sanguineo">Você sabe o seu tipo sanguíneo? Caso sim, digite abaixo.</Q>
                  <Input id="tipo_sanguineo" value={form.tipo_sanguineo} onChange={(e) => update("tipo_sanguineo", e.target.value)} placeholder="Ex.: O+" />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="medicacao_continua">
                    Em caso de emergência, faz uso de alguma medicação contínua?
                  </Q>
                  <p className="text-xs text-muted-foreground">
                    Se desejar, informe o nome do(s) medicamento(s). O preenchimento é opcional e essas
                    informações serão utilizadas apenas em situações de emergência, preservando sua confidencialidade.
                  </p>
                  <Textarea id="medicacao_continua" value={form.medicacao_continua} onChange={(e) => update("medicacao_continua", e.target.value)} rows={3} />
                </div>
              </div>

              {/* Familiares de Referência */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                  Familiares de Referência
                </h2>
                <p className="text-sm text-muted-foreground">
                  Essa informação é essencial para acionarmos em caso de emergência ou
                  necessidades imprevistas durante atividades do voluntariado.
                </p>
                <div className="space-y-2">
                  <Q htmlFor="contato_familia">
                    Em caso de necessidade, quem devemos acionar na sua família? *
                  </Q>
                  <p className="text-xs text-muted-foreground">
                    Informe nome completo, grau de parentesco, telefone com DDD.
                    Pode incluir um ou dois contatos se achar necessário.
                  </p>
                  <Textarea id="contato_familia" value={form.contato_familia} onChange={(e) => update("contato_familia", e.target.value)} rows={3} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="contato_ccci">
                    Em caso de necessidade, quem devemos acionar na CCCI? *
                  </Q>
                  <p className="text-xs text-muted-foreground">
                    Informe nome completo e telefone com DDD. Pode incluir um ou dois contatos se achar necessário.
                  </p>
                  <Textarea id="contato_ccci" value={form.contato_ccci} onChange={(e) => update("contato_ccci", e.target.value)} rows={3} required />
                </div>
                <div className="space-y-2">
                  <Q htmlFor="pessoa_chaves">
                    Algum amigo ou familiar tem as chaves da sua casa em caso de urgência?
                    Se desejar compartilhar deixe o nome.
                  </Q>
                  <Input id="pessoa_chaves" value={form.pessoa_chaves} onChange={(e) => update("pessoa_chaves", e.target.value)} />
                </div>
              </div>

              {/* LGPD */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                  Termo de Consentimento – LGPD
                </h2>
                <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <p>
                    Ao finalizar este cadastro, declaro que estou ciente e de acordo com
                    o tratamento dos meus dados pessoais, nos termos da Lei Geral de
                    Proteção de Dados Pessoais.
                  </p>
                  <p>Autorizo a coleta e utilização das informações fornecidas para as seguintes finalidades:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Organização e gestão da rede de apoio de voluntários.</li>
                    <li>Comunicação sobre atividades, eventos e ações relacionadas.</li>
                    <li>Contato direto quando necessário.</li>
                  </ul>
                  <p>Declaro estar ciente de que:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Meus dados serão tratados com segurança e confidencialidade.</li>
                    <li>Não serão compartilhados com terceiros sem meu consentimento, salvo obrigação legal.</li>
                    <li>Posso solicitar, a qualquer momento, a atualização ou exclusão dos meus dados.</li>
                  </ul>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
                  <Checkbox id="lgpd" checked={aceitouLgpd} onCheckedChange={(v) => setAceitouLgpd(!!v)} />
                  <Label htmlFor="lgpd" className="text-sm font-medium leading-snug cursor-pointer">
                    Li e concordo com o tratamento dos meus dados pessoais conforme descrito acima.
                  </Label>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Enviando..." : "Enviar Cadastro"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Cadastro;
