from app.services.db import execute, fetch_scalar
from app.services.warning_engine import refresh_hotspot_warnings_if_due

print("Shifting EXTRA-11%% case dates to active window...")
execute("""
    UPDATE "Case" 
    SET "incidentDate" = NOW() - INTERVAL '2 days', 
        "reportedDate" = NOW() - INTERVAL '2 days' 
    WHERE "firNumber" LIKE 'FIR/2026/EXTRA-11%%'
""")

print("Refreshing hotspot warnings...")
refresh_hotspot_warnings_if_due()
count = fetch_scalar("SELECT COUNT(*) FROM \"EarlyWarningNotification\" WHERE status = 'ACTIVE'")
print(f"Active warnings in database: {count}")
