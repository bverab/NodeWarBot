import { getServerAuthSession } from "@/lib/auth";
import { CTASection } from "@/components/landing/CTASection";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { HeroSection } from "@/components/landing/HeroSection";
import { PreviewSection } from "@/components/landing/PreviewSection";
import { WorkflowSection } from "@/components/landing/WorkflowSection";
import { SiteHeader } from "@/components/layout/SiteHeader";

export default async function HomePage() {
  const session = await getServerAuthSession();
  const signedIn = Boolean(session);

  return (
    <div className="page-shell">
      <SiteHeader signedIn={signedIn} />
      <main>
        <HeroSection signedIn={signedIn} />
        <FeatureGrid />
        <PreviewSection />
        <WorkflowSection />
        <CTASection signedIn={signedIn} />
      </main>
    </div>
  );
}
