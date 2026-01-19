import os
import sys

# Add the Backend directory to sys.path to allow importing from 'common'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from common.database import Session, engine
from common.models import User, UserRole
from common.security import get_password_hash
from sqlmodel import select

def bootstrap_admin():
    print("--- Bootstrapping SuperAdmin Account ---")
    
    admin_data = {
        "name": "DJ",
        "username": "admin",
        "email": "admin@familyaconnect.com",
        "password": "admin123",
        "user_role": UserRole.SuperAdmin
    }
    
    try:
        with Session(engine) as session:
            # Check if user already exists
            existing_user = session.exec(select(User).where(User.username == admin_data["username"])).first()
            
            if existing_user:
                print(f"ℹ️  User '{admin_data['username']}' already exists. Updating password and details...")
                existing_user.name = admin_data["name"]
                existing_user.email = admin_data["email"]
                existing_user.password_hash = get_password_hash(admin_data["password"])
                existing_user.user_role = admin_data["user_role"]
                session.add(existing_user)
            else:
                print(f"✨ Creating new SuperAdmin: {admin_data['username']}")
                db_user = User(
                    name=admin_data["name"],
                    username=admin_data["username"],
                    email=admin_data["email"],
                    password_hash=get_password_hash(admin_data["password"]),
                    user_role=admin_data["user_role"]
                )
                session.add(db_user)
            
            session.commit()
            print(f"✅ SuperAdmin account '{admin_data['username']}' is ready!")
            
    except Exception as e:
        print(f"❌ Bootstrap FAILED!")
        print(f"Error Details: {str(e)}")

if __name__ == "__main__":
    bootstrap_admin()
