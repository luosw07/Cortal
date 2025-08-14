const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret for JWT signing. In production this should be stored in an env var.
const JWT_SECRET = process.env.JWT_SECRET || 'temporary-dev-secret';

/**
 * Simple in‑memory data stores. In a production system these would live in a
 * database. Because this demonstration is designed to run in a container
 * environment with no persistent storage, the state resets whenever the
 * server restarts.
 */
const announcements = [];
const assignments = [];
const submissions = [];
const resources = [];
const exams = [];

// Course information (editable via API). Initially provide a default description.
let courseInfo = `This course introduces the foundations of modern algebra, including group theory, ring theory, and linear algebra. Throughout the semester we will explore algebraic structures and their applications.`;

// TA invitation code. In lieu of a persistent database we store it in this
// variable. Administrators can update it via the /api/taCode endpoint.
global.taInvitationCode = 'TA2025';

// Notification store. Each entry has { id, email, message, read, date }.
// In production this would be persisted in a database and potentially delivered via
// websockets. Here we keep it in memory for demonstration purposes.
const notifications = [];

// Users store. Each user has:
// { name, email, passwordHash, role ('student'|'admin'), approved: boolean,
//   studentId, studentNameZh }
// On startup this is empty; users register via /api/auth/register. Students
// start as approved=false and must be approved by an admin via pendingStudents.
const users = [];

// Password reset requests. Each entry: { email, approved: boolean }
const resetRequests = [];

// Student registration and management
// Pending student registrations awaiting admin approval
const pendingStudents = [];
// Approved students; each entry holds id, name, email, studentId, studentNameZh, muted boolean
const students = [];
// Helper to find a student by id in pending or approved lists
function findPendingStudentById(id) {
  return pendingStudents.find((s) => s.id === id);
}
function findStudentByEmail(email) {
  return students.find((s) => s.email === email);
}
function findStudentById(studentId) {
  return students.find((s) => s.studentId === studentId);
}
// Messages store for private messaging. Each message has {id, fromName, fromEmail, toName, toEmail, subject, content, date, read}
const messages = [];

// -----------------------------------------------------------------------------
// Password reset workflow
// -----------------------------------------------------------------------------
// A user can request a password reset by submitting their email to
// /api/auth/requestReset. The request is stored in resetRequests and must be
// approved by an admin via /api/admin/resetRequests/:email/approve. Once
// approved, the user can reset their password by calling /api/auth/resetPassword
// with email and newPassword. The approved request is removed upon success.

// Request a password reset. Anyone may call this. A notification is sent to
// admins that a reset has been requested. If the email does not exist, we
// return success without revealing that.
app.post('/api/auth/requestReset', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  // If already pending, do nothing
  const existing = resetRequests.find((r) => r.email === email);
  if (!existing) {
    resetRequests.push({ email, approved: false });
    // Notify admins of pending reset
    users.forEach((u) => {
      if (u.role === 'admin') {
        createNotification(u.email, `Password reset requested for ${email}`);
      }
    });
    saveData();
  }
  res.json({ message: 'Reset request submitted. Wait for admin approval.' });
});

// Admin: list all pending password reset requests
app.get('/api/admin/resetRequests', authRequired, adminRequired, (req, res) => {
  res.json(resetRequests);
});

// Admin: approve a password reset for a given email
app.post('/api/admin/resetRequests/:email/approve', authRequired, adminRequired, (req, res) => {
  const email = req.params.email;
  const reqIndex = resetRequests.findIndex((r) => r.email === email);
  if (reqIndex === -1) return res.status(404).json({ error: 'Reset request not found' });
  resetRequests[reqIndex].approved = true;
  // Notify user via email and notification
  sendEmail(email, 'Password reset approved', 'An administrator has approved your password reset request. You can now set a new password in the course portal.');
  createNotification(email, 'Password reset approved');
  saveData();
  res.json({ message: 'Reset approved' });
});

// Reset password after approval. Requires email and newPassword.
app.post('/api/auth/resetPassword', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ error: 'Email and new password required' });
  const reqObj = resetRequests.find((r) => r.email === email && r.approved);
  if (!reqObj) return res.status(403).json({ error: 'No approved reset request for this email' });
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  // Remove reset request
  const idx = resetRequests.findIndex((r) => r.email === email);
  if (idx !== -1) resetRequests.splice(idx, 1);
  saveData();
  res.json({ message: 'Password has been reset successfully' });
});

// Data persistence: path to save/load application state. This enables the server
// to retain announcements, assignments, submissions and other entities across
// restarts. In production you would use a proper database, but for this
// demonstration we serialize to a JSON file within the server directory.
const DATA_FILE = path.join(__dirname, 'data.json');

/**
 * Load persistent data from the data file into the in-memory arrays. This
 * function mutates the existing arrays rather than reassigning them so that
 * references remain valid. If no file exists, it creates one with initial
 * empty data. Any errors are silently ignored.
 */
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        announcements: [],
        assignments: [],
        submissions: [],
        resources: [],
        exams: [],
        notifications: [],
        users: [],
        pendingStudents: [],
        students: [],
        forumThreads: [],
        messages: [],
        courseInfo: courseInfo,
        taInvitationCode: global.taInvitationCode,
        resetRequests: []
      }, null, 2));
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Repopulate arrays
    announcements.splice(0, announcements.length, ...(data.announcements || []));
    assignments.splice(0, assignments.length, ...(data.assignments || []));
    submissions.splice(0, submissions.length, ...(data.submissions || []));
    resources.splice(0, resources.length, ...(data.resources || []));
    exams.splice(0, exams.length, ...(data.exams || []));
    notifications.splice(0, notifications.length, ...(data.notifications || []));
    users.splice(0, users.length, ...(data.users || []));
    pendingStudents.splice(0, pendingStudents.length, ...(data.pendingStudents || []));
    students.splice(0, students.length, ...(data.students || []));
    forumThreads.splice(0, forumThreads.length, ...(data.forumThreads || []));
    messages.splice(0, messages.length, ...(data.messages || []));
    resetRequests.splice(0, resetRequests.length, ...(data.resetRequests || []));
    if (data.courseInfo) {
      courseInfo = data.courseInfo;
    }
    if (data.taInvitationCode) {
      global.taInvitationCode = data.taInvitationCode;
    }
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

/**
 * Persist the current in-memory data to the data file. This is called
 * whenever a mutating operation occurs (e.g. creating assignments,
 * approving students, posting messages). Errors are logged but do not
 * interrupt request handling.
 */
function saveData() {
  try {
    const data = {
      announcements,
      assignments,
      submissions,
      resources,
      exams,
      notifications,
      users,
      pendingStudents,
      students,
      forumThreads,
      messages,
      courseInfo,
      taInvitationCode: global.taInvitationCode,
      resetRequests
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save data:', err);
  }
}

/**
 * Create a new notification record for the specified user. This helper is used
 * by email notifications to also provide a bell notification in the UI.
 *
 * @param {string} email Recipient email
 * @param {string} message Message to display
 */
function createNotification(email, message) {
  const id = Date.now().toString();
  notifications.push({ id, email, message, read: false, date: new Date().toISOString() });
}

// Discussion forum threads (in-memory). Each thread has fields:
// { id, title, content, authorName, authorEmail, date, archived, comments: [ { id, authorName, authorEmail, content, date } ] }
const forumThreads = [];

/**
 * Generate a JWT token for the given user. Only includes email and role for
 * payload to avoid leaking PII. Tokens expire in 7 days by default.
 *
 * @param {object} user
 * @returns {string}
 */
function generateToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Middleware to enforce that a request has a valid JWT token. If valid the
 * decoded token is stored on req.user. Otherwise returns 401.
 */
function authRequired(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware to restrict access to administrators (role === 'admin'). The
 * authRequired middleware must run before this to set req.user.
 */
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
}

// Create uploads directory if it does not exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for different upload types
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // decide destination based on route
    const url = req.originalUrl;
    let dest = path.join(__dirname, 'uploads');
    if (url.includes('/assignments') && url.includes('/submit')) {
      dest = path.join(dest, 'submissions');
    } else if (url.includes('/assignments')) {
      dest = path.join(dest, 'assignments');
    } else if (url.includes('/resources')) {
      dest = path.join(dest, 'resources');
    } else if (url.includes('/grade')) {
      dest = path.join(dest, 'annotations');
    } else if (url.includes('/forum')) {
      dest = path.join(dest, 'forum');
    }
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + ext);
  },
});
const upload = multer({ storage });

const app = express();
const PORT = process.env.PORT || 3000;

// Load persisted data on startup
loadData();

app.use(cors());
app.use(express.json());

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '..', 'client')));
// Serve uploaded files so they can be accessed by the frontend
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/**
 * Authentication routes
 */
// Register a new user. Students go into pending approval. Admins require a valid invite code.
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, studentId, studentNameZh, inviteCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const existing = users.find((u) => u.email === email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  if (role === 'admin') {
    // Validate TA invitation code. Use the value stored in taInvitationCode if available, otherwise default.
    const validCode = global.taInvitationCode || 'TA2025';
    if (inviteCode !== validCode) {
      return res.status(403).json({ error: 'Invalid invitation code' });
    }
    const user = { name, email, passwordHash, role: 'admin', approved: true };
    users.push(user);
    const token = generateToken(user);
    return res.status(201).json({ token, user: { name, email, role: 'admin', approved: true } });
  }
  // Student registration: approved=false by default
  const id = Date.now().toString();
  const pending = { id, name, email, studentId, studentNameZh };
  pendingStudents.push(pending);
  const user = { name, email, passwordHash, role: 'student', approved: false, studentId, studentNameZh };
  users.push(user);
  // Notify user of pending status
  createNotification(email, 'Registration submitted – pending approval');
  const token = generateToken(user);
  return res.status(201).json({ token, user: { name, email, role: 'student', approved: false, studentId, studentNameZh } });
});

// Log in a user by verifying email and password
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }
  const user = users.find((u) => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Determine approval status
  if (user.role === 'student') {
    if (students.find((s) => s.email === email)) {
      user.approved = true;
    } else if (pendingStudents.find((p) => p.email === email)) {
      user.approved = false;
    }
  }
  const token = generateToken(user);
  return res.json({ token, user: { name: user.name, email: user.email, role: user.role, approved: user.approved, studentId: user.studentId, studentNameZh: user.studentNameZh } });
});

/*
 * Email transport configuration. This example uses a local transport which
 * simply logs emails to the console. To actually send mail you would need
 * to configure an SMTP provider and supply credentials (never commit
 * credentials to source control!).
 */
const transporter = nodemailer.createTransport({
  streamTransport: true,
  newline: 'unix',
  buffer: true,
});

/**
 * Helper to send a notification email. For demonstration purposes this logs
 * the email contents rather than sending them.
 *
 * @param {string} to Recipient email address
 * @param {string} subject Email subject
 * @param {string} text Email text
 */
async function sendEmail(to, subject, text) {
  const info = await transporter.sendMail({ from: 'no-reply@algebra.example', to, subject, text });
  console.log('Email output:\n' + info.message);
  // Also create an in-app notification for this recipient so they can see
  // recent events without checking email. Use the first line of the text for brevity.
  try {
    const firstLine = text.split('\n')[0];
    createNotification(to, `${subject} – ${firstLine}`);
  } catch (e) {
    console.error('Failed to create notification', e);
  }
}

/**
 * Routes for announcements
 */
app.get('/api/announcements', (req, res) => {
  res.json(announcements);
});

app.post('/api/announcements', authRequired, adminRequired, (req, res) => {
  const { title, content } = req.body;
  const id = Date.now();
  const announcement = { id, title, content, date: new Date().toISOString() };
  announcements.unshift(announcement);
  // In a full system you would email enrolled students here
  res.status(201).json(announcement);
  // Persist changes
  saveData();
});

/**
 * Routes for assignments
 */
app.get('/api/assignments', (req, res) => {
  res.json(assignments);
});

// Create a new assignment with optional PDF file
app.post('/api/assignments', authRequired, adminRequired, upload.single('file'), (req, res) => {
  const { title, description, dueDate } = req.body;
  const file = req.file;
  const id = Date.now().toString();
  const assignment = {
    id,
    title,
    description,
    dueDate,
    createdAt: new Date().toISOString(),
    pdfPath: file ? file.path : null,
  };
  assignments.push(assignment);
  // In a real system you would notify enrolled students about new assignments via email
  res.status(201).json({ id });
  // Persist changes
  saveData();
});

// Student submits assignment PDF
app.post('/api/assignments/:id/submit', upload.single('file'), (req, res) => {
  const assignmentId = req.params.id;
  const { studentName, studentEmail, studentID, studentNameZh } = req.body;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Check if student is approved and not muted
  const studentRec = students.find((s) => s.email === studentEmail);
  if (!studentRec) {
    return res.status(403).json({ error: 'Your account has not been approved yet. Please wait for admin approval.' });
  }
  if (studentRec.muted) {
    return res.status(403).json({ error: 'Your account is muted. You cannot submit assignments.' });
  }
  // Find existing submission
  let sub = submissions.find(s => s.assignmentId === assignmentId && s.studentEmail === studentEmail);
  if (sub && sub.graded) {
    return res.status(400).json({ error: 'Submission has already been graded and cannot be replaced' });
  }
  if (sub) {
    // Replace existing file
    try {
      fs.unlinkSync(sub.filePath);
    } catch (err) {
      console.error(err);
    }
    sub.filePath = file.path;
    sub.uploadedAt = new Date().toISOString();
    sub.studentID = studentID;
    sub.studentNameZh = studentNameZh;
  } else {
    const id = Date.now().toString();
    sub = {
      id,
      assignmentId,
      studentName,
      studentEmail,
      studentID,
      studentNameZh,
      filePath: file.path,
      uploadedAt: new Date().toISOString(),
      graded: false,
      grade: null,
      comments: '',
      feedbackPath: null,
    };
    submissions.push(sub);
  }
  // Send confirmation email
  sendEmail(studentEmail, 'Assignment submission received', `Dear ${studentName},\n\nYour submission for assignment ${assignmentId} has been received.`);
  res.status(200).json({ message: 'Submission received', submissionId: sub.id });
  // Persist changes
  saveData();
});

// Get submissions for an assignment (for admin)
app.get('/api/assignments/:id/submissions', (req, res) => {
  const assignmentId = req.params.id;
  const result = submissions.filter(s => s.assignmentId === assignmentId);
  res.json(result);
});

// Grade a submission and optionally merge annotations
app.post('/api/assignments/:assignmentId/submissions/:submissionId/grade', upload.single('annotation'), async (req, res) => {
  const { assignmentId, submissionId } = req.params;
  const { grade, comments } = req.body;
  const annotFile = req.file;
  const submission = submissions.find(s => s.id === submissionId && s.assignmentId === assignmentId);
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  // If annotation image provided, merge with PDF
  let feedbackPath = null;
  if (annotFile) {
    try {
      const pdfBytes = fs.readFileSync(submission.filePath);
      const annotationBytes = fs.readFileSync(annotFile.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pngImage = await pdfDoc.embedPng(annotationBytes);
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const { width, height } = firstPage.getSize();
      // Draw annotation image covering entire page
      firstPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width,
        height,
      });
      // Write merged PDF
      const mergedPdfBytes = await pdfDoc.save();
      const feedbackDir = path.join(__dirname, 'uploads', 'feedback');
      fs.mkdirSync(feedbackDir, { recursive: true });
      const feedbackFilename = `${Date.now()}-feedback.pdf`;
      feedbackPath = path.join(feedbackDir, feedbackFilename);
      fs.writeFileSync(feedbackPath, mergedPdfBytes);
      // Cleanup annotation file
      fs.unlinkSync(annotFile.path);
    } catch (error) {
      console.error('Error merging annotation:', error);
    }
  }
  submission.graded = true;
  submission.grade = grade;
  submission.comments = comments;
  if (feedbackPath) {
    submission.feedbackPath = feedbackPath;
  }
  // Notify student
  const subject = `Assignment ${assignmentId} graded`;
  let body = `Dear ${submission.studentName},\n\nYour assignment has been graded.\nGrade: ${grade}\nComments: ${comments}\n`;
  if (feedbackPath) {
    const feedbackUrl = `${req.protocol}://${req.get('host')}/` + path.relative(path.join(__dirname, '..'), feedbackPath).replace(/\\/g, '/');
    body += `\nYou can download your feedback file here: ${feedbackUrl}`;
  }
  sendEmail(submission.studentEmail, subject, body);
  // Persist data after grading
  saveData();
  res.json({ message: 'Grading complete', feedbackPath: submission.feedbackPath });
});

/**
 * Routes for resource downloads
 */
app.get('/api/resources', (req, res) => {
  res.json(resources);
});

app.post('/api/resources', authRequired, adminRequired, upload.single('file'), (req, res) => {
  const { title } = req.body;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const id = Date.now().toString();
  resources.push({ id, title, filePath: file.path, uploadedAt: new Date().toISOString() });
  res.status(201).json({ id });
  // Persist changes
  saveData();
});

/**
 * Routes for exams
 */
app.get('/api/exams', (req, res) => {
  res.json(exams);
});

app.post('/api/exams', authRequired, adminRequired, (req, res) => {
  const { title, date, description } = req.body;
  const id = Date.now().toString();
  exams.push({ id, title, date, description });
  res.status(201).json({ id });
  // Persist changes
  saveData();
});

/**
 * Update TA invitation code. Requires admin authentication. The new code is
 * stored in memory (global.taInvitationCode) and returned in the response.
 */
app.put('/api/taCode', authRequired, adminRequired, (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Code is required' });
  }
  global.taInvitationCode = code;
  // Persist new invitation code
  saveData();
  return res.json({ code });
});

// Get current TA invitation code. Requires admin authentication.
app.get('/api/taCode', authRequired, adminRequired, (req, res) => {
  const code = global.taInvitationCode || 'TA2025';
  res.json({ code });
});

/**
 * Routes for discussion forum
 */
// List threads; if query parameter includeArchived=true, include archived threads
app.get('/api/forum', (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const threads = includeArchived ? forumThreads : forumThreads.filter(t => !t.archived);
  // Include authorRole in summary so the client can display TA/admin labels
  const summaries = threads.map((t) => ({
    id: t.id,
    title: t.title,
    date: t.date,
    authorName: t.authorName,
    authorRole: t.authorRole,
    commentCount: t.comments.length,
    archived: t.archived,
  }));
  res.json(summaries);
});

// Create a new thread (optionally with an attachment file)
app.post('/api/forum', authRequired, upload.single('file'), (req, res) => {
  const { title, content, authorName, authorEmail } = req.body;
  if (!title || !content || !authorName || !authorEmail) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // If author is a student, check if muted
  if (req.body.authorRole === 'student') {
    const stu = students.find((s) => s.email === authorEmail);
    if (stu && stu.muted) {
      return res.status(403).json({ error: 'Your account is muted. You cannot post threads.' });
    }
  }
  const id = Date.now().toString();
  const thread = {
    id,
    title,
    content,
    authorName,
    authorEmail,
    authorRole: req.body.authorRole || 'student',
    date: new Date().toISOString(),
    archived: false,
    comments: [],
    // If file uploaded, save relative path to serve later
    attachmentPath: req.file ? req.file.path : null,
  };
  forumThreads.unshift(thread);
  res.status(201).json({ id });
  // Persist changes
  saveData();
});

// Get a single thread with comments
app.get('/api/forum/:id', (req, res) => {
  const thread = forumThreads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  res.json(thread);
});

// Add a comment to a thread (optionally with an attachment)
app.post('/api/forum/:id/comments', authRequired, upload.single('file'), (req, res) => {
  const thread = forumThreads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const { content, authorName, authorEmail } = req.body;
  if (!content || !authorName || !authorEmail) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // If author is a student, verify not muted
  if (req.body.authorRole === 'student') {
    const stu = students.find((s) => s.email === authorEmail);
    if (stu && stu.muted) {
      return res.status(403).json({ error: 'Your account is muted. You cannot post comments.' });
    }
  }
  const comment = {
    id: Date.now().toString(),
    authorName,
    authorEmail,
    authorRole: req.body.authorRole || 'student',
    content,
    date: new Date().toISOString(),
    attachmentPath: req.file ? req.file.path : null,
  };
  thread.comments.push(comment);
  res.status(201).json({ id: comment.id });
  // Persist changes
  saveData();
});

// Delete a thread (admin only)
app.delete('/api/forum/:id', authRequired, adminRequired, (req, res) => {
  const idx = forumThreads.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Thread not found' });
  forumThreads.splice(idx, 1);
  res.json({ message: 'Thread deleted' });
  // Persist changes
  saveData();
});

// Toggle archive for a thread (admin only)
app.post('/api/forum/:id/archive', authRequired, adminRequired, (req, res) => {
  const thread = forumThreads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  thread.archived = !thread.archived;
  res.json({ archived: thread.archived });
  // Persist changes
  saveData();
});

// Delete a comment (admin only)
app.delete('/api/forum/:threadId/comments/:commentId', authRequired, adminRequired, (req, res) => {
  const thread = forumThreads.find(t => t.id === req.params.threadId);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const idx = thread.comments.findIndex(c => c.id === req.params.commentId);
  if (idx === -1) return res.status(404).json({ error: 'Comment not found' });
  thread.comments.splice(idx, 1);
  res.json({ message: 'Comment deleted' });
  // Persist changes
  saveData();
});

/**
 * Routes for course information
 */
// Get current course information
app.get('/api/courseInfo', (req, res) => {
  res.json({ info: courseInfo });
});
// Update course information (admin). Accepts { info: string }
app.put('/api/courseInfo', (req, res) => {
  const { info } = req.body;
  if (typeof info !== 'string') {
    return res.status(400).json({ error: 'Invalid info' });
  }
  courseInfo = info;
  res.json({ info: courseInfo });
  // Persist changes
  saveData();
});

/**
 * Routes for notifications
 */
// Get notifications for a specific user by email. If no email param provided, return empty array.
app.get('/api/notifications', (req, res) => {
  const email = req.query.email;
  if (!email) return res.json([]);
  const userNotifications = notifications.filter(n => n.email === email);
  res.json(userNotifications);
});
// Mark a notification as read
app.put('/api/notifications/:id/read', (req, res) => {
  const id = req.params.id;
  const note = notifications.find(n => n.id === id);
  if (!note) return res.status(404).json({ error: 'Notification not found' });
  note.read = true;
  res.json({ success: true });
  // Persist notification read state
  saveData();
});

/**
 * Student registration and moderation endpoints
 */
// Register a new student. The request body must contain name, email, studentId, studentNameZh.
app.post('/api/registerStudent', (req, res) => {
  const { name, email, studentId, studentNameZh } = req.body;
  if (!name || !email || !studentId || !studentNameZh) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // Check if already pending or approved
  if (pendingStudents.some((s) => s.email === email || s.studentId === studentId) || students.some((s) => s.email === email || s.studentId === studentId)) {
    return res.status(400).json({ error: 'A registration with this email or student ID already exists' });
  }
  const id = Date.now().toString();
  pendingStudents.push({ id, name, email, studentId, studentNameZh });
  // Optionally notify admin; for demonstration we simply log
  console.log(`New student registration pending approval: ${name} (${email})`);
  // Create a notification for the student indicating that their registration is awaiting approval
  createNotification(email, 'Registration pending – Your student account is awaiting approval');
  res.status(201).json({ message: 'Registration submitted and pending approval' });
  // Persist pending student registration
  saveData();
});

// Check student registration status by email. Returns status: approved, pending, or notfound.
app.get('/api/checkStudent', (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const stu = students.find((s) => s.email === email);
  if (stu) {
    return res.json({ status: 'approved', student: stu });
  }
  const pending = pendingStudents.find((s) => s.email === email);
  if (pending) {
    return res.json({ status: 'pending' });
  }
  return res.json({ status: 'notfound' });
});

// Get list of pending student registrations (admin only)
app.get('/api/students/pending', authRequired, adminRequired, (req, res) => {
  res.json(pendingStudents);
});

// Approve a pending student by id (admin only)
app.post('/api/students/:id/approve', authRequired, adminRequired, (req, res) => {
  const id = req.params.id;
  const idx = pendingStudents.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Pending student not found' });
  const stu = pendingStudents.splice(idx, 1)[0];
  // Add to approved students with muted flag default false
  const newStudent = { id: stu.id, name: stu.name, email: stu.email, studentId: stu.studentId, studentNameZh: stu.studentNameZh, muted: false };
  students.push(newStudent);
  // Update corresponding user record if exists
  const user = users.find((u) => u.email === stu.email);
  if (user) {
    user.approved = true;
    user.studentId = stu.studentId;
    user.studentNameZh = stu.studentNameZh;
  }
  // Notify student of approval
  sendEmail(stu.email, 'Registration approved', `Dear ${stu.name},\n\nYour account has been approved by the administrator. You can now log in to the course portal.`);
  res.json({ message: 'Student approved', student: newStudent });
  saveData();
});

// Reject a pending student by id (admin only)
app.post('/api/students/:id/reject', authRequired, adminRequired, (req, res) => {
  const id = req.params.id;
  const idx = pendingStudents.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Pending student not found' });
  const stu = pendingStudents.splice(idx, 1)[0];
  // Remove corresponding user record if exists
  const uIdx = users.findIndex((u) => u.email === stu.email);
  if (uIdx !== -1) users.splice(uIdx, 1);
  // Notify student of rejection
  sendEmail(stu.email, 'Registration rejected', `Dear ${stu.name},\n\nYour registration has been rejected by the administrator.`);
  res.json({ message: 'Student registration rejected' });
  // Persist changes after rejecting a student
  saveData();
});

// Mute (ban) a student by studentId (admin only). Muted students cannot post or submit.
app.post('/api/students/:studentId/mute', authRequired, adminRequired, (req, res) => {
  const studentId = req.params.studentId;
  const stu = students.find((s) => s.studentId === studentId);
  if (!stu) return res.status(404).json({ error: 'Student not found' });
  stu.muted = true;
  // Update user record if exists
  const user = users.find((u) => u.email === stu.email);
  if (user) {
    user.muted = true;
  }
  sendEmail(stu.email, 'Account muted', `Dear ${stu.name},\n\nYour account has been muted by the administrator. You will not be able to post or submit assignments until this restriction is lifted.`);
  createNotification(stu.email, 'Your account has been muted');
  res.json({ message: 'Student muted' });
  // Persist muted state
  saveData();
});

// Unmute a student by studentId (admin only)
app.post('/api/students/:studentId/unmute', authRequired, adminRequired, (req, res) => {
  const studentId = req.params.studentId;
  const stu = students.find((s) => s.studentId === studentId);
  if (!stu) return res.status(404).json({ error: 'Student not found' });
  stu.muted = false;
  // Update user record if exists
  const user = users.find((u) => u.email === stu.email);
  if (user) {
    user.muted = false;
  }
  sendEmail(stu.email, 'Account unmuted', `Dear ${stu.name},\n\nYour account has been unmuted by the administrator. You may now post and submit assignments again.`);
  createNotification(stu.email, 'Your account has been unmuted');
  res.json({ message: 'Student unmuted' });
  // Persist unmuted state
  saveData();
});

// Get list of muted students (admin only)
app.get('/api/students/muted', (req, res) => {
  const muted = students.filter((s) => s.muted);
  res.json(muted);
});

/**
 * Grade statistics endpoints
 */
// Return grade statistics for each assignment (admin or student). Computes average grade among graded submissions.
app.get('/api/stats', (req, res) => {
  const stats = assignments.map((assn) => {
    const subs = submissions.filter((s) => s.assignmentId === assn.id && s.graded);
    const count = subs.length;
    let avg = null;
    if (count > 0) {
      const sum = subs.reduce((acc, s) => acc + parseFloat(s.grade), 0);
      avg = sum / count;
    }
    return {
      assignmentId: assn.id,
      title: assn.title,
      average: avg,
      count: count,
    };
  });
  res.json(stats);
});

/**
 * Private messaging endpoints
 */
// Send a private message. Requires fromName, fromEmail, toEmail, subject, content.
app.post('/api/messages', (req, res) => {
  const { fromName, fromEmail, toEmail, subject, content } = req.body;
  if (!fromName || !fromEmail || !toEmail || !subject || !content) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // Restrict messaging: if neither sender nor recipient is an admin, disallow
  const sender = users.find((u) => u.email === fromEmail);
  const receiver = users.find((u) => u.email === toEmail);
  if (sender && receiver) {
    if (sender.role !== 'admin' && receiver.role !== 'admin') {
      return res.status(403).json({ error: 'Private messages can only be sent to or from administrators' });
    }
  }
  const id = Date.now().toString();
  // Determine recipient name (if available)
  let toName = toEmail;
  if (receiver) toName = receiver.name;
  const msg = { id, fromName, fromEmail, toName, toEmail, subject, content, date: new Date().toISOString(), read: false };
  messages.unshift(msg);
  // Notify recipient
  sendEmail(toEmail, `New private message from ${fromName}`, `You have received a new private message:\n\nSubject: ${subject}\n\n${content}`);
  createNotification(toEmail, `New message from ${fromName}`);
  // Persist messages
  saveData();
  res.status(201).json({ message: 'Message sent', id });
});

// Get messages addressed to the provided email
app.get('/api/messages', (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const inbox = messages.filter((m) => m.toEmail === email);
  res.json(inbox);
});

// Mark a message as read
app.put('/api/messages/:id/read', (req, res) => {
  const id = req.params.id;
  const msg = messages.find((m) => m.id === id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  msg.read = true;
  res.json({ success: true });
  // Persist read state
  saveData();
});

// Get list of all admin users (name and email). Requires authentication.
app.get('/api/admins', authRequired, (req, res) => {
  const admins = users.filter(u => u.role === 'admin').map(u => ({ name: u.name, email: u.email }));
  res.json(admins);
});

/**
 * Export grades as a CSV. Requires authentication and admin privileges. The CSV
 * includes assignment ID, assignment title, student name, Chinese name,
 * student ID, student email, upload date, graded flag, grade, comments and
 * a feedback URL if available.
 */
app.get('/api/export/grades', authRequired, adminRequired, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="grades.csv"');
  const header = ['assignmentId','assignmentTitle','studentName','studentNameZh','studentId','studentEmail','uploadedAt','graded','grade','comments','feedbackUrl'];
  res.write(header.join(',') + '\n');
  submissions.forEach(sub => {
    const assign = assignments.find(a => a.id === sub.assignmentId) || {};
    const row = [
      sub.assignmentId,
      (assign.title || '').replace(/,/g, ' '),
      (sub.studentName || '').replace(/,/g, ' '),
      (sub.studentNameZh || '').replace(/,/g, ' '),
      sub.studentID || '',
      sub.studentEmail || '',
      sub.uploadedAt || '',
      sub.graded ? 'yes' : 'no',
      sub.grade != null ? sub.grade : '',
      (sub.comments || '').replace(/\r?\n/g, ' ').replace(/,/g, ' '),
      sub.feedbackPath ? (req.protocol + '://' + req.get('host') + '/' + path.relative(path.join(__dirname, '..'), sub.feedbackPath).replace(/\\/g, '/')) : ''
    ];
    res.write(row.join(',') + '\n');
  });
  res.end();
});

// Catch‑all route to serve index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});