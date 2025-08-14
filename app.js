const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const cookieSession = require('cookie-session');

// Create Express app
const app = express();

// Configure view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  cookieSession({
    name: 'session',
    keys: ['secret-key'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  })
);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple in-memory storage for demo purposes
const users = [];
const assignments = [];
const posts = [];

// Multer setup for PDF uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});
const upload = multer({ storage });

// Helper to check authentication
function requireAuth(role) {
  return function (req, res, next) {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (role && req.session.user.role !== role) {
      return res.status(403).send('Forbidden');
    }
    next();
  };
}

// Routes
app.get('/', (req, res) => {
  res.render('home', {
    user: req.session.user,
    announcements: [
      { title: 'Welcome', content: 'Welcome to Foundations of Algebra!' },
      { title: 'Assignment 1 Released', content: 'Please submit by next week.' },
    ],
    posts: posts.slice(0, 3),
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  const { email } = req.body;
  let user = users.find((u) => u.email === email);
  if (!user) {
    // auto-register as guest for simplicity
    user = { email, role: 'student', name: email.split('@')[0] };
    users.push(user);
  }
  req.session.user = user;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

// Assignments list
app.get('/assignments', (req, res) => {
  res.render('assignments', {
    user: req.session.user,
    assignments,
  });
});

// Submit assignment (students)
app.get('/assignments/:id/submit', requireAuth('student'), (req, res) => {
  const assignment = assignments.find((a) => a.id === req.params.id);
  if (!assignment) return res.status(404).send('Not found');
  res.render('submit', { user: req.session.user, assignment });
});

app.post(
  '/assignments/:id/submit',
  requireAuth('student'),
  upload.single('pdf'),
  (req, res) => {
    const assignment = assignments.find((a) => a.id === req.params.id);
    if (!assignment) return res.status(404).send('Not found');
    assignment.submissions = assignment.submissions || [];
    assignment.submissions.push({
      student: req.session.user.email,
      file: req.file.filename,
      submittedAt: new Date(),
      feedback: null,
    });
    res.redirect('/assignments');
  }
);

// Create assignment (TA only)
app.get('/admin/assignments/new', requireAuth('ta'), (req, res) => {
  res.render('new-assignment', { user: req.session.user });
});

app.post('/admin/assignments/new', requireAuth('ta'), (req, res) => {
  const { title, description, dueDate } = req.body;
  const assignment = {
    id: 'a' + Date.now(),
    title,
    description,
    dueDate,
    submissions: [],
  };
  assignments.push(assignment);
  res.redirect('/assignments');
});

// Forum
app.get('/forum', (req, res) => {
  res.render('forum', { user: req.session.user, posts });
});

app.post('/forum/new', requireAuth('student'), (req, res) => {
  const { title, body } = req.body;
  posts.push({ id: posts.length + 1, title, body, author: req.session.user.name, createdAt: new Date() });
  res.redirect('/forum');
});

// Resources page
app.get('/resources', (req, res) => {
  res.render('resources', { user: req.session.user, resources: [] });
});

// Exams page
app.get('/exams', (req, res) => {
  res.render('exams', { user: req.session.user, exams: [] });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { user: req.session.user });
});

// Start server with dynamic port. If the desired port is in use (EADDRINUSE),
// automatically try the next port. You can also override the default by
// setting the PORT environment variable when starting the app (e.g. `PORT=4000 npm start`).
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      throw err;
    }
  });
};

const initialPort = parseInt(process.env.PORT, 10) || 3000;
startServer(initialPort);