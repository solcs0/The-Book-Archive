// server.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const path = require('path');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_LISTS_DIR = path.join(__dirname, 'public', 'lists');
const LIB_FILE = path.join(DATA_DIR, 'librarians.json');
const STUD_FILE = path.join(DATA_DIR, 'students.json');

// ---- IMPORTANT: paths to the original uploaded pages you provided
// (kept here so generated list pages can link back or reuse them).
// These are local paths from your upload history and will be forwarded/served
// by your environment if you prefer. If you'd rather host images/assets in public/assets,
// replace these with public URLs.
const ORIGINAL_STUDENT_PAGE = '/mnt/data/Therese Student.html';
const ORIGINAL_LIBRARIAN_PAGE = '/mnt/data/Therese Librarian.html';

async function ensureFiles() {
    await fs.ensureDir(DATA_DIR);
    await fs.ensureDir(PUBLIC_LISTS_DIR);
    if (!await fs.pathExists(LIB_FILE)) await fs.writeJson(LIB_FILE, []);
    if (!await fs.pathExists(STUD_FILE)) await fs.writeJson(STUD_FILE, []);
}

// helper read/write
function readJson(file) { return fs.readJson(file); }

function writeJson(file, data) { return fs.writeJson(file, data, { spaces: 2 }); }

// sanitize user object for API responses
function sanitizeUser(user, role) {
    if (role === 'librarian') return { id: user.id, username: user.username, fullname: user.fullname, role: 'librarian' };
    return { id: user.id, name: user.name, grade: user.grade, section: user.section, role: 'student' };
}

// ----------------- HTML generation (card style) -----------------

function escapeHtml(s) {
    if (!s && s !== 0) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Generate a simple card-styled HTML page listing students
 * and write it to public/lists/students-list.html
 */
async function generateStudentsListPage(students) {
    const filePath = path.join(PUBLIC_LISTS_DIR, 'students-list.html');
    const cardsHtml = students.map(s => `
    <div class="card">
      <h3>${escapeHtml(s.name)}</h3>
      <p><strong>Grade:</strong> ${escapeHtml(s.grade)}</p>
      <p><strong>Section:</strong> ${escapeHtml(s.section)}</p>
    </div>
  `).join('\n');

    const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Students — List</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Roboto&display=swap');
      body{font-family:Roboto,Arial,Helvetica,sans-serif;background:#f5deb3;margin:0;padding:24px;color:#3b2f2f}
      header{font-family:'Cinzel Decorative',serif;font-size:28px;margin-bottom:12px}
      .top-links{margin-bottom:18px}
      .top-links a{margin-right:12px;color:#4b2e05;font-weight:600;text-decoration:none}
      .container{display:flex;flex-wrap:wrap;gap:16px}
      .card{background:#fff;padding:16px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);width:220px}
      .card h3{margin:0 0 6px 0}
      footer{margin-top:28px;color:#666;font-size:13px}
    </style>
  </head>
  <body>
    <header>📚 Registered Students</header>
    <div class="top-links">
      <a href="${escapeHtml(ORIGINAL_STUDENT_PAGE)}">Open Student Portal</a>
      <a href="${escapeHtml(ORIGINAL_LIBRARIAN_PAGE)}">Open Librarian Portal</a>
      <a href="/therese-student.html">Back to Student Portal (public)</a>
      <a href="/therese-librarian.html">Back to Librarian Portal (public)</a>
    </div>
    <div class="container">
      ${cardsHtml || '<p>No student accounts yet.</p>'}
    </div>
    <footer>Generated on ${new Date().toLocaleString()}</footer>
  </body>
  </html>`;

    await fs.writeFile(filePath, html, 'utf8');
}

/**
 * Generate librarians list page, similar style
 */
async function generateLibrariansListPage(libs) {
    const filePath = path.join(PUBLIC_LISTS_DIR, 'librarians-list.html');
    const cardsHtml = libs.map(l => `
    <div class="card">
      <h3>${escapeHtml(l.fullname || l.username)}</h3>
      <p><strong>Username:</strong> ${escapeHtml(l.username)}</p>
    </div>
  `).join('\n');

    const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Librarians — List</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Roboto&display=swap');
      body{font-family:Roboto,Arial,Helvetica,sans-serif;background:#f5deb3;margin:0;padding:24px;color:#3b2f2f}
      header{font-family:'Cinzel Decorative',serif;font-size:28px;margin-bottom:12px}
      .top-links{margin-bottom:18px}
      .top-links a{margin-right:12px;color:#4b2e05;font-weight:600;text-decoration:none}
      .container{display:flex;flex-wrap:wrap;gap:16px}
      .card{background:#fff;padding:16px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);width:260px}
      .card h3{margin:0 0 6px 0}
      footer{margin-top:28px;color:#666;font-size:13px}
    </style>
  </head>
  <body>
    <header>📖 Registered Librarians</header>
    <div class="top-links">
      <a href="${escapeHtml(ORIGINAL_LIBRARIAN_PAGE)}">Open Librarian Portal</a>
      <a href="${escapeHtml(ORIGINAL_STUDENT_PAGE)}">Open Student Portal</a>
      <a href="/therese-librarian.html">Back to Librarian Portal (public)</a>
      <a href="/therese-student.html">Back to Student Portal (public)</a>
    </div>
    <div class="container">
      ${cardsHtml || '<p>No librarian accounts yet.</p>'}
    </div>
    <footer>Generated on ${new Date().toLocaleString()}</footer>
  </body>
  </html>`;

    await fs.writeFile(filePath, html, 'utf8');
}

// call these after JSON write
async function regenerateListFiles() {
    const students = await readJson(STUD_FILE);
    const libs = await readJson(LIB_FILE);
    await generateStudentsListPage(students);
    await generateLibrariansListPage(libs);
}

// ----------------- Routes -----------------

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Librarian registration
app.post('/api/librarian/register', [
    body('username').isLength({ min: 3 }).withMessage('Username must be at least 3 chars')
    .matches(/^[a-zA-Z0-9_\-]+$/).withMessage('Username may only contain letters, numbers, - and _'),
    body('fullname').isLength({ min: 3 }).withMessage('Full name required'),
    body('password').isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 })
    .withMessage('Password must be at least 8 chars, include upper, lower and a number')
], async(req, res) => {
    await ensureFiles();
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { username, fullname, password } = req.body;
    const libs = await readJson(LIB_FILE);
    if (libs.find(l => l.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = { id: uuidv4(), username, fullname, passwordHash: hash };
    libs.push(user);
    await writeJson(LIB_FILE, libs);

    // regenerate HTML list files
    await regenerateListFiles();

    res.json({ user: sanitizeUser(user, 'librarian') });
});

// Librarian login
app.post('/api/librarian/login', [
    body('username').exists(),
    body('password').exists()
], async(req, res) => {
    await ensureFiles();
    const { username, password } = req.body;
    const libs = await readJson(LIB_FILE);
    const user = libs.find(u => u.username.toLowerCase() === (username || '').toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ user: sanitizeUser(user, 'librarian') });
});

// Student registration
app.post('/api/student/register', [
    body('name').isLength({ min: 3 }).withMessage('Full name required'),
    body('grade').isLength({ min: 1 }).withMessage('Grade required'),
    body('section').isLength({ min: 1 }).withMessage('Section required'),
    body('passcode').isLength({ min: 4 }).withMessage('Passcode must be at least 4 chars')
], async(req, res) => {
    await ensureFiles();
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, grade, section, passcode } = req.body;
    const studs = await readJson(STUD_FILE);
    if (studs.find(s => s.name.toLowerCase() === name.toLowerCase() && s.grade === grade && s.section.toLowerCase() === section.toLowerCase()))
        return res.status(409).json({ error: 'Student account already exists' });

    const hash = await bcrypt.hash(passcode, 10);
    const user = { id: uuidv4(), name, grade, section, passHash: hash };
    studs.push(user);
    await writeJson(STUD_FILE, studs);

    // regenerate HTML list files
    await regenerateListFiles();

    res.json({ user: sanitizeUser(user, 'student') });
});

// Student login
app.post('/api/student/login', [
    body('name').exists(),
    body('grade').exists(),
    body('section').exists()
], async(req, res) => {
    await ensureFiles();
    const { name, grade, section, passcode } = req.body;
    const studs = await readJson(STUD_FILE);
    const user = studs.find(s => s.name.toLowerCase() === (name || '').toLowerCase() && s.grade === grade && s.section.toLowerCase() === (section || '').toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (passcode) {
        const ok = await bcrypt.compare(passcode, user.passHash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ user: sanitizeUser(user, 'student') });
});

// Profile endpoint
app.get('/api/profile/:role/:id', async(req, res) => {
    await ensureFiles();
    const { role, id } = req.params;
    const file = role === 'librarian' ? LIB_FILE : STUD_FILE;
    const list = await readJson(file);
    const user = list.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ user: sanitizeUser(user, role) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));