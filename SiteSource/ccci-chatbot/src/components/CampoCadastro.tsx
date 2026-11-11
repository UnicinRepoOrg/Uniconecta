// Desenha uma pergunta de cadastroCampos.ts. Usado pelo formulário público e pela edição do painel,
// para que as duas telas mostrem a mesma pergunta, a mesma ajuda e o mesmo tipo de campo.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONDOMINIOS_COGNOPOLIS, CONDOMINIO_OUTRO, VINCULOS, pessoaVazia, hojeIso, idadeDoFormulario, calcularIdade,
  type Campo, type FormState, type ValorForm, type PessoasForm, type CondominioForm, type Opcao,
} from "@/lib/cadastroCampos";

type Props = {
  campo: Campo;
  form: FormState;
  onChange: (key: string, valor: ValorForm) => void;
  idPrefix?: string; // evita ids repetidos quando a mesma pergunta aparece em duas telas
  destacarVazio?: boolean; // painel: campo obrigatório vazio em cadastro antigo
};

const Opcoes = ({ id, opcoes, valor, onChange }: { id: string; opcoes: Opcao[]; valor: string; onChange: (v: string) => void }) => (
  <RadioGroup value={valor} onValueChange={onChange} className="flex flex-wrap gap-x-6 gap-y-2">
    {opcoes.map((o) => (
      <div key={o.valor} className="flex items-center space-x-2">
        <RadioGroupItem value={o.valor} id={`${id}-${o.valor}`} />
        <Label htmlFor={`${id}-${o.valor}`} className="font-normal">{o.rotulo}</Label>
      </div>
    ))}
  </RadioGroup>
);

const SIM_NAO: Opcao[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
];

export const CampoCadastro = ({ campo, form, onChange, idPrefix = "", destacarVazio = false }: Props) => {
  const id = `${idPrefix}${campo.key}`;
  const valor = form[campo.key];
  const str = typeof valor === "string" ? valor : "";
  const set = (v: ValorForm) => onChange(campo.key, v);

  let entrada: React.ReactNode;
  switch (campo.tipo) {
    case "textarea":
      entrada = <Textarea id={id} value={str} onChange={(e) => set(e.target.value)} rows={campo.linhas ?? 3} placeholder={campo.placeholder} />;
      break;
    case "date":
      entrada = <Input id={id} type="date" max={hojeIso()} min="1900-01-01" value={str} onChange={(e) => set(e.target.value)} className="w-48" />;
      break;
    case "idade": {
      // Com data de nascimento a idade é calculada; sem data (cadastros antigos) continua editável.
      const temData = calcularIdade(typeof form.data_nascimento === "string" ? form.data_nascimento : "") !== null;
      const idade = idadeDoFormulario(form);
      entrada = temData ? (
        <Input id={id} value={idade === null ? "" : `${idade} anos`} readOnly disabled className="w-48" />
      ) : (
        <Input id={id} type="number" min={1} max={150} value={str} onChange={(e) => set(e.target.value)} className="w-48" />
      );
      break;
    }
    case "cep":
      entrada = <Input id={id} inputMode="numeric" value={str} onChange={(e) => set(e.target.value)} placeholder={campo.placeholder} className="w-48" />;
      break;
    case "simnao":
      entrada = <Opcoes id={id} opcoes={SIM_NAO} valor={str} onChange={set} />;
      break;
    case "opcao":
      entrada = <Opcoes id={id} opcoes={campo.opcoes ?? []} valor={str} onChange={set} />;
      break;
    case "multipla": {
      const marcados = (valor as string[]) ?? [];
      entrada = (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(campo.opcoes ?? []).map((o) => (
            <div key={o.valor} className="flex items-center space-x-2">
              <Checkbox
                id={`${id}-${o.valor}`}
                checked={marcados.includes(o.valor)}
                onCheckedChange={(v) =>
                  set(v ? (campo.opcoes ?? []).map((x) => x.valor).filter((x) => x === o.valor || marcados.includes(x)) : marcados.filter((x) => x !== o.valor))
                }
              />
              <Label htmlFor={`${id}-${o.valor}`} className="font-normal">{o.rotulo}</Label>
            </div>
          ))}
        </div>
      );
      break;
    }
    case "condominio": {
      const c = valor as CondominioForm;
      entrada = (
        <div className="space-y-2">
          <Opcoes
            id={id}
            opcoes={[...CONDOMINIOS_COGNOPOLIS, CONDOMINIO_OUTRO].map((n) => ({ valor: n, rotulo: n }))}
            valor={c.opcao}
            onChange={(v) => set({ ...c, opcao: v })}
          />
          {c.opcao === CONDOMINIO_OUTRO && (
            <Input aria-label="Nome do condomínio" value={c.outro} onChange={(e) => set({ ...c, outro: e.target.value })} placeholder="Nome do condomínio" />
          )}
        </div>
      );
      break;
    }
    case "pessoas": {
      const p = valor as PessoasForm;
      const atualizar = (i: number, chave: "nome" | "telefone" | "vinculo", v: string) =>
        set({ ...p, lista: p.lista.map((x, j) => (j === i ? { ...x, [chave]: v } : x)) });
      entrada = (
        <div className="space-y-3">
          <Opcoes id={id} opcoes={SIM_NAO} valor={p.tem} onChange={(v) => set({ ...p, tem: v as PessoasForm["tem"] })} />
          {p.tem === "sim" && (
            <div className="space-y-3">
              {p.lista.map((pessoa, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Pessoa {i + 1}</span>
                    {p.lista.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set({ ...p, lista: p.lista.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remover
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-${i}-nome`} className="font-normal">Nome</Label>
                    <Input id={`${id}-${i}-nome`} value={pessoa.nome} onChange={(e) => atualizar(i, "nome", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-${i}-telefone`} className="font-normal">Telefone com DDD</Label>
                    <Input id={`${id}-${i}-telefone`} inputMode="tel" value={pessoa.telefone} onChange={(e) => atualizar(i, "telefone", e.target.value)} placeholder="(XX) XXXXX-XXXX" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm">Grau de vínculo</span>
                    <Opcoes id={`${id}-${i}-vinculo`} opcoes={VINCULOS} valor={pessoa.vinculo} onChange={(v) => atualizar(i, "vinculo", v)} />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => set({ ...p, lista: [...p.lista, pessoaVazia()] })}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar outra pessoa
              </Button>
            </div>
          )}
        </div>
      );
      break;
    }
    default:
      entrada = <Input id={id} value={str} onChange={(e) => set(e.target.value)} placeholder={campo.placeholder} />;
  }

  // Grupos de opções não têm um único elemento para o htmlFor.
  const temControleUnico = ["text", "textarea", "date", "idade", "cep"].includes(campo.tipo);
  return (
    <div id={`${idPrefix}campo-${campo.key}`} className={cn("space-y-2", destacarVazio && "rounded-md border border-destructive/60 p-2")}>
      {campo.introducao?.map((t) => (
        <p key={t} className="text-sm text-muted-foreground leading-relaxed">{t}</p>
      ))}
      <Label htmlFor={temControleUnico ? id : undefined} className="font-bold leading-snug">
        {campo.pergunta}
        {campo.obrigatorio ? " *" : ""}
      </Label>
      {campo.ajuda?.map((a) => (
        <p key={a} className="text-xs text-muted-foreground">{a}</p>
      ))}
      {entrada}
      {destacarVazio && <p className="text-xs text-destructive">Não preenchido neste cadastro.</p>}
    </div>
  );
};
