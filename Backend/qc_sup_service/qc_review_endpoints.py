
# --- QC Review Endpoints for Supervisors ---

class QCImageReview(BaseModel):
    qc_id: UUID
    image_id: UUID
    image_name: str
    qc_s3_path: Optional[str]
    original_s3_path: str
    qc_status: str  # 'Pending', 'Approved', 'Rejected'
    orientation_error: bool
    remarks: Optional[str]
    qc_date: datetime

class QCStatusUpdate(BaseModel):
    qc_status: str  # 'Approved' or 'Rejected'
    orientation_error: bool = False
    remarks: Optional[str] = None

@router.get("/batch-images/{batch_uid}", response_model=List[QCImageReview])
def get_batch_images_for_review(
    batch_uid: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Get all images in a batch with their QC status for supervisor review"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus, Image
    
    # Get the QC allocation for this batch
    allocation = session.exec(
        select(QCAllocation).where(QCAllocation.batch_uid == batch_uid)
    ).first()
    
    if not allocation:
        raise HTTPException(status_code=404, detail="No QC allocation found for this batch")
    
    # Get all QC records with image details
    statement = (
        select(QC, Image)
        .join(Image, QC.image_id == Image.image_id)
        .where(QC.qc_allocation_id == allocation.qc_allocation_id)
        .order_by(Image.image_name)
    )
    
    results = session.exec(statement).all()
    
    images = []
    for qc, img in results:
        images.append(QCImageReview(
            qc_id=qc.qc_id,
            image_id=img.image_id,
            image_name=img.image_name,
            qc_s3_path=img.qc_s3_path,
            original_s3_path=img.original_s3_path,
            qc_status=qc.qc_status.value,
            orientation_error=qc.orientation_error,
            remarks=qc.remarks,
            qc_date=qc.qc_date
        ))
    
    return images

@router.put("/update-qc-status/{qc_id}")
def update_qc_status(
    qc_id: UUID,
    update_data: QCStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Update QC status and remarks for a specific image (Supervisor only)"""
    if current_user.user_role != UserRole.QC_Supervisor:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from common.models import QC, QCStatus
    
    # Get the QC record
    qc_record = session.get(QC, qc_id)
    if not qc_record:
        raise HTTPException(status_code=404, detail="QC record not found")
    
    # Update the QC status
    try:
        qc_record.qc_status = QCStatus(update_data.qc_status)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid QC status: {update_data.qc_status}")
    
    qc_record.orientation_error = update_data.orientation_error
    qc_record.remarks = update_data.remarks
    qc_record.qc_date = get_ist_now()
    
    session.add(qc_record)
    session.commit()
    session.refresh(qc_record)
    
    return {
        "message": "QC status updated successfully",
        "qc_id": str(qc_id),
        "new_status": qc_record.qc_status.value
    }
