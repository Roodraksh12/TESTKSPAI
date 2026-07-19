from app.services.db import fetch_all, fetch_one

rows = fetch_all('SELECT "badgeId", name, role FROM "Officer" LIMIT 5')
print("officers:", rows)

tables = fetch_all(
    """
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
    """
)
print("tables:", [t["table_name"] for t in tables])
