import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import type { SupportRecipient } from "@/components/RecipientTable";

type Props = {
  recipient: SupportRecipient | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<SupportRecipient>) => void;
};

const fields: { key: keyof SupportRecipient; label: string; type?: "text" | "number" | "boolean" }[] = [
  { key: "nome_completo", label: "Nome Completo" },
  { key: "nome_preferido", label: "Como prefere ser chamado(a)" },
  { key: "idade", label: "Idade", type: "number" },
  { key: "endereco", label: "Endereço" },
  { key: "bairro", label: "Bairro" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voluntario_ic", label: "Voluntário IC" },
  { key: "mora_sozinho", label: "Mora sozinho", type: "boolean" },
  { key: "plano_saude", label: "Plano de Saúde" },
  { key: "hospital_preferencia", label: "Hospital de Preferência" },
  { key: "cadastro_ubs", label: "Cadastro UBS" },
  { key: "profissional_saude", label: "Profissional de Saúde" },
  { key: "alergia_intolerancia", label: "Alergias / Intolerâncias" },
  { key: "tipo_sanguineo", label: "Tipo Sanguíneo" },
  { key: "medicacao_continua", label: "Medicação Contínua" },
  { key: "tem_pet", label: "Pet" },
  { key: "contato_familia", label: "Contato Familiar" },
  { key: "contato_ccci", label: "Contato CCCI" },
  { key: "pessoa_chaves", label: "Pessoa com chaves" },
];

export const EditRecipientDialog = ({ recipient, open, onClose, onSave }: Props) => {
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (recipient) {
      const data: Record<string, any> = {};
      fields.forEach((f) => { data[f.key] = recipient[f.key] ?? ""; });
      setForm(data);
    }
  }, [recipient]);

  const handleSave = () => {
    if (!recipient) return;
    const cleaned: Record<string, any> = {};
    fields.forEach((f) => {
      const val = form[f.key];
      if (f.type === "number") {
        cleaned[f.key] = Number(val) || 0;
      } else if (f.type === "boolean") {
        cleaned[f.key] = val;
      } else {
        cleaned[f.key] = val === "" ? null : String(val).trim();
      }
    });
    onSave(recipient.id, cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-display">Editar Cadastro</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{f.label}</Label>
                {f.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={!!form[f.key]} onCheckedChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))} />
                    <span className="text-sm text-foreground">{form[f.key] ? "Sim" : "Não"}</span>
                  </div>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
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
