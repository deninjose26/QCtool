import os
from sqlmodel import create_engine, Session, SQLModel
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "QC_TOOL")

DB_SCHEMA = os.getenv("DB_SCHEMA", "qc_portal")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# We use connect_args to set the search_path to our schema for every connection
engine = create_engine(
    DATABASE_URL, 
    echo=True,
    connect_args={"options": f"-c search_path={DB_SCHEMA}"}
)

def get_session():
    with Session(engine) as session:
        yield session

def init_db():
    # In a real microservice, migrations (Alembic) are preferred.
    # But for initialization, we can use SQLModel.metadata.create_all
    SQLModel.metadata.create_all(engine)
