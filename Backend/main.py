import subprocess
import sys
import os

def run_unified_backend():
    print("🚀 Starting QC Tool Unified Backend (Mounted Approach)...")
    
    # Set up environment with current directory in PYTHONPATH
    env = os.environ.copy()
    env["PYTHONPATH"] = os.getcwd() + os.pathsep + env.get("PYTHONPATH", "")
    
    try:
        # Run only the Gateway (which now mounts all other apps)
        process = subprocess.run(
            [sys.executable, "-m", "api_gateway.main"],
            env=env
        )
    except KeyboardInterrupt:
        print("\n🛑 Stopping Unified Backend...")
        sys.exit(0)

if __name__ == "__main__":
    run_unified_backend()
