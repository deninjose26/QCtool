"""
DigitalOcean Serverless Function: TIFF to JPEG Conversion
Converts uploaded TIFF images to JPEG and uploads to QC bucket
"""

import os
import io
import json
import boto3
from PIL import Image
import requests
from botocore.client import Config


def main(args):
    """
    Main function for image conversion
    
    Expected args:
    {
        "image_id": "uuid-string",
        "original_path": "PROJECT/SOURCE/.../image_001.tif",
        "original_bucket": "purvaj-scan-original",
        "qc_bucket": "purvaj-panda-qc",
        "api_secret": "secret-key-for-auth"
    }
    """
    
    try:
        # 1. Extract and validate parameters
        image_id = args.get('image_id')
        original_path = args.get('original_path')
        original_bucket = args.get('original_bucket')
        qc_bucket = args.get('qc_bucket')
        api_secret = args.get('api_secret')
        
        if not all([image_id, original_path, original_bucket, qc_bucket, api_secret]):
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Missing required parameters',
                    'required': ['image_id', 'original_path', 'original_bucket', 'qc_bucket', 'api_secret']
                })
            }
        
        # 2. Validate API secret
        expected_secret = os.environ.get('API_WEBHOOK_SECRET')
        if api_secret != expected_secret:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Invalid API secret'})
            }
        
        # 3. Initialize S3 client for DigitalOcean Spaces
        s3_client = boto3.client(
            's3',
            endpoint_url=os.environ.get('SPACES_ENDPOINT', 'https://blr1.digitaloceanspaces.com'),
            aws_access_key_id=os.environ.get('DO_SPACES_KEY'),
            aws_secret_access_key=os.environ.get('DO_SPACES_SECRET'),
            region_name=os.environ.get('SPACES_REGION', 'blr1'),
            config=Config(signature_version='s3v4')
        )
        
        print(f"[INFO] Starting conversion for image_id: {image_id}")
        print(f"[INFO] Original path: {original_path}")
        
        # 4. Download TIFF from Original bucket
        try:
            response = s3_client.get_object(
                Bucket=original_bucket,
                Key=original_path
            )
            tiff_data = response['Body'].read()
            original_size = len(tiff_data)
            print(f"[INFO] Downloaded TIFF: {original_size} bytes")
        except Exception as e:
            print(f"[ERROR] Failed to download TIFF: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Failed to download TIFF from original bucket',
                    'details': str(e)
                })
            }
        
        # 5. Convert TIFF to JPEG
        try:
            # Open TIFF image
            img = Image.open(io.BytesIO(tiff_data))
            
            # Get original dimensions
            width, height = img.size
            print(f"[INFO] Image dimensions: {width}x{height}")
            
            # Convert to RGB if needed (TIFF might be CMYK or have alpha channel)
            if img.mode not in ('RGB', 'L'):
                print(f"[INFO] Converting from {img.mode} to RGB")
                img = img.convert('RGB')
            
            # Create JPEG buffer
            jpeg_buffer = io.BytesIO()
            
            # Save as JPEG with optimized settings
            img.save(
                jpeg_buffer,
                format='JPEG',
                quality=85,           # High quality for QC review
                optimize=True,        # Optimize file size
                progressive=True      # Progressive JPEG for faster web loading
            )
            
            jpeg_buffer.seek(0)
            jpeg_data = jpeg_buffer.getvalue()
            jpeg_size = len(jpeg_data)
            
            compression_ratio = (1 - jpeg_size / original_size) * 100
            print(f"[INFO] JPEG created: {jpeg_size} bytes ({compression_ratio:.1f}% compression)")
            
        except Exception as e:
            print(f"[ERROR] Failed to convert image: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Failed to convert TIFF to JPEG',
                    'details': str(e)
                })
            }
        
        # 6. Build QC path (same hierarchy, different extension)
        qc_path = original_path.replace('.tif', '.jpg').replace('.tiff', '.jpg').replace('.TIF', '.jpg').replace('.TIFF', '.jpg')
        print(f"[INFO] QC path: {qc_path}")
        
        # 7. Upload JPEG to QC bucket (using QC credentials)
        try:
            # Create separate S3 client for QC bucket with QC credentials
            qc_s3_client = boto3.client(
                's3',
                endpoint_url=os.environ.get('SPACES_ENDPOINT', 'https://blr1.digitaloceanspaces.com'),
                aws_access_key_id=os.environ.get('QC_SPACES_KEY', os.environ.get('DO_SPACES_KEY')),
                aws_secret_access_key=os.environ.get('QC_SPACES_SECRET', os.environ.get('DO_SPACES_SECRET')),
                region_name=os.environ.get('SPACES_REGION', 'blr1'),
                config=Config(signature_version='s3v4')
            )
            
            qc_s3_client.put_object(
                Bucket=qc_bucket,
                Key=qc_path,
                Body=jpeg_data,
                ContentType='image/jpeg',
                Metadata={
                    'original-file': original_path,
                    'image-id': image_id,
                    'conversion-timestamp': str(int(os.times().elapsed * 1000))
                }
            )
            print(f"[INFO] Uploaded JPEG to QC bucket")
        except Exception as e:
            print(f"[ERROR] Failed to upload JPEG: {str(e)}")
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Failed to upload JPEG to QC bucket',
                    'details': str(e)
                })
            }
        
        # 8. Notify backend API of successful conversion
        try:
            api_base_url = os.environ.get('API_BASE_URL')
            webhook_url = f"{api_base_url}/operator/conversion-complete"
            
            webhook_payload = {
                'image_id': image_id,
                'qc_path': qc_path,
                'jpeg_size': jpeg_size,
                'original_size': original_size,
                'compression_ratio': round(compression_ratio, 2),
                'dimensions': {
                    'width': width,
                    'height': height
                }
            }
            
            webhook_response = requests.post(
                webhook_url,
                json=webhook_payload,
                headers={
                    'X-API-Key': os.environ.get('API_WEBHOOK_SECRET'),
                    'Content-Type': 'application/json'
                },
                timeout=10
            )
            
            if webhook_response.status_code == 200:
                print(f"[INFO] Successfully notified backend")
            else:
                print(f"[WARNING] Backend notification failed: {webhook_response.status_code}")
                
        except Exception as e:
            print(f"[WARNING] Failed to notify backend (non-critical): {str(e)}")
            # Don't fail the function if webhook fails - the image is already converted
        
        # 9. Return success response
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'image_id': image_id,
                'original_path': original_path,
                'qc_path': qc_path,
                'original_size': original_size,
                'jpeg_size': jpeg_size,
                'compression_ratio': round(compression_ratio, 2),
                'dimensions': {
                    'width': width,
                    'height': height
                }
            })
        }
        
    except Exception as e:
        print(f"[ERROR] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Unexpected error during conversion',
                'details': str(e)
            })
        }
