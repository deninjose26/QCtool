from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import the routers from services
from auth_service.main import router as auth_router
from admin_service.main import router as admin_router
from upload_sup_service.main import router as upload_sup_router
from vendor_service.main import router as vendor_router
from operator_service.main import router as operator_router

app = FastAPI(title="Project Management - Unified API")

# 1. Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
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
            "Access-Control-Allow-Origin": "http://localhost:8080",
            "Access-Control-Allow-Credentials": "true"
        }
    )

# 2. Include routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(upload_sup_router)
app.include_router(vendor_router)
app.include_router(operator_router)

@app.get("/")
def read_root():
    return {
        "message": "QC Tool Unified Backend is running",
        "mounted_apps": ["/auth", "/admin", "/upload-sup", "/vendor", "/operator"]
    }

if __name__ == "__main__":
    # Use reload=True for development. String import "api_gateway.main:app" is required for reload.
    uvicorn.run("api_gateway.main:app", host="0.0.0.0", port=8000, reload=True)
