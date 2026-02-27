# IT Integration Tracker — Self-Hosted

A web-based M&A technology integration tracker with role-based access control, task management, file attachments, risk registers, and Excel export. Built for IT teams managing complex multi-workstream integrations.

**Version:** 2.2.0

## ✨ Features

- **Multi-Project Support** — Create unlimited integration projects, each with isolated tasks, contacts, and risks. New projects auto-populate from configurable templates.
- **Role-Based Access Control** — Four-tier permission system (Read Only → Edit → Team Lead → Admin)
- **My Tasks** — Personal task view showing assignments across all projects with overdue highlighting
- **Task Attachments** — Upload files to tasks (10MB limit, restricted to safe file types)
- **Excel Export** — Export full project data to `.xlsx` with overview, tasks, contacts, and risks
- **Template Management** — Admins can configure default workstreams and task templates
- **Light/Dark Theme** — Toggle between light and dark modes, persisted per-user
- **Dashboard** — Per-project analytics with progress by workstream, overdue alerts, and critical task tracking

### Role Permissions

| Role | View | Edit Tasks | Add/Delete Tasks | Manage Projects | Manage Users | Manage Templates |
|------|------|------------|------------------|-----------------|--------------|------------------|
| **Read Only** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Edit** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Team Lead** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Default Workstreams

Office 365, Network, Cybersecurity, Active Directory, Applications, Communications — each with pre-built task templates. Fully customizable via Admin → Templates.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm

### Installation

```bash
git clone https://github.com/jimoverly/it-tracker-selfhosted.git
cd it-tracker-selfhosted
npm install
npm start
```

Access at: **http://localhost:3000**

**Default Login:** `admin` / `admin123`

> ⚠️ **Change the default admin password immediately after first login!**

## ⚙️ Environment Variables

All configuration is optional — the app runs with sensible defaults out of the box.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `DB_PATH` | `./tracker.db` | SQLite database file path. Use an absolute path in production (e.g., `/var/lib/it-tracker/tracker.db`) so the DB isn't lost on redeployment |
| `CORS_ORIGIN` | `true` (all origins) | Restrict API access to a specific origin in production (e.g., `https://tracker.yourdomain.com`) |

**Example (Linux):**
```bash
PORT=3000 \
DB_PATH=/var/lib/it-tracker/tracker.db \
CORS_ORIGIN=https://tracker.yourdomain.com \
npm start
```

**Example (systemd override):**
```bash
sudo systemctl edit it-tracker
# Add under [Service]:
# Environment=DB_PATH=/var/lib/it-tracker/tracker.db
# Environment=CORS_ORIGIN=https://tracker.yourdomain.com
```

## 📁 File Structure

```
it-tracker-selfhosted/
├── server.js                # Express backend (API + auth + DB)
├── package.json             # Dependencies
├── tracker.db               # SQLite database (auto-created)
├── uploads/                 # Task attachments (auto-created)
├── public/
│   ├── index.html           # React frontend (single-file app)
│   └── logo.jpg             # Company logo
├── it-tracker.service       # systemd service config
├── nginx-it-tracker.conf    # nginx reverse proxy config (HTTPS)
└── README.md
```

## 🔐 Security

### v2.2.0 Security Features

- **Login rate limiting** — 5 failed attempts triggers a 15-minute IP lockout
- **Password policy** — Minimum 8 characters enforced on create, reset, and change
- **File upload restrictions** — Whitelist of allowed file types (pdf, doc, docx, xls, xlsx, ppt, pptx, png, jpg, jpeg, gif, bmp, txt, csv, zip, msg, eml). All other types are rejected.
- **Filename sanitization** — Uploaded filenames are stripped of special characters to prevent path traversal
- **Project-scoped operations** — Contact and risk updates are scoped to their project, preventing cross-project data manipulation
- **Session cleanup** — Expired sessions are automatically purged every hour to prevent memory leaks
- **Error handling** — All database operations return proper HTTP error codes instead of silently failing
- **Configurable CORS** — Lock down API access to your domain via `CORS_ORIGIN`

### Security Best Practices

1. **Change the default admin password immediately**
2. **Use HTTPS in production** — The included `nginx-it-tracker.conf` has HTTPS configured. Run `sudo certbot --nginx -d tracker.yourdomain.com` to get a free SSL certificate.
3. **Set `CORS_ORIGIN`** to your domain in production
4. **Store the database outside the app directory** using `DB_PATH` so it's preserved across deployments
5. **Run behind a firewall** — Only expose ports 80/443 via nginx
6. **Create individual user accounts** — Don't share admin credentials
7. **Assign minimum necessary roles** — Use Read Only for stakeholders, Edit for team members, Team Lead for project leads

### Authentication

- Token-based sessions with 24-hour expiry
- SHA-256 password hashing (consider upgrading to bcrypt for high-security environments)
- In-memory sessions — users must re-login after server restart

## 🌐 Production Deployment

### 1. Set Up the Application

```bash
# Copy files to /opt
sudo mkdir -p /opt/it-tracker
sudo cp -r * /opt/it-tracker/
cd /opt/it-tracker
sudo npm install

# Create data directories
sudo mkdir -p /opt/it-tracker/uploads
sudo mkdir -p /var/lib/it-tracker
sudo chown -R www-data:www-data /opt/it-tracker /var/lib/it-tracker
```

### 2. Install the Systemd Service

```bash
sudo cp it-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable it-tracker
sudo systemctl start it-tracker

# Verify it's running
sudo systemctl status it-tracker
sudo journalctl -u it-tracker -f
```

The included `it-tracker.service` sets `NODE_ENV=production` and runs as `www-data`. To add environment variables:

```bash
sudo systemctl edit it-tracker
```

Add:
```ini
[Service]
Environment=DB_PATH=/var/lib/it-tracker/tracker.db
Environment=CORS_ORIGIN=https://tracker.yourdomain.com
```

Then: `sudo systemctl daemon-reload && sudo systemctl restart it-tracker`

### 3. Configure Nginx + HTTPS

```bash
# Install nginx config
sudo cp nginx-it-tracker.conf /etc/nginx/sites-available/it-tracker
sudo ln -s /etc/nginx/sites-available/it-tracker /etc/nginx/sites-enabled/

# Edit the config — replace tracker.yourdomain.com with your domain
sudo nano /etc/nginx/sites-available/it-tracker

# Get SSL certificate (free via Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tracker.yourdomain.com

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

The included nginx config provides:
- HTTP → HTTPS redirect
- TLS 1.2/1.3 with strong ciphers
- Security headers (X-Frame-Options, HSTS, X-Content-Type-Options, X-XSS-Protection)
- 20MB upload limit
- WebSocket support

### Alternative: PM2

```bash
npm install -g pm2
DB_PATH=/var/lib/it-tracker/tracker.db pm2 start server.js --name "it-tracker"
pm2 startup
pm2 save
```

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| **502 Bad Gateway** | Check if Node.js is running: `sudo systemctl status it-tracker` |
| **Can't upload files** | Check directory permissions: `sudo chown -R www-data:www-data /opt/it-tracker/uploads` |
| **File type rejected** | Only these types are allowed: pdf, doc, docx, xls, xlsx, ppt, pptx, png, jpg, jpeg, gif, bmp, txt, csv, zip, msg, eml |
| **Account locked out** | Wait 15 minutes after 5 failed login attempts, or restart the server to clear the lockout |
| **Lost database on redeploy** | Set `DB_PATH` to a location outside the app directory |
| **Port 3000 in use** | Set `PORT=3001` or another available port |
| **SELinux blocking** (CentOS/RHEL) | `sudo setsebool -P httpd_can_network_connect 1` |

**Viewing logs:**
```bash
sudo journalctl -u it-tracker -n 50        # Last 50 log lines
sudo journalctl -u it-tracker -f            # Follow live
sudo tail -f /var/log/nginx/error.log       # Nginx errors
```

## 📊 API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login (rate limited: 5 attempts / 15-min lockout) |
| POST | `/api/auth/logout` | Yes | Logout |
| GET | `/api/auth/me` | Yes | Current user + permissions |
| POST | `/api/auth/change-password` | Yes | Change password (min 8 chars) |

### Users (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/list` | Active users for dropdowns (all roles) |
| POST | `/api/users` | Create user (min 8 char password) |
| PUT | `/api/users/:id` | Update user |
| POST | `/api/users/:id/reset-password` | Reset password (min 8 chars) |
| DELETE | `/api/users/:id` | Delete user (cannot delete self) |

### Templates (Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/workstreams` | List workstreams (all roles can read) |
| POST | `/api/admin/workstreams` | Add workstream |
| PUT | `/api/admin/workstreams/:id` | Update workstream |
| DELETE | `/api/admin/workstreams/:id` | Delete workstream |
| GET | `/api/admin/default-tasks` | List default tasks |
| POST | `/api/admin/default-tasks` | Add default task |
| PUT | `/api/admin/default-tasks/:id` | Update default task |
| DELETE | `/api/admin/default-tasks/:id` | Delete default task |

### Projects
| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/projects` | Read Only | List projects with stats |
| GET | `/api/projects/:id` | Read Only | Get project details |
| POST | `/api/projects` | Admin | Create project (auto-seeds tasks) |
| PUT | `/api/projects/:id` | Admin | Update project |
| DELETE | `/api/projects/:id` | Admin | Delete project + all related data |
| GET | `/api/projects/:id/export` | Read Only | Export project data for Excel |
| GET | `/api/projects/:id/stats` | Read Only | Workstream statistics |

### Tasks
| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/projects/:pid/tasks` | Read Only | List project tasks |
| POST | `/api/projects/:pid/tasks` | Team Lead | Add task |
| PUT | `/api/projects/:pid/tasks/:id` | Edit | Update task |
| DELETE | `/api/projects/:pid/tasks/:id` | Team Lead | Delete task + attachments |
| GET | `/api/my-tasks` | Read Only | Tasks assigned to current user |

### Attachments
| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/projects/:pid/tasks/:tid/attachments` | Read Only | List attachments |
| POST | `/api/projects/:pid/tasks/:tid/attachments` | Edit | Upload file (10MB max, type-restricted) |
| DELETE | `/api/projects/:pid/tasks/:tid/attachments/:id` | Edit | Delete attachment |

### Contacts
| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/projects/:pid/contacts` | Read Only | List contacts |
| POST | `/api/projects/:pid/contacts` | Team Lead | Add contact |
| PUT | `/api/projects/:pid/contacts/:id` | Edit | Update contact |
| DELETE | `/api/projects/:pid/contacts/:id` | Team Lead | Delete contact |

### Risks
| Method | Endpoint | Min Role | Description |
|--------|----------|----------|-------------|
| GET | `/api/projects/:pid/risks` | Read Only | List risks |
| POST | `/api/projects/:pid/risks` | Team Lead | Add risk |
| PUT | `/api/projects/:pid/risks/:id` | Edit | Update risk |
| DELETE | `/api/projects/:pid/risks/:id` | Team Lead | Delete risk |

## 🔄 Upgrading

```bash
# 1. Backup database and uploads
cp /var/lib/it-tracker/tracker.db /var/lib/it-tracker/tracker.db.backup
cp -r /opt/it-tracker/uploads /tmp/it-tracker-uploads-backup

# 2. Pull latest code
cd /opt/it-tracker
sudo -u www-data git pull

# 3. Install any new dependencies
sudo -u www-data npm install

# 4. Restart
sudo systemctl restart it-tracker
```

## 📋 Changelog

### v2.2.0 — Security & Stability Release
- **Security:** File upload type whitelist and filename sanitization
- **Security:** Login rate limiting (5 attempts / 15-min lockout)
- **Security:** Password minimum 8 characters on all endpoints
- **Security:** Configurable CORS origin via `CORS_ORIGIN` env var
- **Security:** nginx config updated with HTTPS, security headers (HSTS, X-Frame-Options, etc.)
- **Bug fix:** Task and project delete race conditions resolved (sequential cleanup)
- **Bug fix:** Contact update now scoped to project_id (prevents cross-project edits)
- **Bug fix:** All database callbacks now return proper error responses
- **Added:** Delete endpoints for contacts and risks
- **Added:** Session cleanup interval (hourly, prevents memory leak)
- **Added:** Configurable database path via `DB_PATH` env var
- **Added:** Multer error handling middleware with user-friendly messages
- **Changed:** Login screen no longer displays default credentials

### v2.1.0 — Initial Release
- Multi-project support with auto-seeded templates
- Role-based access control (4 tiers)
- Task management with attachments and Excel export
- Contact management and risk registers
- My Tasks personal view
- Light/dark theme toggle
- Dashboard with workstream analytics

## 📝 License

Internal use — Applied Industrial Technologies
