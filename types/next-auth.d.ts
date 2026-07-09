import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      badgeId: string
      role: string
      stationId: string
      districtId: string
    }
  }

  interface User {
    id: string
    name?: string | null
    badgeId: string
    role: string
    stationId: string
    districtId: string
  }
}
