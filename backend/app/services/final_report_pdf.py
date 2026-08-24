"""Printable, deterministic filing packet for a structured final report.

The PDF is intentionally rendered from the saved report snapshot. It never
calls an AI service and it does not re-query case data during export, so the
downloaded packet matches the immutable version shown in the review history.
"""

from __future__ import annotations

import html
import io
from datetime import date, datetime
from typing import Any, Iterable

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5B6474")
NAVY = colors.HexColor("#12376B")
CYAN = colors.HexColor("#0891B2")
PALE = colors.HexColor("#F3F6FA")
RULE = colors.HexColor("#D9E0EA")
WARNING = colors.HexColor("#FFF4D6")


def _plain(value: Any, fallback: str = "Not recorded") -> str:
    if value is None or value == "":
        return fallback
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _markup(value: Any, fallback: str = "Not recorded") -> str:
    return html.escape(_plain(value, fallback)).replace("\n", "<br/>")


def _selected(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if row.get("selected")]


def _styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    body = ParagraphStyle(
        "ReportBody",
        parent=sample["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        textColor=INK,
        spaceAfter=4,
    )
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=TA_CENTER,
            textColor=NAVY,
            spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=body,
            alignment=TA_CENTER,
            fontSize=10,
            leading=14,
            textColor=MUTED,
            spaceAfter=12,
        ),
        "section": ParagraphStyle(
            "ReportSection",
            parent=sample["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=NAVY,
            spaceBefore=9,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "subsection": ParagraphStyle(
            "ReportSubsection",
            parent=sample["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=INK,
            spaceBefore=6,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "body": body,
        "small": ParagraphStyle(
            "ReportSmall",
            parent=body,
            fontSize=7.5,
            leading=10,
            textColor=MUTED,
        ),
        "warning": ParagraphStyle(
            "ReportWarning",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#704A00"),
        ),
        "table_head": ParagraphStyle(
            "ReportTableHead",
            parent=body,
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=colors.white,
        ),
        "table": ParagraphStyle(
            "ReportTable",
            parent=body,
            fontSize=7.5,
            leading=10,
            spaceAfter=0,
        ),
        "right": ParagraphStyle(
            "ReportRight",
            parent=body,
            alignment=TA_RIGHT,
        ),
    }


def _p(styles: dict[str, ParagraphStyle], value: Any, style: str = "body", fallback: str = "Not recorded") -> Paragraph:
    return Paragraph(_markup(value, fallback), styles[style])


def _table(
    rows: list[list[Any]],
    widths: list[float],
    *,
    header: bool = True,
    padding: float = 5,
) -> Table:
    table = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands: list[tuple] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), padding),
        ("RIGHTPADDING", (0, 0), (-1, -1), padding),
        ("TOPPADDING", (0, 0), (-1, -1), padding),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
    ]
    if header:
        commands.extend(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ]
        )
        if len(rows) > 1:
            commands.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]))
    else:
        commands.append(("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, PALE]))
    table.setStyle(TableStyle(commands))
    return table


def _label_value_table(
    styles: dict[str, ParagraphStyle],
    pairs: list[tuple[str, Any]],
    *,
    width: float,
) -> Table:
    rows = [
        [
            Paragraph(f"<b>{html.escape(label)}</b>", styles["table"]),
            _p(styles, value, "table"),
        ]
        for label, value in pairs
    ]
    return _table(rows, [width * 0.31, width * 0.69], header=False)


def _join_names(keys: Iterable[str], by_key: dict[str, dict[str, Any]], empty: str = "None linked") -> str:
    names = [by_key[key].get("name") or by_key[key].get("description") or key for key in keys if key in by_key]
    return ", ".join(str(name) for name in names) or empty


def build_final_report_pdf(report: dict[str, Any]) -> bytes:
    """Return an A4 PDF for the exact saved report version."""
    payload = report.get("payload") or {}
    case = payload.get("caseDetails") or {}
    metadata = payload.get("reportMetadata") or {}
    complainant = payload.get("complainant") or {}
    narrative = payload.get("narrative") or {}
    validation = report.get("validation") or {}
    accused = _selected(payload.get("accused") or [])
    not_chargesheeted = [
        row for row in payload.get("accused") or []
        if not row.get("selected") and row.get("disposition") == "NOT_CHARGE_SHEETED"
    ]
    victims = _selected(payload.get("victims") or [])
    offences = _selected(payload.get("offences") or [])
    section_history = [
        row for row in payload.get("offences") or []
        if row.get("firStage") == "ALLEGED" or row.get("finalDecision") in {"RETAINED", "ADDED", "DROPPED"}
    ]
    witnesses = _selected(payload.get("witnesses") or [])
    evidence = _selected(payload.get("evidence") or [])
    documents = sorted(
        _selected(payload.get("documents") or []),
        key=lambda row: (int(row.get("sequenceNumber") or 0), str(row.get("annexureNumber") or "")),
    )
    property_items = _selected(payload.get("propertyItems") or [])
    expert_results = payload.get("expertResults") or []
    matrix = payload.get("allegationMatrix") or []
    accused_by_key = {row["key"]: row for row in accused}
    offence_by_key = {row["key"]: row for row in offences}
    witness_by_key = {row["key"]: row for row in witnesses}
    evidence_by_key = {row["key"]: row for row in evidence}

    buffer = io.BytesIO()
    page_width, page_height = A4
    left = right = 17 * mm
    usable = page_width - left - right
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title=f'Final Report - {_plain(case.get("firNumber"), "Case")}',
        author=_plain(report.get("createdByName"), "KSPAI"),
        subject="Structured police final-report working packet",
    )
    styles = _styles()
    story: list[Any] = []

    def section(title: str) -> None:
        story.append(Paragraph(html.escape(title), styles["section"]))

    status = _plain(report.get("status"), "DRAFT")
    version = _plain(report.get("versionNumber"), "1")
    format_version = _plain(report.get("formatVersion"), "BNSS193-PROVISIONAL-V1")
    regime = _plain(metadata.get("legalRegime"), "BNS_BNSS_2023").replace("_", " / ")
    story.extend(
        [
            Spacer(1, 8 * mm),
            Paragraph("PROVISIONAL FINAL REPORT / CHARGE-SHEET", styles["title"]),
            Paragraph(
                f"Structured working packet | {html.escape(regime)}",
                styles["subtitle"],
            ),
            Table(
                [[Paragraph(
                    "This configurable profile is derived from supplied Rajasthan IIF-IV reference specimens; it is not a notified Karnataka Police or Court form. "
                    "The investigating officer and approving officer must verify every fact, legal section and annexure before filing.",
                    styles["warning"],
                )]],
                colWidths=[usable],
                style=TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), WARNING),
                        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D7A329")),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 9),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                    ]
                ),
            ),
            Spacer(1, 8 * mm),
            _label_value_table(
                styles,
                [
                    ("FIR number", case.get("firNumber")),
                    ("Final report number", metadata.get("finalReportNumber")),
                    ("Final report date", metadata.get("finalReportDate")),
                    ("Report category", metadata.get("reportCategory")),
                    ("Receiving Court", metadata.get("courtName")),
                    ("Police station", case.get("stationName")),
                    ("District", case.get("districtName")),
                    ("Crime type", case.get("crimeType")),
                    ("Incident date", case.get("incidentDate")),
                    ("Reported date", case.get("reportedDate")),
                    ("Report status", status.replace("_", " ").title()),
                    ("Packet version", f"{format_version} / version {version}"),
                ],
                width=usable,
            ),
            Spacer(1, 8 * mm),
            Paragraph(
                "Source discipline: linked names, case facts, evidence and documents are resolved from the saved case record. "
                "Manual additions are visibly identified in the relevant schedules.",
                styles["small"],
            ),
            PageBreak(),
        ]
    )

    section("1. Case and investigating officer details")
    story.append(
        _label_value_table(
            styles,
            [
                ("FIR number", case.get("firNumber")),
                ("Final report number", metadata.get("finalReportNumber")),
                ("Final report date", metadata.get("finalReportDate")),
                ("Receiving Court", metadata.get("courtName")),
                ("Filing place", metadata.get("filingPlace")),
                ("Template profile", metadata.get("templateProfile")),
                ("Legal regime", metadata.get("legalRegime")),
                ("Police station", case.get("stationName")),
                ("District", case.get("districtName")),
                ("Case status", case.get("caseStatus")),
                ("Nature of offence", case.get("crimeType")),
                ("Investigating officer", case.get("currentIoName")),
                ("Officer ID", case.get("currentIoBadgeId")),
                ("Prepared by", f'{_plain(report.get("createdByName"))} / {_plain(report.get("updatedByName"))}'),
                ("Last updated", report.get("updatedAt")),
            ],
            width=usable,
        )
    )

    section("1A. Complainant / informant and victims")
    story.append(
        _label_value_table(
            styles,
            [
                ("Complainant / informant", complainant.get("name")),
                ("Address", complainant.get("address")),
                ("Phone", complainant.get("phone")),
                ("Relationship to victim", complainant.get("relationshipToVictim")),
                ("Verification status", complainant.get("verificationStatus")),
            ],
            width=usable,
        )
    )
    victim_rows = [[_p(styles, "Sl.", "table_head"), _p(styles, "Victim", "table_head"), _p(styles, "Address / phone", "table_head"), _p(styles, "Injury, loss or relevance", "table_head")]]
    for index, row in enumerate(victims, 1):
        victim_rows.append([_p(styles, index, "table"), _p(styles, row.get("name"), "table"), _p(styles, f'{row.get("address") or "Not recorded"}\n{row.get("phone") or "Phone not recorded"}', "table"), _p(styles, row.get("injuryOrLoss"), "table")])
    if len(victim_rows) == 1:
        victim_rows.append([_p(styles, "-", "table"), _p(styles, "No separate victim selected", "table"), "", ""])
    story.append(_table(victim_rows, [9 * mm, 39 * mm, 62 * mm, usable - 110 * mm]))

    section("2. Accused persons sent for trial")
    accused_rows: list[list[Any]] = [
        [_p(styles, "Sl.", "table_head"), _p(styles, "Name and source", "table_head"), _p(styles, "Custody / bail", "table_head"), _p(styles, "Allegation", "table_head")]
    ]
    for index, row in enumerate(accused, 1):
        source = "Manual entry" if row.get("isManual") else "Case person record"
        accused_rows.append(
            [
                _p(styles, index, "table"),
                _p(styles, f'{row.get("name", "")}\n{source}\n{row.get("address") or "Address not recorded"}', "table"),
                _p(styles, f'Custody: {row.get("custodyStatus") or "Not recorded"}\nFirst remand: {_plain(row.get("firstRemandAt"))}\nBail: {row.get("bailStatus") or "Not recorded"}', "table"),
                _p(styles, row.get("allegation"), "table"),
            ]
        )
    if len(accused_rows) == 1:
        accused_rows.append([_p(styles, "-", "table"), _p(styles, "No accused selected", "table"), "", ""])
    story.append(_table(accused_rows, [9 * mm, 48 * mm, 47 * mm, usable - 104 * mm]))

    for index, row in enumerate(accused, 1):
        story.append(Paragraph(f"2.{index} Accused particulars - {html.escape(_plain(row.get('name')))}", styles["subsection"]))
        story.append(
            _label_value_table(
                styles,
                [
                    ("Alias", row.get("alias")),
                    ("Parent / guardian", row.get("parentName")),
                    ("Birth year / gender", f'{_plain(row.get("birthYear"))} / {_plain(row.get("gender"))}'),
                    ("Nationality / occupation", f'{_plain(row.get("nationality"))} / {_plain(row.get("occupation"))}'),
                    ("Permanent address", row.get("permanentAddress")),
                    ("Identity verification", f'{_plain(row.get("identityStatus"))} | {_plain(row.get("identityType"))} {_plain(row.get("identityReference"), "")}'),
                    ("Arrest / Court forwarding", f'{_plain(row.get("arrestAt"))} / {_plain(row.get("forwardedToCourtAt"))}'),
                    ("Bail date / sureties", f'{_plain(row.get("bailAt"))} / {_plain(row.get("suretyDetails"))}'),
                    ("Regular criminal number", row.get("regularCriminalNumber")),
                    ("Previous convictions", row.get("previousConvictions")),
                ],
                width=usable,
            )
        )

    section("2A. Accused not charge-sheeted")
    not_charged_rows = [[_p(styles, "Sl.", "table_head"), _p(styles, "Name", "table_head"), _p(styles, "Disposition", "table_head"), _p(styles, "Recorded reason", "table_head")]]
    for index, row in enumerate(not_chargesheeted, 1):
        not_charged_rows.append([_p(styles, index, "table"), _p(styles, row.get("name"), "table"), _p(styles, row.get("disposition"), "table"), _p(styles, row.get("dispositionReason"), "table")])
    if len(not_charged_rows) == 1:
        not_charged_rows.append([_p(styles, "-", "table"), _p(styles, "None recorded", "table"), "", ""])
    story.append(_table(not_charged_rows, [9 * mm, 45 * mm, 40 * mm, usable - 94 * mm]))

    section("3. Alleged offences")
    offence_rows: list[list[Any]] = [
        [_p(styles, "Sl.", "table_head"), _p(styles, "Act / section", "table_head"), _p(styles, "Title", "table_head"), _p(styles, "Punishment / conditions", "table_head")]
    ]
    for index, row in enumerate(offences, 1):
        notes = row.get("punishment") or "Not recorded"
        if row.get("conditionNote"):
            notes = f'{notes}\nCondition: {row["conditionNote"]}'
        if row.get("isManual"):
            notes = f"{notes}\nManual legal entry - verify against the authoritative statute."
        offence_rows.append(
            [
                _p(styles, index, "table"),
                _p(styles, f'{row.get("actCode", "")} {row.get("sectionNumber", "")}', "table"),
                _p(styles, row.get("title"), "table"),
                _p(styles, notes, "table"),
            ]
        )
    if len(offence_rows) == 1:
        offence_rows.append([_p(styles, "-", "table"), _p(styles, "No offences selected", "table"), "", ""])
    story.append(_table(offence_rows, [9 * mm, 30 * mm, 50 * mm, usable - 89 * mm]))

    section("3A. FIR-to-final legal-section decision record")
    history_rows = [[_p(styles, "Act / section", "table_head"), _p(styles, "FIR stage", "table_head"), _p(styles, "Final decision", "table_head"), _p(styles, "Reason / approval reference", "table_head")]]
    for row in section_history:
        history_rows.append([
            _p(styles, f'{row.get("actCode", "")} {row.get("sectionNumber", "")}', "table"),
            _p(styles, row.get("firStage"), "table"),
            _p(styles, row.get("finalDecision"), "table"),
            _p(styles, f'{row.get("decisionReason") or "Not recorded"}\nApproval: {row.get("approvalReference") or "Not recorded"}', "table"),
        ])
    if len(history_rows) == 1:
        history_rows.append([_p(styles, "No section-change history recorded", "table"), "", "", ""])
    story.append(_table(history_rows, [35 * mm, 31 * mm, 34 * mm, usable - 100 * mm]))

    section("4. Accused-to-offence allegation matrix")
    matrix_rows: list[list[Any]] = [
        [_p(styles, "Accused", "table_head"), _p(styles, "Alleged section", "table_head"), _p(styles, "Supporting facts", "table_head"), _p(styles, "Linked sources", "table_head")]
    ]
    for row in matrix:
        accused_row = accused_by_key.get(row.get("accusedKey"))
        offence_row = offence_by_key.get(row.get("offenceKey"))
        if not accused_row or not offence_row:
            continue
        links = (
            f'Evidence: {_join_names(row.get("evidenceKeys") or [], evidence_by_key)}\n'
            f'Witnesses: {_join_names(row.get("witnessKeys") or [], witness_by_key)}'
        )
        matrix_rows.append(
            [
                _p(styles, accused_row.get("name"), "table"),
                _p(styles, f'{offence_row.get("actCode", "")} {offence_row.get("sectionNumber", "")}', "table"),
                _p(styles, row.get("facts"), "table"),
                _p(styles, links, "table"),
            ]
        )
    if len(matrix_rows) == 1:
        matrix_rows.append([_p(styles, "No allegation links recorded", "table"), "", "", ""])
    story.append(_table(matrix_rows, [34 * mm, 29 * mm, 62 * mm, usable - 125 * mm]))

    section("5. Investigation narrative")
    for title, key in (
        ("5.1 Case background", "caseBackground"),
        ("5.2 Information received", "informationReceived"),
        ("5.3 Investigation conducted", "investigationConducted"),
        ("5.4 Evidence summary", "evidenceSummary"),
        ("5.5 Conclusion", "conclusion"),
        ("5.6 Submission / prayer", "prayer"),
    ):
        story.append(Paragraph(html.escape(title), styles["subsection"]))
        story.append(_p(styles, narrative.get(key)))

    section("Schedule A - Prosecution witnesses")
    witness_rows: list[list[Any]] = [
        [_p(styles, "Sl.", "table_head"), _p(styles, "Name and address", "table_head"), _p(styles, "Statement / relevance", "table_head"), _p(styles, "Source", "table_head")]
    ]
    for index, row in enumerate(witnesses, 1):
        witness_rows.append(
            [
                _p(styles, index, "table"),
                _p(styles, f'{row.get("name", "")}\n{row.get("relationshipName") or "Relationship not recorded"}\n{row.get("address") or "Address not recorded"}\n{row.get("phone") or "Phone not recorded"}', "table"),
                _p(styles, row.get("statementSummary"), "table"),
                _p(styles, f'{row.get("evidenceType") or "Oral"}\n{"Manual entry" if row.get("isManual") else "Case person record"}', "table"),
            ]
        )
    if len(witness_rows) == 1:
        witness_rows.append([_p(styles, "-", "table"), _p(styles, "No witnesses selected", "table"), "", ""])
    story.append(_table(witness_rows, [9 * mm, 57 * mm, usable - 96 * mm, 30 * mm]))

    section("Schedule B - Evidence register")
    evidence_rows: list[list[Any]] = [
        [_p(styles, "Sl.", "table_head"), _p(styles, "Type", "table_head"), _p(styles, "Description", "table_head"), _p(styles, "Status / recorded", "table_head")]
    ]
    for index, row in enumerate(evidence, 1):
        evidence_rows.append(
            [
                _p(styles, index, "table"),
                _p(styles, row.get("type"), "table"),
                _p(styles, row.get("description"), "table"),
                _p(styles, f'{row.get("status") or "Not recorded"}\n{_plain(row.get("timestamp"))}\nResult: {row.get("resultStatus") or "Not recorded"}\nRef: {row.get("referenceNumber") or "Not recorded"}\n{row.get("resultSummary") or ""}', "table"),
            ]
        )
    if len(evidence_rows) == 1:
        evidence_rows.append([_p(styles, "-", "table"), _p(styles, "No evidence selected", "table"), "", ""])
    story.append(_table(evidence_rows, [9 * mm, 35 * mm, usable - 89 * mm, 45 * mm]))

    section("Schedule C - Document and annexure index")
    document_rows: list[list[Any]] = [
        [_p(styles, "Annexure", "table_head"), _p(styles, "Document", "table_head"), _p(styles, "Category / copy", "table_head"), _p(styles, "Pages / source date", "table_head")]
    ]
    for index, row in enumerate(documents, 1):
        document_rows.append(
            [
                _p(styles, row.get("annexureNumber") or index, "table"),
                _p(styles, f'{row.get("name") or "Not recorded"}\n{row.get("description") or ""}', "table"),
                _p(styles, f'{row.get("category") or "OTHER"}\n{row.get("copyType") or "Copy status not recorded"}', "table"),
                _p(styles, f'{row.get("pageCount") or 1} page(s)\n{_plain(row.get("createdAt"))}', "table"),
            ]
        )
    if len(document_rows) == 1:
        document_rows.append([_p(styles, "-", "table"), _p(styles, "No documents selected", "table"), "", ""])
    story.append(_table(document_rows, [14 * mm, usable - 88 * mm, 38 * mm, 36 * mm]))

    section("Schedule D - Seized / recovered property")
    property_rows = [[_p(styles, "Sl.", "table_head"), _p(styles, "Description / quantity", "table_head"), _p(styles, "Recovery / seizure reference", "table_head"), _p(styles, "Disposal / custody", "table_head")]]
    for index, row in enumerate(property_items, 1):
        property_rows.append([_p(styles, index, "table"), _p(styles, f'{row.get("description") or "Not recorded"}\nQty: {row.get("quantity") or "Not recorded"}\nValue: {row.get("estimatedValue") or "Not recorded"}', "table"), _p(styles, f'{row.get("recoveryStatus") or "Not recorded"}\n{row.get("seizureMemoReference") or "Reference not recorded"}', "table"), _p(styles, row.get("disposalStatus"), "table")])
    if len(property_rows) == 1:
        property_rows.append([_p(styles, "-", "table"), _p(styles, "No property item selected", "table"), "", ""])
    story.append(_table(property_rows, [9 * mm, 63 * mm, 55 * mm, usable - 127 * mm]))

    section("Schedule E - Medical, forensic and electronic results")
    result_rows = [[_p(styles, "Type", "table_head"), _p(styles, "Status / reference", "table_head"), _p(styles, "Result summary", "table_head")]]
    for row in expert_results:
        result_rows.append([_p(styles, row.get("type"), "table"), _p(styles, f'{row.get("status") or "Not recorded"}\n{row.get("referenceNumber") or "Reference not recorded"}\n{row.get("resultDate") or "Date not recorded"}', "table"), _p(styles, row.get("summary"), "table")])
    if len(result_rows) == 1:
        result_rows.append([_p(styles, "No separate expert result recorded", "table"), "", ""])
    story.append(_table(result_rows, [38 * mm, 52 * mm, usable - 90 * mm]))

    section("Officer verification and workflow")
    validation_counts = validation.get("counts") or {}
    workflow_rows = [
        ("IO declaration", "Confirmed" if payload.get("officerDeclaration") else "Not confirmed"),
        ("Validation at saved version", "Ready" if validation.get("ready") else "Incomplete"),
        ("Blocking errors", validation_counts.get("errors", 0)),
        ("Unanswered explanations", validation_counts.get("unansweredExplanations", 0)),
        ("Submitted for review", report.get("submittedAt")),
        ("Reviewed by", report.get("reviewedByName")),
        ("Review note", report.get("reviewNote")),
        ("Approved by", report.get("approvedByName")),
        ("Approved at", report.get("approvedAt")),
    ]
    story.append(_label_value_table(styles, workflow_rows, width=usable))
    story.extend(
        [
            Spacer(1, 13 * mm),
            _table(
                [
                    [
                        _p(styles, "Investigating Officer\nName / badge / signature / date", "table"),
                        _p(styles, "Reviewing / Approving Officer\nName / badge / signature / date", "table"),
                    ]
                ],
                [usable / 2, usable / 2],
                header=False,
                padding=10,
            ),
        ]
    )

    def decorate(canvas: Any, document: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(left, 14 * mm, page_width - right, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(left, 9.5 * mm, f'FIR: {_plain(case.get("firNumber"), "Not recorded")}')
        canvas.drawCentredString(page_width / 2, 9.5 * mm, f'{format_version} | Version {version}')
        canvas.drawRightString(page_width - right, 9.5 * mm, f'Page {document.page}')
        if status != "APPROVED":
            canvas.saveState()
            canvas.setFillColor(colors.HexColor("#E7EBF1"))
            canvas.setFont("Helvetica-Bold", 42)
            canvas.translate(page_width / 2, page_height / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "DRAFT - NOT FOR FILING")
            canvas.restoreState()
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()
