import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerAuthSession();

  return (
    <main style={{ padding: 24 }}>
      <h1>NodeWarBot Dashboard</h1>
      <p>Initial web foundation using Next.js App Router and Discord login.</p>

      {session ? (
        <p>
          Signed in as <strong>{session.user?.name ?? session.user?.email ?? "Discord user"}</strong>
        </p>
      ) : (
        <p>You are not signed in.</p>
      )}

      <nav style={{ display: "flex", gap: 12 }}>
        <Link href="/login">Login</Link>
        <Link href="/guilds">Guilds</Link>
      </nav>
    </main>
  );
}
