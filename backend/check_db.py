import psycopg

conn_str = 'postgresql://postgres.njpodfktpkuwzjclwrwo:Somik.dmas17@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
with psycopg.connect(conn_str) as conn:
    with conn.cursor() as cur:
        cur.execute('SELECT c.id, c."stationId", ps."districtId" FROM "Case" c LEFT JOIN "PoliceStation" ps ON c."stationId" = ps.id')
        rows = cur.fetchall()
        for r in rows:
            if not r[1] or not r[2]:
                print(f"Case {r[0]} missing station or district: {r}")
        print("Total cases:", len(rows))
