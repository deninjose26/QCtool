import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from dotenv import load_dotenv

load_dotenv()

def send_welcome_email(to_email: str, name: str, username: str, password: str, role: str):
    mail_server = os.getenv("MAIL_SERVER")
    mail_port = int(os.getenv("MAIL_PORT", 587))
    mail_username = os.getenv("MAIL_USERNAME")
    mail_password = os.getenv("MAIL_PASSWORD")
    mail_from = os.getenv("MAIL_FROM")
    
    if not all([mail_server, mail_username, mail_password, mail_from]):
        print("Email credentials not fully configured in .env")
        return False

    subject = "Welcome to FamilyaConnect QC Portal - Account Created"
    
    # HTML Body
    html = f"""
    <html>
    <body>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="cid:logo" alt="FamilyaConnect Logo" style="height: 60px; width: auto; object-contain: contain;">
            </div>
            <h2 style="color: #0d9488; text-align: center;">Welcome to QC Portal</h2>
            <p>Hello <strong>{name}</strong>,</p>
            <p>An account has been created for you on the familyaConnect QC Portal. Below are your login credentials:</p>
            
            <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Username:</strong> {username}</p>
            </div>
            
            <p>Please log in and change your password as soon as possible for security reasons.</p>
            
            <hr style="margin-top: 40px; border: 0; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #6b7280; text-align: center;">
                © {os.getenv("YEAR", "2026")} FamilyaConnect.com . Secure Enterprise Platform.
            </p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart('related')
    msg['From'] = mail_from
    msg['To'] = to_email
    msg['Subject'] = subject
    
    # Create the HTML part
    msg_html = MIMEText(html, 'html')
    msg.attach(msg_html)

    # Attach the logo
    logo_path = r"e:\qc_tool\Frontend\src\assets\logo.png"
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
