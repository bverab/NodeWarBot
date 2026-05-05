"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type DisabledIconActionProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  title: string;
};

export function DisabledIconAction({ ariaLabel, children, className = "", title }: DisabledIconActionProps) {
  return (
    <Button aria-label={ariaLabel} className={className} disabled title={title} type="button" variant="ghost">
      {children}
    </Button>
  );
}
