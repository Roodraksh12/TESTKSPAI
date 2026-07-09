import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 1. Create Districts
  const districtsData = [
    'Bengaluru Urban',
    'Mysuru',
    'Belagavi',
    'Dakshina Kannada',
    'Kalaburagi',
    'Hubballi-Dharwad'
  ]

  const districts = []
  for (const name of districtsData) {
    const district = await prisma.district.create({
      data: { name }
    })
    districts.push(district)
  }

  // 2. Create Police Stations
  const stationsData = [
    { name: 'Whitefield PS', districtId: districts[0].id }, // Bengaluru Urban
    { name: 'Indiranagar PS', districtId: districts[0].id },
    { name: 'Kuvempunagar PS', districtId: districts[1].id }, // Mysuru
  ]

  const stations = []
  for (const s of stationsData) {
    const station = await prisma.policeStation.create({
      data: s
    })
    stations.push(station)
  }

  const whitefield = stations[0]

  // 3. Create Demo Officers
  const passwordHash = await bcrypt.hash('demo1234', 10)

  const officerConstable = await prisma.officer.create({
    data: {
      badgeId: 'KA-CON-1001',
      passwordHash,
      name: 'Ramesh K (Demo Constable)',
      role: 'CONSTABLE',
      stationId: whitefield.id
    }
  })

  const officerInspector = await prisma.officer.create({
    data: {
      badgeId: 'KA-INS-4471',
      passwordHash,
      name: 'Suresh V (Demo Inspector)',
      role: 'INSPECTOR',
      stationId: whitefield.id
    }
  })

  const officerSP = await prisma.officer.create({
    data: {
      badgeId: 'KA-SP-9999',
      passwordHash,
      name: 'Priya M (Demo SP)',
      role: 'SP',
      stationId: whitefield.id
    }
  })

  // 4. Create Persons (to be reused across cases)
  const p1 = await prisma.person.create({ data: { name: 'Ravi Kumar', role: 'ACCUSED', phone: '9876543210', address: '123 Main St, Whitefield' } })
  const p2 = await prisma.person.create({ data: { name: 'Sunil Rao', role: 'ACCUSED', phone: '9988776655', address: '456 Cross, Indiranagar' } })
  const p3 = await prisma.person.create({ data: { name: 'Anita D', role: 'VICTIM', phone: '9123456789', address: '789 1st Ave, Whitefield' } })

  // 5. Create Connections
  await prisma.connection.create({
    data: {
      personAId: p1.id,
      personBId: p2.id,
      relationType: 'CO_ACCUSED'
    }
  })

  // 6. Create Mock Cases for Whitefield PS
  const casesData = [
    {
      firNumber: 'FIR/2026/0001',
      stationId: whitefield.id,
      crimeType: 'Theft',
      status: 'UNDER_INVESTIGATION' as const,
      incidentDate: new Date('2026-06-15T10:00:00Z'),
      reportedDate: new Date('2026-06-16T09:00:00Z'),
      summary: 'Two-wheeler theft reported from ITPL parking lot.',
      latitude: 12.986,
      longitude: 77.737,
    },
    {
      firNumber: 'FIR/2026/0002',
      stationId: whitefield.id,
      crimeType: 'Chain Snatching',
      status: 'OPEN' as const,
      incidentDate: new Date('2026-06-20T18:30:00Z'),
      reportedDate: new Date('2026-06-20T20:00:00Z'),
      summary: 'Gold chain snatched by two men on a black motorcycle.',
      latitude: 12.971,
      longitude: 77.750,
    },
    {
      firNumber: 'FIR/2026/0003',
      stationId: whitefield.id,
      crimeType: 'Burglary',
      status: 'CHARGESHEETED' as const,
      incidentDate: new Date('2026-05-10T02:00:00Z'),
      reportedDate: new Date('2026-05-10T08:00:00Z'),
      summary: 'House break-in at night. Electronics stolen.',
      latitude: 12.965,
      longitude: 77.740,
    }
  ]

  const createdCases = []
  for (const c of casesData) {
    createdCases.push(await prisma.case.create({ data: c }))
  }

  // Link persons to cases
  await prisma.casePerson.create({ data: { caseId: createdCases[0].id, personId: p1.id, role: 'ACCUSED' } })
  await prisma.casePerson.create({ data: { caseId: createdCases[0].id, personId: p3.id, role: 'VICTIM' } })
  await prisma.casePerson.create({ data: { caseId: createdCases[2].id, personId: p2.id, role: 'ACCUSED' } })

  // 7. Create CaseMatches
  await prisma.caseMatch.create({
    data: {
      caseId: createdCases[1].id,
      matchedCaseId: createdCases[0].id,
      confidenceScore: 85.5,
      status: 'PENDING',
      reason: 'Similar MO (two men on motorcycle) and close geographical proximity.'
    }
  })

  // 8. Create Alerts
  await prisma.alert.create({
    data: {
      stationId: whitefield.id,
      type: 'HOTSPOT',
      zoneLabel: 'ITPL Back Gate',
      riskScore: 92.0,
      reason: '3 vehicle thefts in the last 14 days.'
    }
  })

  console.log('Seeding complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
