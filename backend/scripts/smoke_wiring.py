import httpx

base = "http://127.0.0.1:8000"

def login(badge: str) -> dict:
    r = httpx.post(
        f"{base}/api/auth/login",
        json={"badgeId": badge, "password": "demo1234"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()

try:
    httpx.get(f"{base}/health", timeout=5).raise_for_status()
except Exception as e:
    print("backend down", e)
    raise SystemExit(1)

for badge in ("KA-IT-0001", "KA-INS-4471", "KA-SP-9999"):
    data = login(badge)
    tok = data["token"]
    h = {"Authorization": f"Bearer {tok}"}
    me = httpx.get(f"{base}/api/auth/me", headers=h, timeout=30)
    me.raise_for_status()
    user = me.json()["user"]
    print(badge, "role=", user["role"], "status=", user.get("status"), "caps=", user.get("capabilities", {}).get("canInvite"))
    st = httpx.get(f"{base}/api/admin/stations", headers=h, timeout=30)
    print("  stations", st.status_code, len(st.json().get("stations", [])) if st.status_code == 200 else st.text[:120])
    dash = httpx.get(f"{base}/api/dashboard", headers=h, timeout=60)
    print("  dashboard", dash.status_code)
    cases = httpx.get(f"{base}/api/cases", headers=h, timeout=60)
    print("  cases", cases.status_code, "n=", len(cases.json().get("cases", [])) if cases.status_code == 200 else "")

print("OK")
