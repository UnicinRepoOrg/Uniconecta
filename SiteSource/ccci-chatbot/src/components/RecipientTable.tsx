import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export type SupportRecipient = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  nome_completo: string;
  nome_preferido: string | null;
  idade: number;
  endereco: string;
  bairro: string;
  whatsapp: string;
  voluntario_ic: string;
  mora_sozinho: boolean;
  plano_saude: string | null;
  hospital_preferencia: string | null;
  tem_pet: string | null;
  cadastro_ubs: string | null;
  contato_familia: string;
  contato_ccci: string;
  pessoa_chaves: string | null;
  profissional_saude: string | null;
  alergia_intolerancia: string | null;
  tipo_sanguineo: string | null;
  medicacao_continua: string | null;
};

type Props = {
  recipients: SupportRecipient[];
  loading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    approved: { label: "Aprovado", variant: "default" },
    pending: { label: "Pendente", variant: "secondary" },
    rejected: { label: "Rejeitado", variant: "destructive" },
  };
  const s = map[status] || { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div className="py-2 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  ) : null
);

export const RecipientTable = ({ recipients, loading, onApprove, onReject, onDelete }: Props) => {
  const [selected, setSelected] = useState<SupportRecipient | null>(null);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-display">Cadastros de Apoio</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : recipients.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum cadastro ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>WhatsApp</TableHead>
                    <TableHead>IC</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome_completo}</TableCell>
                      <TableCell className="text-muted-foreground">{r.whatsapp}</TableCell>
                      <TableCell className="text-muted-foreground">{r.voluntario_ic}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected(r)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {r.status !== "approved" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:text-success" onClick={() => onApprove(r.id)} title="Aprovar">
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {r.status !== "rejected" && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onReject(r.id)} title="Rejeitar">
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => onDelete(r.id)} title="Remover">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="font-display">{selected?.nome_completo}</DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-1">
                <DetailRow label="Como prefere ser chamado(a)" value={selected.nome_preferido} />
                <DetailRow label="Idade" value={String(selected.idade)} />
                <DetailRow label="Endereço" value={selected.endereco} />
                <DetailRow label="Bairro" value={selected.bairro} />
                <DetailRow label="WhatsApp" value={selected.whatsapp} />
                <DetailRow label="Voluntário IC" value={selected.voluntario_ic} />
                <DetailRow label="Mora sozinho" value={selected.mora_sozinho ? "Sim" : "Não"} />
                <DetailRow label="Plano de Saúde" value={selected.plano_saude} />
                <DetailRow label="Hospital de preferência" value={selected.hospital_preferencia} />
                <DetailRow label="Cadastro UBS" value={selected.cadastro_ubs} />
                <DetailRow label="Profissional de Saúde" value={selected.profissional_saude} />
                <DetailRow label="Alergias / Intolerâncias" value={selected.alergia_intolerancia} />
                <DetailRow label="Tipo Sanguíneo" value={selected.tipo_sanguineo} />
                <DetailRow label="Medicação Contínua" value={selected.medicacao_continua} />
                <DetailRow label="Pet" value={selected.tem_pet} />
                <DetailRow label="Contato Familiar" value={selected.contato_familia} />
                <DetailRow label="Contato CCCI" value={selected.contato_ccci} />
                <DetailRow label="Pessoa com chaves" value={selected.pessoa_chaves} />
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
