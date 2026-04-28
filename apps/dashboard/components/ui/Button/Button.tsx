import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, href, variant = "primary", className = "", ...props }: ButtonProps) {
  const classes = `${styles.button} ${styles[variant]} ${className}`.trim();

  if (href) {
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
