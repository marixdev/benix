import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import benchmarksRouter from './routes/benchmarks';
import affiliatesRouter from './routes/affiliates';
import sitemapRouter from './routes/sitemap';
import { 
  rateLimit, 
  securityHeaders, 
  securityLogger, 
  ipBlocker 
} from './middleware/security';

const app = new Hono();

// Security middleware (apply first)
app.use('*', ipBlocker);
app.use('*', securityHeaders);
app.use('*', securityLogger);

// General rate limiting: 100 requests per minute
app.use('*', rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
  blockDuration: 60 * 1000,
  keyPrefix: 'general'
}));

// Stricter rate limiting for admin endpoints: 20 requests per minute
app.use('/api/affiliates/admin/*', rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 20,
  blockDuration: 5 * 60 * 1000, // 5 min block
  keyPrefix: 'admin'
}));

// Other middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080', 'http://localhost:8081', 'https://benix.app'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
}));

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/api/benchmarks', benchmarksRouter);
app.route('/api/affiliates', affiliatesRouter);
app.route('/api/sitemap.xml', sitemapRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal server error' }, 500);
});

const port = Number(process.env.PORT) || 3001;

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    BENIX API SERVER                          ║
╠══════════════════════════════════════════════════════════════╣
║  🚀 Server running at http://localhost:${port}                 ║
╠══════════════════════════════════════════════════════════════╣
║  📊 POST /api/benchmarks       - Upload benchmark            ║
║  📄 GET  /api/benchmarks/:id   - Get benchmark by ID         ║
║  📋 GET  /api/benchmarks       - List recent benchmarks      ║
║  🤝 GET  /api/affiliates       - List affiliates             ║
║  🔐 *    /api/affiliates/admin - Admin CRUD (needs API key)  ║
║  ❤️  GET  /health               - Health check                ║
╠══════════════════════════════════════════════════════════════╣
║  🛡️  SECURITY ENABLED:                                        ║
║     • Rate limiting (100 req/min general, 20/min admin)      ║
║     • Admin login lockout (5 failed = 30min ban)             ║
║     • IP blocking & security headers                         ║
║     • Request logging for suspicious activity                ║
╚══════════════════════════════════════════════════════════════╝
`);

export default {
  port,
  fetch: app.fetch,
};
