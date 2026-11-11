import { useState } from "react";
import { createRecipient, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle } from "lucide-react";
import { CampoCadastro } from "@/components/CampoCadastro";
import {
  SECOES, DECLARACAO, TOTAL_CAIXAS_DECLARACAO, LINK_VIDEO, LINK_MANUAL,
  camposDaSecao, campoVisivel, formularioVazio, paraPayload, validarFormulario,
  type FormState, type ValorForm,
} from "@/lib/cadastroCampos";

const linkClass = "text-primary underline break-all";

const Cadastro = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Uma caixa por item da declaração, mais a declaração final.
  const [declaracao, setDeclaracao] = useState<boolean[]>(() => Array(TOTAL_CAIXAS_DECLARACAO).fill(false));
  const [form, setForm] = useState<FormState>(formularioVazio);

  const update = (key: string, valor: ValorForm) => setForm((prev) => ({ ...prev, [key]: valor }));
  const marcar = (i: number, v: boolean) => setDeclaracao((prev) => prev.map((x, j) => (j === i ? v : x)));
  const declaracaoCompleta = declaracao.every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const erro = validarFormulario(form, "cadastro");
    if (erro) {
      toast({ title: "Atenção", description: erro.mensagem, variant: "destructive" });
      document.getElementById(`campo-${erro.campo.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!declaracaoCompleta) {
      toast({
        title: "Atenção",
        description: "Para enviar, marque todos os itens da Declaração de Ciência e Compromisso.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      // validarFormulario já garantiu os campos obrigatórios.
      await createRecipient({ ...paraPayload(form), termo_aceito: true });
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
              voluntariado e para a Rede de Apoio.
            </p>
            <p>
              Após o envio, seu cadastro será validado pela Comissão de Voluntariado.
              Assim que estiver tudo certo, avisaremos você sobre a aprovação para
              participar da Rede de Apoio.
            </p>
            <p>
              Antes de preencher, assista ao vídeo de apresentação e orientação da Rede de Apoio:{" "}
              <a href={LINK_VIDEO} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {LINK_VIDEO}
              </a>
            </p>
            <p>
              Clique aqui para abrir o Manual de Usabilidade:{" "}
              <a href={LINK_MANUAL} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {LINK_MANUAL}
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
              {SECOES.map((secao) => (
                <div key={secao.id} className="space-y-4">
                  <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                    {secao.titulo}
                  </h2>
                  {secao.introducao && (
                    <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                      {secao.introducao.map((p) => <p key={p}>{p}</p>)}
                    </div>
                  )}
                  {camposDaSecao(secao.id)
                    .filter((c) => campoVisivel(c, form))
                    .map((c) => <CampoCadastro key={c.key} campo={c} form={form} onChange={update} />)}
                </div>
              ))}

              {/* Declaração de Ciência e Compromisso (substitui o antigo termo da LGPD) */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold font-display text-foreground border-b border-border pb-2">
                  {DECLARACAO.titulo}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">{DECLARACAO.introducao}</p>
                <div className="space-y-3">
                  {DECLARACAO.itens.map((item, i) => (
                    <div key={item} className="flex items-start gap-3">
                      <Checkbox id={`declaracao-${i}`} checked={declaracao[i]} onCheckedChange={(v) => marcar(i, !!v)} className="mt-0.5" />
                      <Label htmlFor={`declaracao-${i}`} className="text-sm font-normal leading-snug cursor-pointer">{item}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{DECLARACAO.privacidade}</p>
                <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
                  <Checkbox
                    id="declaracao-final"
                    checked={declaracao[DECLARACAO.itens.length]}
                    onCheckedChange={(v) => marcar(DECLARACAO.itens.length, !!v)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="declaracao-final" className="text-sm font-medium leading-snug cursor-pointer">
                    {DECLARACAO.final}
                  </Label>
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading || !declaracaoCompleta}>
                {loading ? "Enviando..." : "Enviar Cadastro"}
              </Button>
              {!declaracaoCompleta && (
                <p className="text-xs text-center text-muted-foreground">
                  O envio é liberado depois de marcar todos os itens da declaração.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Cadastro;
