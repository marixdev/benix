# Benix API

Backend API server for the Benix VPS benchmarking platform.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Hono](https://hono.dev)
- **Database**: MariaDB / MySQL
- **ID Generation**: [nanoid](https://github.com/ai/nanoid)

## Local Development

### 1. Install Dependencies

```bash
cd api
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

### 3. Run

```bash
bun run dev
```

---

## CloudPanel Deployment (Step-by-step)

### Step 1: Create Node.js Site in CloudPanel

1. Login to CloudPanel Admin Panel
2. Go to **Sites** → **Add Site**
3. Choose **Create a Node.js Site**
4. Fill in:
   - Domain: `api.benix.app`
   - Node.js Version: `20 LTS` (hoặc mới nhất)
   - App Port: `3001`
5. Click **Create**

### Step 2: Create Database

1. Go to **Databases** → **Add Database**
2. Fill in:
   - Database Name: `benix`
   - Database User: `benix`
   - Password: (lưu lại password này)
3. Click **Create**

### Step 3: SSH vào Server

SSH với **Site User** (không phải root):

```bash
ssh benix@your-server-ip
```

### Step 4: Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### Step 5: Clone và Setup Code

```bash
cd htdocs/api.benix.app

# Clone repo (hoặc upload code)
git clone https://github.com/marixdev/benix.git temp
mv temp/api/* .
rm -rf temp

# Install dependencies
bun install
```

### Step 6: Configure Environment

```bash
cp .env.example .env
nano .env
```

Điền thông tin:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=benix
DB_PASSWORD=your_database_password
DB_NAME=benix
ADMIN_API_KEY=your_secure_admin_key_here
PORT=3001
```

### Step 7: Test Run

```bash
bun run start
```

Nếu thấy `✅ Database tables ready` và server chạy OK thì tiếp tục. Nhấn `Ctrl+C` để dừng.

### Step 8: Install PM2

```bash
npm install pm2@latest -g
```

### Step 9: Start với PM2

```bash
pm2 start bun --name benix-api -- run start
```

Kiểm tra status:

```bash
pm2 status
```

Phải thấy `benix-api` với status `online`.

### Step 10: Save PM2 Configuration

```bash
pm2 save
```

### Step 11: Setup Auto-start sau Reboot

> ⚠️ CloudPanel site user không có quyền sudo, nên dùng **Crontab**.

**Với Site User (benix-api):**

1. Lấy đường dẫn đầy đủ của PM2:

```bash
which pm2
```

Output ví dụ: `/home/benix-api/.nvm/versions/node/v20.10.0/bin/pm2`

2. Edit crontab:

```bash
crontab -e
```

3. Thêm dòng này vào cuối file (thay đường dẫn pm2 cho đúng):

```cron
@reboot /home/benix-api/.nvm/versions/node/v20.10.0/bin/pm2 resurrect
```

4. Save và thoát (`Ctrl+X`, `Y`, `Enter`)

5. Kiểm tra crontab đã lưu:

```bash
crontab -l
```

**Với Root (nếu cần dùng systemd):**

SSH vào server với **root**:

```bash
ssh root@your-server-ip

# Chạy PM2 startup với đường dẫn đầy đủ và user cụ thể
env PATH=$PATH:/home/benix-api/.nvm/versions/node/v20.10.0/bin /home/benix-api/.nvm/versions/node/v20.10.0/lib/node_modules/pm2/bin/pm2 startup systemd -u benix-api --hp /home/benix-api

# Quay lại site user để save
su - benix-api
pm2 save
```

1. Lấy đường dẫn PM2:

```bash
which pm2
```

Output ví dụ: `/home/benix/.nvm/versions/node/v20.10.0/bin/pm2`

2. Edit crontab:

```bash
crontab -e
```

3. Thêm dòng này vào cuối file (thay đường dẫn pm2 đúng):

```cron
@reboot /home/benix/.nvm/versions/node/v20.10.0/bin/pm2 resurrect
```

4. Save và thoát (`Ctrl+X`, `Y`, `Enter`)

5. Kiểm tra crontab đã lưu:

```bash
crontab -l
```

### Step 12: Configure Reverse Proxy

Trong CloudPanel, vào **Sites** → **api.benix.app** → **Vhost**

Tìm `location /` và sửa thành:

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 86400;
}
```

Click **Save** và **Restart** nginx.

### Step 13: Test

```bash
curl https://api.benix.app/health
```

Phải trả về:
```json
{"status":"ok","timestamp":"..."}
```

### Step 14: Reboot Test

```bash
sudo reboot
```

Sau khi server khởi động lại, SSH vào và kiểm tra:

```bash
pm2 status
```

`benix-api` phải `online`.

---

## PM2 Commands

| Command | Mô tả |
|---------|-------|
| `pm2 status` | Xem trạng thái apps |
| `pm2 logs benix-api` | Xem logs |
| `pm2 restart benix-api` | Restart app |
| `pm2 stop benix-api` | Stop app |
| `pm2 delete benix-api` | Xóa app khỏi PM2 |
| `pm2 monit` | Monitor realtime |

---

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

---

## Troubleshooting

### Xem logs

```bash
pm2 logs benix-api --lines 100
```

### Database connection error

Kiểm tra `.env` có đúng credentials không:

```bash
mysql -u benix -p benix
# Nhập password, nếu vào được là OK
```

### PM2 không chạy sau reboot

Kiểm tra crontab:

```bash
crontab -l
```

Phải có dòng `@reboot pm2 resurrect`.

### Port đã được sử dụng

```bash
lsof -i :3001
# Kill process nếu cần
kill -9 <PID>
```

---

## License

GPL v3
