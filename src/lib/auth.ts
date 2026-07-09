import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import prisma from "@/lib/prisma"
import bcrypt from "bcrypt"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Badge ID",
      credentials: {
        badgeId: { label: "Badge ID", type: "text", placeholder: "KA-INS-4471" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.badgeId || !credentials?.password) return null

        const officer = await prisma.officer.findUnique({
          where: { badgeId: credentials.badgeId },
          include: { station: true }
        })

        if (!officer) return null

        const isPasswordValid = await bcrypt.compare(credentials.password, officer.passwordHash)

        if (!isPasswordValid) return null

        return {
          id: officer.id,
          name: officer.name,
          badgeId: officer.badgeId,
          role: officer.role,
          stationId: officer.stationId,
          districtId: officer.station.districtId
        }
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.badgeId = (user as any).badgeId
        token.role = (user as any).role
        token.stationId = (user as any).stationId
        token.districtId = (user as any).districtId
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.badgeId = token.badgeId as string
        session.user.role = token.role as string
        session.user.stationId = token.stationId as string
        session.user.districtId = token.districtId as string
      }
      return session
    }
  },
  pages: {
    signIn: "/login",
  },
}
