import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";
import GoogleProvider from "next-auth/providers/google";
import {
  LOCAL_ADMIN_PROVIDER_ID,
  LOCAL_ADMIN_USER_ID,
  isLocalAdminEnabled,
  verifyLocalAdminCredentials
} from "@/lib/server/localAdmin";

const providers: NextAuthOptions["providers"] = [];

if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Discord sends iss=https://discord.com on the callback (RFC 9207); openid-client rejects it unless the issuer is known.
      issuer: "https://discord.com",
      authorization: {
        params: {
          scope: "identify guilds"
        }
      }
    })
  );
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  );
}

if (isLocalAdminEnabled()) {
  providers.push(
    CredentialsProvider({
      id: LOCAL_ADMIN_PROVIDER_ID,
      name: "Local admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!verifyLocalAdminCredentials(credentials?.username, credentials?.password)) {
          return null;
        }
        return { id: LOCAL_ADMIN_USER_ID, name: String(credentials?.username).trim() };
      }
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    error: "/login"
  },
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (account?.providerAccountId) {
        token.userId = account.providerAccountId;
      }

      // Only set at sign-in; tokens issued before this field existed keep working without it.
      if (account?.provider) {
        token.provider = account.provider;
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      session.provider = typeof token.provider === "string" ? token.provider : undefined;
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    }
  }
};

export const getServerAuthSession = () => getServerSession(authOptions);
