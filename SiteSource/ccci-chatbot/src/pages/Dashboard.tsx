import { useEffect, useState } from "react";
import { getRecipients, updateRecipient, updateStatus as apiUpdateStatus, deleteRecipient, checkIcnet, ApiError } from "@/lib/api";
import { icnetSituation, compareNames, NAME_MATCH_LABEL, formatDateTime } from "@/lib/icnet";
import { clearToken } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Check, X, Eye, Pencil, Trash2, RefreshCw } from "lucide-react";
import type { SupportRecipient } from "@/components/RecipientTable";
import { EditRecipientDialog } from "@/components/EditRecipientDialog";

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  value ? (
    <div className="py-2 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  ) : null
);

// Situação no ICnet; "· nome diferente" chama a atenção quando o nome devolvido não bate com o do cadastro.
const IcnetBadge = ({ r }: { r: SupportRecipient }) => {
  const situation = icnetSituation(r);
  const match = compareNames(r.nome_completo, r.icnet_nomes);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge variant={situation.variant} className="whitespace-nowrap">{situation.label}</Badge>
      {match === "diferente" && <span className="text-xs text-destructive">nome diferente</span>}
    </div>
  );
};

const Dashboard = () => {
  const [recipients, setRecipients] = useState<SupportRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SupportRecipient | null>(null);
  const [editing, setEditing] = useState<SupportRecipient | null>(null);
  const [deleting, setDeleting] = useState<SupportRecipient | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError && err.status === 401) {
      clearToken();
      navigate("/login");
      return;
    }
    toast({ title: "Erro", description: err instanceof ApiError ? err.message : fallback, variant: "destructive" });
  };

  const fetchRecipients = async () => {
    try {
      setRecipients((await getRecipients()) || []);
    } catch (err) {
      handleApiError(err, "Não foi possível carregar os cadastros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRecipients(); }, []);

  const handleLogout = () => {
    clearToken();
    navigate("/login");
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await apiUpdateStatus(id, status);
      toast({ title: "Atualizado", description: status === "approved" ? "Cadastro aprovado!" : "Cadastro não aprovado." });
      fetchRecipients();
    } catch (err) {
      handleApiError(err, "Não foi possível atualizar o status.");
    }
  };

  const handleEdit = async (id: string, data: Partial<SupportRecipient>) => {
    try {
      await updateRecipient(id, data);
      toast({ title: "Salvo", description: "Cadastro atualizado com sucesso." });
      setEditing(null);
      fetchRecipients();
    } catch (err) {
      handleApiError(err, "Não foi possível salvar o cadastro.");
    }
  };

  const handleIcnetCheck = async (r: SupportRecipient) => {
    setCheckingId(r.id);
    try {
      const updated = await checkIcnet(r.id);
      setRecipients((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      setSelected((current) => (current && current.id === updated.id ? updated : current));
      if (updated.icnet_erro) {
        toast({ title: "Consulta ao ICnet", description: updated.icnet_erro, variant: "destructive" });
      } else {
        toast({ title: "Consulta ao ICnet", description: icnetSituation(updated).label });
      }
    } catch (err) {
      handleApiError(err, "Não foi possível consultar o ICnet.");
    } finally {
      setCheckingId(null);
    }
  };

  const icnetButton = (r: SupportRecipient) => (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleIcnetCheck(r)}
      disabled={checkingId === r.id} title="Consultar ICnet">
      <RefreshCw className={`h-4 w-4 ${checkingId === r.id ? "animate-spin" : ""}`} />
    </Button>
  );

  const handleDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    try {
      await deleteRecipient(id);
      toast({ title: "Removido", description: "Cadastro excluído da base." });
      setDeleting(null);
      fetchRecipients();
    } catch (err) {
      handleApiError(err, "Não foi possível excluir o cadastro.");
    }
  };

  const approved = recipients.filter((r) => r.status === "approved");
  const pending = recipients.filter((r) => r.status !== "approved");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-bold font-display text-foreground">CCCI Unicin — Admin</h1>
            <p className="text-sm text-muted-foreground">Aprovação de cadastros de apoio</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Pendentes */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display">Pendentes de Aprovação ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : pending.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum cadastro pendente.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>IC</TableHead>
                      <TableHead>ICnet</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.nome_completo}</TableCell>
                        <TableCell className="text-muted-foreground">{r.whatsapp}</TableCell>
                        <TableCell className="text-muted-foreground">{r.voluntario_ic}</TableCell>
                        <TableCell><IcnetBadge r={r} /></TableCell>
                        <TableCell>
                          <Badge variant={r.status === "rejected" ? "destructive" : "secondary"}>
                            {r.status === "rejected" ? "Não Aprovado" : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected(r)} title="Ver detalhes">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(r)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {icnetButton(r)}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:text-success" onClick={() => updateStatus(r.id, "approved")} title="Aprovar">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => updateStatus(r.id, "rejected")} title="Não Aprovar">
                              <X className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(r)} title="Remover da base">
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

        {/* Aprovados */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display">Aprovados ({approved.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {approved.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum cadastro aprovado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>IC</TableHead>
                      <TableHead>ICnet</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approved.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.nome_completo}</TableCell>
                        <TableCell className="text-muted-foreground">{r.whatsapp}</TableCell>
                        <TableCell className="text-muted-foreground">{r.voluntario_ic}</TableCell>
                        <TableCell><IcnetBadge r={r} /></TableCell>
                        <TableCell><Badge variant="default">Aprovado</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSelected(r)} title="Ver detalhes">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(r)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {icnetButton(r)}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => updateStatus(r.id, "rejected")} title="Revogar">
                              <X className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(r)} title="Remover da base">
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
      </main>

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
                <div className="py-2 border-b border-border/50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Consulta ao ICnet</span>
                    <Button size="sm" variant="outline" onClick={() => handleIcnetCheck(selected)} disabled={checkingId === selected.id}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checkingId === selected.id ? "animate-spin" : ""}`} />
                      Consultar ICnet
                    </Button>
                  </div>
                  <div className="mt-1 space-y-1 text-sm">
                    <Badge variant={icnetSituation(selected).variant}>{icnetSituation(selected).label}</Badge>
                    {selected.icnet_consultado_em && (
                      <>
                        <p>
                          <span className="text-muted-foreground">ICs no ICnet: </span>
                          {selected.icnet_ics && selected.icnet_ics.length > 0
                            ? selected.icnet_ics.map((ic) => `${ic.sigla} (${ic.ativo ? "ativo" : "inativo"})`).join(", ")
                            : "nenhuma"}
                        </p>
                        <p>
                          <span className="text-muted-foreground">Nome no ICnet: </span>
                          {selected.icnet_nomes && selected.icnet_nomes.length > 0
                            ? `${selected.icnet_nomes.join(" / ")} — ${NAME_MATCH_LABEL[compareNames(selected.nome_completo, selected.icnet_nomes) ?? "diferente"]}`
                            : "não informado pelo ICnet"}
                        </p>
                        <p className="text-xs text-muted-foreground">Consultado em {formatDateTime(selected.icnet_consultado_em)}</p>
                      </>
                    )}
                    {selected.icnet_erro && (
                      <p className="text-xs text-destructive">
                        {selected.icnet_erro} ({formatDateTime(selected.icnet_erro_em)})
                      </p>
                    )}
                  </div>
                </div>
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

      <EditRecipientDialog
        recipient={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSave={handleEdit}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto remove <strong>{deleting?.nome_completo}</strong> permanentemente da base de dados.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;
