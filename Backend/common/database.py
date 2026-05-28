import os
from sqlmodel import create_engine, Session, SQLModel
from sqlalchemy.pool import NullPool
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "QC_TOOL")

DB_SCHEMA = os.getenv("DB_SCHEMA", "qc_portal")
DB_SSL_MODE = os.getenv("DB_SSL_MODE", "require")

# Get the full connection string from environment if available (recommended for production)
DATABASE_URL = os.getenv("DATABASE_URL")

# Fallback to constructing from parts if DATABASE_URL is not set
if not DATABASE_URL:
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Detect if using PgBouncer (port 25061)
# PgBouncer handles connection pooling, so we should disable SQLAlchemy pooling
# We check both the explicit port variable and the connection string
is_pgbouncer_port = str(DB_PORT) == "25061"
is_pgbouncer_url = DATABASE_URL and (":25061/" in DATABASE_URL or ":25061?" in DATABASE_URL)
USE_PGBOUNCER = is_pgbouncer_port or is_pgbouncer_url

if USE_PGBOUNCER:
    print(f"🔵 PgBouncer High-Concurrency Mode ({DB_PORT})")
    engine = create_engine(
        DATABASE_URL, 
        echo=False,
        pool_size=3,            # Reduced to prevent exhaustion
        max_overflow=2,         # Allow 2 extra during spikes (total 5 max)
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=True,
        connect_args={
            "sslmode": DB_SSL_MODE,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5
        }
    )

    # Set search_path AFTER connection (standard SQL command)
    # This is safe for PgBouncer and ensures the schema is always active
    from sqlalchemy import event
    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET search_path TO {DB_SCHEMA}")
        cursor.close()
else:
    print(f"Direct PostgreSQL Connection ({DB_PORT}) - EMERGENCY MODE")
    engine = create_engine(
        DATABASE_URL, 
        echo=False,
        poolclass=NullPool,
        connect_args={
            "options": f"-c search_path={DB_SCHEMA}",
            "sslmode": DB_SSL_MODE
        }
    )

from contextlib import contextmanager

@contextmanager
def get_retry_session():
    """
    Context manager that provides a session with retry logic for transient OperationalErrors.
    Useful for background tasks or helper functions outside of FastAPI routes.
    """
    import time
    from sqlalchemy.exc import OperationalError
    from sqlalchemy import text
    
    max_retries = 3
    retry_delay = 1.0
    session = None
    
    try:
        for attempt in range(max_retries):
            session = Session(engine)
            try:
                # Ping the DB to ensure connection is live
                if USE_PGBOUNCER:
                    session.execute(text(f"SET search_path TO {DB_SCHEMA}"))
                else:
                    session.execute(text("SELECT 1"))
                break # Success!
            except OperationalError as e:
                error_str = str(e).lower()
                session.close()
                session = None
                
                # Retry for transient errors
                is_transient = any(msg in error_str for msg in ["ssl", "connection slots", "unsupported startup", "reset by peer", "closed unexpectedly"])
                if is_transient and attempt < max_retries - 1:
                    print(f"⚠️  DB retry ({attempt + 1}/{max_retries}): {error_str.splitlines()[0]}")
                    time.sleep(retry_delay)
                else:
                    raise
        
        yield session
    except Exception:
        raise
    finally:
        if session:
            session.close()

def get_session():
    """
    FastAPI dependency that uses the retry session logic.
    """
    with get_retry_session() as session:
        yield session

def init_db():
    # In a real microservice, migrations (Alembic) are preferred.
    # But for initialization, we can use SQLModel.metadata.create_all
    SQLModel.metadata.create_all(engine)
