import { useEffect, useState } from "react";
import { getStageVersion } from "@/lib/api";

// Monta o texto da versão: o número do estágio (quando há) antes da versão do
// software, e o nome do estágio na frente fora da produção.
//   prod-2 → "v2.1.27"     dev → "dev · v1.27"
// Sem resposta da API, mostra só a versão do software.
export const versionLabel = (stage: string | null, stageVersion: string | null, appVersion: string) => {
  const number = stageVersion ? `${stageVersion}.${appVersion}` : appVersion;
  return stage && stage !== "prod" ? `${stage} · v${number}` : `v${number}`;
};

const SiteFooter = () => {
  const [label, setLabel] = useState(versionLabel(null, null, __APP_VERSION__));

  useEffect(() => {
    getStageVersion()
      .then((r) => setLabel(versionLabel(r.stage, r.version, __APP_VERSION__)))
      .catch(() => undefined);
  }, []);

  return (
    <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
      CCCI Unicin © {new Date().getFullYear()} · {label}
    </footer>
  );
};

export default SiteFooter;
