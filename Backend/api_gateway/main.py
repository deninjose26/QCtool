from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import os
import datetime

# Import the routers from services
from auth_service.main import router as auth_router
from admin_service.main import router as admin_router
from upload_sup_service.main import router as upload_sup_router
from vendor_service.main import router as vendor_router
from operator_service.main import router as operator_router
from qc_sup_service.main import router as qc_sup_router
from qc_service.main import router as qc_router
from notification_service.main import router as notification_router

# Initialize system logging
from common.system_logger import setup_system_logging
setup_system_logging()

# Try to import email scheduler (optional dependency)
try:
    from common.email_scheduler import start_scheduler, shutdown_scheduler
    SCHEDULER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Email scheduler not available: {e}")
    print("   To enable email notifications, install: pip install APScheduler pytz")
    SCHEDULER_AVAILABLE = False

# Import recovery service
from common.recovery_service import start_recovery_service, stop_recovery_service
import asyncio

# Background task for recovery service
recovery_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global recovery_task
    
    worker_id = os.getpid()
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    print(f"⚡ Worker {worker_id} starting...")
    
    # In production with multiple workers, background services should run separately
    if not is_prod:
        print("🚀 Starting background services (development mode)...")
        if SCHEDULER_AVAILABLE:
            try:
                start_scheduler()
                print("✅ Email scheduler started")
            except Exception as e:
                print(f"⚠️  Failed to start scheduler: {e}")
        
        try:
            recovery_task = asyncio.create_task(start_recovery_service())
            print("✅ Recovery service started")
        except Exception as e:
            print(f"⚠️  Failed to start recovery: {e}")
    else:
        print("ℹ️  Background services disabled in multi-worker mode")

    yield  # --- Application runs here ---

    print(f"🛑 Worker {worker_id} shutting down...")
    if SCHEDULER_AVAILABLE:
        try:
            shutdown_scheduler()
            print("✅ Email scheduler stopped")
        except: pass
    
    if recovery_task:
        try:
            stop_recovery_service()
            print("✅ Recovery service stopped")
        except: pass

# Disable Swagger/ReDoc in production for security
is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"

if is_production:
    app = FastAPI(
        title="QC Portal API",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan
    )
    print("🔒 API Documentation disabled (production mode)")
else:
    app = FastAPI(
        title="QC Portal API - Development",
        lifespan=lifespan
    )
    print("📚 API Documentation available at /docs")

# 1. Enable CORS
# Using a robust list of allowed origins
ALLOWED_ORIGINS = [
    "https://qcportal.familyaconnect.com",
    "http://qcportal.familyaconnect.com",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    print(f"Incoming Request: {request.method} {request.url.path} | Origin: {origin}")
    response = await call_next(request)
    print(f"Response Status: {response.status_code}")
    return response

import traceback
from fastapi.responses import JSONResponse

import logging

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the full error with traceback to system_logs/system.txt
    logging.error(f"Global error caught on {request.method} {request.url.path}")
    logging.error(traceback.format_exc())
    
    # Determine CORS header for error response
    origin = request.headers.get("origin")
    cors_origin = origin if origin in ALLOWED_ORIGINS else ALLOWED_ORIGINS[0]
    
    # Return a clean, professional message to the user/frontend
    # Do NOT include technical details or source code here
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. Our team has been notified. Please try again later.",
            "type": "InternalServerError"
        },
        headers={
            "Access-Control-Allow-Origin": cors_origin,
            "Access-Control-Allow-Credentials": "true"
        }
    )

# --- Lifespan and Background services handled above ---

# 2. Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(upload_sup_router)
app.include_router(vendor_router)
app.include_router(operator_router)
app.include_router(qc_sup_router)
app.include_router(qc_router)
app.include_router(notification_router)

@app.get("/")
def read_root():
    return {
        "message": "QC Tool Unified Backend is running",
        "mounted_apps": ["/auth", "/admin", "/upload-sup", "/vendor", "/operator"],
        "email_scheduler": "Active - Daily reports at 9:00 AM IST" if SCHEDULER_AVAILABLE else "Disabled"
    }

@app.get("/health")
@app.head("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import os
    import multiprocessing
    
    # Disable auto-reload in production for better performance
    # Enable in development for convenience
    is_production = os.getenv("ENVIRONMENT", "development").lower() == "production"
    
    if is_production:
        print("🚀 Running in PRODUCTION mode (reload disabled)")
        
        # Optimized for direct port with session management improvements
        workers = 2 
        
        print(f"   Workers: {workers} (Optimized for direct DB connection)")
        print(f"   Database: Direct Port 25060 (Session-managed)")
        print(f"   Logging: Production (errors only)")
        
        # Production: Multiple workers, no reload, optimized settings
        uvicorn.run(
            "api_gateway.main:app",
            host="0.0.0.0",
            port=8000,
            workers=workers,
            reload=False,
            log_level="warning",  # Less verbose logging
            access_log=False,     # Disable access logs (use nginx logs instead)
            proxy_headers=True,   # Trust X-Forwarded-* headers from nginx
            forwarded_allow_ips="*"
        )
    else:
        print("🔧 Running in DEVELOPMENT mode (reload enabled)")
        print("   Workers: 1 (single process for debugging)")
        print("   Reload: Enabled (auto-restart on code changes)")
        
        # Development: Single worker, auto-reload for convenience
        uvicorn.run(
            "api_gateway.main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )


