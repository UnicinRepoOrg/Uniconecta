import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Heart, Shield } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

const Landing = () => (
  <div className="min-h-screen bg-background flex flex-col">
    <header className="border-b border-border bg-card py-4 px-4">
      <div className="container mx-auto flex items-center gap-3">
        <img
          src="/logo-uniconecta.png"
          alt="UniConecta CCCI — Rede de Apoio para os Voluntários"
          className="h-14 w-14 object-contain"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <div>
          <h1 className="text-xl font-bold font-display text-foreground">CCCI Unicin</h1>
          <p className="text-sm text-muted-foreground">Comunidade Cosmoética Internacional</p>
        </div>
      </div>
    </header>

    <main className="flex-1 flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <img
          src="/logo-uniconecta.png"
          alt="UniConecta CCCI — Rede de Apoio para os Voluntários"
          className="mx-auto h-32 w-32 object-contain"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <h2 className="text-3xl font-bold font-display text-foreground">
          Bem-vindo à Rede de Apoio CCCI
        </h2>
        <p className="text-muted-foreground">
          Se você deseja se cadastrar na Rede de Apoio, clique em <strong className="text-foreground">"Quero me cadastrar na Rede de Apoio"</strong> abaixo.
        </p>

        <div className="space-y-3 pt-4">
          <Button asChild className="w-full h-16 text-base" size="lg">
            <Link to="/cadastro">
              <Heart className="h-5 w-5 mr-2" />
              Quero me cadastrar na Rede de Apoio
            </Link>
          </Button>

          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-foreground">
            ⚠️ O cadastro é exclusivo para <strong>voluntários(as) da Conscienciologia residentes em Foz do Iguaçu</strong>. Se você não atende a esses dois critérios, por favor não realize o cadastro.
          </div>

          <div className="pt-4">
            <Button asChild variant="outline" className="w-full h-12 text-sm" size="lg">
              <Link to="/login">
                <Shield className="h-4 w-4 mr-2" />
                Área Administrativa (somente equipe)
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>

    <SiteFooter />
  </div>
);

export default Landing;
