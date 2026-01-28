from uuid import UUID
from typing import Optional
from sqlmodel import Session
from common.models import Notification, NotificationType

def create_notification(
    session: Session,
    user_id: UUID,
    notif_type: NotificationType,
    title: str,
    message: str,
    link: Optional[str] = None
):
    """
    Utility function to create a persistent notification in the database.
    Does NOT commit the session - host function should handle commit.
    """
    new_notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        message=message,
        link=link
    )
    session.add(new_notif)
    return new_notif
