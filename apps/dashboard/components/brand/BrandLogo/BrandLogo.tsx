import Image from "next/image";
import Link from "next/link";
import type { MouseEventHandler } from "react";
import { assets } from "@/constants/assets";
import { routes } from "@/constants/routes";
import styles from "./BrandLogo.module.css";

type BrandLogoProps = {
  className?: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
};

export function BrandLogo({
  className = "",
  href = routes.home,
  onClick,
  showText = true,
  size = "md"
}: BrandLogoProps) {
  return (
    <Link className={`${styles.logo} ${styles[size]} ${className}`.trim()} href={href} onClick={onClick}>
      <Image
        alt=""
        aria-hidden="true"
        className={styles.symbol}
        height={72}
        priority
        src={assets.spectreSymbolMark}
        width={72}
      />
      {showText ? (
        <Image
          alt="Spectre"
          className={styles.wordmark}
          height={26}
          priority
          src={assets.spectreWordmark}
          width={120}
        />
      ) : null}
    </Link>
  );
}
