import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { assets } from "@/constants/assets";
import { routes } from "@/constants/routes";
import styles from "./CTASection.module.css";

type CTASectionProps = {
  signedIn: boolean;
};

export function CTASection({ signedIn }: CTASectionProps) {
  return (
    <section className={`${styles.section} container`}>
      <div className={styles.band}>
        <div className={styles.mascot} aria-hidden="true">
          <Image
            alt=""
            fill
            sizes="180px"
            src={assets.spectreMascotHero}
          />
        </div>
        <div>
          <Badge>Spectre foundation</Badge>
          <h2>Open the first dashboard shell.</h2>
          <p className={styles.lede}>Event editing and publishing from web are not enabled yet.</p>
        </div>
        <div className={styles.actions}>
          <Button href={signedIn ? routes.guilds : routes.login}>Enter dashboard</Button>
          <Button href={routes.guildsPreview} variant="secondary">
            Preview UI
          </Button>
          <Button href={routes.discordSignIn} variant="secondary">
            Discord login
          </Button>
        </div>
      </div>
    </section>
  );
}
