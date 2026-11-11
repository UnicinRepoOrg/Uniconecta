import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { SupportRecipient } from "@/components/RecipientTable";
import { CampoCadastro } from "@/components/CampoCadastro";
import {
  SECOES, camposDaSecao, campoVisivel, campoFaltando, formularioDoCadastro, formularioVazio, paraPayload, validarFormulario,
  type FormState, type ValorForm,
} from "@/lib/cadastroCampos";

type Props = {
  recipient: SupportRecipient | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<SupportRecipient>) => void;
};

// Mostra as mesmas perguntas do formulário de cadastro (cadastroCampos.ts). Os campos obrigatórios que um
// cadastro antigo não tem ficam destacados, mas não impedem salvar.
export const EditRecipientDialog = ({ recipient, open, onClose, onSave }: Props) => {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(formularioVazio);
  // Destaca só os campos obrigatórios que já estavam vazios ao abrir; um campo que aparece depois
  // (a disponibilidade de carona, ao marcar "Sim") não fica em vermelho.
  const [vaziosAoAbrir, setVaziosAoAbrir] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (recipient) {
      const inicial = formularioDoCadastro(recipient);
      setForm(inicial);
      setVaziosAoAbrir(new Set(SECOES.flatMap((s) => camposDaSecao(s.id)).filter((c) => campoFaltando(c, inicial)).map((c) => c.key)));
    }
  }, [recipient]);

  const update = (key: string, valor: ValorForm) => setForm((prev) => ({ ...prev, [key]: valor }));

  const handleSave = () => {
    if (!recipient) return;
    const erro = validarFormulario(form, "edicao");
    if (erro) {
      toast({ title: "Atenção", description: erro.mensagem, variant: "destructive" });
      return;
    }
    onSave(recipient.id, paraPayload(form) as Partial<SupportRecipient>);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="font-display">Editar Cadastro</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {SECOES.map((secao) => (
              <div key={secao.id} className="space-y-4">
                <h3 className="text-base font-semibold font-display text-foreground border-b border-border pb-1">{secao.titulo}</h3>
                {camposDaSecao(secao.id)
                  .filter((c) => campoVisivel(c, form))
                  .map((c) => (
                    <CampoCadastro
                      key={c.key}
                      campo={c}
                      form={form}
                      onChange={update}
                      idPrefix="editar-"
                      destacarVazio={vaziosAoAbrir.has(c.key) && campoFaltando(c, form)}
                    />
                  ))}
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
