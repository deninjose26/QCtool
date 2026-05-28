from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from sqlmodel import Session, select, desc
from common.database import get_session
from common.auth_utils import get_current_user
from common.models import User, Notification, NotificationType
from pydantic import BaseModel

router = APIRouter(prefix="/notifications", tags=["Notifications"])

class NotificationRead(BaseModel):
    notification_id: UUID
    type: str
    title: str
    message: str
    link: Optional[str]
    is_read: bool
    created_date: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[NotificationRead])
def get_my_notifications(
    limit: int = 20,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Fetch recent notifications for the current user."""
    statement = select(Notification).where(
        Notification.user_id == current_user.user_id
    ).order_by(desc(Notification.created_date)).limit(limit)
    
    return session.exec(statement).all()

@router.get("/unread-count")
def get_unread_count(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get the count of unread notifications using SQL COUNT (optimized)."""
    from sqlalchemy import func
    count = session.exec(
        select(func.count(Notification.notification_id)).where(
            Notification.user_id == current_user.user_id,
            Notification.is_read == False
        )
    ).first() or 0
    return {"count": count}

@router.patch("/{notification_id}/read")
def mark_as_read(
    notification_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Mark a specific notification as read."""
    notification = session.get(Notification, notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if notification.user_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    notification.is_read = True
    session.add(notification)
    session.commit()
    return {"message": "Notification marked as read"}

@router.patch("/read-all")
def mark_all_as_read(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read for the current user."""
    statement = select(Notification).where(
        Notification.user_id == current_user.user_id,
        Notification.is_read == False
    )
    unread_notifications = session.exec(statement).all()
    
    for notification in unread_notifications:
        notification.is_read = True
        session.add(notification)
    
    session.commit()
    return {"message": f"Marked {len(unread_notifications)} notifications as read"}
