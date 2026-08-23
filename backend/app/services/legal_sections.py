"""Expected IPC/BNS section prediction.

Rule-based, fully explainable section suggestion for a case. Every prediction
carries the evidence that produced it (crime type match and/or the exact phrases
found in the summary) so an officer can see *why* a section was proposed rather
than being handed an opaque number.

This is deliberately NOT a model. Section selection is a legal judgement with
liberty consequences; a transparent lookup an officer can audit line by line is
the honest tool here. Nothing produced by this module is filed automatically.

Kept separate from ``intake_intel.suggest_legal_sections`` (the chat tool, which
returns prose for the LLM) so that contract stays stable — this module returns
structured rows for the UI.

India transitioned from the IPC to the Bharatiya Nyaya Sanhita (BNS) on 1 July 2024.
Offences are charged under whichever statute was in force on the incident date,
but this system now exclusively focuses on BNS/BNSS naming.
"""

from __future__ import annotations

import re
from typing import Any

BNS_COMMENCEMENT = "2024-07-01"

# Confidence bands. A section matched purely from the recorded crime type is a
# strong signal; one inferred from wording in the summary is weaker and framed
# as conditional so nobody treats it as settled.
CONF_PRIMARY = 88
CONF_KEYWORD_ONLY = 55
CONF_CONDITIONAL_BASE = 40
KEYWORD_BOOST = 18
CONF_CEILING = 95


class Section:
    """One chargeable section with its IPC↔BNS pairing and triggering rules."""

    def __init__(
        self,
        *,
        bns: str,
        title: str,
        punishment: str,
        cognizable: bool,
        bailable: bool,
        crime_types: tuple[str, ...] = (),
        keywords: tuple[str, ...] = (),
        conditional: bool = False,
        condition_note: str = "",
    ) -> None:
        self.bns = bns
        self.title = title
        self.punishment = punishment
        self.cognizable = cognizable
        self.bailable = bailable
        self.crime_types = crime_types
        self.keywords = keywords
        self.conditional = conditional
        self.condition_note = condition_note


# Indicative BNS mapping. Numbering is the commonly cited correspondence;
# it is a drafting aid, not a substitute for the bare act.
SECTIONS: tuple[Section, ...] = (
    Section(
        bns="303(2)", title="Theft",
        punishment="Up to 3 years, or fine, or both",
        cognizable=True, bailable=False,
        crime_types=("theft", "vehicle theft"),
        keywords=("stole", "stolen", "theft", "missing from", "took away"),
    ),
    Section(
        bns="305", title="Theft in a dwelling house",
        punishment="Up to 7 years and fine",
        cognizable=True, bailable=False,
        crime_types=("burglary",),
        keywords=("house", "dwelling", "residence", "apartment", "flat", "home"),
    ),
    Section(
        bns="331(3)", title="House-breaking to commit an offence",
        punishment="Up to 3 years and fine",
        cognizable=True, bailable=False,
        crime_types=("burglary",),
        keywords=("broke open", "break-in", "forced entry", "grill", "lock broken", "tool mark"),
    ),
    Section(
        bns="331(4)", title="House-breaking by night",
        punishment="Up to 5 years and fine",
        cognizable=True, bailable=False,
        crime_types=("burglary",),
        keywords=("night", "midnight", "after dark", "2 am", "3 am"),
        conditional=True,
        condition_note="Applies only if entry occurred between sunset and sunrise.",
    ),
    Section(
        bns="309(4)", title="Robbery",
        punishment="Rigorous imprisonment up to 10 years and fine",
        cognizable=True, bailable=False,
        crime_types=("robbery", "chain snatching"),
        keywords=("snatch", "force", "pushed", "threatened", "overpowered", "resisted"),
    ),
    Section(
        bns="311", title="Robbery with attempt to cause death or grievous hurt",
        punishment="Minimum 7 years rigorous imprisonment",
        cognizable=True, bailable=False,
        crime_types=("robbery",),
        keywords=("knife", "weapon", "machete", "pistol", "firearm", "grievous", "stabbed"),
        conditional=True,
        condition_note="Attracts a statutory minimum — apply only with clear proof of a deadly weapon.",
    ),
    Section(
        bns="317(2)", title="Dishonestly receiving stolen property",
        punishment="Up to 3 years, or fine, or both",
        cognizable=True, bailable=False,
        crime_types=("theft", "vehicle theft", "burglary"),
        keywords=("recovered", "recovery", "seized from", "pledged", "resold", "scrap"),
        conditional=True,
        condition_note="Add once property is recovered from a person other than the principal accused.",
    ),
    Section(
        bns="318(4)", title="Cheating and dishonestly inducing delivery of property",
        punishment="Up to 7 years and fine",
        cognizable=True, bailable=False,
        crime_types=("fraud", "economic offence", "cyber fraud"),
        keywords=("cheat", "fraud", "duped", "fake", "impersonat", "otp", "upi", "transferred"),
    ),
    Section(
        bns="316(2)", title="Criminal breach of trust",
        punishment="Up to 5 years, or fine, or both",
        cognizable=True, bailable=False,
        crime_types=("fraud", "economic offence"),
        keywords=("entrusted", "custody", "misappropriat", "diverted funds"),
        conditional=True,
        condition_note="Use where property was lawfully entrusted before being misused.",
    ),
    Section(
        bns="316(5)", title="Criminal breach of trust by public servant / banker",
        punishment="Up to life imprisonment, or up to 10 years and fine",
        cognizable=True, bailable=False,
        crime_types=("economic offence",),
        keywords=("public servant", "government", "bank official", "treasury", "clerk"),
        conditional=True,
        condition_note="Only where the accused held office or fiduciary capacity.",
    ),
    Section(
        bns="115(2)", title="Voluntarily causing hurt",
        punishment="Up to 1 year, or fine up to ₹1,000, or both",
        cognizable=False, bailable=True,
        crime_types=("assault",),
        keywords=("beat", "hit", "slap", "punch", "hurt", "injured"),
    ),
    Section(
        bns="118(1)", title="Voluntarily causing hurt by dangerous weapon",
        punishment="Up to 3 years, or fine, or both",
        cognizable=True, bailable=False,
        crime_types=("assault",),
        keywords=("knife", "rod", "weapon", "blade", "acid", "stabbed", "sharp"),
        conditional=True,
        condition_note="Requires a weapon or means likely to cause death.",
    ),
    Section(
        bns="117(2)", title="Voluntarily causing grievous hurt",
        punishment="Up to 7 years and fine",
        cognizable=True, bailable=False,
        crime_types=("assault",),
        keywords=("fracture", "grievous", "permanent", "disfigur", "hospitalis", "hospitaliz"),
        conditional=True,
        condition_note="Depends on the medico-legal certificate classifying injury as grievous.",
    ),
    Section(
        bns="351(2)", title="Criminal intimidation",
        punishment="Up to 2 years, or fine, or both",
        cognizable=False, bailable=True,
        crime_types=("assault",),
        keywords=("threat", "intimidat", "warned", "kill you", "consequences"),
        conditional=True,
        condition_note="Add where a threat to person, property or reputation is on record.",
    ),
    Section(
        bns="103(1)", title="Murder",
        punishment="Death, or imprisonment for life, and fine",
        cognizable=True, bailable=False,
        crime_types=("murder", "homicide"),
        keywords=("murder", "killed", "death", "deceased", "died"),
    ),
    Section(
        bns="137(2)", title="Kidnapping",
        punishment="Up to 7 years and fine",
        cognizable=True, bailable=False,
        crime_types=("kidnapping", "missing"),
        keywords=("kidnap", "abduct", "taken away", "forcibly took"),
        conditional=True,
        condition_note="For a missing-person report, apply only once abduction is indicated.",
    ),
)

# Evidence checklists keyed by the crime-type family a section belongs to.
EVIDENCE_BY_FAMILY: dict[str, list[str]] = {
    "theft": [
        "Ownership proof for the stolen property (bill, IMEI, RC book)",
        "Scene mahazar and seizure memo if anything is recovered",
        "CCTV covering the approach and exit path",
        "Complainant statement under BNSS 180 (formerly 161 CrPC)",
    ],
    "burglary": [
        "Photographs of the point of entry and any tool marks",
        "Fingerprint and forensic lifting from entry surfaces",
        "Itemised inventory of missing property",
        "Neighbour canvass statements",
    ],
    "robbery": [
        "Description and, if seized, the weapon itself",
        "Medico-legal certificate for any injury",
        "Scene sketch showing the point of interception",
        "Victim identification of accused and vehicle",
    ],
    "fraud": [
        "Bank statements and the full transaction trail",
        "KYC of the beneficiary account",
        "Screenshots, emails, chat records",
        "Call detail records where a phone was used",
    ],
    "assault": [
        "Medico-legal certificate classifying the injury",
        "Weapon recovery if a weapon was used",
        "Independent eyewitness statements",
    ],
    "murder": [
        "Inquest report and post-mortem findings",
        "Scene of crime forensic examination",
        "Weapon recovery and FSL linkage",
        "Last-seen and motive evidence",
    ],
    "missing": [
        "Last-seen statement with time and place",
        "Call detail records and tower dump",
        "CCTV at exit points (bus stand, railway station)",
        "Photograph circulated to neighbouring stations",
    ],
}

FAMILY_BY_CRIME_TYPE: dict[str, str] = {
    "theft": "theft",
    "vehicle theft": "theft",
    "burglary": "burglary",
    "robbery": "robbery",
    "chain snatching": "robbery",
    "fraud": "fraud",
    "cyber fraud": "fraud",
    "economic offence": "fraud",
    "assault": "assault",
    "murder": "murder",
    "homicide": "murder",
    "missing": "missing",
    "kidnapping": "missing",
}

DISCLAIMER = (
    "Suggested framing only. Section selection is the investigating officer's decision — "
    "verify against the bare act and the facts on record before filing. "
    f"BNS applies to offences on or after {BNS_COMMENCEMENT}."
)


def _normalise(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _crime_type_matches(crime_type: str, section: Section) -> bool:
    """True when the recorded crime type names this section's offence family."""
    for candidate in section.crime_types:
        if candidate in crime_type or crime_type in candidate:
            return True
    return False


def _matched_keywords(blob: str, section: Section) -> list[str]:
    return [kw for kw in section.keywords if kw in blob]


def resolve_family(crime_type: str | None) -> str | None:
    """Map a free-text crime type onto an evidence-checklist family."""
    key = _normalise(crime_type)
    if not key:
        return None
    for candidate, family in FAMILY_BY_CRIME_TYPE.items():
        if candidate in key or key in candidate:
            return family
    return None


def predict_sections(crime_type: str | None, summary: str | None = None) -> dict[str, Any]:
    """Rank the sections a case is likely to attract, with the reason for each.

    A section surfaces when the recorded crime type names it, or when the summary
    contains wording that points to it. Confidence reflects which of those fired:
    crime-type matches score high, summary-only inferences score low and are
    flagged conditional so they read as questions, not conclusions.
    """
    crime_key = _normalise(crime_type)
    summary_key = _normalise(summary)
    blob = f"{crime_key} {summary_key}".strip()

    predictions: list[dict[str, Any]] = []

    for section in SECTIONS:
        by_type = _crime_type_matches(crime_key, section) if crime_key else False
        hits = _matched_keywords(blob, section) if blob else []

        if not by_type and not hits:
            continue

        rationale_parts: list[str] = []
        if by_type:
            if section.conditional:
                confidence = CONF_CONDITIONAL_BASE + (KEYWORD_BOOST if hits else 0)
            else:
                confidence = CONF_PRIMARY
            rationale_parts.append(f'Crime type recorded as "{crime_type}".')
        else:
            confidence = CONF_KEYWORD_ONLY if not section.conditional else CONF_CONDITIONAL_BASE
            rationale_parts.append("Inferred from the case summary, not the recorded crime type.")

        if hits:
            if by_type and not section.conditional:
                confidence = min(CONF_CEILING, confidence + 5)
            quoted = ", ".join(f'"{h}"' for h in hits[:4])
            rationale_parts.append(f"Summary mentions {quoted}.")

        if section.conditional and section.condition_note:
            rationale_parts.append(section.condition_note)

        predictions.append(
            {
                "id": f"bns-{section.bns}",
                "bnsSection": f"BNS {section.bns}",
                "title": section.title,
                "punishment": section.punishment,
                "cognizable": section.cognizable,
                "bailable": section.bailable,
                "confidence": min(CONF_CEILING, confidence),
                "basis": "conditional" if section.conditional else "primary",
                "matchedKeywords": hits,
                "rationale": " ".join(rationale_parts),
            }
        )

    # Strongest first; stable tie-break on section number keeps output deterministic.
    predictions.sort(key=lambda p: (-p["confidence"], p["bnsSection"]))

    family = resolve_family(crime_type)
    evidence = EVIDENCE_BY_FAMILY.get(family or "", [])
    if not evidence:
        evidence = [
            "Secure the scene and record the complainant's statement",
            "Preserve CCTV within its retention window",
            "Document all seizures with a witnessed memo",
        ]

    return {
        "crimeType": crime_type,
        "predictions": predictions,
        "evidenceNeeded": evidence,
        "matched": len(predictions) > 0,
        "note": (
            "No section template matched — record the facts and select sections manually."
            if not predictions
            else ""
        ),
        "disclaimer": DISCLAIMER,
    }
