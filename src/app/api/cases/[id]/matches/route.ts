import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateMatchStatus } from "@/lib/scrb/intake-intel";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { matchId, status } = body as {
      matchId?: string;
      status?: "CONFIRMED" | "REJECTED";
    };

    if (!matchId || !status || !["CONFIRMED", "REJECTED"].includes(status)) {
      return NextResponse.json(
        { error: "matchId and status (CONFIRMED|REJECTED) required" },
        { status: 400 }
      );
    }

    const isSp = session.user.role === "SP";
    const result = await updateMatchStatus(
      matchId,
      status,
      session.user.id,
      session.user.stationId,
      isSp
    );

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Ensure match belongs to this case
    if (result.match.caseId !== params.id) {
      return NextResponse.json({ error: "Match does not belong to this case" }, { status: 400 });
    }

    return NextResponse.json({ success: true, match: result.match });
  } catch (error) {
    console.error("Match update error:", error);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
