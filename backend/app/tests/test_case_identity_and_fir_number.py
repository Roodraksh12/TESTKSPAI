from __future__ import annotations

from app.routers import cases
from app.services import intake_intel


def test_new_person_is_not_reused_by_name(monkeypatch) -> None:
    inserted: list[dict] = []

    def fail_if_name_lookup_runs(*_args, **_kwargs):
        raise AssertionError("A name-only identity lookup must not run")

    def fake_insert(_sql: str, params: dict) -> dict:
        inserted.append(params)
        return {"id": params["id"], "name": params["name"], "role": params["role"]}

    monkeypatch.setattr(cases, "fetch_one", fail_if_name_lookup_runs)
    monkeypatch.setattr(cases, "execute_returning", fake_insert)

    first = cases._create_unverified_person("Ramesh Kumar", "ACCUSED")
    second = cases._create_unverified_person("Ramesh Kumar", "ACCUSED")

    assert first["id"] != second["id"]
    assert [row["name"] for row in inserted] == ["Ramesh Kumar", "Ramesh Kumar"]


def test_fir_number_uses_atomic_counter(monkeypatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(cases, "fetch_scalar", lambda *_args, **_kwargs: "FirNumberCounter")

    def fake_insert(sql: str, params: dict) -> dict:
        captured.update(sql=sql, params=params)
        return {"lastNumber": 127}

    monkeypatch.setattr(cases, "execute_returning", fake_insert)

    assert cases._allocate_fir_number(2026) == "FIR/2026/0127"
    assert "ON CONFLICT" in captured["sql"]
    assert '"lastNumber" + 1' in captured["sql"]
    assert captured["params"] == {"registerYear": 2026}


def test_identity_match_rejects_identical_name_without_corroboration(monkeypatch) -> None:
    monkeypatch.setattr(
        intake_intel,
        "_load_persons_with_cases",
        lambda: [
            {
                "id": "person-old",
                "name": "Ramesh Kumar",
                "role": "ACCUSED",
                "phone": None,
                "address": None,
                "casePersons": [
                    {
                        "caseIdRef": "case-old",
                        "firNumber": "FIR/2025/0010",
                        "stationId": "station-1",
                        "caseStatus": "OPEN",
                    }
                ],
            }
        ],
    )

    assert intake_intel.find_identity_matches(names=["Ramesh Kumar"]) == []


def test_identity_match_requires_prior_case_and_uses_multiple_identifiers(monkeypatch) -> None:
    monkeypatch.setattr(
        intake_intel,
        "_load_persons_with_cases",
        lambda: [
            {
                "id": "person-current",
                "name": "Ramesh Kumar",
                "role": "ACCUSED",
                "phone": "9876543210",
                "address": None,
                "casePersons": [
                    {
                        "caseIdRef": "case-current",
                        "firNumber": "FIR/2026/0011",
                        "stationId": "station-1",
                        "caseStatus": "OPEN",
                    }
                ],
            },
            {
                "id": "person-old",
                "name": "Ramesh Kumar",
                "role": "ACCUSED",
                "phone": "9876543210",
                "address": None,
                "casePersons": [
                    {
                        "caseIdRef": "case-old",
                        "firNumber": "FIR/2025/0010",
                        "stationId": "station-1",
                        "caseStatus": "OPEN",
                    }
                ],
            },
        ],
    )

    matches = intake_intel.find_identity_matches(
        names=["Ramesh Kumar"],
        phones=["9876543210"],
        exclude_case_id="case-current",
        station_id="station-1",
    )

    assert [match["personId"] for match in matches] == ["person-old"]
    assert matches[0]["priorCaseIds"] == ["case-old"]
    assert matches[0]["confidenceScore"] >= 80


def test_identity_match_can_be_corroborated_by_address(monkeypatch) -> None:
    monkeypatch.setattr(
        intake_intel,
        "_load_persons_with_cases",
        lambda: [
            {
                "id": "person-old",
                "name": "Ramesh Kumar",
                "role": "ACCUSED",
                "phone": None,
                "address": "12 MG Road Bengaluru",
                "casePersons": [
                    {
                        "caseIdRef": "case-old",
                        "firNumber": "FIR/2025/0010",
                        "stationId": "station-1",
                        "caseStatus": "OPEN",
                    }
                ],
            }
        ],
    )

    matches = intake_intel.find_identity_matches(
        names=["Ramesh Kumar"],
        addresses=["12 MG Road Bengaluru"],
    )

    assert [match["personId"] for match in matches] == ["person-old"]
    assert matches[0]["confidenceScore"] >= 80
