import { Context, Next } from 'hono';

// ========== RATE LIMITING ==========
interface RateLimitEntry {
  count: number;
  firstRequest: number;
  blocked: boolean;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    // Remove entries older than 1 hour
    if (now - entry.firstRequest > 3600000) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

interface RateLimitOptions {
  windowMs: number;      // Time window in ms
  maxRequests: number;   // Max requests per window
  blockDuration: number; // How long to block after exceeding limit (ms)
  keyPrefix?: string;    // Prefix for the rate limit key
}

export const rateLimit = (options: RateLimitOptions) => {
  const { windowMs, maxRequests, blockDuration, keyPrefix = 'rl' } = options;

  return async (c: Context, next: Next) => {
    const ip = getClientIP(c);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Check if currently blocked
    if (entry?.blocked && entry.blockedUntil && now < entry.blockedUntil) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Remaining', '0');
      return c.json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter 
      }, 429);
    }

    // Reset if window expired or was blocked but block expired
    if (!entry || now - entry.firstRequest > windowMs || (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil)) {
      entry = { count: 1, firstRequest: now, blocked: false };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      entry.blocked = true;
      entry.blockedUntil = now + blockDuration;
      rateLimitStore.set(key, entry);

      const retryAfter = Math.ceil(blockDuration / 1000);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Remaining', '0');
      
      console.warn(`[SECURITY] Rate limit exceeded for IP: ${ip}`);
      
      return c.json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter 
      }, 429);
    }

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil((entry.firstRequest + windowMs) / 1000)));

    await next();
  };
};

// ========== ADMIN LOGIN PROTECTION ==========
interface LoginAttempt {
  attempts: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const loginAttemptStore = new Map<string, LoginAttempt>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes lockout

export const trackFailedLogin = (ip: string) => {
  const now = Date.now();
  let entry = loginAttemptStore.get(ip);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW) {
    entry = { attempts: 1, firstAttempt: now };
  } else {
    entry.attempts++;
    if (entry.attempts >= MAX_LOGIN_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION;
      console.warn(`[SECURITY] IP locked out due to failed login attempts: ${ip}`);
    }
  }

  loginAttemptStore.set(ip, entry);
};

export const clearLoginAttempts = (ip: string) => {
  loginAttemptStore.delete(ip);
};

export const isIPLockedOut = (ip: string): { locked: boolean; retryAfter?: number } => {
  const entry = loginAttemptStore.get(ip);
  const now = Date.now();

  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return { 
      locked: true, 
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000) 
    };
  }

  return { locked: false };
};

// ========== SECURITY HEADERS ==========
export const securityHeaders = async (c: Context, next: Next) => {
  await next();
  
  // Security headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
};

// ========== INPUT SANITIZATION ==========
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return input;
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }
  
  return sanitized;
};

// ========== HELPER FUNCTIONS ==========
export const getClientIP = (c: Context): string => {
  // Check various headers for real IP (behind proxy/load balancer)
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = c.req.header('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = c.req.header('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback
  return 'unknown';
};

// ========== REQUEST LOGGING FOR SECURITY ==========
export const securityLogger = async (c: Context, next: Next) => {
  const start = Date.now();
  const ip = getClientIP(c);
  const method = c.req.method;
  const path = c.req.path;
  const userAgent = c.req.header('user-agent') || 'unknown';
  
  await next();
  
  const duration = Date.now() - start;
  const status = c.res.status;
  
  // Log suspicious requests
  if (status === 401 || status === 403 || status === 429) {
    console.warn(`[SECURITY] ${method} ${path} - ${status} - IP: ${ip} - UA: ${userAgent} - ${duration}ms`);
  }
  
  // Log admin access
  if (path.includes('/admin')) {
    console.log(`[ADMIN] ${method} ${path} - ${status} - IP: ${ip} - ${duration}ms`);
  }
};

// ========== BLOCKED IPS (Optional - for manual blocking) ==========
const blockedIPs = new Set<string>();

export const blockIP = (ip: string) => {
  blockedIPs.add(ip);
  console.warn(`[SECURITY] IP manually blocked: ${ip}`);
};

export const unblockIP = (ip: string) => {
  blockedIPs.delete(ip);
  console.log(`[SECURITY] IP unblocked: ${ip}`);
};

export const ipBlocker = async (c: Context, next: Next) => {
  const ip = getClientIP(c);
  
  if (blockedIPs.has(ip)) {
    console.warn(`[SECURITY] Blocked IP attempted access: ${ip}`);
    return c.json({ error: 'Access denied' }, 403);
  }
  
  await next();
};

// ========== HMAC SIGNATURE VERIFICATION ==========
// Secret key for CLI signature (keep in sync with CLI)
const BENIX_SECRET = process.env.BENIX_SECRET || 'benix-cli-2026-secure-key';

export const verifySignature = async (c: Context, next: Next) => {
  const signature = c.req.header('X-Benix-Signature');
  const timestamp = c.req.header('X-Benix-Timestamp');
  
  if (!signature || !timestamp) {
    console.warn(`[SECURITY] Missing signature headers from IP: ${getClientIP(c)}`);
    return c.json({ error: 'Invalid request' }, 401);
  }
  
  // Check timestamp is within 5 minutes
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
    console.warn(`[SECURITY] Expired timestamp from IP: ${getClientIP(c)}`);
    return c.json({ error: 'Request expired' }, 401);
  }
  
  // Get body for signature verification
  const body = await c.req.text();
  
  // Create expected signature: HMAC-SHA256(timestamp + body)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(BENIX_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const data = encoder.encode(timestamp + body);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  if (signature !== expectedSignature) {
    console.warn(`[SECURITY] Invalid signature from IP: ${getClientIP(c)}`);
    return c.json({ error: 'Invalid signature' }, 401);
  }
  
  // Store parsed body for later use
  c.set('parsedBody', JSON.parse(body));
  
  await next();
};

// Validate benchmark data structure
export const validateBenchmarkData = async (c: Context, next: Next) => {
  try {
    const body = c.get('parsedBody') || await c.req.json();
    
    // Required fields
    if (!body.data?.system?.hostname || !body.data?.system?.os) {
      return c.json({ error: 'Invalid benchmark data: missing required system info' }, 400);
    }
    
    // Check for suspicious patterns (fake data)
    const system = body.data.system;
    
    // Must have reasonable CPU info
    if (body.data.cpu && (!body.data.cpu.model || !body.data.cpu.cores || body.data.cpu.cores < 1)) {
      return c.json({ error: 'Invalid CPU data' }, 400);
    }
    
    // Must have reasonable benchmark scores (if present)
    if (body.data.cpu?.benchmark) {
      const bench = body.data.cpu.benchmark;
      if (bench.singleThread < 100 || bench.multiThread < 100) {
        return c.json({ error: 'Invalid benchmark scores' }, 400);
      }
    }
    
    c.set('validatedBody', body);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid JSON data' }, 400);
  }
};
