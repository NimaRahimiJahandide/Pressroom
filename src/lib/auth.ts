/**
 * auth.ts
 * =======
 * Minimal session helper — stub for development.
 * Returns { userId } if a session exists, null otherwise.
 *
 * Production options (pick one and remove the stub below):
 *   - NextAuth.js / Auth.js (next-auth)
 *   - Lucia Auth
 *   - Clerk
 *   - Supabase Auth
 *
 * The rest of the app only calls getServerSession(),
 * so swapping providers is a one-file change.
 */

import { cookies } from 'next/headers';

type Session = {
  userId: string;
};

/**
 * Read the session from a cookie / JWT / DB lookup.
 * This is a dev stub — replaces with real auth later.
 */
export async function getServerSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session');

  if (!sessionToken?.value) {
    return null;
  }

  // ── Dev stub: treat cookie value as userId directly ──
  // In production, verify the JWT / lookup session in DB here.
  return { userId: sessionToken.value };
}