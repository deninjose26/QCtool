"""
Local Flask Server for Conversion Function
Simulates DigitalOcean Functions locally by running a Flask server
that listens for conversion requests from the backend.

Run this to test the complete pipeline locally!
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# Add the function directory to Python path
function_dir = os.path.join(os.path.dirname(__file__), 'packages', 'image-processing', 'convert-image')
sys.path.insert(0, function_dir)

# Load the conversion function
exec(open(os.path.join(function_dir, '__main__.py')).read())

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for local development

@app.route('/convert', methods=['POST'])
def convert_image():
    """
    Endpoint that simulates DigitalOcean Function
    Receives conversion request from backend
    """
    try:
        # Get request data
        data = request.get_json()
        
        print("\n" + "=" * 60)
        print("🔄 CONVERSION REQUEST RECEIVED")
        print("=" * 60)
        print(f"Image ID: {data.get('image_id')}")
        print(f"Original Path: {data.get('original_path')}")
        print(f"Original Bucket: {data.get('original_bucket')}")
        print(f"QC Bucket: {data.get('qc_bucket')}")
        print("=" * 60)
        
        # Call the conversion function
        result = main(data)
        
        print("\n" + "=" * 60)
        print("✅ CONVERSION RESULT")
        print("=" * 60)
        print(f"Status: {result['statusCode']}")
        print(f"Response: {result['body']}")
        print("=" * 60 + "\n")
        
        # Return the result
        return jsonify(result), result['statusCode']
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}\n")
        return jsonify({
            'statusCode': 500,
            'body': {'error': str(e)}
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Conversion function server is running'
    }), 200

if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("🚀 STARTING LOCAL CONVERSION FUNCTION SERVER")
    print("=" * 60)
    print("Server running at: http://localhost:5000")
    print("Endpoint: POST http://localhost:5000/convert")
    print("Health check: GET http://localhost:5000/health")
    print("=" * 60)
    print("\nWaiting for conversion requests from backend...")
    print("Press Ctrl+C to stop\n")
    
    # Run Flask server
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True,      # CRITICAL: Handle multiple conversions concurrently
        use_reloader=False  # Disable reloader to avoid double execution
    )
