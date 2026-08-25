/**
 * NextAuth.js Authentication Configuration
 * 
 * Provides GitHub OAuth authentication for EdgePilot AI.
 * All authentication logic is server-side only.
 * 
 * @module src/app/api/auth/[...nextauth]/route
 */

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

const handler = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
});

export { handler as GET, handler as POST };
