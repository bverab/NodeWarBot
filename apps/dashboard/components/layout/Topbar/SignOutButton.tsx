"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { routes } from "@/constants/routes";
import { Button } from "@/components/ui/Button";

export function SignOutButton() {
  return (
    <Button
      onClick={() => {
        void signOut({ callbackUrl: routes.login });
      }}
      type="button"
      variant="ghost"
    >
      <LogOut size={16} aria-hidden="true" />
      Sign out
    </Button>
  );
}
