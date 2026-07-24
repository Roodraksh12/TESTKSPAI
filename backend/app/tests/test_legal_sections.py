from __future__ import annotations

from app.services.legal_sections import predict_sections


def _ids(result: dict) -> list[str]:
    return [p["ipcSection"] for p in result["predictions"]]


def test_theft_predicts_379_as_primary() -> None:
    result = predict_sections("Theft", "Two-wheeler stolen from the parking lot.")
    top = result["predictions"][0]
    assert top["ipcSection"] == "IPC 379"
    assert top["bnsSection"] == "BNS 303(2)"
    assert top["basis"] == "primary"
    assert top["confidence"] >= 88


def test_predictions_are_sorted_by_confidence_descending() -> None:
    result = predict_sections("Robbery", "Accused used a knife and threatened the victim.")
    confidences = [p["confidence"] for p in result["predictions"]]
    assert confidences == sorted(confidences, reverse=True)


def test_weapon_wording_surfaces_conditional_397() -> None:
    without = predict_sections("Robbery", "Chain snatched while victim was walking.")
    with_weapon = predict_sections("Robbery", "Accused brandished a knife before snatching.")

    assert "IPC 397" in _ids(with_weapon)
    weapon_row = next(p for p in with_weapon["predictions"] if p["ipcSection"] == "IPC 397")
    assert weapon_row["basis"] == "conditional"
    assert "knife" in weapon_row["matchedKeywords"]

    # The same conditional section scores lower without the weapon wording.
    if "IPC 397" in _ids(without):
        plain_row = next(p for p in without["predictions"] if p["ipcSection"] == "IPC 397")
        assert plain_row["confidence"] < weapon_row["confidence"]


def test_every_prediction_carries_a_rationale() -> None:
    result = predict_sections("Burglary", "Grill was cut at night and the house was entered.")
    assert result["predictions"]
    for prediction in result["predictions"]:
        assert prediction["rationale"].strip()


def test_night_entry_triggers_457() -> None:
    result = predict_sections("Burglary", "Entry made around 2 am through the balcony.")
    assert "IPC 457" in _ids(result)


def test_unknown_crime_type_returns_no_predictions_but_stays_useful() -> None:
    result = predict_sections("Cattle trespass", None)
    assert result["predictions"] == []
    assert result["matched"] is False
    assert result["note"]
    # An officer still gets baseline evidence guidance rather than an empty screen.
    assert len(result["evidenceNeeded"]) > 0


def test_summary_only_match_is_flagged_as_inferred() -> None:
    result = predict_sections(None, "Complainant was duped into sharing an OTP.")
    cheating = next(p for p in result["predictions"] if p["ipcSection"] == "IPC 420")
    assert "Inferred from the case summary" in cheating["rationale"]
    assert cheating["confidence"] < 88


def test_disclaimer_is_always_present() -> None:
    for crime in ("Theft", "Cattle trespass", None):
        assert predict_sections(crime, None)["disclaimer"]
