from sqlmodel import Session, text
from common.database import engine

def clear_database():
    tables = [
        "qc",
        "qc_allocation",
        "notifications",
        "image",
        "upload",
        "batch",
        "scanning_operator_allocation",
        "vendor_allocation",
        "record_type",
        "record_name",
        "record_owners",
        "location",
        "source",
        "projects"
    ]
    
    with Session(engine) as session:
        print("Starting database clear (preserving users)...")
        try:
            # Disable triggers/constraints check for faster/simpler truncation if needed
            # but CASCADE handles dependencies
            for table in tables:
                print(f"Truncating {table}...")
                session.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
            
            session.commit()
            print("Successfully cleared all data except users.")
        except Exception as e:
            session.rollback()
            print(f"Error clearing database: {e}")

if __name__ == "__main__":
    clear_database()
