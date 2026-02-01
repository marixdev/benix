import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import db from '../db';
import type { BenchmarkData, BenchmarkRecord, BenchmarkListItem, CreateBenchmarkRequest, NetworkInfo } from '../types/benchmark';
import { rateLimit, getClientIP, sanitizeInput } from '../middleware/security';

// Helper to check if network is NetworkInfo (object with provider) or array
const isNetworkInfo = (network: unknown): network is NetworkInfo => {
  return network !== null && typeof network === 'object' && !Array.isArray(network) && 'provider' in network;
};

const app = new Hono();

// Strict rate limiting for benchmark uploads: 3 per hour per IP
app.post('/', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  blockDuration: 60 * 60 * 1000, // 1 hour block
  keyPrefix: 'benchmark-upload'
}));

// Validate benchmark data
app.post('/', async (c, next) => {
  try {
    const body = await c.req.json<CreateBenchmarkRequest>();
    
    // 1. Required fields
    if (!body.data?.system?.hostname || !body.data?.system?.os) {
      return c.json({ error: 'Missing required system info' }, 400);
    }
    
    // 2. Duration check - benchmark phải mất ít nhất 60 giây
    const duration = body.data.duration || 0;
    if (duration < 60) {
      console.warn(`[SECURITY] Suspicious short duration: ${duration}s from IP: ${getClientIP(c)}`);
      return c.json({ error: 'Invalid benchmark duration' }, 400);
    }
    
    // 3. CPU validation
    if (body.data.cpu) {
      const cpu = body.data.cpu;
      // Cores phải >= 1
      if (!cpu.cores || cpu.cores < 1 || cpu.cores > 512) {
        return c.json({ error: 'Invalid CPU cores' }, 400);
      }
      // Benchmark scores phải hợp lý
      if (cpu.benchmark) {
        const { singleThread, multiThread } = cpu.benchmark;
        // Single thread phải từ 1000 - 100000 ops/s (realistic range)
        if (singleThread < 1000 || singleThread > 100000) {
          return c.json({ error: 'Invalid CPU benchmark scores' }, 400);
        }
        // Multi thread phải >= single thread
        if (multiThread < singleThread) {
          return c.json({ error: 'Invalid CPU benchmark scores' }, 400);
        }
        // Multi thread không thể > single * cores * 1.5 (accounting for hyperthreading)
        if (multiThread > singleThread * cpu.cores * 1.5) {
          return c.json({ error: 'Invalid CPU benchmark scores' }, 400);
        }
      }
    }
    
    // 4. Memory validation
    if (body.data.memory) {
      const mem = body.data.memory;
      // Memory speeds phải hợp lý (0.5 - 200 GB/s)
      if (mem.read && (mem.read < 0.5 || mem.read > 200)) {
        return c.json({ error: 'Invalid memory benchmark' }, 400);
      }
    }
    
    // 5. Fingerprint - tạo hash từ system info để detect duplicate
    const fingerprint = createFingerprint(body.data);
    
    // Check duplicate trong 24h
    const existingRow = await db.query(
      'SELECT id FROM benchmarks WHERE fingerprint = ? AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    ).get(fingerprint) as { id: string } | null;
    
    if (existingRow) {
      console.warn(`[SECURITY] Duplicate benchmark attempt from IP: ${getClientIP(c)}`);
      return c.json({ error: 'Duplicate benchmark detected', existing_id: existingRow.id }, 409);
    }
    
    // Store validated body and fingerprint
    c.set('validatedBody', body);
    c.set('fingerprint', fingerprint);
    
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400);
  }
});

// Create fingerprint from system info
function createFingerprint(data: BenchmarkData): string {
  const parts = [
    data.system?.hostname || '',
    data.system?.os || '',
    data.system?.cpu || '',
    data.system?.cores || '',
    data.system?.memory?.total || '',
    data.system?.virtualization || '',
  ];
  
  // Simple hash
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Create new benchmark
app.post('/', async (c) => {
  try {
    const body = c.get('validatedBody') as CreateBenchmarkRequest;
    const fingerprint = c.get('fingerprint') as string;
    
    if (!body.data || !body.data.system) {
      return c.json({ error: 'Invalid benchmark data' }, 400);
    }

    // Validate data size (max 500KB)
    const dataString = JSON.stringify(body.data);
    if (dataString.length > 500000) {
      return c.json({ error: 'Benchmark data too large' }, 400);
    }

    const id = nanoid(10);
    const hostname = sanitizeInput(body.data.system.hostname || 'unknown');
    const source = sanitizeInput(body.source || 'benix');
    const ip = getClientIP(c);
    const isPrivate = body.is_private ? 1 : 0;

    await db.run(
      'INSERT INTO benchmarks (id, hostname, data, source, ip, is_private, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, hostname, dataString, source, ip, isPrivate, fingerprint]
    );

    console.log(`[BENCHMARK] New benchmark uploaded: ${id} from IP: ${ip} (private: ${isPrivate})`);

    return c.json({ 
      success: true, 
      id,
      is_private: isPrivate === 1,
    }, 201);
  } catch (error) {
    console.error('Error creating benchmark:', error);
    return c.json({ error: 'Failed to create benchmark' }, 500);
  }
});

// Get benchmark by ID
app.get('/:id', async (c) => {
  const { id } = c.req.param();

  const row = await db.query(
    'SELECT id, hostname, data, source, ip, is_private, created_at FROM benchmarks WHERE id = ?'
  ).get(id) as { id: string; hostname: string; data: string; source: string; ip: string; is_private: number; created_at: string } | null;

  if (!row) {
    return c.json({ error: 'Benchmark not found' }, 404);
  }

  // If private, only return basic info (no detailed data)
  if (row.is_private) {
    const data: BenchmarkData = JSON.parse(row.data);
    const network = data.network;
    return c.json({
      id: row.id,
      hostname: row.hostname,
      is_private: true,
      summary: {
        os: data.system?.os || 'Unknown',
        cpu: data.system?.cpu || 'Unknown',
        cores: data.system?.cores || 0,
        frequency: data.system?.frequency || '',
        ram: data.system?.memory?.total || '',
        disk: data.system?.disk?.total?.replace(/\s*\([^)]*\)/g, '') || '',
        virtualization: data.system?.virtualization || 'KVM',
        provider: isNetworkInfo(network) ? network.provider : '',
        location: isNetworkInfo(network) ? network.location : '',
      },
      createdAt: row.created_at,
      source: row.source as 'benix' | 'marix',
    });
  }

  const record: BenchmarkRecord = {
    id: row.id,
    hostname: row.hostname,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    source: row.source as 'benix' | 'marix',
  };

  return c.json(record);
});

// Get recent benchmarks
app.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = Number(c.req.query('offset')) || 0;

  const rows = await db.query(
    'SELECT id, hostname, data, source, is_private, created_at FROM benchmarks ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as { id: string; hostname: string; data: string; source: string; is_private: number; created_at: string }[];

  const items: BenchmarkListItem[] = rows.map(row => {
    const data: BenchmarkData = JSON.parse(row.data);
    const network = data.network;
    const isPrivate = row.is_private === 1;
    
    let diskValue = data.system?.disk?.total || '';
    if (isPrivate) {
      diskValue = diskValue.replace(/\s*\([^)]*\)/g, '');
    }
    
    return {
      id: row.id,
      hostname: row.hostname,
      os: data.system?.os || 'Unknown',
      cpu: data.system?.cpu || 'Unknown',
      cores: data.system?.cores || 0,
      frequency: data.system?.frequency || '',
      ram: data.system?.memory?.total || '',
      disk: diskValue,
      virtualization: data.system?.virtualization || 'KVM',
      provider: isNetworkInfo(network) ? network.provider : '',
      location: isNetworkInfo(network) ? network.location : '',
      createdAt: row.created_at,
      source: row.source as 'benix' | 'marix',
      isPrivate,
    };
  });

  const countResult = await db.query('SELECT COUNT(*) as count FROM benchmarks').get() as { count: number };

  return c.json({
    items,
    total: countResult.count,
    limit,
    offset,
  });
});

// Delete benchmark
app.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  const exists = await db.query('SELECT id FROM benchmarks WHERE id = ?').get(id);
  if (!exists) {
    return c.json({ error: 'Benchmark not found' }, 404);
  }
  
  await db.run('DELETE FROM benchmarks WHERE id = ?', [id]);

  return c.json({ success: true });
});

// Get provider statistics
app.get('/stats/providers', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
  const offset = Number(c.req.query('offset')) || 0;

  const rows = await db.query('SELECT data FROM benchmarks').all() as { data: string }[];

  const providerCounts: Record<string, number> = {};
  
  for (const row of rows) {
    try {
      const data = JSON.parse(row.data);
      const network = data.network;
      const provider = isNetworkInfo(network) ? network.provider : '';
      if (provider && provider.trim() !== '') {
        const normalizedProvider = provider.trim();
        providerCounts[normalizedProvider] = (providerCounts[normalizedProvider] || 0) + 1;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  const allProviders = Object.entries(providerCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  const paginatedProviders = allProviders.slice(offset, offset + limit);
  const countResult = await db.query('SELECT COUNT(*) as count FROM benchmarks').get() as { count: number };

  return c.json({
    providers: paginatedProviders,
    total: countResult.count,
    totalProviders: allProviders.length,
    limit,
    offset,
  });
});

export default app;
