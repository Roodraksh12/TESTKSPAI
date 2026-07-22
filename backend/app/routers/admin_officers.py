from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.deps import get_current_user
from app.services.case_access import (
    create_audit_log,
    jurisdiction_station_filter_sql,
    load_officer_by_badge,
    load_officer_by_id,
    officer_user_payload,
)
from app.services.db import execute, fetch_all, fetch_one, new_id
from app.services.hierarchy import (
    admin_capabilities,
    can_invite_rank,
    child_hierarchy_path,
    is_police_it,
    is_leaf_rank,
    required_geo_fields,
    scope_level_for,
    SHO_RANKS,
)
from app.services.mailer import send_invite_email, send_reset_email
from app.services.parallel import invalidate_all
from app.services.passwords import generate_temp_password, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


class InviteRequest(BaseModel):
    name: str
    badgeId: str
    role: str
    email: str
    stationId: str | None = None
    districtId: str | None = None
    districtIds: list[str] | None = None
    rangeId: str | None = None
    commandRangeId: str | None = None


def _require_not_leaf(officer: dict) -> None:
    if is_leaf_rank(officer.get("role")) and not is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="No administration functions for this rank")


def _is_ancestor_of(actor: dict, target: dict) -> bool:
    if is_police_it(actor.get("role")):
        return True
    actor_path = actor.get("hierarchyPath") or ""
    target_path = target.get("hierarchyPath") or ""
    if not actor_path or not target_path:
        return False
    # ltree ancestor: actor @> target means actor path is prefix of target
    row = fetch_one(
        "SELECT (%(a)s::ltree @> %(t)s::ltree) AS ok",
        {"a": actor_path, "t": target_path},
    )
    return bool(row and row.get("ok"))


def _require_invite_geo(role: str, payload: InviteRequest) -> None:
    missing = []
    for field in required_geo_fields(role):
        if field == "districtIds":
            ids = payload.districtIds or ([payload.districtId] if payload.districtId else [])
            if not ids:
                missing.append("districtIds")
        elif not getattr(payload, field, None):
            missing.append(field)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing jurisdiction fields for {role}: {', '.join(missing)}",
        )


def _jurisdiction_ok(inviter: dict, payload: InviteRequest) -> None:
    if is_police_it(inviter.get("role")):
        return
    inviter_level = scope_level_for(inviter.get("role"))
    inviter_district = inviter.get("districtId")
    inviter_range = inviter.get("rangeId")
    inviter_station = inviter.get("stationId")
    inviter_cr = inviter.get("commandRangeId")
    role = (payload.role or "").upper()

    if payload.commandRangeId and inviter_cr and payload.commandRangeId != inviter_cr:
        if inviter_level not in {"STATE"}:
            raise HTTPException(status_code=403, detail="Command range outside your jurisdiction")

    if payload.districtId and inviter_district and payload.districtId != inviter_district:
        if inviter_level in {"DISTRICT", "SUBDIVISION", "STATION"}:
            raise HTTPException(status_code=403, detail="Invitee district outside your jurisdiction")
        if inviter_level == "DISTRICTS":
            allowed = set(inviter.get("districtIds") or [])
            if payload.districtId not in allowed:
                raise HTTPException(status_code=403, detail="Invitee district outside your jurisdiction")

    if payload.districtIds and inviter_level == "DISTRICTS":
        allowed = set(inviter.get("districtIds") or [])
        if not set(payload.districtIds).issubset(allowed):
            raise HTTPException(status_code=403, detail="District set outside your jurisdiction")

    if payload.rangeId and inviter_range and payload.rangeId != inviter_range:
        if inviter_level in {"SUBDIVISION", "STATION"}:
            raise HTTPException(status_code=403, detail="Invitee subdivision outside your jurisdiction")

    if role in SHO_RANKS or role in {"SI", "ASI", "HEAD_CONSTABLE", "CONSTABLE", "DYSP"}:
        if inviter_station and payload.stationId and payload.stationId != inviter_station:
            if (inviter.get("role") or "").upper() in SHO_RANKS:
                raise HTTPException(status_code=403, detail="Can only add officers to your station")


@router.get("/capabilities")
def capabilities(current_user: dict = Depends(get_current_user)) -> dict:
    return admin_capabilities(current_user["officer"])


@router.post("/invitations")
def create_invitation(
    payload: InviteRequest,
    current_user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    inviter = current_user["officer"]
    _require_not_leaf(inviter)

    role = payload.role.strip().upper()
    if not can_invite_rank(inviter.get("role"), role):
        raise HTTPException(
            status_code=403,
            detail=f"Your rank cannot invite {role}",
        )

    badge = payload.badgeId.strip()
    if load_officer_by_badge(badge):
        raise HTTPException(status_code=409, detail="Badge ID already exists")

    _require_invite_geo(role, payload)
    _jurisdiction_ok(inviter, payload)

    station_id = payload.stationId
    district_id = payload.districtId or inviter.get("districtId")
    range_id = payload.rangeId
    command_range_id = payload.commandRangeId
    district_ids = list(payload.districtIds or [])
    if not district_ids and payload.districtId:
        district_ids = [payload.districtId]

    level = scope_level_for(role)

    if level == "STATE":
        station_id = None
        district_id = None
        range_id = None
        command_range_id = None
        district_ids = []
    elif level == "COMMAND_RANGE":
        station_id = None
        district_id = None
        range_id = None
        if not command_range_id:
            raise HTTPException(status_code=400, detail="commandRangeId is required")
    elif level == "DISTRICTS":
        station_id = None
        range_id = None
        if not district_ids:
            raise HTTPException(status_code=400, detail="districtIds is required for DIG")
        district_id = district_ids[0]
        # Inherit command range from first district when possible
        dist = fetch_one(
            'SELECT "commandRangeId" FROM "District" WHERE id = %(id)s',
            {"id": district_id},
        )
        command_range_id = (dist or {}).get("commandRangeId") or command_range_id
    elif level == "DISTRICT":
        station_id = None
        range_id = None
        if not district_id:
            raise HTTPException(status_code=400, detail="districtId is required")
        dist = fetch_one(
            'SELECT "commandRangeId" FROM "District" WHERE id = %(id)s',
            {"id": district_id},
        )
        command_range_id = (dist or {}).get("commandRangeId") or command_range_id
    elif level == "SUBDIVISION":
        station_id = None
        if not district_id or not range_id:
            raise HTTPException(status_code=400, detail="districtId and rangeId are required for DySP")
    else:
        # STATION personnel
        if (inviter.get("role") or "").upper() in SHO_RANKS:
            station_id = inviter.get("stationId")
        if not station_id:
            raise HTTPException(status_code=400, detail="stationId is required for station personnel")
        st = fetch_one(
            'SELECT "districtId", "rangeId" FROM "PoliceStation" WHERE id = %(id)s',
            {"id": station_id},
        )
        if not st:
            raise HTTPException(status_code=400, detail="Unknown station")
        district_id = st["districtId"]
        range_id = st.get("rangeId")
        dist = fetch_one(
            'SELECT "commandRangeId" FROM "District" WHERE id = %(id)s',
            {"id": district_id},
        )
        command_range_id = (dist or {}).get("commandRangeId")

    officer_id = new_id()
    temp_password = generate_temp_password()
    password_hash = hash_password(temp_password)
    hierarchy_path = child_hierarchy_path(inviter.get("hierarchyPath"), officer_id)
    email = (payload.email or "").strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email is required to send invite credentials")
    channel = "email"

    expires = datetime.now(timezone.utc) + timedelta(hours=settings.temp_password_ttl_hours)

    execute(
        '''
        INSERT INTO "Officer" (
          id, "badgeId", "passwordHash", name, role, "stationId",
          email, "districtId", "rangeId", "commandRangeId", "reportingOfficerId",
          "hierarchyPath", status, "createdById"
        ) VALUES (
          %(id)s, %(badgeId)s, %(passwordHash)s, %(name)s, %(role)s::"Role", %(stationId)s,
          %(email)s, %(districtId)s, %(rangeId)s, %(commandRangeId)s, %(reportingOfficerId)s,
          %(hierarchyPath)s::ltree, 'MUST_CHANGE_PASSWORD', %(createdById)s
        )
        ''',
        {
            "id": officer_id,
            "badgeId": badge,
            "passwordHash": password_hash,
            "name": payload.name.strip(),
            "role": role,
            "stationId": station_id,
            "email": email,
            "districtId": district_id,
            "rangeId": range_id,
            "commandRangeId": command_range_id,
            "reportingOfficerId": inviter["id"],
            "hierarchyPath": hierarchy_path,
            "createdById": inviter["id"],
        },
    )

    if level == "DISTRICTS":
        for did in district_ids:
            execute(
                '''
                INSERT INTO "OfficerDistrict" ("officerId", "districtId")
                VALUES (%(officerId)s, %(districtId)s)
                ON CONFLICT DO NOTHING
                ''',
                {"officerId": officer_id, "districtId": did},
            )

    inv_id = new_id()
    execute(
        '''
        INSERT INTO "Invitation" (
          id, "invitedOfficerId", "invitedById", "tempPasswordHash",
          "expiresAt", channel, "createdAt"
        ) VALUES (
          %(id)s, %(invitedOfficerId)s, %(invitedById)s, %(tempPasswordHash)s,
          %(expiresAt)s, %(channel)s, NOW()
        )
        ''',
        {
            "id": inv_id,
            "invitedOfficerId": officer_id,
            "invitedById": inviter["id"],
            "tempPasswordHash": password_hash,
            "expiresAt": expires,
            "channel": channel,
        },
    )

    create_audit_log(
        inviter["id"],
        "INVITE_SENT",
        "OFFICER",
        officer_id,
        f"Invited {badge} as {role} via {channel}",
    )
    invalidate_all()

    emailed = False
    if email:
        emailed = send_invite_email(
            email,
            payload.name.strip(),
            badge,
            temp_password,
            settings,
            role=role,
        )

    created = load_officer_by_id(officer_id)
    response: dict = {
        "officer": officer_user_payload(created) if created else {"id": officer_id, "badgeId": badge},
        "invitationId": inv_id,
        "channel": channel,
        "emailed": emailed,
        "expiresAt": expires.isoformat(),
    }
    # Surface temp password if SMTP failed so the inviter can still deliver credentials
    if not emailed:
        response["tempPassword"] = temp_password
    return response


@router.get("/invitations")
def list_invitations(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    _require_not_leaf(officer)
    if is_police_it(officer.get("role")):
        rows = fetch_all(
            '''
            SELECT i.*, o."badgeId", o.name, o.role, o.status
            FROM "Invitation" i
            JOIN "Officer" o ON i."invitedOfficerId" = o.id
            ORDER BY i."createdAt" DESC
            LIMIT 100
            '''
        )
    else:
        path = officer.get("hierarchyPath") or ""
        rows = fetch_all(
            '''
            SELECT i.*, o."badgeId", o.name, o.role, o.status
            FROM "Invitation" i
            JOIN "Officer" o ON i."invitedOfficerId" = o.id
            WHERE o."hierarchyPath" <@ %(path)s::ltree
            ORDER BY i."createdAt" DESC
            LIMIT 100
            ''',
            {"path": path},
        )
    return {"invitations": rows}


@router.get("/subtree")
def list_subtree(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    if is_leaf_rank(officer.get("role")) and not is_police_it(officer.get("role")):
        return {"officers": [officer_user_payload(officer)]}

    if is_police_it(officer.get("role")):
        rows = fetch_all(
            '''
            SELECT o.id, o."badgeId", o.name, o.role, o."stationId", o.email,
                   o."districtId", o."rangeId", o."reportingOfficerId",
                   o."hierarchyPath"::text AS "hierarchyPath", o.status,
                   ps.name AS "stationName", d.name AS "districtName"
            FROM "Officer" o
            LEFT JOIN "PoliceStation" ps ON o."stationId" = ps.id
            LEFT JOIN "District" d ON COALESCE(o."districtId", ps."districtId") = d.id
            ORDER BY o."hierarchyPath"
            LIMIT 500
            '''
        )
    else:
        path = officer.get("hierarchyPath") or ""
        rows = fetch_all(
            '''
            SELECT o.id, o."badgeId", o.name, o.role, o."stationId", o.email,
                   o."districtId", o."rangeId", o."reportingOfficerId",
                   o."hierarchyPath"::text AS "hierarchyPath", o.status,
                   ps.name AS "stationName", d.name AS "districtName"
            FROM "Officer" o
            LEFT JOIN "PoliceStation" ps ON o."stationId" = ps.id
            LEFT JOIN "District" d ON COALESCE(o."districtId", ps."districtId") = d.id
            WHERE o."hierarchyPath" <@ %(path)s::ltree
            ORDER BY o."hierarchyPath"
            LIMIT 500
            ''',
            {"path": path},
        )

    officers = []
    for row in rows:
        row["districtId"] = row.get("districtId")
        officers.append(officer_user_payload(row))
    return {"officers": officers}


@router.get("/org-tree")
def org_tree(current_user: dict = Depends(get_current_user)) -> dict:
    data = list_subtree(current_user)
    by_id = {o["id"]: {**o, "children": []} for o in data["officers"]}
    roots = []
    for o in data["officers"]:
        parent = o.get("reportingOfficerId")
        if parent and parent in by_id:
            by_id[parent]["children"].append(by_id[o["id"]])
        else:
            roots.append(by_id[o["id"]])
    return {"tree": roots}


@router.get("/password-resets")
def list_password_resets(
    status: str = "PENDING",
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    caps = admin_capabilities(officer)
    if not caps["canFulfillResets"]:
        raise HTTPException(status_code=403, detail="Cannot view password reset queue")

    if is_police_it(officer.get("role")):
        rows = fetch_all(
            '''
            SELECT r.*, o."badgeId", o.name, o.role, o."hierarchyPath"::text AS "hierarchyPath"
            FROM "PasswordResetRequest" r
            JOIN "Officer" o ON r."officerId" = o.id
            WHERE r.status = %(status)s::"ResetRequestStatus"
            ORDER BY r."requestedAt" DESC
            LIMIT 100
            ''',
            {"status": status},
        )
    else:
        path = officer.get("hierarchyPath") or ""
        rows = fetch_all(
            '''
            SELECT r.*, o."badgeId", o.name, o.role, o."hierarchyPath"::text AS "hierarchyPath"
            FROM "PasswordResetRequest" r
            JOIN "Officer" o ON r."officerId" = o.id
            WHERE r.status = %(status)s::"ResetRequestStatus"
              AND o."hierarchyPath" <@ %(path)s::ltree
              AND o.id <> %(self)s
            ORDER BY r."requestedAt" DESC
            LIMIT 100
            ''',
            {"status": status, "path": path, "self": officer["id"]},
        )
    return {"requests": rows}


@router.post("/password-resets/{request_id}/fulfill")
def fulfill_password_reset(
    request_id: str,
    current_user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    actor = current_user["officer"]
    caps = admin_capabilities(actor)
    if not caps["canFulfillResets"]:
        raise HTTPException(status_code=403, detail="Cannot fulfill password resets")

    req = fetch_one(
        'SELECT * FROM "PasswordResetRequest" WHERE id = %(id)s',
        {"id": request_id},
    )
    if not req:
        raise HTTPException(status_code=404, detail="Reset request not found")
    if req["status"] != "PENDING":
        raise HTTPException(status_code=400, detail="Request already handled")

    target = load_officer_by_id(req["officerId"])
    if not target:
        raise HTTPException(status_code=404, detail="Officer not found")

    if not _is_ancestor_of(actor, target):
        raise HTTPException(status_code=403, detail="Not an ancestor of this officer")

    temp_password = generate_temp_password()
    password_hash = hash_password(temp_password)
    execute(
        '''
        UPDATE "Officer"
        SET "passwordHash" = %(passwordHash)s, status = 'MUST_CHANGE_PASSWORD'
        WHERE id = %(id)s
        ''',
        {"passwordHash": password_hash, "id": target["id"]},
    )
    execute(
        '''
        UPDATE "PasswordResetRequest"
        SET status = 'FULFILLED', "fulfilledById" = %(by)s, "fulfilledAt" = NOW()
        WHERE id = %(id)s
        ''',
        {"by": actor["id"], "id": request_id},
    )
    inv_id = new_id()
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.temp_password_ttl_hours)
    execute(
        '''
        INSERT INTO "Invitation" (
          id, "invitedOfficerId", "invitedById", "tempPasswordHash",
          "expiresAt", channel, "createdAt"
        ) VALUES (
          %(id)s, %(oid)s, %(by)s, %(hash)s, %(exp)s, 'reset', NOW()
        )
        ''',
        {
            "id": inv_id,
            "oid": target["id"],
            "by": actor["id"],
            "hash": password_hash,
            "exp": expires,
        },
    )
    create_audit_log(
        actor["id"],
        "RESET_FULFILLED",
        "PASSWORD_RESET",
        request_id,
        f"Reset fulfilled for {target['badgeId']}",
    )
    invalidate_all()

    emailed = False
    if target.get("email"):
        emailed = send_reset_email(
            target["email"],
            target["name"],
            target["badgeId"],
            temp_password,
            settings,
        )

    result: dict = {"ok": True, "emailed": emailed, "expiresAt": expires.isoformat()}
    if not emailed:
        result["tempPassword"] = temp_password
    return result


@router.get("/it-dashboard")
def it_dashboard(current_user: dict = Depends(get_current_user)) -> dict:
    """Police IT home metrics — officers, password resets, SMTP (not crime KPIs)."""
    officer = current_user["officer"]
    if not is_police_it(officer.get("role")):
        raise HTTPException(status_code=403, detail="Police IT only")

    total_officers = fetch_one('SELECT COUNT(*)::int AS n FROM "Officer"') or {"n": 0}
    by_status = fetch_all(
        '''
        SELECT status::text AS status, COUNT(*)::int AS n
        FROM "Officer"
        GROUP BY status
        '''
    )
    by_role = fetch_all(
        '''
        SELECT role::text AS role, COUNT(*)::int AS n
        FROM "Officer"
        GROUP BY role
        ORDER BY n DESC
        LIMIT 12
        '''
    )
    pending_resets = fetch_one(
        '''
        SELECT COUNT(*)::int AS n FROM "PasswordResetRequest"
        WHERE status = 'PENDING'::"ResetRequestStatus"
        '''
    ) or {"n": 0}
    must_change = fetch_one(
        '''
        SELECT COUNT(*)::int AS n FROM "Officer"
        WHERE status = 'MUST_CHANGE_PASSWORD'::"OfficerStatus"
        '''
    ) or {"n": 0}
    recent_invites = fetch_all(
        '''
        SELECT i.id, i."createdAt", i.channel, o."badgeId", o.name, o.role, o.status
        FROM "Invitation" i
        JOIN "Officer" o ON i."invitedOfficerId" = o.id
        ORDER BY i."createdAt" DESC
        LIMIT 8
        '''
    )
    settings = get_settings()

    status_map = {row["status"]: row["n"] for row in by_status}
    return {
        "officer": {
            "name": officer.get("name"),
            "badgeId": officer.get("badgeId"),
            "role": officer.get("role"),
            "scopeLabel": "Statewide — Police IT",
        },
        "stats": {
            "totalOfficers": int(total_officers.get("n") or 0),
            "pendingPasswordResets": int(pending_resets.get("n") or 0),
            "mustChangePassword": int(must_change.get("n") or 0),
            "activeOfficers": int(status_map.get("ACTIVE") or 0),
        },
        "officersByRole": by_role,
        "recentInvites": recent_invites,
        "smtp": {
            "configured": settings.smtp_configured,
            "host": settings.smtp_host or None,
            "from": settings.smtp_from or None,
        },
    }


@router.get("/smtp-status")
def smtp_status(
    current_user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not is_police_it(current_user["officer"].get("role")):
        raise HTTPException(status_code=403, detail="Police IT only")
    return {
        "configured": settings.smtp_configured,
        "host": settings.smtp_host or None,
        "port": settings.smtp_port,
        "from": settings.smtp_from or None,
        "useTls": settings.smtp_use_tls,
        "appPublicUrl": settings.app_public_url,
    }


@router.get("/stations")
def list_stations(current_user: dict = Depends(get_current_user)) -> dict:
    """Stations the current officer may assign when inviting."""
    officer = current_user["officer"]
    scope_sql, scope_params = jurisdiction_station_filter_sql(officer, alias="ps")
    rows = fetch_all(
        f'''
        SELECT ps.id, ps.name, ps."districtId", ps."rangeId", d.name AS "districtName"
        FROM "PoliceStation" ps
        JOIN "District" d ON ps."districtId" = d.id
        WHERE 1=1{scope_sql}
        ORDER BY d.name, ps.name
        ''',
        scope_params,
    )
    return {"stations": rows}


@router.get("/command-ranges")
def list_command_ranges(current_user: dict = Depends(get_current_user)) -> dict:
    officer = current_user["officer"]
    _require_not_leaf(officer)
    if is_police_it(officer.get("role")) or scope_level_for(officer.get("role")) == "STATE":
        rows = fetch_all('SELECT id, name FROM "CommandRange" ORDER BY name')
    elif officer.get("commandRangeId"):
        rows = fetch_all(
            'SELECT id, name FROM "CommandRange" WHERE id = %(id)s',
            {"id": officer["commandRangeId"]},
        )
    else:
        rows = []
    return {"commandRanges": rows}


@router.get("/districts")
def list_districts(
    commandRangeId: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> dict:
    officer = current_user["officer"]
    _require_not_leaf(officer)
    level = scope_level_for(officer.get("role"))
    params: dict = {}
    where = "WHERE 1=1"

    if is_police_it(officer.get("role")) or level == "STATE":
        if commandRangeId:
            where += ' AND d."commandRangeId" = %(commandRangeId)s'
            params["commandRangeId"] = commandRangeId
    elif level == "COMMAND_RANGE":
        where += ' AND d."commandRangeId" = %(commandRangeId)s'
        params["commandRangeId"] = officer.get("commandRangeId") or commandRangeId
        if not params["commandRangeId"]:
            return {"districts": []}
    elif level == "DISTRICTS":
        ids = officer.get("districtIds") or []
        if not ids:
            return {"districts": []}
        where += " AND d.id = ANY(%(ids)s)"
        params["ids"] = list(ids)
    elif officer.get("districtId"):
        where += " AND d.id = %(id)s"
        params["id"] = officer["districtId"]
    else:
        return {"districts": []}

    rows = fetch_all(
        f'''
        SELECT d.id, d.name, d."commandRangeId", cr.name AS "commandRangeName"
        FROM "District" d
        LEFT JOIN "CommandRange" cr ON d."commandRangeId" = cr.id
        {where}
        ORDER BY d.name
        ''',
        params,
    )
    return {"districts": rows}


@router.get("/subdivisions")
def list_subdivisions(
    districtId: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """DySP subdivisions (`Range` table)."""
    officer = current_user["officer"]
    _require_not_leaf(officer)
    level = scope_level_for(officer.get("role"))
    params: dict = {}
    where = "WHERE 1=1"

    if level == "SUBDIVISION" and officer.get("rangeId"):
        where += " AND r.id = %(id)s"
        params["id"] = officer["rangeId"]
    elif districtId:
        where += ' AND r."districtId" = %(districtId)s'
        params["districtId"] = districtId
    elif officer.get("districtId"):
        where += ' AND r."districtId" = %(districtId)s'
        params["districtId"] = officer["districtId"]
    elif is_police_it(officer.get("role")) or level == "STATE":
        pass
    else:
        # Restrict to districts in inviter scope via officer geo
        if level == "COMMAND_RANGE" and officer.get("commandRangeId"):
            where += (
                ' AND r."districtId" IN ('
                'SELECT id FROM "District" WHERE "commandRangeId" = %(cr)s)'
            )
            params["cr"] = officer["commandRangeId"]
        elif level == "DISTRICTS":
            ids = officer.get("districtIds") or []
            if not ids:
                return {"subdivisions": []}
            where += ' AND r."districtId" = ANY(%(ids)s)'
            params["ids"] = list(ids)
        elif officer.get("districtId"):
            where += ' AND r."districtId" = %(districtId)s'
            params["districtId"] = officer["districtId"]
        else:
            return {"subdivisions": []}

    rows = fetch_all(
        f'''
        SELECT r.id, r.name, r."districtId", d.name AS "districtName"
        FROM "Range" r
        JOIN "District" d ON r."districtId" = d.id
        {where}
        ORDER BY d.name, r.name
        ''',
        params,
    )
    return {"subdivisions": rows}
