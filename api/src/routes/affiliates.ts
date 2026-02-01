import { Hono } from 'hono';
import db from '../db';
import { 
  trackFailedLogin, 
  clearLoginAttempts, 
  isIPLockedOut, 
  getClientIP,
  sanitizeInput 
} from '../middleware/security';

const affiliates = new Hono();

// Types
interface Affiliate {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  affiliate_link: string;
  price_from: string | null;
  features: string | null;
  is_featured: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Get admin API key from database
const getAdminKey = async (): Promise<string> => {
  const setting = await db.query('SELECT value FROM settings WHERE `key` = ?').get('admin_api_key') as { value: string } | null;
  return setting?.value || 'benix-admin-secret-key-change-me';
};

const adminAuth = async (c: any, next: any) => {
  const ip = getClientIP(c);
  
  const lockStatus = isIPLockedOut(ip);
  if (lockStatus.locked) {
    console.warn(`[SECURITY] Locked out IP attempted admin access: ${ip}`);
    return c.json({ 
      error: 'Too many failed attempts. Please try again later.',
      retryAfter: lockStatus.retryAfter 
    }, 429);
  }
  
  const apiKey = c.req.header('X-Admin-Key') || c.req.query('admin_key');
  const currentKey = await getAdminKey();
  
  if (apiKey !== currentKey) {
    trackFailedLogin(ip);
    console.warn(`[SECURITY] Failed admin auth from IP: ${ip}`);
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  clearLoginAttempts(ip);
  await next();
};

// ========== PUBLIC ROUTES ==========

// GET /affiliates - List active affiliates (public)
affiliates.get('/', async (c) => {
  try {
    const rows = await db.query(`
      SELECT id, name, slug, logo_url, description, affiliate_link, price_from, features, is_featured
      FROM affiliates 
      WHERE is_active = 1 
      ORDER BY is_featured DESC, sort_order ASC, name ASC
    `).all() as Affiliate[];
    
    const affiliateList = rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }));
    
    return c.json({ affiliates: affiliateList, total: affiliateList.length });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    return c.json({ error: 'Failed to fetch affiliates' }, 500);
  }
});

// GET /affiliates/:slug - Get single affiliate by slug (public)
affiliates.get('/:slug', async (c) => {
  const { slug } = c.req.param();
  try {
    const row = await db.query(`
      SELECT id, name, slug, logo_url, description, affiliate_link, price_from, features, is_featured
      FROM affiliates 
      WHERE slug = ? AND is_active = 1
    `).get(slug) as Affiliate | null;
    
    if (!row) {
      return c.json({ error: 'Affiliate not found' }, 404);
    }
    
    return c.json({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    });
  } catch (error) {
    console.error('Error fetching affiliate:', error);
    return c.json({ error: 'Failed to fetch affiliate' }, 500);
  }
});

// ========== ADMIN ROUTES ==========

// GET /affiliates/admin/list - List all affiliates (admin)
affiliates.get('/admin/list', adminAuth, async (c) => {
  try {
    const rows = await db.query(`
      SELECT * FROM affiliates 
      ORDER BY sort_order ASC, name ASC
    `).all() as Affiliate[];
    
    const affiliateList = rows.map(row => ({
      ...row,
      features: row.features ? JSON.parse(row.features) : []
    }));
    
    return c.json({ affiliates: affiliateList, total: affiliateList.length });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    return c.json({ error: 'Failed to fetch affiliates' }, 500);
  }
});

// PUT /affiliates/admin/change-key - Change admin API key
affiliates.put('/admin/change-key', adminAuth, async (c) => {
  try {
    const { newKey, confirmKey } = await c.req.json();
    
    if (!newKey || !confirmKey) {
      return c.json({ error: 'New key and confirmation are required' }, 400);
    }
    if (newKey !== confirmKey) {
      return c.json({ error: 'Keys do not match' }, 400);
    }
    if (newKey.length < 8) {
      return c.json({ error: 'Key must be at least 8 characters' }, 400);
    }
    
    await db.run('UPDATE settings SET value = ?, updated_at = NOW() WHERE `key` = ?', [newKey, 'admin_api_key']);
    
    return c.json({ success: true, message: 'Admin key updated successfully' });
  } catch (error) {
    console.error('Error changing admin key:', error);
    return c.json({ error: 'Failed to change admin key' }, 500);
  }
});

// POST /affiliates/admin - Create affiliate (admin)
affiliates.post('/admin', adminAuth, async (c) => {
  try {
    const body = await c.req.json();
    const { name, slug, logo_url, description, affiliate_link, price_from, features, is_featured, is_active, sort_order } = body;
    
    if (!name || !slug || !affiliate_link) {
      return c.json({ error: 'Name, slug, and affiliate_link are required' }, 400);
    }
    
    const result = await db.run(`
      INSERT INTO affiliates (name, slug, logo_url, description, affiliate_link, price_from, features, is_featured, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name,
      slug,
      logo_url || null,
      description || null,
      affiliate_link,
      price_from || null,
      features ? JSON.stringify(features) : null,
      is_featured ? 1 : 0,
      is_active !== false ? 1 : 0,
      sort_order || 0
    ]);
    
    return c.json({ success: true, id: result.insertId }, 201);
  } catch (error: any) {
    console.error('Error creating affiliate:', error);
    if (error.message?.includes('Duplicate entry')) {
      return c.json({ error: 'Slug already exists' }, 400);
    }
    return c.json({ error: 'Failed to create affiliate' }, 500);
  }
});

// PUT /affiliates/admin/:id - Update affiliate (admin)
affiliates.put('/admin/:id', adminAuth, async (c) => {
  const { id } = c.req.param();
  try {
    const body = await c.req.json();
    const { name, slug, logo_url, description, affiliate_link, price_from, features, is_featured, is_active, sort_order } = body;
    
    if (!name || !slug || !affiliate_link) {
      return c.json({ error: 'Name, slug, and affiliate_link are required' }, 400);
    }
    
    const result = await db.run(`
      UPDATE affiliates 
      SET name = ?, slug = ?, logo_url = ?, description = ?, affiliate_link = ?, 
          price_from = ?, features = ?, is_featured = ?, is_active = ?, sort_order = ?,
          updated_at = NOW()
      WHERE id = ?
    `, [
      name,
      slug,
      logo_url || null,
      description || null,
      affiliate_link,
      price_from || null,
      features ? JSON.stringify(features) : null,
      is_featured ? 1 : 0,
      is_active !== false ? 1 : 0,
      sort_order || 0,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return c.json({ error: 'Affiliate not found' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error updating affiliate:', error);
    if (error.message?.includes('Duplicate entry')) {
      return c.json({ error: 'Slug already exists' }, 400);
    }
    return c.json({ error: 'Failed to update affiliate' }, 500);
  }
});

// DELETE /affiliates/admin/:id - Delete affiliate (admin)
affiliates.delete('/admin/:id', adminAuth, async (c) => {
  const { id } = c.req.param();
  try {
    const result = await db.run('DELETE FROM affiliates WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return c.json({ error: 'Affiliate not found' }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting affiliate:', error);
    return c.json({ error: 'Failed to delete affiliate' }, 500);
  }
});

// POST /affiliates/admin/reorder - Reorder affiliates (admin)
affiliates.post('/admin/reorder', adminAuth, async (c) => {
  try {
    const body = await c.req.json();
    const { orders } = body;
    
    if (!Array.isArray(orders)) {
      return c.json({ error: 'Orders array is required' }, 400);
    }
    
    for (const { id, sort_order } of orders) {
      await db.run('UPDATE affiliates SET sort_order = ? WHERE id = ?', [sort_order, id]);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error reordering affiliates:', error);
    return c.json({ error: 'Failed to reorder affiliates' }, 500);
  }
});

export default affiliates;
