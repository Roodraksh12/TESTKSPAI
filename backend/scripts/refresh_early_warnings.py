"""Backfill or manually refresh persisted hotspot early warnings."""

from app.services.warning_engine import refresh_hotspot_warnings


if __name__ == "__main__":
    count = refresh_hotspot_warnings()
    print(f"Refreshed {count} active hotspot warning(s).")
