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
import { CadastroDetalhe } from "@/components/CadastroDetalhe";
import type { PessoaVinculada } from "@/lib/api";

export type SupportRecipient = {
  id: string;
  created_at: string;
  updated_at: string;
  status: string;
  nome_completo: string;
  // Obrigatório desde o cadastro de 11/2026; cadastros antigos podem não ter.
  nome_preferido: string | null;
  // "AAAA-MM-DD". Cadastros antigos têm só a idade; com a data, a API recalcula a idade a cada leitura.
  data_nascimento?: string | null;
  idade: number | null;
  endereco: string;
  bairro: string;
  condominio?: string | null;
  cep?: string | null;
  whatsapp: string;
  voluntario_ic: string;
  mora_sozinho: boolean;
  // Lista vazia = respondeu "Não"; ausente/null = não respondeu (cadastros antigos).
  pessoas_vinculadas?: PessoaVinculada[] | null;
  // O BOT usa possui_carro para avisar primeiro quem tem carro nos pedidos de carona.
  possui_carro?: boolean | null;
  carona_disponibilidade?: string | null;
  carona_regiao?: string | null;
  carona_dias?: string[];
  carona_periodo?: string[];
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
  // Data/hora em que a Declaração de Ciência e Compromisso foi aceita (gravada pela API).
  termo_aceito_em?: string | null;
  // Consulta ao ICnet (gravada pelo backend; ausente em cadastros nunca consultados).
  icnet_voluntario?: boolean;
  icnet_ativo?: boolean;
  icnet_ics?: { sigla: string; ativo: boolean }[];
  icnet_nomes?: string[];
  icnet_consultado_em?: string | null;
  icnet_erro?: string | null;
  icnet_erro_em?: string | null;
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
              <CadastroDetalhe recipient={selected} />
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
