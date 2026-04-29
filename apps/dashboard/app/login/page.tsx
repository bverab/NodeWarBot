import { redirect } from "next/navigation";
import { CalendarClock, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";
import { getServerAuthSession } from "@/lib/auth";
import { getDiscordEnvStatus, getGoogleEnvStatus } from "@/lib/env";
import { routes } from "@/constants/routes";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Badge } from "@/components/ui/Badge";
import { LoginActions } from "./LoginActions";
import "./login.css";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const authErrorMessages: Record<string, string> = {
  OAuthCallback:
    "The Discord authorization session expired or could not be verified. Try again from this page.",
  OAuthSignin:
    "Spectre could not start the Discord authorization flow. Check the OAuth app configuration.",
  OAuthAccountNotLinked:
    "This Discord account is linked to a different sign-in method.",
  Configuration:
    "Discord OAuth is not configured correctly for this environment."
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerAuthSession();
  const discordEnv = getDiscordEnvStatus();
  const googleEnv = getGoogleEnvStatus();
  const showDevWarning = process.env.NODE_ENV !== "production" && !discordEnv.configured;
  const params = await searchParams;
  const authError = params?.error
    ? authErrorMessages[params.error] ?? "Authentication failed. Try signing in with Discord again."
    : undefined;

  if (session) {
    redirect(routes.guilds);
  }

  return (
    <main className="page-shell login-page">
      <section className="login-visual">
        <div className="login-sparkles" aria-hidden="true" />
        <div className="login-visual-content">
          <BrandLogo className="login-brand" size="lg" />

          <div className="section-heading login-heading">
            <Badge>Secure Discord Entry</Badge>
            <h1>Guild operations through a sharper command layer.</h1>
            <p className="section-lede">
              Authenticate with Discord, select the guild you manage, and keep event coordination
              aligned from one focused dashboard.
            </p>
          </div>

          <div className="login-floating-cards" aria-label="Spectre login status previews">
            <div className="login-floating-card login-floating-card-one">
              <ShieldCheck size={17} aria-hidden="true" />
              <div>
                <strong>Guild detected</strong>
                <span>Black Desert guild linked</span>
              </div>
            </div>
            <div className="login-floating-card login-floating-card-two">
              <CheckCircle2 size={17} aria-hidden="true" />
              <div>
                <strong>Admin access verified</strong>
                <span>Node War and Siege controls ready</span>
              </div>
            </div>
            <div className="login-floating-card login-floating-card-three">
              <CalendarClock size={17} aria-hidden="true" />
              <div>
                <strong>Node War scheduled</strong>
                <span>Tonight - 22:00 - 50 slots</span>
              </div>
            </div>
            <div className="login-floating-card login-floating-card-four">
              <UsersRound size={17} aria-hidden="true" />
              <div>
                <strong>32/50 players registered</strong>
                <span>Classes and roles synced</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <LoginActions
          authError={authError}
          discordConfigured={discordEnv.configured}
          discordMissing={discordEnv.missing}
          googleConfigured={googleEnv.configured}
          showDevWarning={showDevWarning}
        />
      </section>
    </main>
  );
}
