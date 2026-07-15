import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { draftCaseSummary } from "@/lib/scrb/intake-intel";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let audience: "SP" | "SHO" | "IO" = "SP";
    try {
      const body = await req.json();
      if (body?.audience && ["SP", "SHO", "IO"].includes(body.audience)) {
        audience = body.audience;
      }
    } catch {
      /* empty body ok */
    }

    const isSp = session.user.role === "SP";
    const result = await draftCaseSummary(params.id, session.user.stationId, {
      isSp,
      audience,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "DRAFT_CASE_SUMMARY",
        targetType: "CASE",
        targetId: params.id,
        details: `Draft ${audience} note generated`,
      },
    });

    return NextResponse.json({ draft: result.draft });
  } catch (error) {
    console.error("Draft error:", error);
    return NextResponse.json({ error: "Failed to draft summary" }, { status: 500 });
  }
}
