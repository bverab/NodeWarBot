import Image from "next/image";
import { ArrowRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { assets } from "@/constants/assets";
import { routes } from "@/constants/routes";
import styles from "./HeroSection.module.css";

type HeroSectionProps = {
  signedIn: boolean;
};

export function HeroSection({ signedIn }: HeroSectionProps) {
  return (
    <section className={styles.hero} id="home">
      <div className={styles.artFrame}>
        <Image
          alt="Spectre mascot surrounded by violet arcane energy over a dark fantasy landscape"
          className={styles.artImage}
          fill
          priority
          sizes="100vw"
          src={assets.landingHeroSceneShining}
        />
      </div>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <Badge>Discord bot for Black Desert Online</Badge>
          <div>
            <p className={styles.eyebrow}>War, Siege, PvE operations</p>
            <h1 className={styles.title}>
              Manage guild wars <span>through the veil.</span>
            </h1>
          </div>
          <p className={styles.description}>
            Spectre is the premium command layer for Discord-native event management: war rosters,
            siege preparation, PvE signups, recurring schedules, fillers, and role slots without
            leaving your guild server.
          </p>
          <div className={styles.actions}>
            <Button href={signedIn ? routes.guilds : routes.login}>
              {signedIn ? "Open dashboard" : "Connect Discord"}
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
            <Button href="#preview" variant="secondary">
              <Eye size={17} aria-hidden="true" />
              View preview
            </Button>
          </div>
          <div className={styles.trustRow}>
            <span>Discord-native</span>
            <span>Built for BDO guilds</span>
            <span>Web dashboard foundation</span>
          </div>
        </div>

        <div className={styles.visualLayer} aria-hidden="true">
          <div className={styles.mascotFrame}>
            <Image
              alt=""
              className={styles.mascotImage}
              fill
              priority
              sizes="(max-width: 900px) 72vw, 48vw"
              src={assets.spectreMascotBook}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
