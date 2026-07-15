import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { CaseCard } from "@/components/scrb/case-ledger";
import { CasesFilter } from "@/components/scrb/cases-filter";
import { Prisma } from "@prisma/client";

export default async function CasesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  // Fetch all stations for the filter dropdown
  const stations = await prisma.policeStation.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Build the where clause based on search params
  const where: Prisma.CaseWhereInput = {};

  const crimeType = searchParams.crimeType;
  if (typeof crimeType === "string" && crimeType !== "All Crimes") {
    where.crimeType = crimeType;
  }

  const stationId = searchParams.stationId;
  if (typeof stationId === "string" && stationId !== "all") {
    where.stationId = stationId;
  }

  const dateParam = searchParams.date;
  if (typeof dateParam === "string" && dateParam !== "all") {
    const now = new Date();
    let startDate = new Date();
    if (dateParam === "today") {
      startDate.setHours(0, 0, 0, 0);
    } else if (dateParam === "week") {
      startDate.setDate(now.getDate() - 7);
    } else if (dateParam === "month") {
      startDate.setMonth(now.getMonth() - 1);
    }
    
    if (dateParam !== "all") {
      where.reportedDate = {
        gte: startDate,
      };
    }
  }

  const q = searchParams.q;
  if (typeof q === "string" && q.trim().length > 0) {
    where.OR = [
      { firNumber: { contains: q } },
      { summary: { contains: q } },
      { casePersons: { some: { person: { name: { contains: q } } } } }
    ];
  }

  const cases = await prisma.case.findMany({
    where,
    orderBy: { reportedDate: "desc" },
    include: {
      casePersons: {
        include: { person: true },
      },
      station: true,
    },
  });

  // Format cases for the CaseCard component
  const formattedCases = cases.map(c => ({
    ...c,
    station: c.station.name,
  }));

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Cases Directory
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse, filter, and manage all registered cases.
        </p>
      </div>

      <CasesFilter stations={stations} />

      {formattedCases.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface-2 shadow-sm">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">No cases found matching your filters.</p>
            <p className="text-xs text-muted-foreground/60">Try adjusting your search or filter criteria.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {formattedCases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}
