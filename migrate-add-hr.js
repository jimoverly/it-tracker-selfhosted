#!/usr/bin/env node
/**
 * Migration Script: Add Human Resources Workstream
 * 
 * Run this once against your existing tracker.db to add the HR workstream,
 * default tasks, and optionally seed HR tasks into existing projects.
 * 
 * Usage:
 *   node migrate-add-hr.js                          # Uses ./tracker.db
 *   node migrate-add-hr.js /var/lib/it-tracker/tracker.db   # Custom path
 *   node migrate-add-hr.js --dry-run                # Preview without changes
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbPath = args.find(a => !a.startsWith('--')) || './tracker.db';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║     Migration: Add Human Resources Workstream               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`  Database: ${path.resolve(dbPath)}`);
console.log(`  Mode:     ${dryRun ? '🔍 DRY RUN (no changes)' : '🔧 LIVE'}`);
console.log('');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('❌ Cannot open database:', err.message);
        console.error('   Make sure the path is correct and the file exists.');
        process.exit(1);
    }
});

// HR Workstream definition
const HR_WORKSTREAM = { name: 'Human Resources', color: '#d53f8c', sort_order: 7 };

// HR Default Tasks
const HR_TASKS = [
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

// HR Contacts (added per project)
const HR_CONTACTS = [
    { role: 'HR Director', company: 'Acquired', workstream: 'Human Resources' },
    { role: 'HR Business Partner', company: 'Applied', workstream: 'Human Resources' }
];

// HR Risks (added per project)
const HR_RISKS = [
    { id_suffix: 'HR1', description: 'Incomplete employee records', workstream: 'Human Resources', likelihood: 'Medium', impact: 'High', mitigation: 'Cross-reference multiple systems and conduct manager verification' },
    { id_suffix: 'HR2', description: 'Policy compliance gaps', workstream: 'Human Resources', likelihood: 'Medium', impact: 'Medium', mitigation: 'Legal review of all consolidated policies before rollout' }
];

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (dryRun) {
            console.log(`  [DRY RUN] ${sql.substring(0, 80)}...`);
            resolve({ changes: 0, lastID: 0 });
        } else {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes, lastID: this.lastID });
            });
        }
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

async function migrate() {
    try {
        // Step 1: Check if HR workstream already exists
        console.log('Step 1: Checking for existing HR workstream...');
        const existing = await get("SELECT id FROM default_workstreams WHERE name = ?", ['Human Resources']);
        if (existing) {
            console.log('  ⚠️  Human Resources workstream already exists (id: ' + existing.id + ')');
            console.log('  Skipping workstream creation.');
        } else {
            console.log('  Adding Human Resources workstream...');
            await run("INSERT INTO default_workstreams (name, color, sort_order) VALUES (?, ?, ?)",
                [HR_WORKSTREAM.name, HR_WORKSTREAM.color, HR_WORKSTREAM.sort_order]);
            console.log('  ✅ Workstream added');
        }

        // Step 2: Add default tasks (skip existing)
        console.log('\nStep 2: Adding HR default tasks...');
        let tasksAdded = 0;
        let tasksSkipped = 0;
        for (const t of HR_TASKS) {
            const exists = await get("SELECT id FROM default_tasks WHERE id = ?", [t[0]]);
            if (exists) {
                tasksSkipped++;
            } else {
                await run("INSERT INTO default_tasks (id, workstream, name, description, priority, dependencies, sort_order) VALUES (?,?,?,?,?,?,?)", t);
                tasksAdded++;
            }
        }
        console.log(`  ✅ ${tasksAdded} tasks added, ${tasksSkipped} already existed`);

        // Step 3: Add HR tasks to existing projects
        console.log('\nStep 3: Seeding HR tasks into existing projects...');
        const projects = await all("SELECT id, name FROM projects");
        if (projects.length === 0) {
            console.log('  No projects found — skipping');
        } else {
            console.log(`  Found ${projects.length} project(s):`);
            for (const p of projects) {
                const existingHR = await get("SELECT COUNT(*) as c FROM tasks WHERE project_id = ? AND workstream = 'Human Resources'", [p.id]);
                if (existingHR && existingHR.c > 0) {
                    console.log(`    📁 ${p.name} (id: ${p.id}) — already has ${existingHR.c} HR tasks, skipping`);
                    continue;
                }

                console.log(`    📁 ${p.name} (id: ${p.id}) — adding ${HR_TASKS.length} HR tasks...`);
                for (const t of HR_TASKS) {
                    await run(
                        "INSERT INTO tasks (id, project_id, workstream, name, description, priority, status, percent_complete, dependencies) VALUES (?,?,?,?,?,?,?,?,?)",
                        [t[0], p.id, t[1], t[2], t[3], t[4], 'Not Started', 0, t[5]]
                    );
                }

                // Add HR contacts
                for (const c of HR_CONTACTS) {
                    const contactExists = await get(
                        "SELECT id FROM contacts WHERE project_id = ? AND role = ? AND workstream = 'Human Resources'",
                        [p.id, c.role]
                    );
                    if (!contactExists) {
                        await run("INSERT INTO contacts (project_id, role, company, workstream) VALUES (?,?,?,?)",
                            [p.id, c.role, c.company, c.workstream]);
                    }
                }

                // Add HR risks (generate unique IDs based on existing count)
                const riskCount = await get("SELECT COUNT(*) as c FROM risks WHERE project_id = ?", [p.id]);
                let riskNum = (riskCount?.c || 0) + 1;
                for (const r of HR_RISKS) {
                    const riskId = `RISK-${String(riskNum).padStart(3, '0')}`;
                    const riskExists = await get(
                        "SELECT id FROM risks WHERE project_id = ? AND description = ?",
                        [p.id, r.description]
                    );
                    if (!riskExists) {
                        await run(
                            "INSERT INTO risks (id, project_id, description, workstream, likelihood, impact, mitigation) VALUES (?,?,?,?,?,?,?)",
                            [riskId, p.id, r.description, r.workstream, r.likelihood, r.impact, r.mitigation]
                        );
                        riskNum++;
                    }
                }

                console.log(`       ✅ Done — tasks, contacts, and risks added`);
            }
        }

        // Summary
        console.log('\n══════════════════════════════════════════════════════════════');
        if (dryRun) {
            console.log('🔍 DRY RUN COMPLETE — no changes were made');
            console.log('   Run without --dry-run to apply changes');
        } else {
            console.log('✅ MIGRATION COMPLETE');
            console.log('   Restart your server: sudo systemctl restart it-tracker');
        }
        console.log('══════════════════════════════════════════════════════════════');

    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

migrate();
