const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + safeName);
    }
});
const allowedExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|png|jpg|jpeg|gif|bmp|txt|csv|zip|msg|eml)$/i;
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (allowedExtensions.test(file.originalname)) cb(null, true);
        else cb(new Error('File type not allowed'), false);
    }
});

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const db = new sqlite3.Database(process.env.DB_PATH || './tracker.db', (err) => {
    if (err) console.error('Database error:', err);
    else { console.log('Connected to SQLite'); initDB(); }
});

const hash = p => crypto.createHash('sha256').update(p).digest('hex');
const genToken = () => crypto.randomBytes(32).toString('hex');
const sessions = new Map();

// Clean up expired sessions every hour
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, session] of sessions) {
        if (session.expires < now) { sessions.delete(token); cleaned++; }
    }
    if (cleaned > 0) console.log(`Session cleanup: removed ${cleaned} expired sessions`);
}, 3600000);

const ROLES = {
    readonly: { level: 1, canRead: true, canEdit: false, canAddTasks: false, canAdmin: false },
    edit: { level: 2, canRead: true, canEdit: true, canAddTasks: false, canAdmin: false },
    teamlead: { level: 3, canRead: true, canEdit: true, canAddTasks: true, canAdmin: false },
    admin: { level: 4, canRead: true, canEdit: true, canAddTasks: true, canAdmin: true }
};

function auth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const s = sessions.get(token);
    if (!s || s.expires < Date.now()) { sessions.delete(token); return res.status(401).json({ error: 'Session expired' }); }
    req.user = s.user; req.role = ROLES[s.user.role] || ROLES.readonly;
    next();
}

function reqRole(min) {
    return (req, res, next) => {
        if (!req.role || req.role.level < ROLES[min].level) return res.status(403).json({ error: `Requires ${min}` });
        next();
    };
}

function initDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, display_name TEXT, email TEXT, role TEXT DEFAULT 'readonly', active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_login DATETIME)`);
        db.run(`CREATE TABLE IF NOT EXISTS default_workstreams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, color TEXT DEFAULT '#718096', sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1)`);
        db.run(`CREATE TABLE IF NOT EXISTS default_tasks (id TEXT PRIMARY KEY, workstream TEXT NOT NULL, name TEXT NOT NULL, description TEXT, priority TEXT DEFAULT 'Medium', dependencies TEXT, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1)`);
        db.run(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, acquired_company TEXT, parent_company TEXT, status TEXT DEFAULT 'Active', start_date TEXT, target_completion TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS tasks (id TEXT, project_id INTEGER, workstream TEXT, name TEXT, description TEXT, owner TEXT, priority TEXT, status TEXT, start_date TEXT, due_date TEXT, percent_complete INTEGER DEFAULT 0, dependencies TEXT, notes TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_by TEXT, PRIMARY KEY (id, project_id))`);
        db.run(`CREATE TABLE IF NOT EXISTS task_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, project_id INTEGER NOT NULL, filename TEXT NOT NULL, original_name TEXT NOT NULL, file_size INTEGER, mime_type TEXT, uploaded_by TEXT, uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, name TEXT, role TEXT, company TEXT, workstream TEXT, email TEXT, phone TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        db.run(`CREATE TABLE IF NOT EXISTS risks (id TEXT, project_id INTEGER, description TEXT, workstream TEXT, likelihood TEXT, impact TEXT, mitigation TEXT, owner TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id, project_id))`);
        initDefaults();
    });
}

function initDefaults() {
    db.get("SELECT COUNT(*) as c FROM users", (e, r) => { if (r?.c === 0) db.run(`INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)`, ['admin', hash('admin123'), 'Administrator', 'admin']); });
    db.get("SELECT COUNT(*) as c FROM default_workstreams", (e, r) => {
        if (r?.c === 0) {
            [['Office 365','#0078d4',1],['Network','#38a169',2],['Cybersecurity','#e53e3e',3],['Active Directory','#805ad5',4],['Applications','#dd6b20',5],['Communications','#319795',6],['Human Resources','#d53f8c',7]].forEach(w => db.run(`INSERT INTO default_workstreams (name,color,sort_order) VALUES (?,?,?)`, w));
        }
    });
    db.get("SELECT COUNT(*) as c FROM default_tasks", (e, r) => { if (r?.c === 0) seedDefaultTasks(); });
    db.get("SELECT COUNT(*) as c FROM projects", (e, r) => { if (r?.c === 0) seedDemo(); });
}

function seedDefaultTasks() {
    const t = [
        ['O365-001','Office 365','Assess email environment','Document mail servers','High','',1],
        ['O365-002','Office 365','Plan migration strategy','Determine approach','High','O365-001',2],
        ['O365-003','Office 365','Configure Exchange Online','Set up tenant','High','O365-002',3],
        ['O365-004','Office 365','Migrate mailboxes','Execute migration','High','O365-003',4],
        ['O365-005','Office 365','Configure Teams/SharePoint','Set up collaboration','Medium','O365-003',5],
        ['NET-001','Network','Network assessment','Document topology','High','',1],
        ['NET-002','Network','Plan integration','Design architecture','High','NET-001',2],
        ['NET-003','Network','Configure VPN','Site-to-site connectivity','High','NET-002',3],
        ['NET-004','Network','IP/DNS planning','Plan IP scheme','High','NET-001',4],
        ['NET-005','Network','Firewall consolidation','Merge policies','High','NET-003',5],
        ['SEC-001','Cybersecurity','Security assessment','Vulnerability scan','Critical','',1],
        ['SEC-002','Cybersecurity','Review policies','Align security policies','Critical','SEC-001',2],
        ['SEC-003','Cybersecurity','Endpoint protection','Deploy EDR','Critical','SEC-001',3],
        ['SEC-004','Cybersecurity','Identity management','Implement IAM','High','SEC-002',4],
        ['SEC-005','Cybersecurity','Security training','Awareness training','High','SEC-002',5],
        ['SEC-006','Cybersecurity','SIEM integration','Integrate logging','High','SEC-001',6],
        ['SEC-007','Cybersecurity','IR plan update','Update procedures','Medium','SEC-002',7],
        ['SEC-008','Cybersecurity','Penetration testing','Security testing','Medium','SEC-003',8],
        ['SEC-009','Cybersecurity','Compliance verification','Verify compliance','Medium','SEC-004',9],
        ['SEC-010','Cybersecurity','Data classification','Review sensitive data','High','SEC-001',10],
        ['AD-001','Active Directory','AD assessment','Document structure','High','',1],
        ['AD-002','Active Directory','Plan integration','Determine approach','High','AD-001',2],
        ['AD-003','Active Directory','Establish trust','Configure trusts','High','AD-002',3],
        ['AD-004','Active Directory','GPO consolidation','Standardize GPOs','High','AD-003',4],
        ['AD-005','Active Directory','User migration','Migrate objects','High','AD-003',5],
        ['AD-006','Active Directory','Service accounts','Audit accounts','Medium','AD-001',6],
        ['AD-007','Active Directory','Azure AD Connect','Hybrid identity','High','AD-003',7],
        ['APP-001','Applications','App inventory','Document apps','High','',1],
        ['APP-002','Applications','App rationalization','Identify redundant','High','APP-001',2],
        ['APP-003','Applications','ERP integration','Plan ERP merge','High','APP-002',3],
        ['APP-004','Applications','Database consolidation','Plan DB migration','High','APP-001',4],
        ['APP-005','Applications','SSO integration','Configure SSO','Medium','AD-003',5],
        ['COM-001','Communications','Phone assessment','Document systems','Medium','',1],
        ['COM-002','Communications','UC planning','Plan Teams/VoIP','Medium','COM-001',2],
        ['COM-003','Communications','Number porting','Transfer numbers','Medium','COM-002',3],
        ['COM-004','Communications','Conference rooms','Standardize tech','Low','COM-002',4],
        ['HR-001','Human Resources','Employee policy review','Review and compare employee handbooks, PTO, benefits, and workplace policies between acquired and parent companies','High','',1],
        ['HR-002','Human Resources','Policy gap analysis','Identify differences in HR policies including code of conduct, harassment, remote work, and disciplinary procedures','High','HR-001',2],
        ['HR-003','Human Resources','Unified policy development','Draft consolidated employee policies aligned to parent company standards','High','HR-002',3],
        ['HR-004','Human Resources','Master user list compilation','Compile comprehensive list of all employees from acquired company with name, title, department, location, email, and system access','Critical','',4],
        ['HR-005','Human Resources','User list reconciliation','Cross-reference master user list against AD, O365, application access, and badge systems to identify discrepancies','Critical','HR-004',5],
        ['HR-006','Human Resources','Org chart alignment','Map acquired company org structure to parent company hierarchy and reporting lines','High','HR-004',6],
        ['HR-007','Human Resources','Benefits integration','Plan transition of health insurance, 401k, and other employee benefits to parent company programs','High','HR-001',7],
        ['HR-008','Human Resources','Payroll system integration','Coordinate payroll system migration and ensure continuity of pay cycles','High','HR-004',8],
        ['HR-009','Human Resources','Employee communications plan','Develop communication strategy for policy changes, system migrations, and integration milestones','Medium','HR-003',9],
        ['HR-010','Human Resources','Onboarding package update','Update new employee onboarding materials to reflect integrated systems, policies, and contacts','Medium','HR-003',10],
        ['HR-011','Human Resources','Compliance verification','Verify all HR practices meet federal, state, and local employment law requirements post-integration','High','HR-003',11],
        ['HR-012','Human Resources','Contractor/vendor audit','Identify and document all contractors, temps, and third-party vendors with system access from acquired company','High','HR-004',12]
    ];
    t.forEach(x => db.run(`INSERT INTO default_tasks (id,workstream,name,description,priority,dependencies,sort_order) VALUES (?,?,?,?,?,?,?)`, x));
}

function seedDemo() {
    db.run(`INSERT INTO projects (name,description,acquired_company,parent_company,start_date) VALUES (?,?,?,?,?)`,
        ['Demo Integration','Sample project','Acme Corp','Applied Industrial Technologies',new Date().toISOString().split('T')[0]],
        function(e) { if (!e) seedProjectData(this.lastID); });
}

function seedProjectData(pid) {
    db.all("SELECT * FROM default_tasks WHERE active=1", (e, tasks) => {
        if (tasks) tasks.forEach(t => db.run(`INSERT INTO tasks (id,project_id,workstream,name,description,priority,status,percent_complete,dependencies) VALUES (?,?,?,?,?,?,?,?,?)`, [t.id,pid,t.workstream,t.name,t.description,t.priority,'Not Started',0,t.dependencies]));
    });
    [['IT Director','Acquired','Office 365'],['Network Admin','Acquired','Network'],['Security Manager','Acquired','Cybersecurity'],['IT Director','Applied','Office 365'],['CISO','Applied','Cybersecurity'],['HR Director','Acquired','Human Resources'],['HR Business Partner','Applied','Human Resources']].forEach(c => db.run(`INSERT INTO contacts (project_id,role,company,workstream) VALUES (?,?,?,?)`, [pid,c[0],c[1],c[2]]));
    [['RISK-001','Data loss during migration','Office 365','Medium','High','Comprehensive backup'],['RISK-002','Network connectivity issues','Network','Medium','High','Redundant connections'],['RISK-003','Security vulnerabilities','Cybersecurity','High','High','Security assessment'],['RISK-004','Incomplete employee records','Human Resources','Medium','High','Cross-reference multiple systems and conduct manager verification'],['RISK-005','Policy compliance gaps','Human Resources','Medium','Medium','Legal review of all consolidated policies before rollout']].forEach(r => db.run(`INSERT INTO risks (id,project_id,description,workstream,likelihood,impact,mitigation) VALUES (?,?,?,?,?,?,?)`, [r[0],pid,r[1],r[2],r[3],r[4],r[5]]));
}

// AUTH - with rate limiting
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 900000; // 15 minutes

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credentials required' });
    
    // Rate limiting by IP
    const ip = req.ip || req.connection.remoteAddress;
    const attempts = loginAttempts.get(ip);
    if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS && Date.now() - attempts.first < LOGIN_LOCKOUT_MS) {
        const remaining = Math.ceil((LOGIN_LOCKOUT_MS - (Date.now() - attempts.first)) / 60000);
        return res.status(429).json({ error: `Too many attempts. Try again in ${remaining} minutes` });
    }
    
    db.get("SELECT * FROM users WHERE username=? AND active=1", [username], (e, u) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        if (!u || u.password !== hash(password)) {
            // Track failed attempt
            const now = Date.now();
            const prev = loginAttempts.get(ip);
            if (prev && now - prev.first < LOGIN_LOCKOUT_MS) {
                prev.count++;
            } else {
                loginAttempts.set(ip, { count: 1, first: now });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Clear attempts on success
        loginAttempts.delete(ip);
        const token = genToken();
        sessions.set(token, { user: { id: u.id, username: u.username, display_name: u.display_name, email: u.email, role: u.role }, expires: Date.now() + 86400000 });
        db.run("UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?", [u.id]);
        res.json({ token, user: { id: u.id, username: u.username, display_name: u.display_name, email: u.email, role: u.role } });
    });
});

app.post('/api/auth/logout', (req, res) => { const t = req.headers.authorization?.replace('Bearer ',''); if (t) sessions.delete(t); res.json({ ok: true }); });
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user, permissions: req.role }));

app.post('/api/auth/change-password', auth, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    db.get("SELECT password FROM users WHERE id=?", [req.user.id], (e, u) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        if (!u) return res.status(404).json({ error: 'User not found' });
        if (u.password !== hash(currentPassword)) return res.status(401).json({ error: 'Wrong password' });
        db.run("UPDATE users SET password=? WHERE id=?", [hash(newPassword), req.user.id], (e) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ ok: true });
        });
    });
});

// USERS
app.get('/api/users', auth, reqRole('admin'), (req, res) => {
    db.all("SELECT id,username,display_name,email,role,active,created_at,last_login FROM users ORDER BY username", (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

// Get active users for dropdowns (all authenticated users can access)
app.get('/api/users/list', auth, (req, res) => {
    db.all("SELECT id,username,display_name,role FROM users WHERE active=1 ORDER BY display_name,username", (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.post('/api/users', auth, reqRole('admin'), (req, res) => {
    const { username, password, display_name, email, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!['readonly','edit','teamlead','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    db.run(`INSERT INTO users (username,password,display_name,email,role) VALUES (?,?,?,?,?)`, [username, hash(password), display_name, email, role], function(e) {
        if (e) return res.status(500).json({ error: e.message.includes('UNIQUE') ? 'Username exists' : e.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/users/:id', auth, reqRole('admin'), (req, res) => {
    const { display_name, email, role, active } = req.body;
    if (parseInt(req.params.id) === req.user.id && role !== 'admin') return res.status(400).json({ error: 'Cannot change own role' });
    db.run(`UPDATE users SET display_name=?,email=?,role=?,active=? WHERE id=?`, [display_name, email, role, active?1:0, req.params.id], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

app.post('/api/users/:id/reset-password', auth, reqRole('admin'), (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    db.get("SELECT username FROM users WHERE id=?", [req.params.id], (e, u) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        if (!u) return res.status(404).json({ error: 'Not found' });
        db.run("UPDATE users SET password=? WHERE id=?", [hash(newPassword), req.params.id], (e) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ ok: true });
        });
    });
});

app.delete('/api/users/:id', auth, reqRole('admin'), (req, res) => {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete self' });
    db.run("DELETE FROM users WHERE id=?", [req.params.id], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

// WORKSTREAMS
app.get('/api/admin/workstreams', auth, (req, res) => {
    db.all("SELECT * FROM default_workstreams ORDER BY sort_order", (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});
app.post('/api/admin/workstreams', auth, reqRole('admin'), (req, res) => {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    db.run(`INSERT INTO default_workstreams (name,color,sort_order) VALUES (?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM default_workstreams))`, [name, color||'#718096'], function(e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ id: this.lastID });
    });
});
app.put('/api/admin/workstreams/:id', auth, reqRole('admin'), (req, res) => {
    const { name, color, sort_order, active } = req.body;
    db.run(`UPDATE default_workstreams SET name=?,color=?,sort_order=?,active=? WHERE id=?`, [name, color, sort_order, active?1:0, req.params.id], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});
app.delete('/api/admin/workstreams/:id', auth, reqRole('admin'), (req, res) => {
    db.run("DELETE FROM default_workstreams WHERE id=?", [req.params.id], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

// DEFAULT TASKS
app.get('/api/admin/default-tasks', auth, (req, res) => {
    db.all("SELECT * FROM default_tasks ORDER BY workstream,sort_order", (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});
app.post('/api/admin/default-tasks', auth, reqRole('admin'), (req, res) => {
    const { id, workstream, name, description, priority, dependencies } = req.body;
    if (!id || !workstream || !name) return res.status(400).json({ error: 'Required fields' });
    db.run(`INSERT INTO default_tasks (id,workstream,name,description,priority,dependencies,sort_order) VALUES (?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM default_tasks WHERE workstream=?))`,
        [id, workstream, name, description, priority||'Medium', dependencies||'', workstream], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ ok: true });
        });
});
app.put('/api/admin/default-tasks/:id', auth, reqRole('admin'), (req, res) => {
    const { workstream, name, description, priority, dependencies, sort_order, active } = req.body;
    db.run(`UPDATE default_tasks SET workstream=?,name=?,description=?,priority=?,dependencies=?,sort_order=?,active=? WHERE id=?`,
        [workstream, name, description, priority, dependencies, sort_order, active?1:0, req.params.id], function(e) {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ changes: this.changes });
        });
});
app.delete('/api/admin/default-tasks/:id', auth, reqRole('admin'), (req, res) => {
    db.run("DELETE FROM default_tasks WHERE id=?", [req.params.id], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

// PROJECTS
app.get('/api/projects', auth, (req, res) => {
    db.all(`SELECT p.*, (SELECT COUNT(*) FROM tasks WHERE project_id=p.id) as task_count, (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status='Complete') as completed_count, (SELECT AVG(percent_complete) FROM tasks WHERE project_id=p.id) as overall_progress FROM projects p ORDER BY created_at DESC`, (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.get('/api/projects/:id', auth, (req, res) => {
    db.get("SELECT * FROM projects WHERE id=?", [req.params.id], (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        r ? res.json(r) : res.status(404).json({ error: 'Not found' });
    });
});

app.post('/api/projects', auth, reqRole('admin'), (req, res) => {
    const { name, description, acquired_company, parent_company, start_date, target_completion } = req.body;
    db.run(`INSERT INTO projects (name,description,acquired_company,parent_company,start_date,target_completion) VALUES (?,?,?,?,?,?)`,
        [name, description, acquired_company, parent_company||'Applied Industrial Technologies', start_date, target_completion],
        function(e) { seedProjectData(this.lastID); res.json({ id: this.lastID }); });
});

app.put('/api/projects/:id', auth, reqRole('admin'), (req, res) => {
    const { name, description, acquired_company, parent_company, status, start_date, target_completion } = req.body;
    db.run(`UPDATE projects SET name=?,description=?,acquired_company=?,parent_company=?,status=?,start_date=?,target_completion=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [name, description, acquired_company, parent_company, status, start_date, target_completion, req.params.id], function(e) { res.json({ changes: this.changes }); });
});

app.delete('/api/projects/:id', auth, reqRole('admin'), (req, res) => {
    const pid = req.params.id;
    // First clean up attachment files, then delete all records
    db.all("SELECT filename FROM task_attachments WHERE project_id=?", [pid], (e, files) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        (files||[]).forEach(f => {
            const p = path.join(uploadDir, f.filename);
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(err) { console.error('File cleanup error:', err); }
        });
        db.serialize(() => {
            db.run("DELETE FROM task_attachments WHERE project_id=?", [pid]);
            db.run("DELETE FROM tasks WHERE project_id=?", [pid]);
            db.run("DELETE FROM contacts WHERE project_id=?", [pid]);
            db.run("DELETE FROM risks WHERE project_id=?", [pid]);
            db.run("DELETE FROM projects WHERE id=?", [pid], function(e) {
                if (e) return res.status(500).json({ error: 'Database error' });
                res.json({ changes: this.changes });
            });
        });
    });
});

// MY TASKS - tasks assigned to current user across all projects
app.get('/api/my-tasks', auth, (req, res) => {
    const username = req.user.display_name || req.user.username;
    db.all(`SELECT t.*, p.name as project_name, p.id as project_id,
        (SELECT COUNT(*) FROM task_attachments WHERE task_id=t.id AND project_id=t.project_id) as attachment_count
        FROM tasks t 
        JOIN projects p ON t.project_id = p.id 
        WHERE t.owner = ? 
        ORDER BY 
            CASE WHEN t.status='Blocked' THEN 0 WHEN t.status='In Progress' THEN 1 WHEN t.status='Not Started' THEN 2 ELSE 3 END,
            CASE WHEN t.due_date IS NULL OR t.due_date='' THEN '9999-99-99' ELSE t.due_date END,
            t.priority`, 
        [username], (e, r) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json(r || []);
        });
});

// EXPORT
app.get('/api/projects/:id/export', auth, (req, res) => {
    const pid = req.params.id;
    db.get("SELECT * FROM projects WHERE id=?", [pid], (e, project) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        if (!project) return res.status(404).json({ error: 'Not found' });
        db.all("SELECT * FROM tasks WHERE project_id=? ORDER BY workstream,id", [pid], (e, tasks) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            db.all("SELECT * FROM contacts WHERE project_id=?", [pid], (e, contacts) => {
                if (e) return res.status(500).json({ error: 'Database error' });
                db.all("SELECT * FROM risks WHERE project_id=?", [pid], (e, risks) => {
                    if (e) return res.status(500).json({ error: 'Database error' });
                    const ws = [...new Set((tasks||[]).map(t => t.workstream))];
                    const wsStats = ws.map(w => {
                        const wt = tasks.filter(t => t.workstream === w);
                        return { workstream: w, total: wt.length, notStarted: wt.filter(t => t.status==='Not Started').length, inProgress: wt.filter(t => t.status==='In Progress').length, complete: wt.filter(t => t.status==='Complete').length, blocked: wt.filter(t => t.status==='Blocked').length, progress: wt.length ? Math.round(wt.reduce((s,t) => s+(t.percent_complete||0),0)/wt.length) : 0 };
                    });
                    res.json({ project, tasks: tasks||[], contacts: contacts||[], risks: risks||[], workstreamStats: wsStats, exportedAt: new Date().toISOString(), exportedBy: req.user.username });
                });
            });
        });
    });
});

// TASKS
app.get('/api/projects/:pid/tasks', auth, (req, res) => {
    db.all(`SELECT t.*, (SELECT COUNT(*) FROM task_attachments WHERE task_id=t.id AND project_id=t.project_id) as attachment_count FROM tasks t WHERE t.project_id=? ORDER BY t.id`, [req.params.pid], (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.put('/api/projects/:pid/tasks/:id', auth, reqRole('edit'), (req, res) => {
    const { workstream, name, description, owner, priority, status, start_date, due_date, percent_complete, dependencies, notes } = req.body;
    db.run(`UPDATE tasks SET workstream=?,name=?,description=?,owner=?,priority=?,status=?,start_date=?,due_date=?,percent_complete=?,dependencies=?,notes=?,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE id=? AND project_id=?`,
        [workstream, name, description, owner, priority, status, start_date, due_date, percent_complete, dependencies, notes, req.user.username, req.params.id, req.params.pid], function(e) {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ changes: this.changes });
        });
});

app.post('/api/projects/:pid/tasks', auth, reqRole('teamlead'), (req, res) => {
    const { id, workstream, name, description, owner, priority, status, start_date, due_date, percent_complete, dependencies, notes } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'Task ID and name required' });
    db.run(`INSERT INTO tasks (id,project_id,workstream,name,description,owner,priority,status,start_date,due_date,percent_complete,dependencies,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, req.params.pid, workstream, name, description, owner, priority||'Medium', status||'Not Started', start_date, due_date, percent_complete||0, dependencies, notes], function(e) {
            if (e) return res.status(500).json({ error: e.message });
            res.json({ ok: true });
        });
});

app.delete('/api/projects/:pid/tasks/:id', auth, reqRole('teamlead'), (req, res) => {
    const { id, pid } = req.params;
    // Sequential: find files → delete files → delete attachment records → delete task
    db.all("SELECT filename FROM task_attachments WHERE task_id=? AND project_id=?", [id, pid], (e, files) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        (files||[]).forEach(f => {
            const p = path.join(uploadDir, f.filename);
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(err) { console.error('File cleanup error:', err); }
        });
        db.run("DELETE FROM task_attachments WHERE task_id=? AND project_id=?", [id, pid], (e) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            db.run("DELETE FROM tasks WHERE id=? AND project_id=?", [id, pid], function(e) {
                if (e) return res.status(500).json({ error: 'Database error' });
                res.json({ changes: this.changes });
            });
        });
    });
});

// ATTACHMENTS
app.get('/api/projects/:pid/tasks/:tid/attachments', auth, (req, res) => {
    db.all("SELECT * FROM task_attachments WHERE task_id=? AND project_id=? ORDER BY uploaded_at DESC", [req.params.tid, req.params.pid], (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.post('/api/projects/:pid/tasks/:tid/attachments', auth, reqRole('edit'), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file or file type not allowed' });
    db.run(`INSERT INTO task_attachments (task_id,project_id,filename,original_name,file_size,mime_type,uploaded_by) VALUES (?,?,?,?,?,?,?)`,
        [req.params.tid, req.params.pid, req.file.filename, req.file.originalname, req.file.size, req.file.mimetype, req.user.username], function(e) {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ id: this.lastID, filename: req.file.filename });
        });
});

app.delete('/api/projects/:pid/tasks/:tid/attachments/:id', auth, reqRole('edit'), (req, res) => {
    db.get("SELECT filename FROM task_attachments WHERE id=? AND project_id=?", [req.params.id, req.params.pid], (e, f) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        if (!f) return res.status(404).json({ error: 'Not found' });
        const p = path.join(uploadDir, f.filename);
        try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(err) { console.error('File cleanup error:', err); }
        db.run("DELETE FROM task_attachments WHERE id=?", [req.params.id], function(e) {
            if (e) return res.status(500).json({ error: 'Database error' });
            res.json({ ok: true });
        });
    });
});

// CONTACTS
app.get('/api/projects/:pid/contacts', auth, (req, res) => {
    db.all("SELECT * FROM contacts WHERE project_id=? ORDER BY workstream", [req.params.pid], (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.put('/api/projects/:pid/contacts/:id', auth, reqRole('edit'), (req, res) => {
    const { name, role, company, workstream, email, phone } = req.body;
    db.run(`UPDATE contacts SET name=?,role=?,company=?,workstream=?,email=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?`, [name, role, company, workstream, email, phone, req.params.id, req.params.pid], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

app.post('/api/projects/:pid/contacts', auth, reqRole('teamlead'), (req, res) => {
    const { name, role, company, workstream, email, phone } = req.body;
    db.run(`INSERT INTO contacts (project_id,name,role,company,workstream,email,phone) VALUES (?,?,?,?,?,?,?)`, [req.params.pid, name, role, company, workstream, email, phone], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ id: this.lastID });
    });
});

app.delete('/api/projects/:pid/contacts/:id', auth, reqRole('teamlead'), (req, res) => {
    db.run("DELETE FROM contacts WHERE id=? AND project_id=?", [req.params.id, req.params.pid], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

// RISKS
app.get('/api/projects/:pid/risks', auth, (req, res) => {
    db.all("SELECT * FROM risks WHERE project_id=?", [req.params.pid], (e, r) => {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json(r || []);
    });
});

app.put('/api/projects/:pid/risks/:id', auth, reqRole('edit'), (req, res) => {
    const { description, workstream, likelihood, impact, mitigation, owner } = req.body;
    db.run(`UPDATE risks SET description=?,workstream=?,likelihood=?,impact=?,mitigation=?,owner=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=?`, [description, workstream, likelihood, impact, mitigation, owner, req.params.id, req.params.pid], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

app.post('/api/projects/:pid/risks', auth, reqRole('teamlead'), (req, res) => {
    const { id, description, workstream, likelihood, impact, mitigation, owner } = req.body;
    if (!id) return res.status(400).json({ error: 'Risk ID required' });
    db.run(`INSERT INTO risks (id,project_id,description,workstream,likelihood,impact,mitigation,owner) VALUES (?,?,?,?,?,?,?,?)`, [id, req.params.pid, description, workstream, likelihood, impact, mitigation, owner], function(e) {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ ok: true });
    });
});

app.delete('/api/projects/:pid/risks/:id', auth, reqRole('teamlead'), (req, res) => {
    db.run("DELETE FROM risks WHERE id=? AND project_id=?", [req.params.id, req.params.pid], function(e) {
        if (e) return res.status(500).json({ error: 'Database error' });
        res.json({ changes: this.changes });
    });
});

// STATS
app.get('/api/projects/:pid/stats', auth, (req, res) => {
    const stats = {};
    db.serialize(() => {
        db.get("SELECT COUNT(*) as total FROM tasks WHERE project_id=?", [req.params.pid], (e, r) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            stats.totalTasks = r?.total || 0;
        });
        db.all("SELECT status, COUNT(*) as count FROM tasks WHERE project_id=? GROUP BY status", [req.params.pid], (e, r) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            stats.byStatus = r || [];
        });
        db.all("SELECT workstream, COUNT(*) as total, SUM(CASE WHEN status='Complete' THEN 1 ELSE 0 END) as complete, AVG(percent_complete) as progress FROM tasks WHERE project_id=? GROUP BY workstream", [req.params.pid], (e, r) => {
            if (e) return res.status(500).json({ error: 'Database error' });
            stats.byWorkstream = r || [];
            res.json(stats);
        });
    });
});

// Multer error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 10MB)' });
        return res.status(400).json({ error: err.message });
    }
    if (err.message === 'File type not allowed') return res.status(400).json({ error: 'File type not allowed. Accepted: pdf, doc, docx, xls, xlsx, ppt, pptx, png, jpg, gif, txt, csv, zip, msg, eml' });
    next(err);
});

app.listen(PORT, () => {
    console.log(`IT Integration Tracker: http://localhost:${PORT}`);
});
