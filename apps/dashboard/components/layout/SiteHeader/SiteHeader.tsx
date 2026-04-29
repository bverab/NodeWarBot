"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { landingNavigation } from "@/config/navigation";
import { routes } from "@/constants/routes";
import styles from "./SiteHeader.module.css";

type SiteHeaderProps = {
  signedIn: boolean;
};

const observedSectionHrefs = ["#home", ...landingNavigation.map((item) => item.href)];

export function SiteHeader({ signedIn }: SiteHeaderProps) {
  const [activeHref, setActiveHref] = useState<string>("#home");

  useEffect(() => {
    const sections = observedSectionHrefs
      .map((href) => document.querySelector<HTMLElement>(href))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id) {
          setActiveHref(`#${visible.target.id}`);
        }
      },
      {
        rootMargin: "-28% 0px -54% 0px",
        threshold: [0.16, 0.28, 0.42]
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  function handleNavClick(href: string) {
    const section = document.querySelector(href);

    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveHref(href);
    }
  }

  function handleLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    const home = document.querySelector("#home");

    if (home) {
      event.preventDefault();
      home.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveHref("#home");
    }
  }

  return (
    <header className={styles.header}>
      <BrandLogo
        className={activeHref === "#home" ? styles.logoActive : undefined}
        href="/#home"
        onClick={handleLogoClick}
      />
      <nav className={styles.nav} aria-label="Primary navigation">
        {landingNavigation.map((item) => (
          <Link
            aria-current={activeHref !== "#home" && activeHref === item.href ? "page" : undefined}
            className={activeHref !== "#home" && activeHref === item.href ? styles.active : undefined}
            href={item.href}
            key={item.label}
            onClick={(event) => {
              event.preventDefault();
              handleNavClick(item.href);
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className={styles.actions}>
        <Button href={routes.login} variant="secondary">Log in</Button>
        <Button href={signedIn ? routes.guilds : routes.login}>Open Spectre</Button>
      </div>
    </header>
  );
}
