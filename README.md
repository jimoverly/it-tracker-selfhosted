# IT Integration Tracker - Self-Hosted Deployment Guide

A comprehensive web-based IT Integration Tracker for managing **multiple M&A technology integrations** with **role-based access control**, **email notifications**, **file attachments**, and **Excel export**.

## ✨ Features

### Multi-Project Support
- Create unlimited projects with isolated data
- Auto-populated from configurable task templates
- Project dashboard with progress indicators

### Role-Based Access Control
| Role | View | Edit | Add/Delete Tasks | Manage Projects | Manage Users | Manage Templates |
|------|------|------|------------------|-----------------|--------------|------------------|
| **Read Only** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Edit** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Team Lead** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Email Notifications
- Password reset emails with temporary credentials
- Overdue task notifications to task owners
- Configure SMTP settings via environment variables

### Task Attachments
- Upload files to any task (10MB limit per file)
- Download attachments from task detail view
- Automatic cleanup on task/project deletion

### Excel Export
- Export full project to .xlsx spreadsheet
- Includes: Overview, Workstream Summary, Tasks, Contacts, Risks
- Dashboard metrics included in export

### Template Management (Admin)
- Configure default workstreams with custom colors
- Create/edit/delete default task templates
- New projects auto-populate from templates

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm

### Installation

```bash
# Extract the package
unzip it-tracker-selfhosted.zip
cd it-tracker-selfhosted

# Install dependencies
npm install

# Start the server
npm start
```

Access at: **http://localhost:3000**

**Default Login:** `admin` / `admin123`

> ⚠️ **IMPORTANT:** Change the default password immediately after first login!

## 📧 Email Configuration

Set environment variables to enable email notifications:

```bash
# Windows
set SMTP_ENABLED=true
set SMTP_HOST=smtp.office365.com
set SMTP_PORT=587
set SMTP_USER=your-email@company.com
set SMTP_PASS=your-password
set SMTP_FROM=noreply@company.com
npm start

# Linux/Mac
SMTP_ENABLED=true \
SMTP_HOST=smtp.office365.com \
SMTP_PORT=587 \
SMTP_USER=your-email@company.com \
SMTP_PASS=your-password \
SMTP_FROM=noreply@company.com \
npm start
```

### Email Features
1. **Password Reset** - When admin resets a user's password, email is sent with new credentials
2. **Overdue Notifications** - Click "📧 Notify Overdue" in project view to email all task owners with overdue tasks

> Note: Task owners must have an email address configured in the Owner Email field

## 📁 File Structure

```
it-tracker-selfhosted/
├── server.js           # Express backend with API routes
├── package.json        # Dependencies
├── tracker.db          # SQLite database (auto-created)
├── uploads/            # Task attachments (auto-created)
├── public/
│   ├── index.html      # React frontend
│   └── logo.jpg        # Company logo
└── README.md
```

## 🔐 Security Best Practices

1. **Change default admin password immediately**
2. **Use HTTPS** in production (set up Nginx reverse proxy with SSL)
3. **Restrict network access** - Run behind firewall
4. **Create individual accounts** - Don't share admin credentials
5. **Use appropriate roles:**
   - **Read Only** - Stakeholders, executives viewing progress
   - **Edit** - Team members updating task status
   - **Team Lead** - Project leads who need to add/remove tasks
   - **Admin** - IT managers with full access

## 🌐 Production Deployment

### Using Systemd Service (Recommended for Production)

```bash
# 1. Copy files to /opt
sudo mkdir -p /opt/it-tracker
sudo cp -r * /opt/it-tracker/
cd /opt/it-tracker
sudo npm install

# 2. Create uploads directory with proper permissions
sudo mkdir -p /opt/it-tracker/uploads
sudo chown -R www-data:www-data /opt/it-tracker

# 3. Install the systemd service
sudo cp it-tracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable it-tracker
sudo systemctl start it-tracker

# 4. Check if running
sudo systemctl status it-tracker
sudo journalctl -u it-tracker -f  # View logs

# 5. Install nginx config
sudo cp nginx-it-tracker.conf /etc/nginx/sites-available/it-tracker
sudo ln -s /etc/nginx/sites-available/it-tracker /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

### Troubleshooting Bad Gateway

```bash
# Check if Node.js is running
sudo systemctl status it-tracker

# Check Node.js logs
sudo journalctl -u it-tracker -n 50

# Check if port 3000 is listening
sudo ss -tlnp | grep 3000

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Common fixes:
# 1. Permissions - ensure www-data owns the directory
sudo chown -R www-data:www-data /opt/it-tracker

# 2. SELinux (CentOS/RHEL) - allow nginx to connect
sudo setsebool -P httpd_can_network_connect 1

# 3. Restart both services
sudo systemctl restart it-tracker
sudo systemctl restart nginx
```

### Using PM2 (Alternative)

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start server.js --name "it-tracker"

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Nginx Reverse Proxy (HTTPS)

```nginx
server {
    listen 443 ssl;
    server_name tracker.yourcompany.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    client_max_body_size 20M;  # For file uploads
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user
- `POST /api/auth/change-password` - Change password

### Users (Admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `POST /api/users/:id/reset-password` - Reset password (sends email)
- `DELETE /api/users/:id` - Delete user

### Templates (Admin only)
- `GET /api/admin/workstreams` - List workstreams
- `POST /api/admin/workstreams` - Add workstream
- `PUT /api/admin/workstreams/:id` - Update workstream
- `DELETE /api/admin/workstreams/:id` - Delete workstream
- `GET /api/admin/default-tasks` - List default tasks
- `POST /api/admin/default-tasks` - Add default task
- `PUT /api/admin/default-tasks/:id` - Update default task
- `DELETE /api/admin/default-tasks/:id` - Delete default task

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project (Admin)
- `PUT /api/projects/:id` - Update project (Admin)
- `DELETE /api/projects/:id` - Delete project (Admin)
- `GET /api/projects/:id/export` - Export to JSON (for Excel)
- `POST /api/projects/:id/notify-overdue` - Send overdue notifications (Admin)

### Tasks
- `GET /api/projects/:id/tasks` - List tasks
- `POST /api/projects/:id/tasks` - Add task (Team Lead+)
- `PUT /api/projects/:id/tasks/:taskId` - Update task (Edit+)
- `DELETE /api/projects/:id/tasks/:taskId` - Delete task (Team Lead+)

### Attachments
- `GET /api/projects/:id/tasks/:taskId/attachments` - List attachments
- `POST /api/projects/:id/tasks/:taskId/attachments` - Upload file (Edit+)
- `DELETE /api/projects/:id/tasks/:taskId/attachments/:attachmentId` - Delete (Edit+)

### Contacts & Risks
- Similar CRUD endpoints under `/api/projects/:id/contacts` and `/api/projects/:id/risks`

## 🔄 Upgrading

When upgrading to a new version:

```bash
# Backup your database
cp tracker.db tracker.db.backup

# Extract new version
unzip it-tracker-selfhosted-new.zip

# Copy your data
cp tracker.db.backup it-tracker-selfhosted/tracker.db
cp -r uploads it-tracker-selfhosted/

# Restart
cd it-tracker-selfhosted
npm install
npm start
```

## 📝 License

Internal use only - Applied Industrial Technologies
