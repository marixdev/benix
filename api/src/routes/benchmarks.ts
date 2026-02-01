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

// Strict rate limiting for benchmark uploads: 10 per minute per IP
app.post('/', rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
  blockDuration: 5 * 60 * 1000,
  keyPrefix: 'benchmark-upload'
}));

// Create new benchmark
app.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateBenchmarkRequest>();
    
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
      'INSERT INTO benchmarks (id, hostname, data, source, ip, is_private) VALUES (?, ?, ?, ?, ?, ?)',
      [id, hostname, dataString, source, ip, isPrivate]
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
