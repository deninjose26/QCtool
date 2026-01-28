# QCTool Serverless Functions

This directory contains DigitalOcean Functions for serverless image processing.

## 📁 Structure

```
serverless-functions/
├── project.yml                          # DO Functions configuration
├── .env                                 # Environment variables (DO NOT COMMIT)
├── packages/
│   └── image-processing/
│       └── convert-image/
│           ├── __main__.py              # Main conversion function
│           └── requirements.txt         # Python dependencies
└── README.md                            # This file
```

## 🚀 Deployment Instructions

### Prerequisites

1. **Install DigitalOcean CLI (doctl)**
   ```bash
   # Windows (using Chocolatey)
   choco install doctl
   
   # Or download from: https://github.com/digitalocean/doctl/releases
   ```

2. **Authenticate with DigitalOcean**
   ```bash
   doctl auth init
   # Enter your DigitalOcean API token when prompted
   ```

3. **Install Serverless Plugin**
   ```bash
   doctl serverless install
   ```

4. **Connect to your Functions Namespace**
   ```bash
   doctl serverless connect
   # Select your namespace or create a new one
   ```

### Environment Setup

1. **Update `.env` file** with your actual values:
   ```env
   DO_SPACES_KEY=your_actual_key
   DO_SPACES_SECRET=your_actual_secret
   API_BASE_URL=https://your-api-domain.com
   API_WEBHOOK_SECRET=your_generated_secret
   ```

2. **Generate API webhook secret** (if not done):
   ```python
   import secrets
   print(secrets.token_urlsafe(32))
   ```

### Deploy the Function

From the `serverless-functions` directory:

```bash
# Deploy to DigitalOcean
doctl serverless deploy .

# Watch deployment progress
doctl serverless watch
```

### Get the Function URL

After deployment:

```bash
# List all functions
doctl serverless functions list

# Get function details
doctl serverless functions get image-processing/convert-image
```

The output will show the URL like:
```
https://faas-blr1-123456789.doserverless.co/api/v1/web/fn-xxxxx/image-processing/convert-image
```

**Copy this URL** and add it to your Backend `.env`:
```env
DO_FUNCTION_CONVERT_URL=https://faas-blr1-123456789.doserverless.co/api/v1/web/fn-xxxxx/image-processing/convert-image
```

## 🧪 Testing the Function

### Test with curl:

```bash
curl -X POST "YOUR_FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "image_id": "test-uuid-123",
    "original_path": "TEST_PROJECT/TEST_SOURCE/test.tif",
    "original_bucket": "purvaj-scan-original",
    "qc_bucket": "purvaj-panda-qc",
    "api_secret": "your_webhook_secret"
  }'
```

### View Logs:

```bash
# View recent activation logs
doctl serverless activations list

# Get specific activation details
doctl serverless activations get <activation-id>

# Stream logs in real-time
doctl serverless activations logs --follow
```

## 🔧 Function Configuration

### Resource Limits

- **Timeout:** 120 seconds (2 minutes)
- **Memory:** 1024 MB (1 GB)
- **Runtime:** Python 3.11

### Environment Variables

The function receives these from the deployment:
- `DO_SPACES_KEY` - DigitalOcean Spaces access key
- `DO_SPACES_SECRET` - DigitalOcean Spaces secret key
- `API_BASE_URL` - Your FastAPI backend URL
- `API_WEBHOOK_SECRET` - Secret for webhook authentication

## 📊 How It Works

1. **Trigger:** Your FastAPI backend calls the function URL with image details
2. **Download:** Function downloads TIFF from `purvaj-scan-original`
3. **Convert:** Converts TIFF to JPEG (85% quality, optimized)
4. **Upload:** Uploads JPEG to `purvaj-panda-qc` (same path structure)
5. **Notify:** Calls your API webhook to update database

## 🔒 Security

- Function validates API secret before processing
- Uses environment variables for credentials (never hardcoded)
- Webhook authentication with secret key
- S3 operations use IAM credentials

## 📈 Monitoring

### Check Function Status:
```bash
doctl serverless activations list --limit 10
```

### View Function Metrics:
```bash
doctl serverless activations result <activation-id>
```

## 🐛 Troubleshooting

### Function times out:
- Increase timeout in `project.yml` (max 300 seconds)
- Check if TIFF file is too large (>100MB)

### Out of memory:
- Increase memory in `project.yml` (max 2048 MB)
- Large TIFFs may need more RAM

### Webhook fails:
- Verify `API_BASE_URL` is accessible from DO servers
- Check `API_WEBHOOK_SECRET` matches in both .env files
- Ensure your API endpoint `/operator/conversion-complete` exists

### S3 access denied:
- Verify DO Spaces credentials in `.env`
- Check bucket names are correct
- Ensure buckets are in the same region (blr1)

## 🔄 Update Function

After making code changes:

```bash
# Redeploy
doctl serverless deploy .

# The URL remains the same, no need to update .env
```

## 💰 Cost Estimation

DigitalOcean Functions pricing (as of 2024):
- **Free tier:** 90,000 GB-seconds/month
- **After free tier:** $0.0000185 per GB-second

**Example calculation for 2,500 images:**
- Memory: 1 GB
- Time per image: 5 seconds
- Total: 2,500 × 1 GB × 5 sec = 12,500 GB-seconds
- Cost: ~$0.23 per batch (well within free tier for testing)

## 📝 Notes

- Function is stateless (no data persists between invocations)
- Each invocation is isolated and parallel
- DigitalOcean auto-scales based on demand
- Cold start time: ~2-3 seconds for first invocation
- Warm invocations: <100ms startup time

## 🆘 Support

For issues:
1. Check logs: `doctl serverless activations logs --follow`
2. Verify environment variables are set correctly
3. Test with a small TIFF file first
4. Check DigitalOcean Functions dashboard for errors
