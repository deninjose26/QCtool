from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import the routers from services
from auth_service.main import router as auth_router
from admin_service.main import router as admin_router
from upload_sup_service.main import router as upload_sup_router
from vendor_service.main import router as vendor_router
from operator_service.main import router as operator_router
from qc_sup_service.main import router as qc_sup_router
from qc_service.main import router as qc_router
from notification_service.main import router as notification_router

# Try to import email scheduler (optional dependency)
try:
    from common.email_scheduler import start_scheduler, shutdown_scheduler
    SCHEDULER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Email scheduler not available: {e}")
    print("   To enable email notifications, install: pip install APScheduler pytz")
    SCHEDULER_AVAILABLE = False

app = FastAPI(title="Project Management - Unified API")

# 1. Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local network access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"Incoming Request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"Response Status: {response.status_code}")
    return response

import traceback
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print("❌ GLOBAL ERROR CAUGHT:")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": traceback.format_exc()},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true"
        }
    )

# Startup event - Initialize email scheduler if available
@app.on_event("startup")
async def startup_event():
    print("🚀 Starting application...")
    if SCHEDULER_AVAILABLE:
        print("📧 Initializing email scheduler...")
        try:
            start_scheduler()
            print("✅ Email scheduler started successfully")
        except Exception as e:
            print(f"⚠️  Failed to start email scheduler: {e}")
    else:
        print("ℹ️  Email scheduler disabled (APScheduler not installed)")

# Shutdown event - Cleanup email scheduler if available
@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 Shutting down application...")
    if SCHEDULER_AVAILABLE:
        print("📧 Stopping email scheduler...")
        try:
            shutdown_scheduler()
            print("✅ Email scheduler stopped successfully")
        except Exception as e:
            print(f"⚠️  Error stopping scheduler: {e}")

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

if __name__ == "__main__":
    # Use reload=True for development. String import "api_gateway.main:app" is required for reload.
    uvicorn.run("api_gateway.main:app", host="0.0.0.0", port=8000, reload=True)


