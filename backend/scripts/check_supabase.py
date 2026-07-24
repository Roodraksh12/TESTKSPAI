from app.services.db import fetch_all, fetch_one

try:
    tables = fetch_all(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
        """
    )
    print("TABLES:", [t["table_name"] for t in tables])
except Exception as e:
    print("DB_ERROR:", type(e).__name__, e)

try:
    officers = fetch_all('SELECT "badgeId", name, role FROM "Officer" LIMIT 5')
    print("OFFICERS:", officers)
except Exception as e:
    print("OFFICER_QUERY_ERROR:", type(e).__name__, e)

try:
    snake = fetch_all("SELECT badge_id, name, role FROM officers LIMIT 5")
    print("SNAKE_OFFICERS:", snake)
except Exception as e:
    print("SNAKE_QUERY_ERROR:", type(e).__name__, e)
