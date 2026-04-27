import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getServerAuthSession();

  if (session) {
    redirect("/guilds");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Login</h1>
      <p>Sign in with Discord to access your guild list.</p>
      <Link href="/api/auth/signin/discord?callbackUrl=/guilds">Continue with Discord</Link>
    </main>
  );
}
