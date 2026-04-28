import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  padded?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function Card({ children, padded = true, className = "", ...props }: CardProps) {
  const classes = `${styles.card} ${padded ? styles.padded : ""} ${className}`.trim();

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
