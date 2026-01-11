import cors from 'cors';
import { config } from '../config';

export const corsMiddleware = cors({
  origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
  methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  credentials: true,
});
