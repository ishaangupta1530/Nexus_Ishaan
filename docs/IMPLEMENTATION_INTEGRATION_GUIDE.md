# Implementation & Integration Guide

## Quick Start Integration

### 1. Install Required Dependencies

```bash
cd backend
npm install
# Already included:
# - @nestjs/bullmq
# - bull
# - uuid
# - redis
# - bcrypt
# - nanoid
# - node-cron
# - @nestjs/schedule
# - @nestjs-modules/mailer
```

### 2. Update App Module

Add these imports to `backend/src/app.module.ts`:

```typescript
import { QueueModule } from './queue/queue.module';
import { ReportsModule } from './reports/reports.module';
import { SharedExportModule } from './shared-export/shared-export.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    // ... existing imports ...
    
    // Must import ScheduleModule for reports
    ScheduleModule.forRoot(),
    
    // Queue must be before Export
    QueueModule,
    
    // Reports module for scheduled reports
    ReportsModule,
    
    // Shared exports module
    SharedExportModule,
    
    // Export module (updated to use queue)
    ExportModule,
    
    // ... rest of imports ...
  ],
})
export class AppModule {}
```

### 3. Database Migrations

```bash
# Create migration
npx prisma migrate dev --name add_enterprise_export_system

# Prisma will auto-create SharedExport table
# Prisma will update ExportJob with sharedExports relation
# Prisma will update ScheduledReport model

# View the database
npx prisma studio
```

### 4. Environment Configuration

Update `.env`:

```env
# Redis (for Bull Queue)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD= # if using cloud Redis, add password

# Export Storage
UPLOAD_DIR=./uploads/exports

# Frontend URL (for shareable links)
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000

# Email (for scheduled reports)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@nexus.com
```

### 5. Start the Application

```bash
# Development with hot reload
npm run start:dev

# Production
npm run build
npm start
```

## Testing the Implementation

### Test 1: Create and Process Export

```bash
# 1. Create export job
curl -X POST http://localhost:3000/export/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "REFERRALS",
    "format": "JSON",
    "filters": { "status": "OPEN" }
  }'

# Response:
# {
#   "jobId": "cly7x8z4k0000qz1a2b3c4d5e",
#   "estimatedTime": "30-60 seconds"
# }

# 2. Poll job status
curl -X GET http://localhost:3000/export/status/cly7x8z4k0000qz1a2b3c4d5e \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
# {
#   "id": "cly7x8z4k0000qz1a2b3c4d5e",
#   "status": "PROCESSING",
#   "progress": 45,
#   "queueState": "active"
# }

# 3. Download when complete
curl -X GET http://localhost:3000/export/download/cly7x8z4k0000qz1a2b3c4d5e \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  --output referrals.json
```

### Test 2: Create Scheduled Report

```bash
# Create weekly Monday report
curl -X POST http://localhost:3000/scheduled-reports \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Referrals",
    "reportType": "REFERRALS",
    "format": "pdf",
    "schedule": "0 0 * * 1",
    "recipients": ["manager@company.com"],
    "filters": { "status": "OPEN" },
    "enabled": true
  }'

# Response:
# {
#   "id": "cly8a9b0c1d2e3f4g5h6i7j8k",
#   "name": "Weekly Referrals",
#   "nextRunAt": "2024-01-29T00:00:00Z",
#   "status": "PENDING"
# }

# Trigger immediately
curl -X POST http://localhost:3000/scheduled-reports/cly8a9b0c1d2e3f4g5h6i7j8k/trigger \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test 3: Create Shareable Link

```bash
# Create secure shared link
curl -X POST http://localhost:3000/shared-exports \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exportJobId": "cly7x8z4k0000qz1a2b3c4d5e",
    "password": "SecurePass123",
    "expiresAt": "2024-02-01T00:00:00Z",
    "maxViews": 5
  }'

# Response:
# {
#   "shareToken": "abcd1234efgh5678ijkl9012mnop3456",
#   "shareUrl": "http://localhost:3001/shared-export/abcd1234efgh5678ijkl9012mnop3456",
#   "expiresAt": "2024-02-01T00:00:00Z",
#   "maxViews": 5
# }

# Access shared export (public - no auth needed!)
curl -X GET http://localhost:3000/shared-exports/abcd1234efgh5678ijkl9012mnop3456 \
  -H "Content-Type: application/json" \
  -d '{ "password": "SecurePass123" }'

# Response:
# {
#   "exportJobId": "cly7x8z4k0000qz1a2b3c4d5e",
#   "filename": "REFERRALS.json",
#   "format": "JSON",
#   "viewsRemaining": 4
# }
```

### Test 4: Queue Health Check

```bash
# Get queue statistics
curl -X GET http://localhost:3000/health/queue \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Response:
# {
#   "status": "healthy",
#   "exportQueue": {
#     "queue": "export-queue",
#     "waiting": 2,
#     "active": 1,
#     "completed": 156,
#     "failed": 0,
#     "total": 159
#   },
#   "reportsQueue": {
#     "queue": "reports-queue",
#     "waiting": 0,
#     "active": 0,
#     "completed": 12,
#     "failed": 0,
#     "total": 12
#   }
# }
```

## Debugging

### Check Queue Jobs (Optional: Install Bull Board)

```bash
# Install
npm install @bull-board/express @bull-board/ui

# Add to app.module.ts
import { BullModule } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/express';
import { BullAdapter } from '@bull-board/bull';

// In main.ts or app setup:
const bullBoard = createBullBoard({
  queues: [
    new BullAdapter(exportQueue),
    new BullAdapter(reportsQueue),
  ],
});

app.use('/admin/queues', bullBoard.router);

// Visit: http://localhost:3000/admin/queues
```

### Redis CLI Inspection

```bash
# Connect to Redis
redis-cli

# List all keys
KEYS *

# Get queue info
HGETALL bull:export-queue:1  # Job ID 1

# Check queue counts
ZCARD bull:export-queue:wait
ZCARD bull:export-queue:active
ZCARD bull:export-queue:completed

# Clear queue (CAREFUL!)
FLUSHDB
```

### Database Inspection

```bash
# Prisma Studio
npx prisma studio

# Or via SQL:
SELECT * FROM export_jobs WHERE user_id = 'user123';
SELECT * FROM shared_exports WHERE view_count > 0;
SELECT * FROM scheduled_reports WHERE enabled = true;
```

### Logs

```bash
# Watch application logs
npm run start:dev 2>&1 | grep -E "Job|Export|Report|Queue"

# Filter by component
tail -f logs/app.log | grep "ExportProcessor"
tail -f logs/app.log | grep "SharedExportService"
tail -f logs/app.log | grep "ScheduledReportsService"
```

## Common Issues & Solutions

### Issue: "Queue connection refused"
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:**
```bash
# Check Redis status
redis-cli ping
# Should return: PONG

# Start Redis if not running (Mac)
brew services start redis

# Start Redis (Docker)
docker run -d -p 6379:6379 redis:latest

# Start Redis (Windows)
# Download from: https://github.com/microsoftarchive/redis
```

### Issue: "Job processing timeout"
```
Error: Stalled job detected
```

**Solution:**
- Increase lockDuration in queue.module.ts (milliseconds)
- Increase job.updateProgress() calls for long-running jobs
- Split large exports into smaller batches

### Issue: "Email not sending"
```
Error: SMTP connection failed
```

**Solution:**
- Verify SMTP credentials in .env
- Check SMTP_PORT (usually 587 for TLS)
- Enable "Less secure app access" for Gmail
- Use app-specific password for Gmail

### Issue: "Token already exists"
```
Unique constraint failed on shareToken
```

**Solution:** This should never happen (nanoid collision is 1 in billion)
- If it does: Clear corrupted record manually
- Restart application

### Issue: "Export file not found"
```
Error: ENOENT: no such file or directory
```

**Solution:**
- Check UPLOAD_DIR exists and is writable
- Verify disk has sufficient space
- Check file permissions: `chmod 755 ./uploads/exports`

## Performance Tuning

### For High Volume Exports

```typescript
// In queue.module.ts
defaultJobOptions: {
  attempts: 5,              // Increase retries
  backoff: {
    type: 'exponential',
    delay: 1000,           // Reduce initial delay
  },
  removeOnComplete: {
    age: 86400,            // Keep for 24 hours
  },
}

// In export.processor.ts
concurrency: 10,           // Increase workers
stalledInterval: 15000,    // Check more frequently
maxStalledCount: 3,        // Allow more retries
```

### For Scheduled Reports

```typescript
// Spread reports across different times
// Instead of all running at same time:
schedule: "0 0 * * 1"    // Monday midnight - might overload

// Try:
schedule: "0 2 * * 1"    // Monday 2 AM
schedule: "0 4 * * 1"    // Monday 4 AM
schedule: "0 6 * * 1"    // Monday 6 AM
```

### For Shared Exports

```typescript
// Use CDN for files instead of server
// Configure S3:
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// Upload large files to S3
// Share S3 pre-signed URL instead of file path
```

## Monitoring Recommendations

### Set Alerts For

1. **Failed Jobs**: Failed queue jobs > 5
2. **Failed Reports**: Report status = FAILED
3. **Disk Space**: Upload directory > 90% full
4. **Queue Lag**: Waiting jobs > 50
5. **Processing Time**: Job duration > 5 minutes

### Metrics to Track

- Average job processing time
- Job success rate
- Share link access frequency
- Report generation frequency
- Email delivery success rate
- Queue depth (waiting jobs)

## Next Steps

1. ✅ **Immediate**: Test all 4 main features locally
2. ✅ **Short-term**: Add monitoring and alerting
3. ✅ **Medium-term**: Implement S3 storage for files
4. ✅ **Long-term**: Build analytics dashboard

---

**Last Updated:** January 25, 2024
**Status:** Ready for Integration
