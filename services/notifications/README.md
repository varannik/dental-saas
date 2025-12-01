# Notifications Service

Multi-channel notification delivery (email, SMS, push, in-app).

## Structure

```
notifications/
├── src/
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── services/
│   │   ├── email.service.ts
│   │   ├── sms.service.ts
│   │   ├── push.service.ts
│   │   └── notification.service.ts
│   ├── templates/               # Email/notification templates
│   ├── workers/                 # Background job processors
│   └── types/
├── tests/
└── Dockerfile
```

## Features

- Email notifications (transactional, marketing)
- SMS notifications (Twilio)
- Push notifications (FCM, APNs)
- In-app notifications
- Notification preferences
- Template management
- Rate limiting
- Delivery tracking

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/notifications/send` | Send notification |
| GET | `/notifications` | List user notifications |
| PUT | `/notifications/:id/read` | Mark as read |
| GET | `/notifications/preferences` | Get preferences |
| PUT | `/notifications/preferences` | Update preferences |

