import { getServerAuthSession } from "@/lib/auth";
import { CTASection } from "@/components/landing/CTASection";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { HeroSection } from "@/components/landing/HeroSection";
import { PlansSection } from "@/components/landing/PlansSection";
import { PreviewSection } from "@/components/landing/PreviewSection";
import { WorkflowSection } from "@/components/landing/WorkflowSection";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default async function HomePage() {
  const session = await getServerAuthSession();
  const signedIn = Boolean(session);

  return (
    <div className="page-shell">
      <SiteHeader signedIn={signedIn} />
      <main className="landing-canvas">
        <HeroSection signedIn={signedIn} />
        <FeatureGrid />
        <WorkflowSection />
        <PreviewSection />
        <PlansSection />
        <CTASection signedIn={signedIn} />
      </main>
      <SiteFooter />
    </div>
  );
}
