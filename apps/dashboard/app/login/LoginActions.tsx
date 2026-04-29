"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { AlertTriangle, ChevronRight, LockKeyhole, Mail, MessageCircle, Sparkles, UserRound } from "lucide-react";
import { routes } from "@/constants/routes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type LoginActionsProps = {
  discordConfigured: boolean;
  discordMissing: string[];
  googleConfigured: boolean;
  authError?: string;
  showDevWarning: boolean;
};

export function LoginActions({
  authError,
  discordConfigured,
  discordMissing,
  googleConfigured,
  showDevWarning
}: LoginActionsProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [classicMessage, setClassicMessage] = useState("");
  const isRegister = authMode === "register";

  function handleClassicSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClassicMessage("Classic accounts are not enabled yet.");
  }

  function switchMode(nextMode: "login" | "register") {
    setAuthMode(nextMode);
    setClassicMessage("");
  }

  return (
    <div className="login-panel-inner">
      <div className="login-panel-copy">
        <span className="login-panel-kicker">Discord-first access</span>
        <h1>Welcome to Spectre</h1>
        <p>
          {isRegister
            ? "Create access for your Discord guild event workspace."
            : "Sign in to manage your Discord guild events."}
        </p>
      </div>

      {showDevWarning ? (
        <Card className="developer-warning">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h3>Discord OAuth is not configured</h3>
            <p>Missing: {discordMissing.join(", ")}</p>
          </div>
        </Card>
      ) : null}

      {authError ? (
        <Card className="oauth-error">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <h3>Discord sign-in could not be completed</h3>
            <p>{authError}</p>
          </div>
        </Card>
      ) : null}

      <div className="oauth-stack">
        <Button
          className="login-oauth-button login-oauth-button-primary"
          disabled={!discordConfigured}
          onClick={() => {
            if (discordConfigured) {
              void signIn("discord", { callbackUrl: routes.guilds });
            }
          }}
          type="button"
        >
          <MessageCircle size={18} aria-hidden="true" />
          Continue with Discord
          <ChevronRight size={17} aria-hidden="true" />
        </Button>

        <Button
          className="login-oauth-button"
          disabled={!googleConfigured}
          onClick={() => {
            if (googleConfigured) {
              void signIn("google", { callbackUrl: routes.guilds });
            }
          }}
          type="button"
          variant="secondary"
        >
          <Sparkles size={17} aria-hidden="true" />
          {googleConfigured ? "Continue with Google" : "Google coming soon"}
        </Button>
      </div>

      <div className="login-divider">
        <span>or</span>
      </div>

      <form className="classic-login-form" onSubmit={handleClassicSubmit}>
        {isRegister ? (
          <label className="login-field">
            <span>Name</span>
            <span className="login-input-shell">
              <UserRound size={16} aria-hidden="true" />
              <input autoComplete="name" name="name" placeholder="Your name" type="text" />
            </span>
          </label>
        ) : null}

        <label className="login-field">
          <span>Email</span>
          <span className="login-input-shell">
            <Mail size={16} aria-hidden="true" />
            <input autoComplete="email" name="email" placeholder="you@example.com" type="email" />
          </span>
        </label>

        <label className="login-field">
          <span>Password</span>
          <span className="login-input-shell">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              name="password"
              placeholder="Enter your password"
              type="password"
            />
          </span>
        </label>

        {isRegister ? (
          <label className="login-field">
            <span>Confirm password</span>
            <span className="login-input-shell">
              <LockKeyhole size={16} aria-hidden="true" />
              <input
                autoComplete="new-password"
                name="confirmPassword"
                placeholder="Confirm your password"
                type="password"
              />
            </span>
          </label>
        ) : (
          <div className="login-form-row">
            <label className="remember-control">
              <input name="remember" type="checkbox" />
              <span>Remember me</span>
            </label>
            <button className="login-text-button" type="button">
              Forgot password?
            </button>
          </div>
        )}

        {classicMessage ? <p className="classic-login-message">{classicMessage}</p> : null}

        <Button className="login-submit-button" type="submit">
          {isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="login-create-account">
        {isRegister ? "Already have an account? " : "New to Spectre? "}
        <button
          className="login-text-button"
          onClick={() => switchMode(isRegister ? "login" : "register")}
          type="button"
        >
          {isRegister ? "Sign in" : "Create account"}
        </button>
      </p>
    </div>
  );
}
