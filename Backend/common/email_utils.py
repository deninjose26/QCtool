import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from dotenv import load_dotenv

load_dotenv()

def _get_logo_path():
    """Get logo path from env var or use relative path fallback."""
    logo_path = os.getenv("EMAIL_LOGO_PATH")
    if logo_path and os.path.exists(logo_path):
        return logo_path
    # Relative fallback
    fallback = os.path.join(os.path.dirname(__file__), '..', '..', 'Frontend', 'src', 'assets', 'logo.png')
    if os.path.exists(fallback):
        return fallback
    return None

def _attach_logo(msg):
    """Attach logo image to email if available."""
    logo_path = _get_logo_path()
    if logo_path:
        with open(logo_path, 'rb') as f:
            logo_img = MIMEImage(f.read())
            logo_img.add_header('Content-ID', '<logo>')
            logo_img.add_header('Content-Disposition', 'inline', filename='logo.png')
            msg.attach(logo_img)

def _send_email(to_email: str, subject: str, html: str) -> bool:
    """Common email sending logic."""
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

    msg_html = MIMEText(html, 'html')
    msg.attach(msg_html)
    _attach_logo(msg)

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


def send_welcome_email(to_email: str, name: str, username: str, role: str):
    """Send welcome email WITHOUT password (security fix)."""
    subject = "Welcome to FamilyaConnect QC Portal - Account Created"
    year = os.getenv("YEAR", "2026")

    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">Welcome to QC Portal</h2>
            <p>Hello <strong>{name}</strong>,</p>
            <p>An account has been created for you on the FamilyaConnect QC Portal.</p>

            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Username:</strong> {username}</p>
                <p style="margin: 5px 0;"><strong>Role:</strong> {role}</p>
            </div>

            <p>Your temporary password has been provided by your administrator. Please log in and change your password immediately for security reasons.</p>

            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                &copy; {year} FamilyaConnect.com . Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """

    return _send_email(to_email, subject, html)


def send_password_reset_email(to_email: str, name: str, username: str, new_password: str, changed_by: str):
    """Send password reset notification. Password shown as temporary - user must change on login."""
    subject = "FamilyaConnect QC Portal - Your Password Has Been Reset"
    year = os.getenv("YEAR", "2026")

    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto;">
            </div>
            <h2 style="color: #dc2626; text-align: center;">Password Reset Notification</h2>
            <p>Hello <strong>{name}</strong>,</p>
            <p>Your password for the FamilyaConnect QC Portal has been reset by <strong>{changed_by}</strong>.</p>

            <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #dc2626; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #991b1b;"><strong>Security Notice:</strong></p>
                <p style="margin: 5px 0;">Your account credentials have been changed. You must change your password on your next login.</p>
            </div>

            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Username:</strong> {username}</p>
                <p style="margin: 5px 0;"><strong>Temporary Password:</strong> {new_password}</p>
            </div>

            <p><strong>Important:</strong> This is a temporary password. You will be required to set a new password upon logging in.</p>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                If you did not request this password reset, please contact your administrator immediately.
            </p>

            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                &copy; {year} FamilyaConnect.com . Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """

    return _send_email(to_email, subject, html)
