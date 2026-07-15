import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildCaseIntakeBrief } from "@/lib/scrb/intake-intel";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isSp = session.user.role === "SP";
    const brief = await buildCaseIntakeBrief(params.id, session.user.stationId, { isSp });

    if ("error" in brief) {
      return NextResponse.json({ error: brief.error }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        officerId: session.user.id,
        action: "CASE_INTAKE",
        targetType: "CASE",
        targetId: params.id,
        details: `Intake brief generated for ${brief.firNumber}`,
      },
    });

    return NextResponse.json({ intake: brief });
  } catch (error) {
    console.error("Intake error:", error);
    return NextResponse.json({ error: "Failed to build intake brief" }, { status: 500 });
  }
}
