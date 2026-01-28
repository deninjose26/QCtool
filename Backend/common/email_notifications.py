import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from dotenv import load_dotenv
from typing import List, Dict, Any
from datetime import datetime

load_dotenv()

def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Base function to send emails"""
    mail_server = os.getenv("MAIL_SERVER")
    mail_port = int(os.getenv("MAIL_PORT", 587))
    mail_username = os.getenv("MAIL_USERNAME")
    mail_password = os.getenv("MAIL_PASSWORD")
    mail_from = os.getenv("MAIL_FROM")
    
    if not all([mail_server, mail_username, mail_password, mail_from]):
        print("Email credentials not fully configured in .env")
        return False

    msg = MIMEMultipart('related')
    msg['From'] = mail_from
    msg['To'] = to_email
    msg['Subject'] = subject
    
    # Create the HTML part
    msg_html = MIMEText(html_body, 'html')
    msg.attach(msg_html)

    # Attach the logo
    logo_path = r"e:\QCtool\Frontend\src\assets\logo.png"
    if os.path.exists(logo_path):
        with open(logo_path, 'rb') as f:
            logo_img = MIMEImage(f.read())
            logo_img.add_header('Content-ID', '<logo>')
            logo_img.add_header('Content-Disposition', 'inline', filename='logo.png')
            msg.attach(logo_img)

    try:
        server = smtplib.SMTP(mail_server, mail_port)
        server.starttls()
        server.login(mail_username, mail_password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Error sending email: {str(e)}")
        return False


def send_user_creation_email(to_email: str, name: str, username: str, password: str, role: str):
    """Send email when a new user is created"""
    subject = "Welcome to FamilyaConnect QC Portal - Account Created"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">Welcome to QC Portal</h2>
            <p>Hello <strong>{name}</strong>,</p>
            <p>An account has been created for you on the FamilyaConnect QC Portal with the role of <strong>{role}</strong>.</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Username:</strong> {username}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> {password}</p>
            </div>
            
            <p>Please log in and change your password as soon as possible for security reasons.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)


def send_vendor_allocation_email(to_email: str, vendor_name: str, allocation_details: Dict[str, Any]):
    """Send email to vendor when a new allocation is made"""
    subject = "New Source Allocation - FamilyaConnect QC Portal"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">New Allocation Assigned</h2>
            <p>Hello <strong>{vendor_name}</strong>,</p>
            <p>A new source has been allocated to you:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Project:</strong> {allocation_details.get('project_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Source:</strong> {allocation_details.get('source_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> {allocation_details.get('location_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Record Owner:</strong> {allocation_details.get('record_owner_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Allocated Date:</strong> {allocation_details.get('allocation_date', 'N/A')}</p>
            </div>
            
            <p>Please log in to the portal to view complete details and begin work.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)



def send_operator_batch_allocation_email(to_email: str, operator_name: str, batch_details: Dict[str, Any]):
    """Send email to scanning operator when a batch is allocated"""
    subject = "New Batch Allocated - FamilyaConnect QC Portal"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">New Batch Allocated</h2>
            <p>Hello <strong>{operator_name}</strong>,</p>
            <p>A new batch has been allocated to you for scanning:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Project:</strong> {batch_details.get('project_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Source:</strong> {batch_details.get('source_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> {batch_details.get('location_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Record Owner:</strong> {batch_details.get('record_owner_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Allocated Date:</strong> {batch_details.get('allocation_date', 'N/A')}</p>
            </div>
            
            <p>Please log in to the portal to begin uploading images for this batch.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)



def send_reupload_batch_email(to_email: str, operator_name: str, batch_details: Dict[str, Any]):
    """Send email to operator when a re-upload batch is allocated"""
    subject = "Re-upload Required - FamilyaConnect QC Portal"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #dc2626; text-align: center;">Re-upload Required</h2>
            <p>Hello <strong>{operator_name}</strong>,</p>
            <p>A batch requires re-upload due to QC rejection:</p>
            
            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <p style="margin: 5px 0;"><strong>Project:</strong> {batch_details.get('project_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Source:</strong> {batch_details.get('source_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Location:</strong> {batch_details.get('location_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Record Owner:</strong> {batch_details.get('record_owner_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Book Name:</strong> {batch_details.get('book_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Allocated Date:</strong> {batch_details.get('allocation_date', 'N/A')}</p>
            </div>
            
            <p>Please log in to the portal to view the rejected images and re-upload corrected versions.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)



def send_qc_batch_available_email(to_email: str, manager_name: str, batch_count: int, upload_type: str):
    """Send email to QC Manager when new batches are available for allocation"""
    subject = f"New {upload_type} Batches Available for QC Allocation"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">New Batches Available</h2>
            <p>Hello <strong>{manager_name}</strong>,</p>
            <p><strong>{batch_count}</strong> new <strong>{upload_type}</strong> batch(es) are now available for QC allocation.</p>
            
            <p>Please log in to the portal to allocate these batches to QC users.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)


def send_qc_user_allocation_email(to_email: str, user_name: str, batch_details: Dict[str, Any]):
    """Send email to QC User when a batch is allocated to them"""
    subject = "New QC Batch Allocated - FamilyaConnect QC Portal"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">New QC Batch Allocated</h2>
            <p>Hello <strong>{user_name}</strong>,</p>
            <p>A new batch has been allocated to you for quality control:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Batch ID:</strong> {batch_details.get('batch_id', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Project:</strong> {batch_details.get('project_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Total Images:</strong> {batch_details.get('total_count', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Upload Type:</strong> {batch_details.get('upload_type', 'N/A')}</p>
            </div>
            
            <p>Please log in to the portal to begin QC review.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)


def send_qc_completed_notification_email(to_email: str, manager_name: str, batch_details: Dict[str, Any]):
    """Send email to QC Manager when a QC user completes a batch"""
    subject = "QC Batch Completed - Verification Required"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">QC Batch Completed</h2>
            <p>Hello <strong>{manager_name}</strong>,</p>
            <p>A QC batch has been completed and requires your verification:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Batch ID:</strong> {batch_details.get('batch_id', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>QC User:</strong> {batch_details.get('qc_user_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Accepted:</strong> {batch_details.get('accepted_count', 0)}</p>
                <p style="margin: 5px 0;"><strong>Rejected:</strong> {batch_details.get('rejected_count', 0)}</p>
                <p style="margin: 5px 0;"><strong>Completed Date:</strong> {batch_details.get('completed_date', 'N/A')}</p>
            </div>
            
            <p>Please log in to the portal to review and verify this batch.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)


def send_batch_verification_with_rejection_email(to_email: str, vendor_name: str, batch_details: Dict[str, Any]):
    """Send email to vendor when a batch is verified with rejections"""
    subject = "Batch Verified with Rejections - Action Required"
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #dc2626; text-align: center;">Batch Verified with Rejections</h2>
            <p>Hello <strong>{vendor_name}</strong>,</p>
            <p>A batch has been verified by the QC Manager and contains rejected images:</p>
            
            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <p style="margin: 5px 0;"><strong>Batch ID:</strong> {batch_details.get('batch_id', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Project:</strong> {batch_details.get('project_name', 'N/A')}</p>
                <p style="margin: 5px 0;"><strong>Total Images:</strong> {batch_details.get('total_count', 0)}</p>
                <p style="margin: 5px 0;"><strong>Accepted:</strong> {batch_details.get('accepted_count', 0)}</p>
                <p style="margin: 5px 0;"><strong>Rejected:</strong> {batch_details.get('rejected_count', 0)}</p>
            </div>
            
            <p>Please coordinate with your scanning operators to re-upload the rejected images.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)


def send_daily_upload_summary_email(to_email: str, manager_name: str, summary_data: Dict[str, Any]):
    """Send daily upload summary to Upload Managers"""
    subject = f"Daily Upload Summary - {summary_data.get('date', 'Today')}"
    
    batches_html = ""
    for batch in summary_data.get('batches', []):
        batches_html += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('vendor_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('project_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('source_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('location_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('record_owner_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('book_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('upload_type', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('upload_count', 0)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('status', 'N/A')}</td>
        </tr>
        """
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">Daily Upload Summary</h2>
            <p>Hello <strong>{manager_name}</strong>,</p>
            <p>Here's the upload summary for the last 24 hours:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Total Batches:</strong> {summary_data.get('total_batches', 0)}</p>
                <p style="margin: 5px 0;"><strong>Complete Uploads:</strong> {summary_data.get('complete_uploads', 0)}</p>
                <p style="margin: 5px 0;"><strong>Partial Uploads:</strong> {summary_data.get('partial_uploads', 0)}</p>
                <p style="margin: 5px 0;"><strong>Re-uploads:</strong> {summary_data.get('reuploads', 0)}</p>
                <p style="margin: 5px 0;"><strong>Total Images:</strong> {summary_data.get('total_images', 0)}</p>
            </div>
            
            <h3 style="color: #374151; margin-top: 30px;">Batch Details:</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Vendor</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Project</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Source</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Location</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Record Owner</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Book Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Type</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Images</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches_html if batches_html else '<tr><td colspan="9" style="padding: 20px; text-align: center; color: #6b7280;">No uploads in the last 24 hours</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)



def send_daily_qc_summary_email(to_email: str, manager_name: str, summary_data: Dict[str, Any]):
    """Send daily QC summary to QC Managers"""
    subject = f"Daily QC Summary - {summary_data.get('date', 'Today')}"
    
    batches_html = ""
    for batch in summary_data.get('batches', []):
        batches_html += f"""
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('qc_user_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('project_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('source_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('location_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('record_owner_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('book_name', 'N/A')}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('total_count', 0)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('accepted_count', 0)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">{batch.get('rejected_count', 0)}</td>
        </tr>
        """
    
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-fit: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">Daily QC Summary</h2>
            <p>Hello <strong>{manager_name}</strong>,</p>
            <p>Here's the QC summary for the last 24 hours:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Completed Batches:</strong> {summary_data.get('completed_batches', 0)}</p>
                <p style="margin: 5px 0;"><strong>Total Images Reviewed:</strong> {summary_data.get('total_images', 0)}</p>
                <p style="margin: 5px 0;"><strong>Total Accepted:</strong> {summary_data.get('total_accepted', 0)}</p>
                <p style="margin: 5px 0;"><strong>Total Rejected:</strong> {summary_data.get('total_rejected', 0)}</p>
                <p style="margin: 5px 0;"><strong>Accuracy Rate:</strong> {summary_data.get('accuracy_rate', 0)}%</p>
            </div>
            
            <h3 style="color: #374151; margin-top: 30px;">Batch Details:</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">QC User</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Project</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Source</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Location</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Record Owner</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Book Name</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Total</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Accepted</th>
                            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px;">Rejected</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches_html if batches_html else '<tr><td colspan="9" style="padding: 20px; text-align: center; color: #6b7280;">No QC completed in the last 24 hours</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com. Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """
    
    return _send_email(to_email, subject, html)

