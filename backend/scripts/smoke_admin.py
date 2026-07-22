import httpx

base = "http://127.0.0.1:8000"
try:
    r = httpx.get(f"{base}/health", timeout=5)
    print("health", r.status_code)
except Exception as e:
    print("backend down", e)
    raise SystemExit(0)

r = httpx.post(
    f"{base}/api/auth/login",
    json={"badgeId": "KA-INS-4471", "password": "demo1234"},
    timeout=30,
)
print("login", r.status_code, list(r.json().keys()) if r.status_code == 200 else r.text[:200])
if r.status_code != 200:
    raise SystemExit(1)
tok = r.json()["token"]
h = {"Authorization": f"Bearer {tok}"}
me = httpx.get(f"{base}/api/auth/me", headers=h, timeout=30)
print("me", me.status_code, me.json()["user"].get("capabilities"))
sub = httpx.get(f"{base}/api/admin/subtree", headers=h, timeout=30)
print("subtree", sub.status_code, len(sub.json().get("officers", [])))
inv = httpx.post(
    f"{base}/api/admin/invitations",
    headers=h,
    json={
        "name": "Temp Constable",
        "badgeId": "KA-CON-TEMP1",
        "role": "CONSTABLE",
        "email": None,
        "stationId": "station-whitefield-ps",
    },
    timeout=30,
)
print("invite", inv.status_code, inv.json() if inv.status_code < 500 else inv.text[:300])
