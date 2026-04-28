import Image from "next/image";
import Link from "next/link";
import { assets } from "@/constants/assets";
import { routes } from "@/constants/routes";
import styles from "./BrandLogo.module.css";

type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "" }: BrandLogoProps) {
  return (
    <Link className={`${styles.logo} ${className}`.trim()} href={routes.home}>
      <Image
        alt=""
        aria-hidden="true"
        className={styles.symbol}
        height={72}
        priority
        src={assets.spectreSymbolMark}
        width={72}
      />
      <Image
        alt="Spectre"
        className={styles.wordmark}
        height={26}
        priority
        src={assets.spectreWordmark}
        width={120}
      />
    </Link>
  );
}
