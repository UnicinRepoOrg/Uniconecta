// Detalhe de um cadastro no painel, montado a partir de cadastroCampos.ts.
import type { ReactNode } from "react";
import type { SupportRecipient } from "@/components/RecipientTable";
import { camposDoDetalhe } from "@/lib/cadastroCampos";
import { formatDateTime } from "@/lib/icnet";

type Props = {
  recipient: SupportRecipient;
  // Conteúdo extra logo depois de um campo (o painel põe a consulta ao ICnet depois de "Voluntário IC").
  depoisDe?: Partial<Record<string, ReactNode>>;
};

export const CadastroDetalhe = ({ recipient, depoisDe = {} }: Props) => (
  <div className="space-y-1">
    {camposDoDetalhe(recipient).map(({ campo, valor, faltando }) => (
      <div key={campo.key}>
        {(valor !== null || faltando) && (
          <div className="py-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{campo.rotulo}</span>
            {valor !== null ? (
              <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap">{valor}</p>
            ) : (
              <p className="text-sm text-destructive mt-0.5">Não preenchido</p>
            )}
          </div>
        )}
        {depoisDe[campo.key]}
      </div>
    ))}
    <div className="py-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Declaração de Ciência e Compromisso</span>
      <p className="text-sm text-foreground mt-0.5">
        {recipient.termo_aceito_em ? `Aceita em ${formatDateTime(recipient.termo_aceito_em)}` : "Sem registro (cadastro anterior à declaração)"}
      </p>
    </div>
  </div>
);
