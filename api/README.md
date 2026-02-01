# Benix API

Backend API server for the Benix VPS benchmarking platform.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Hono](https://hono.dev)
- **Database**: MariaDB / MySQL
- **ID Generation**: [nanoid](https://github.com/ai/nanoid)

## Setup

### 1. Install Dependencies

```bash
cd api
bun install
```

### 2. Create Database (MariaDB)

```sql
CREATE DATABASE benix CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'benix'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON benix.* TO 'benix'@'localhost';
FLUSH PRIVILEGES;
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=benix
DB_PASSWORD=your_password
DB_NAME=benix
ADMIN_API_KEY=your_secure_admin_key
PORT=3001
```

### 4. Run

Development:
```bash
bun run dev
```

Production:
```bash
bun run start
```

## CloudPanel Deployment

### 1. Create Node.js Site

- Add new site in CloudPanel
- Choose Node.js app type
- Set Node.js version (or use Bun)

### 2. Setup Bun on Server

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 3. Deploy Code

```bash
cd /home/youruser/htdocs/api.benix.app
git clone https://github.com/marixdev/benix.git .
cd api
bun install
```

### 4. Create Database

In CloudPanel > Databases > Add Database:
- Database name: `benix`
- User: `benix`
- Password: (save this)

### 5. Configure Environment

```bash
cp .env.example .env
nano .env
# Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
```

### 6. Setup PM2 (Process Manager)

```bash
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.cjs << 'EOPM2'
module.exports = {
  apps: [{
    name: 'benix-api',
    script: 'bun',
    args: 'run start',
    cwd: '/home/youruser/htdocs/api.benix.app/api',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOPM2

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 7. Reverse Proxy (Nginx)

CloudPanel auto-generates nginx config. Add to your site config:

```nginx
location /api {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
}

location /sitemap.xml {
    proxy_pass http://127.0.0.1:3001/api/sitemap.xml;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/benchmarks` | List benchmarks |
| `GET` | `/api/benchmarks/:id` | Get benchmark |
| `POST` | `/api/benchmarks` | Submit benchmark |
| `GET` | `/api/benchmarks/stats/providers` | Provider stats |
| `GET` | `/api/affiliates` | List affiliates |
| `GET` | `/api/sitemap.xml` | Dynamic sitemap |

### Admin Endpoints (require X-Admin-Key header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/affiliates/admin/list` | List all affiliates |
| `POST` | `/api/affiliates/admin` | Create affiliate |
| `PUT` | `/api/affiliates/admin/:id` | Update affiliate |
| `DELETE` | `/api/affiliates/admin/:id` | Delete affiliate |

## License

GPL v3
