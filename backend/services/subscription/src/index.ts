import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { subscriptionRoutes } from './controllers/subscription.controller';
import { planRoutes } from './controllers/plan.controller';
import { setupLogging } from './utils/logging';
import { errorHandler } from './utils/error-handler';

// Load environment variables
dotenv.config();

// Create Express server
const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Setup logging
setupLogging(app);

// Routes
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/plans', planRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'subscription-service' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`Subscription service running on port ${port}`);
});

export default app; 