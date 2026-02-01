import { Hono } from 'hono';
import db from '../db';
import type { BenchmarkData } from '../types/benchmark';

const app = new Hono();

// Known VPS providers for quality filter
const KNOWN_PROVIDERS = [
  'vultr', 'digitalocean', 'linode', 'hetzner', 'ovh', 'aws', 'google', 'azure',
  'contabo', 'hostinger', 'ionos', 'upcloud', 'scaleway', 'kamatera', 'cloudways',
  'netcup', 'time4vps', 'hostworld', 'vpsserver', 'racknerd', 'greencloud',
  'buyvm', 'hosteons', 'cloudcone', 'hostus', 'crunchbits', 'webhorizon',
  'reliablesite', 'servermania', 'hostwinds', 'interserver', 'a2hosting',
  'bluehost', 'godaddy', 'namecheap', 'dreamhost', 'siteground', 'kinsta',
  'liquidweb', 'inmotion', 'fastcomet', 'hostgator', 'wpengine', 'nexushost',
  'v.ps', 'aeza', 'vietserver', 'vpsme', 'cloudsigma', 'atlantic', 'colocrossing',
  'virmach', 'spartanhost', 'oplink', 'simplecloud', 'letbox', 'hostdare'
];

// Get provider from benchmark data
const getProvider = (data: BenchmarkData): string => {
  const network = data.network;
  if (network && typeof network === 'object' && !Array.isArray(network)) {
    return ((network as { provider?: string }).provider || '').toLowerCase().trim();
  }
  return '';
};

// Calculate overall score for a benchmark (higher = better)
const calculateScore = (data: BenchmarkData): number => {
  let score = 0;
  
  // CPU score (weighted heavily)
  if (data.cpu?.singleCore) score += data.cpu.singleCore * 2;
  if (data.cpu?.multiCore) score += data.cpu.multiCore;
  
  // Memory score (read + write in MB/s)
  if (data.memory?.read) {
    const readMB = parseFloat(data.memory.read.replace(/[^0-9.]/g, '')) || 0;
    score += readMB / 100;
  }
  if (data.memory?.write) {
    const writeMB = parseFloat(data.memory.write.replace(/[^0-9.]/g, '')) || 0;
    score += writeMB / 100;
  }
  
  // Disk score (read + write in MB/s)
  if (data.disk?.read) {
    const diskRead = parseFloat(data.disk.read.replace(/[^0-9.]/g, '')) || 0;
    score += diskRead / 10;
  }
  if (data.disk?.write) {
    const diskWrite = parseFloat(data.disk.write.replace(/[^0-9.]/g, '')) || 0;
    score += diskWrite / 10;
  }
  
  return score;
};

// Check if benchmark is valid for sitemap
const isValidBenchmark = (data: BenchmarkData): boolean => {
  // Must have system info
  if (!data.system?.cpu || !data.system?.cores) return false;

  // Must have some benchmark results
  const hasCpuBench = data.cpu?.singleCore || data.cpu?.multiCore;
  const hasMemoryBench = data.memory?.read || data.memory?.write;
  const hasDiskBench = data.disk?.read || data.disk?.write;
  
  if (!hasCpuBench && !hasMemoryBench && !hasDiskBench) return false;

  // Must have a known provider
  const provider = getProvider(data);
  if (!provider) return false;
  
  const isKnownProvider = KNOWN_PROVIDERS.some(p => provider.includes(p));
  return isKnownProvider;
};

// Generate sitemap XML
app.get('/', async (c) => {
  try {
    // Get public benchmarks older than 1 week
    const rows = await db.query(`
      SELECT id, data, created_at
      FROM benchmarks
      WHERE is_private = 0
        AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY created_at DESC
    `).all() as { id: string; data: string; created_at: string }[];

    const baseUrl = 'https://benix.app';
    const now = new Date().toISOString().split('T')[0];

    // Find best benchmark per provider
    const bestByProvider = new Map<string, { id: string; score: number; createdAt: string }>();
    
    for (const row of rows) {
      try {
        const data: BenchmarkData = JSON.parse(row.data);
        
        if (!isValidBenchmark(data)) continue;
        
        const provider = getProvider(data);
        const score = calculateScore(data);
        
        const existing = bestByProvider.get(provider);
        if (!existing || score > existing.score) {
          bestByProvider.set(provider, {
            id: row.id,
            score,
            createdAt: row.created_at
          });
        }
      } catch {
        continue;
      }
    }

    // Build sitemap XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/benchmarks</loc>
    <lastmod>${now}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`;

    // Add best benchmark from each provider
    for (const [provider, benchmark] of bestByProvider) {
      const createdAt = new Date(benchmark.createdAt);
      const lastmod = createdAt.toISOString().split('T')[0];
      
      xml += `
  <url>
    <loc>${baseUrl}/benchmark/${benchmark.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    console.log(`[SITEMAP] Generated with ${bestByProvider.size} providers (best benchmark each) from ${rows.length} total benchmarks`);

    c.header('Content-Type', 'application/xml');
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    return c.text('Error generating sitemap', 500);
  }
});

export default app;
