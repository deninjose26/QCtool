"""
Audit Logging Utility

Provides helper functions to log user actions to the audit_logs table.
"""

from sqlmodel import Session, select
from common.models import AuditLog, SystemSettings, User
from uuid import UUID
from datetime import datetime
import json
from typing import Optional, Any


def is_audit_logging_enabled(session: Session) -> bool:
    """Check if audit logging is enabled in system settings"""
    setting = session.get(SystemSettings, "enable_audit_logs")
    return setting and setting.setting_value == "true"


def log_action(
    session: Session,
    user_id: UUID,
    username: str,
    action: str,
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    ip_address: Optional[str] = None,
    payload: Optional[Any] = None,
    result: str = "success"
) -> None:
    """
    Log a user action to the audit_logs table.
    
    Args:
        session: Database session
        user_id: UUID of the user performing the action
        username: Username of the user
        action: Description of the action (e.g., "CREATE_SOURCE", "UPDATE_PROJECT")
        endpoint: API endpoint called (e.g., "/admin/sources")
        method: HTTP method (e.g., "POST", "PUT", "DELETE")
        ip_address: IP address of the request
        payload: Request payload or relevant data (will be JSON serialized)
        result: Result of the action ("success" or "failure")
    """
    # Serialize payload to JSON if provided
    payload_str = None
    if payload is not None:
        try:
            if isinstance(payload, str):
                payload_str = payload
            else:
                payload_str = json.dumps(payload, default=str)
        except Exception:
            payload_str = str(payload)
    
    # Create audit log entry
    audit_log = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        endpoint=endpoint,
        method=method,
        ip_address=ip_address,
        payload=payload_str,
        result=result,
        timestamp=datetime.utcnow()
    )
    
    try:
        session.add(audit_log)
        session.commit()
    except Exception as e:
        # Don't let audit logging failures break the main operation
        print(f"Warning: Failed to log audit entry: {e}")
        session.rollback()


def log_user_action(
    session: Session,
    user: User,
    action: str,
    details: Optional[dict] = None,
    result: str = "success"
) -> None:
    """
    Simplified helper to log a user action.
    
    Args:
        session: Database session
        user: User object
        action: Action description
        details: Optional dictionary with action details
        result: Result of the action
    """
    log_action(
        session=session,
        user_id=user.user_id,
        username=user.username,
        action=action,
        payload=details,
        result=result
    )
