import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ cases: [], suspects: [] });
  }

  const words = q.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    return NextResponse.json({ cases: [], suspects: [] });
  }

  try {
    const caseOrConditions = words.flatMap((w) => [
      { firNumber: { contains: w, mode: "insensitive" } as any },
      { summary: { contains: w, mode: "insensitive" } as any },
    ]);

    const casesPromise = prisma.case.findMany({
      where: {
        OR: caseOrConditions,
      },
      take: 8,
      include: {
        station: true,
      }
    });

    const suspectOrConditions = words.flatMap((w) => [
      { name: { contains: w, mode: "insensitive" } as any },
      { phone: { contains: w, mode: "insensitive" } as any },
    ]);

    const suspectsPromise = prisma.person.findMany({
      where: {
        OR: suspectOrConditions,
      },
      take: 8,
      include: {
        casePersons: {
          include: {
            case: true
          }
        }
      }
    });

    const [cases, suspects] = await Promise.all([casesPromise, suspectsPromise]);

    return NextResponse.json({ cases, suspects });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
