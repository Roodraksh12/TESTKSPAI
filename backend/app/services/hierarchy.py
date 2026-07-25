"""Rank cascade, jurisdiction helpers, invite rules, and platform capabilities."""

from __future__ import annotations

from typing import Any, Literal

ScopeLevel = Literal[
    "STATE",
    "COMMAND_RANGE",
    "DISTRICTS",
    "DISTRICT",
    "SUBDIVISION",
    "STATION",
]

RANK_ORDER: list[str] = [
    "POLICE_IT",
    "DGP_IGP",
    "ADGP",
    "IGP",
    "DIG",
    "SP",
    "ADDL_SP_DCP",
    "ASP_ACP",
    "DYSP",
    "SHO",
    "INSPECTOR",
    "SI",
    "ASI",
    "HEAD_CONSTABLE",
    "CONSTABLE",
]

GAZETTED: set[str] = {
    "DGP_IGP",
    "ADGP",
    "IGP",
    "DIG",
    "SP",
    "ADDL_SP_DCP",
    "ASP_ACP",
}

INVITE_TARGETS: dict[str, list[str]] = {
    "POLICE_IT": list(GAZETTED),
    "DGP_IGP": ["ADGP"],
    "ADGP": ["IGP"],
    "IGP": ["DIG"],
    "DIG": ["SP"],
    "SP": ["ADDL_SP_DCP"],
    "ADDL_SP_DCP": ["ASP_ACP"],
    "ASP_ACP": ["DYSP"],
    "DYSP": ["SHO", "INSPECTOR"],
    "SHO": ["SI", "ASI", "HEAD_CONSTABLE", "CONSTABLE"],
    "INSPECTOR": ["SI", "ASI", "HEAD_CONSTABLE", "CONSTABLE"],
    "SI": [],
    "ASI": [],
    "HEAD_CONSTABLE": [],
    "CONSTABLE": [],
}

STATION_LEAF_RANKS: set[str] = {"SI", "ASI", "HEAD_CONSTABLE", "CONSTABLE"}
SHO_RANKS: set[str] = {"SHO", "INSPECTOR"}
COMMAND_HOME_RANKS: set[str] = {"POLICE_IT"} | GAZETTED | {"DYSP"}

# Legacy helper — True when not limited to a single station
WIDE_CASE_SCOPE_RANKS: set[str] = COMMAND_HOME_RANKS

SCOPE_BY_ROLE: dict[str, ScopeLevel] = {
    "POLICE_IT": "STATE",
    "DGP_IGP": "STATE",
    "ADGP": "STATE",
    "IGP": "COMMAND_RANGE",
    "DIG": "DISTRICTS",
    "SP": "DISTRICT",
    "ADDL_SP_DCP": "DISTRICT",
    "ASP_ACP": "DISTRICT",
    "DYSP": "SUBDIVISION",
    "SHO": "STATION",
    "INSPECTOR": "STATION",
    "SI": "STATION",
    "ASI": "STATION",
    "HEAD_CONSTABLE": "STATION",
    "CONSTABLE": "STATION",
}

SCOPE_LABEL: dict[ScopeLevel, str] = {
    "STATE": "State",
    "COMMAND_RANGE": "Command range",
    "DISTRICTS": "Assigned districts",
    "DISTRICT": "District",
    "SUBDIVISION": "Sub-division",
    "STATION": "Station",
}


def normalize_rank(role: str | None) -> str:
    return (role or "").upper()


def scope_level_for(role: str | None) -> ScopeLevel:
    return SCOPE_BY_ROLE.get(normalize_rank(role), "STATION")


def can_invite_rank(inviter_role: str, invitee_role: str) -> bool:
    return normalize_rank(invitee_role) in INVITE_TARGETS.get(normalize_rank(inviter_role), [])


def inviteable_ranks(inviter_role: str) -> list[str]:
    return list(INVITE_TARGETS.get(normalize_rank(inviter_role), []))


def has_wide_case_scope(role: str | None) -> bool:
    """True when officer is not limited to a single station for case queries."""
    return scope_level_for(role) != "STATION"


def is_police_it(role: str | None) -> bool:
    return normalize_rank(role) == "POLICE_IT"


def is_leaf_rank(role: str | None) -> bool:
    return normalize_rank(role) in STATION_LEAF_RANKS


def can_invite_anyone(role: str | None) -> bool:
    return bool(inviteable_ranks(role or ""))


def can_fulfill_resets(role: str | None) -> bool:
    r = normalize_rank(role)
    if r == "POLICE_IT":
        return True
    if r in STATION_LEAF_RANKS:
        return False
    return True


def path_segment_for_id(officer_id: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in officer_id)
    if cleaned and cleaned[0].isdigit():
        cleaned = "o_" + cleaned
    return cleaned or "unknown"


def child_hierarchy_path(parent_path: str | None, new_officer_id: str) -> str:
    seg = path_segment_for_id(new_officer_id)
    if not parent_path:
        return seg
    return f"{parent_path}.{seg}"


def required_geo_fields(invitee_role: str) -> list[str]:
    """Jurisdiction fields required when inviting this rank."""
    level = scope_level_for(invitee_role)
    if level == "STATE":
        return []
    if level == "COMMAND_RANGE":
        return ["commandRangeId"]
    if level == "DISTRICTS":
        return ["districtIds"]  # DIG: one or more
    if level == "DISTRICT":
        return ["districtId"]
    if level == "SUBDIVISION":
        return ["districtId", "rangeId"]
    return ["stationId"]


def admin_capabilities(officer: dict[str, Any]) -> dict[str, Any]:
    """Backward-compatible admin flags (subset of platform_capabilities). """
    return platform_capabilities(officer)


def platform_capabilities(officer: dict[str, Any]) -> dict[str, Any]:
    role = normalize_rank(officer.get("role"))
    level = scope_level_for(role)
    is_it = is_police_it(role)
    is_leaf = is_leaf_rank(role)
    can_write = not is_it  # Police IT is read-only for investigation writes
    can_fir = can_write and role not in STATION_LEAF_RANKS - {"SI"}  # SI may upload; HC/CON no
    if role in {"SI"}:
        can_fir = True
    if role in {"ASI", "HEAD_CONSTABLE", "CONSTABLE"}:
        can_fir = False
    if is_it:
        can_fir = False

    default_home = "/overview" if is_it or role in COMMAND_HOME_RANKS else "/dashboard"

    return {
        "canInvite": can_invite_anyone(role),
        "canFulfillResets": can_fulfill_resets(role),
        "canViewFullOrg": is_it,
        "canViewSubtree": (not is_leaf) or is_it,
        "canManageSmtpHint": is_it,
        "isLeaf": is_leaf,
        "isPoliceIt": is_it,
        "inviteableRanks": inviteable_ranks(role),
        "scopeLevel": level,
        "scopeLabel": SCOPE_LABEL[level],
        "defaultHome": default_home,
        "canWriteCases": can_write,
        "canUploadFir": can_fir,
        "canConfirmMatches": can_write,
        "nav": {
            "overview": True,
            "copilot": not is_it,
            "analytics": not is_it,
            "hotspots": not is_it,
            "earlyWarnings": not is_it,
            "deadlines": not is_it,
            "cases": not is_it,
            "network": not is_it,
            "firIntake": can_fir and not is_it,
            "audit": not is_it,
            # Police IT: dedicated Invite + Password Reset pages; others use Administration
            "invite": is_it and can_invite_anyone(role),
            "passwordResets": is_it and can_fulfill_resets(role),
            "administration": (not is_leaf) or is_it,
            "settings": True,
            "profile": True,
        },
    }
