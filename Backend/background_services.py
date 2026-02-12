#!/usr/bin/env python3
"""
Background Services Runner for Production

This script runs the email scheduler and recovery service as a separate process
in production environments where the main API runs with multiple workers.

Usage:
    python background_services.py
"""

import asyncio
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Initialize system logging
from common.system_logger import setup_system_logging
setup_system_logging()

print("🔧 Starting Background Services (Production Mode)...")
print("=" * 60)

# Try to import email scheduler
try:
    from common.email_scheduler import start_scheduler, shutdown_scheduler
    SCHEDULER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Email scheduler not available: {e}")
    print("   To enable: pip install APScheduler pytz")
    SCHEDULER_AVAILABLE = False

# Import recovery service
from common.recovery_service import start_recovery_service, stop_recovery_service

async def main():
    """Main function to run background services"""
    
    # Start email scheduler
    if SCHEDULER_AVAILABLE:
        print("📧 Initializing email scheduler...")
        try:
            start_scheduler()
            print("✅ Email scheduler started successfully")
            print("   Daily reports will be sent at 9:00 AM IST")
        except Exception as e:
            print(f"❌ Failed to start email scheduler: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("ℹ️  Email scheduler disabled (APScheduler not installed)")
    
    # Start automatic recovery service
    print("🔄 Starting automatic recovery service...")
    try:
        recovery_task = asyncio.create_task(start_recovery_service())
        print("✅ Recovery service started")
        print("   Checking for stuck uploads every 5 minutes")
    except Exception as e:
        print(f"❌ Failed to start recovery service: {e}")
        import traceback
        traceback.print_exc()
        return
    
    print("=" * 60)
    print("✅ All background services running")
    print("   Press Ctrl+C to stop")
    print("=" * 60)
    
    # Keep running until interrupted
    try:
        await recovery_task
    except KeyboardInterrupt:
        print("\n🛑 Shutting down background services...")
        
        # Stop recovery service
        try:
            stop_recovery_service()
            recovery_task.cancel()
            print("✅ Recovery service stopped")
        except Exception as e:
            print(f"⚠️  Error stopping recovery service: {e}")
        
        # Stop email scheduler
        if SCHEDULER_AVAILABLE:
            try:
                shutdown_scheduler()
                print("✅ Email scheduler stopped")
            except Exception as e:
                print(f"⚠️  Error stopping scheduler: {e}")
        
        print("👋 Background services shut down successfully")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
