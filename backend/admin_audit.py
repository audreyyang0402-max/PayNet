"""Who-changed-what tracking for the admin portal.

Every admin shares the same "admin" role, so this can't gate on role. Instead it
gates on a short, explicit allow-list of emails — the two founders — read from
the SUPER_ADMIN_EMAILS env var. Anyone else with the admin role can still use
the portal normally; they just never see this log and don't get a 403 that
would tip them off it exists (routes return 404 instead).
"""
import os
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import AdminAuditLog, User

# Comma-separated list of emails allowed to read the audit log, e.g.:
#   SUPER_ADMIN_EMAILS=you@example.com,partner@example.com
# Falls back to the two founder accounts on file if the env var isn't set.
# Set this explicitly in backend/.env (and on Render) to be sure it's correct.
_DEFAULT_SUPER_ADMIN_EMAILS = "avaanandha@gmail.com,audreyyang0402@gmail.com"

_SUPER_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("SUPER_ADMIN_EMAILS", _DEFAULT_SUPER_ADMIN_EMAILS).split(",")
    if email.strip()
}


def is_super_admin(user: User) -> bool:
    """True only for the handful of accounts allowed to see the audit log."""
    return bool(user and user.email and user.email.strip().lower() in _SUPER_ADMIN_EMAILS)


async def log_admin_action(
    db: AsyncSession,
    actor: User,
    action: str,
    summary: str,
    target_type: Optional[str] = None,
    target_id: Optional[uuid.UUID | str] = None,
    target_label: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Queue one audit row on the given session. Does NOT commit.

    Call this right before the endpoint's own `await db.commit()` so the log
    entry lands in the same transaction as the change it describes — if the
    change fails and rolls back, so does the log entry.
    """
    db.add(AdminAuditLog(
        actor_user_id=actor.id if actor else None,
        actor_name=actor.name if actor else "Unknown",
        actor_email=actor.email if actor else "unknown",
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        target_label=target_label,
        summary=summary,
        details=details,
    ))
