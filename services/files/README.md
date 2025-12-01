# Files Service

File upload, storage, and CDN management.

## Structure

```
files/
├── src/
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── services/
│   │   ├── storage.service.ts     # S3/MinIO
│   │   ├── cdn.service.ts         # CDN integration
│   │   └── image.service.ts       # Image processing
│   └── types/
├── tests/
└── Dockerfile
```

## Features

- File upload (multipart)
- S3-compatible storage (AWS S3, MinIO)
- Image resizing and optimization
- CDN integration
- Signed URLs for private files
- File metadata management
- Virus scanning

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/files/upload` | Upload file |
| GET | `/files/:id` | Get file info |
| GET | `/files/:id/url` | Get signed URL |
| DELETE | `/files/:id` | Delete file |
| POST | `/files/presigned` | Get presigned upload URL |

