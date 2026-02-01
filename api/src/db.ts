import mysql from 'mysql2/promise';

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'benix',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'benix',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Database wrapper with simple API
class Database {
  private pool: mysql.Pool;

  constructor(pool: mysql.Pool) {
    this.pool = pool;
  }

  // Query all rows
  query(sql: string) {
    const self = this;
    return {
      all: async (...params: unknown[]) => {
        const [rows] = await self.pool.execute(sql, params);
        return rows;
      },
      get: async (...params: unknown[]) => {
        const [rows] = await self.pool.execute(sql, params) as [unknown[], unknown];
        return (rows as unknown[])[0] || null;
      }
    };
  }

  // Run insert/update/delete
  async run(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader> {
    const [result] = await this.pool.execute(sql, params || []);
    return result as mysql.ResultSetHeader;
  }

  // Execute raw SQL (for table creation)
  async exec(sql: string): Promise<void> {
    await this.pool.execute(sql);
  }

  // Prepare statement (for compatibility)
  prepare(sql: string) {
    const self = this;
    return {
      run: async (params: Record<string, unknown>) => {
        // Convert $param to ? style
        const values = Object.values(params);
        const cleanSql = sql.replace(/\$\w+/g, '?');
        await self.pool.execute(cleanSql, values);
      }
    };
  }
}

export const db = new Database(pool);

// Initialize database tables
async function initDatabase() {
  // Create benchmarks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS benchmarks (
      id VARCHAR(20) PRIMARY KEY,
      hostname VARCHAR(255) NOT NULL,
      data LONGTEXT NOT NULL,
      source VARCHAR(50) DEFAULT 'benix',
      ip VARCHAR(45),
      is_private TINYINT(1) DEFAULT 0,
      fingerprint VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_hostname (hostname),
      INDEX idx_private (is_private),
      INDEX idx_fingerprint (fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Add fingerprint column if not exists (for existing databases)
  await db.exec(`
    ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(20),
    ADD INDEX IF NOT EXISTS idx_fingerprint (fingerprint)
  `).catch(() => {
    // Ignore error if column already exists
  });

  // Create affiliates table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS affiliates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      logo_url TEXT,
      description TEXT,
      affiliate_link TEXT NOT NULL,
      price_from VARCHAR(50),
      features TEXT,
      is_featured TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active (is_active),
      INDEX idx_sort (sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Create settings table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Initialize default admin key if not exists
  const adminKeySetting = await db.query(
    'SELECT value FROM settings WHERE `key` = ?'
  ).get('admin_api_key') as { value: string } | null;
  
  if (!adminKeySetting) {
    await db.run(
      'INSERT INTO settings (`key`, value) VALUES (?, ?)',
      ['admin_api_key', process.env.ADMIN_API_KEY || 'benix-admin-secret-key-change-me']
    );
  }

  console.log('✅ Database tables ready');
}

// Initialize on import
initDatabase().catch(err => {
  console.error('❌ Database init failed:', err.message);
});

export default db;
