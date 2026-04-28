import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Eye, LogIn, ShieldCheck } from "lucide-react";
import { getServerAuthSession } from "@/lib/auth";
import { getDiscordEnvStatus } from "@/lib/env";
import { assets } from "@/constants/assets";
import { routes } from "@/constants/routes";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function LoginPage() {
  const session = await getServerAuthSession();
  const discordEnv = getDiscordEnvStatus();

  if (session) {
    redirect(routes.guilds);
  }

  return (
    <main className="page-shell login-page">
      <section className="login-visual">
        <Link className="brand-mark" href="/">
          <span className="brand-glyph">S</span>
          <span>Spectre</span>
        </Link>
        <div className="section-heading">
          <Badge>Secure Discord entry</Badge>
          <h1>Enter the guild command layer.</h1>
          <p className="section-lede">
            Spectre uses Discord OAuth to identify you and read the guilds you can access. Tokens
            stay server-side.
          </p>
        </div>
        <Card>
          <div className="login-mascot-card">
            <div className="login-mascot-visual">
              <Image
                alt="Spectre mascot brand artwork"
                fill
                sizes="180px"
                src={assets.spectreMascotHero}
              />
            </div>
            <div>
              <ShieldCheck size={24} aria-hidden="true" />
              <h3>Current access</h3>
              <p>Guild selection is available now. Admin permission checks are still conservative.</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <Badge tone="muted">Discord OAuth</Badge>
          <h1>Sign in</h1>
          <p>
            Connect with Discord to load your guild list. Web event editing, publishing, and PvE
            management are coming later.
          </p>
          {!discordEnv.configured ? (
            <Card className="developer-warning">
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <h3>Discord OAuth is not configured</h3>
                <p>Missing: {discordEnv.missing.join(", ")}</p>
              </div>
            </Card>
          ) : null}
          <Button href={discordEnv.configured ? routes.discordSignIn : routes.guildsPreview}>
            {discordEnv.configured ? <LogIn size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            {discordEnv.configured ? "Continue with Discord" : "Browse preview mode"}
          </Button>
          <Button href={routes.guildsPreview} variant="secondary">
            <Eye size={17} aria-hidden="true" />
            Preview dashboard UI
          </Button>
          <Button href={routes.home} variant="ghost">
            Back to Spectre
          </Button>
        </div>
      </section>
    </main>
  );
}
