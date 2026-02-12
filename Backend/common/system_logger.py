import os
import logging
import time
from logging.handlers import TimedRotatingFileHandler
from datetime import datetime, timedelta

# Create system_logs directory if it doesn't exist
LOGS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'system_logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

def setup_system_logging():
    """
    Sets up system logging to write to daily .txt files in the system_logs folder.
    Keeps logs for 30 days.
    """
    log_filename = os.path.join(LOGS_DIR, "system.txt")
    
    # Create a handler that rotates every day at midnight
    # backupCount=30 ensures files older than 30 days are automatically deleted
    handler = TimedRotatingFileHandler(
        log_filename, 
        when="midnight", 
        interval=1, 
        backupCount=30,
        encoding='utf-8'
    )
    
    # Suffix for rotated files: 2026-02-04
    handler.suffix = "%Y-%m-%d" 
    
    # Custom namer to ensure rotated files are named like 'system_2026-02-04.txt'
    # Base name is system.txt, handler appends .suffix, so we get system.txt.2026-02-04
    handler.namer = lambda name: name.replace("system.txt.", "system_") + ".txt"
    
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    # Add handler to root logger so it captures everything
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)

def cleanup_old_logs():
    """
    Manually clean up logs older than 30 days just in case, or if we use simple files.
    Since TimedRotatingFileHandler with backupCount handles this, it might be redundant, 
    but good to have as a fallback task if the user wants custom logic.
    """
    now = time.time()
    retention_period = 30 * 24 * 60 * 60 # 30 days in seconds
    
    print(f"🧹 Running system logs cleanup at {datetime.now()}...")
    
    try:
        files = os.listdir(LOGS_DIR)
        count = 0
        for f in files:
            file_path = os.path.join(LOGS_DIR, f)
            if os.path.isfile(file_path):
                file_age = os.path.getmtime(file_path)
                if now - file_age > retention_period:
                    os.remove(file_path)
                    print(f"🗑️ Deleted old log: {f}")
                    count += 1
        print(f"✅ Cleanup finished. Removed {count} old log files.")
    except Exception as e:
        print(f"❌ Error during logs cleanup: {e}")

if __name__ == "__main__":
    # Test cleanup
    cleanup_old_logs()
