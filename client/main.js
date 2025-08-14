/*
 * This script manages client‑side interactions for the course portal.
 * It handles user authentication (simple local storage), navigation,
 * data fetching and rendering, assignment submissions, grading with
 * annotations and comments, resource uploads/downloads, and exam
 * notifications. The goal is to provide a fluid experience that
 * approximates Apple's aesthetic through subtle animations and
 * responsive layouts.
 */

// Utility to select elements
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// In‑memory user session (persisted in localStorage); if null, user is guest
let currentUser = null;

// Setup event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Restore user from localStorage if available
  const stored = localStorage.getItem('courseUser');
  if (stored) {
    currentUser = JSON.parse(stored);
    initForLoggedInUser();
  } else {
    initForGuest();
  }

  // Attach navigation handler for all nav buttons
  $$('.nav-links button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      showSection(section + '-section');
      setActiveNav(btn);
      // Load additional content when navigating to specific sections
      if (section === 'scores') {
        loadScores();
      } else if (section === 'messages') {
        loadMessages();
      } else if (section === 'admin') {
        loadAdminThreads();
        loadPendingStudents();
        loadStudentList();
      }
    });
  });

  // Configure pdf.js worker globally once loaded. Without this the library will try
  // to load its worker relative to the current origin, which may fail in our
  // environment. We set it to a CDN version matching the pdf.js script loaded in
  // index.html.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
  }

  // New discussion thread submission
  const newThreadForm = document.getElementById('newThreadForm');
  if (newThreadForm) {
    newThreadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        alert('Please login to post a thread.');
        return;
      }
      // Prevent pending students from posting
      if (currentUser.role === 'pendingStudent' || currentUser.approved === false) {
        alert('Your registration is still pending approval; you cannot post threads yet.');
        return;
      }
      const titleVal = document.getElementById('threadTitle').value.trim();
      const contentVal = document.getElementById('threadContent').value.trim();
      const fileInput = document.getElementById('threadFile');
      if (!titleVal || !contentVal) return;
      const formData = new FormData();
      formData.append('title', titleVal);
      formData.append('content', contentVal);
      formData.append('authorName', currentUser.name);
      formData.append('authorEmail', currentUser.email);
      formData.append('authorRole', currentUser.role);
      if (fileInput && fileInput.files.length) {
        formData.append('file', fileInput.files[0]);
      }
      const resp = await fetch('/api/forum', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        document.getElementById('threadTitle').value = '';
        document.getElementById('threadContent').value = '';
        if (fileInput) fileInput.value = '';
        loadDiscussions();
        loadHomeThreads();
        if (currentUser && currentUser.role === 'admin') {
          loadAdminThreads();
        }
        alert('Thread posted');
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to post thread');
      }
    });
  }

  // New private message submission
  const newMessageForm = document.getElementById('newMessageForm');
  if (newMessageForm) {
    newMessageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        alert('Please login to send a message.');
        return;
      }
      const recipient = document.getElementById('messageRecipient').value.trim();
      const subject = document.getElementById('messageSubject').value.trim();
      const content = document.getElementById('messageContent').value.trim();
      if (!recipient || !subject || !content) {
        alert('Please complete all fields.');
        return;
      }
      try {
        const body = {
          fromName: currentUser.name,
          fromEmail: currentUser.email,
          toEmail: recipient,
          subject,
          content,
        };
        const resp = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          alert('Message sent');
          document.getElementById('newMessageForm').reset();
          loadMessages();
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to send message');
        }
      } catch (err) {
        console.error('Send message failed', err);
        alert('Error sending message');
      }
    });
  }

  // Student mute/unmute actions (admin)
  const muteBtn = document.getElementById('muteBtn');
  const unmuteBtn = document.getElementById('unmuteBtn');
  if (muteBtn) {
    muteBtn.addEventListener('click', async () => {
      const input = document.getElementById('muteStudentId');
      const sid = input.value.trim();
      if (!sid) {
        alert('Please enter a student ID.');
        return;
      }
      if (!confirm('Mute this student? They will be unable to post or submit.')) return;
      await fetch(`/api/students/${encodeURIComponent(sid)}/mute`, { method: 'POST' });
      alert('Student muted');
      loadStudentList();
    });
  }
  if (unmuteBtn) {
    unmuteBtn.addEventListener('click', async () => {
      const input = document.getElementById('muteStudentId');
      const sid = input.value.trim();
      if (!sid) {
        alert('Please enter a student ID.');
        return;
      }
      if (!confirm('Unmute this student?')) return;
      await fetch(`/api/students/${encodeURIComponent(sid)}/unmute`, { method: 'POST' });
      alert('Student unmuted');
      loadStudentList();
    });
  }

  // Login form submission
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#nameInput').value.trim();
    const email = $('#emailInput').value.trim();
    const role = $('#roleSelect').value;
    if (!name || !email) {
      alert('Please enter your name and email.');
      return;
    }
    if (role === 'student') {
      const studentId = $('#studentIdInput').value.trim();
      const studentNameZh = $('#studentNameZhInput').value.trim();
      if (!studentId || !studentNameZh) {
        alert('Please enter your student ID and Chinese name.');
        return;
      }
      try {
        // Check current status on server
        const checkRes = await fetch(`/api/checkStudent?email=${encodeURIComponent(email)}`);
        const statusData = await checkRes.json();
        if (statusData.status === 'approved') {
          // Already approved; proceed to login
          currentUser = { name, email, role: 'student', studentId, studentNameZh, approved: true };
          alert('Welcome back! Your registration is approved.');
        } else if (statusData.status === 'pending') {
          // Registration pending; treat as pending user
          currentUser = { name, email, role: 'pendingStudent', studentId, studentNameZh, approved: false };
          alert('Your registration is still pending approval. You can browse the site but cannot submit or post until approved.');
        } else {
          // Not found; register new student
          const resp = await fetch('/api/registerStudent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, studentId, studentNameZh }),
          });
          if (resp.ok) {
            currentUser = { name, email, role: 'pendingStudent', studentId, studentNameZh, approved: false };
            alert('Registration submitted. Awaiting administrator approval.');
          } else {
            const msg = await resp.json();
            alert(msg.error || 'Registration failed');
            return;
          }
        }
      } catch (err) {
        console.error('Registration error', err);
        alert('An error occurred during registration. Please try again later.');
        return;
      }
    } else {
      // Admin/TA login
      const invite = $('#inviteCodeInput').value.trim();
      const storedCode = localStorage.getItem('taInvitationCode') || 'TA2025';
      if (invite !== storedCode) {
        alert('Invalid invitation code for TA registration.');
        return;
      }
      currentUser = { name, email, role: 'admin', approved: true };
    }
    // Persist session
    localStorage.setItem('courseUser', JSON.stringify(currentUser));
    // Hide login modal and initialise user
    $('#login-section').classList.add('hidden');
    initForLoggedInUser();
  });

  // Role select change: toggle student/admin fields
  $('#roleSelect').addEventListener('change', () => {
    const role = $('#roleSelect').value;
    if (role === 'student') {
      $('#studentFields').style.display = 'block';
      $('#adminFields').classList.add('hidden');
    } else {
      $('#studentFields').style.display = 'none';
      $('#adminFields').classList.remove('hidden');
    }
  });

  // TA invitation code settings (admin panel)
  const inviteForm = document.getElementById('inviteCodeForm');
  if (inviteForm) {
    inviteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newCode = document.getElementById('taCodeInput').value.trim();
      if (!newCode) {
        alert('Please enter a code');
        return;
      }
      localStorage.setItem('taInvitationCode', newCode);
      document.getElementById('currentTaCode').textContent = newCode;
      document.getElementById('taCodeInput').value = '';
      alert('TA invitation code updated');
    });
  }

  // Admin forms submissions
  document.getElementById('adminAnnouncementForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#adminAnnouncementTitle').value.trim();
    const content = $('#adminAnnouncementContent').value.trim();
    if (!title || !content) return;
    await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    $('#adminAnnouncementTitle').value = '';
    $('#adminAnnouncementContent').value = '';
    loadAnnouncements();
    alert('Announcement posted');
  });
  document.getElementById('adminAssignmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#adminAssignmentTitle').value.trim();
    const description = $('#adminAssignmentDescription').value.trim();
    const dueDate = $('#adminAssignmentDue').value;
    const fileInput = $('#adminAssignmentFile');
    if (!title || !dueDate || !fileInput.files.length) {
      alert('Please complete all required fields and select a PDF.');
      return;
    }
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('dueDate', dueDate);
    formData.append('file', fileInput.files[0]);
    await fetch('/api/assignments', {
      method: 'POST',
      body: formData,
    });
    $('#adminAssignmentTitle').value = '';
    $('#adminAssignmentDescription').value = '';
    $('#adminAssignmentDue').value = '';
    fileInput.value = '';
    loadAssignments();
    alert('Assignment created');
  });
  document.getElementById('adminResourceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#adminResourceTitle').value.trim();
    const fileInput = $('#adminResourceFile');
    if (!title || !fileInput.files.length) return;
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', fileInput.files[0]);
    await fetch('/api/resources', {
      method: 'POST',
      body: formData,
    });
    $('#adminResourceTitle').value = '';
    fileInput.value = '';
    loadResources();
    alert('Resource uploaded');
  });
  document.getElementById('adminExamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#adminExamTitle').value.trim();
    const date = $('#adminExamDate').value;
    const description = $('#adminExamDescription').value.trim();
    if (!title || !date || !description) return;
    await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, date, description }),
    });
    $('#adminExamTitle').value = '';
    $('#adminExamDate').value = '';
    $('#adminExamDescription').value = '';
    loadExams();
    alert('Exam created');
  });

  // Course information update
  document.getElementById('courseInfoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const info = document.getElementById('courseInfoTextarea').value;
    await fetch('/api/courseInfo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ info }),
    });
    alert('Course information updated');
    loadCourseInfo();
  });
});

function initForLoggedInUser() {
  // Hide login modal
  $('#login-section').classList.add('hidden');
  // Display navigation
  $('header.navbar').style.display = 'flex';
  // Configure user info with logout link
  const userInfoEl = $('#userInfo');
  // Determine pending status
  const pending = currentUser.role === 'pendingStudent' || currentUser.approved === false;
  // Display name with role/pending label
  let roleLabel = currentUser.role;
  if (pending) {
    roleLabel = 'pending';
  }
  userInfoEl.innerHTML = `<span>${currentUser.name} (${roleLabel})</span> | <a href="#" id="logoutLink" style="color:#ff3b30; text-decoration:none;">Logout</a>`;
  // Attach logout handler
  document.getElementById('logoutLink').addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('courseUser');
    currentUser = null;
    initForGuest();
  });
  // Show admin navigation if user is admin
  if (currentUser.role === 'admin') {
    document.getElementById('adminNav').style.display = 'inline-block';
    // Update invitation code display
    const code = localStorage.getItem('taInvitationCode') || 'TA2025';
    const codeEl = document.getElementById('currentTaCode');
    if (codeEl) {
      codeEl.textContent = code;
    }
    // Populate admin lists
    loadAdminThreads();
    loadPendingStudents();
    loadStudentList();
  } else {
    document.getElementById('adminNav').style.display = 'none';
  }
  // Show or hide create thread container based on approval
  const newThread = document.getElementById('newThreadContainer');
  if (newThread) {
    if (pending) {
      newThread.classList.add('hidden');
    } else {
      newThread.classList.remove('hidden');
    }
  }
  // Load page data
  showSection('home-section');
  setActiveNav(document.querySelector('nav.nav-links button[data-section="home"]'));
  loadAnnouncements();
  loadAssignments();
  loadResources();
  loadExams();
  loadDiscussions();
  loadCourseInfo();
  loadHomeThreads();
  loadNotifications();
  loadScores();
  loadMessages();
}

function initForGuest() {
  // Hide login modal initially
  $('#login-section').classList.add('hidden');
  // Show navigation
  $('header.navbar').style.display = 'flex';
  // Set user info with login link
  const userInfoEl = $('#userInfo');
  userInfoEl.innerHTML = `<span>Guest</span> | <a href="#" id="loginLink" style="color:#007aff; text-decoration:none;">Login</a>`;
  // Show nav but hide admin nav
  document.getElementById('adminNav').style.display = 'none';
  // Hide thread creation container
  const newThread = document.getElementById('newThreadContainer');
  if (newThread) newThread.classList.add('hidden');
  // Attach login link to show login modal
  document.getElementById('loginLink').addEventListener('click', (e) => {
    e.preventDefault();
    // Show login modal
    $('#login-section').classList.remove('hidden');
    // Show appropriate fields based on selected role
    const role = $('#roleSelect').value;
    if (role === 'student') {
      $('#studentFields').style.display = 'block';
      $('#adminFields').classList.add('hidden');
    } else {
      $('#studentFields').style.display = 'none';
      $('#adminFields').classList.remove('hidden');
    }
  });
  // Load content for guest view
  showSection('home-section');
  setActiveNav(document.querySelector('nav.nav-links button[data-section="home"]'));
  loadAnnouncements();
  loadAssignments();
  loadResources();
  loadExams();
  loadDiscussions();
  loadCourseInfo();
  loadHomeThreads();
  // Hide notifications for guests
  const bell = document.getElementById('notificationsBell');
  if (bell) bell.style.display = 'none';
}

function setActiveNav(button) {
  $$('.nav-links button').forEach((btn) => btn.classList.remove('active'));
  if (button) button.classList.add('active');
}

function showSection(sectionId) {
  $$('.page').forEach((page) => page.classList.add('hidden'));
  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('hidden');
}

/**
 * Fetch course information from the server and render it on the home page.
 * The info supports Markdown and LaTeX.
 */
async function loadCourseInfo() {
  try {
    const res = await fetch('/api/courseInfo');
    const data = await res.json();
    const container = document.getElementById('courseInfo');
    if (!container) return;
    // Render markdown and math
    container.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = window.marked.parse(data.info || '');
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(div, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
      } catch (err) {
        console.error(err);
      }
    }
    container.appendChild(div);
    // If an admin is editing the course information, prefill the textarea
    const infoTextarea = document.getElementById('courseInfoTextarea');
    if (infoTextarea) {
      infoTextarea.value = data.info || '';
    }
  } catch (err) {
    console.error('Failed to load course info', err);
  }
}

/**
 * Fetch top discussion threads and display them on the home page. For brevity
 * this shows up to five most recent, non-archived threads.
 */
async function loadHomeThreads() {
  try {
    const res = await fetch('/api/forum');
    const threads = await res.json();
    const container = document.getElementById('homeThreadsList');
    if (!container) return;
    container.innerHTML = '';
    if (!threads.length) {
      const p = document.createElement('p');
      p.textContent = 'No discussions yet.';
      container.appendChild(p);
      return;
    }
    // Show latest five threads
    threads.slice(0, 5).forEach((th) => {
      const card = document.createElement('div');
      card.className = 'thread-card';
      const title = document.createElement('h4');
      title.textContent = th.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const d = new Date(th.date);
      let authorHTML = th.authorName;
      if (th.authorRole === 'admin') {
        authorHTML += ' <span class="author-label">TA</span>';
      }
      meta.innerHTML = `${authorHTML} • ${d.toLocaleString()} • ${th.commentCount} comments`;
      card.appendChild(title);
      card.appendChild(meta);
      card.addEventListener('click', () => openThreadPage(th.id));
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load home threads', err);
  }
}

/**
 * Load notifications for the current user. Updates the bell icon and fills
 * the notification panel. Clicking a notification marks it as read.
 */
async function loadNotifications() {
  const bell = document.getElementById('notificationsBell');
  const countSpan = document.getElementById('notificationCount');
  const panel = document.getElementById('notificationPanel');
  if (!bell || !countSpan || !panel) return;
  if (!currentUser) {
    bell.style.display = 'none';
    return;
  }
  try {
    const res = await fetch(`/api/notifications?email=${encodeURIComponent(currentUser.email)}`);
    const notes = await res.json();
    // Show bell icon
    bell.style.display = 'block';
    // Count unread
    const unread = notes.filter(n => !n.read).length;
    if (unread > 0) {
      countSpan.style.display = 'block';
      countSpan.textContent = unread.toString();
    } else {
      countSpan.style.display = 'none';
    }
    // Populate panel
    panel.innerHTML = '';
    if (!notes.length) {
      const p = document.createElement('p');
      p.textContent = 'No notifications.';
      p.style.fontSize = '0.85rem';
      panel.appendChild(p);
    } else {
      notes.sort((a, b) => new Date(b.date) - new Date(a.date));
      notes.forEach((n) => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        if (!n.read) item.style.fontWeight = '600';
        item.innerHTML = `<div>${n.message}</div><div style="font-size:0.7rem;color:#6e6e73;">${new Date(n.date).toLocaleString()}</div>`;
        item.addEventListener('click', async () => {
          // Mark as read
          await fetch(`/api/notifications/${n.id}/read`, { method: 'PUT' });
          item.style.fontWeight = 'normal';
          loadNotifications();
        });
        panel.appendChild(item);
      });
    }
    // Toggle panel on bell click
    bell.onclick = () => {
      panel.classList.toggle('hidden');
    };
  } catch (err) {
    console.error('Failed to load notifications', err);
  }
}

/**
 * Open a discussion thread in a dedicated page. This function populates the
 * thread page with content, comments, attachments, and admin controls. It
 * hides other sections and sets the navigation state accordingly.
 * @param {string} threadId
 */
async function openThreadPage(threadId) {
  try {
    const res = await fetch(`/api/forum/${threadId}`);
    if (!res.ok) {
      alert('Thread not found');
      return;
    }
    const thread = await res.json();
    // Hide other pages and set nav state
    showSection('thread-page-section');
    setActiveNav(null);
    const container = document.getElementById('threadPageContent');
    container.innerHTML = '';
    // Back link
    const backBtn = document.createElement('button');
    backBtn.textContent = '← Back to discussions';
    backBtn.className = 'secondary-btn';
    backBtn.style.marginBottom = '1rem';
    backBtn.addEventListener('click', () => {
      showSection('discussions-section');
      setActiveNav(document.querySelector('nav.nav-links button[data-section="discussions"]'));
    });
    container.appendChild(backBtn);
    // Header with title
    const header = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = thread.title;
    header.appendChild(h3);
    container.appendChild(header);
    // Meta information
    const meta = document.createElement('div');
    meta.className = 'meta';
    const d = new Date(thread.date);
    let authorHTML = thread.authorName;
    if (thread.authorRole === 'admin') {
      authorHTML += ' <span class="author-label">TA</span>';
    }
    meta.innerHTML = `${authorHTML} • ${d.toLocaleString()}`;
    if (thread.archived) {
      const arch = document.createElement('span');
      arch.textContent = ' (Archived)';
      arch.style.color = '#ff3b30';
      meta.appendChild(arch);
    }
    container.appendChild(meta);
    // Attachment if exists
    if (thread.attachmentPath) {
      const attLink = document.createElement('a');
      const rel = thread.attachmentPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
      attLink.href = '/' + rel;
      attLink.textContent = 'Download Attachment';
      attLink.target = '_blank';
      attLink.style.display = 'block';
      attLink.style.marginTop = '0.5rem';
      container.appendChild(attLink);
    }
    // Content body parsed
    const body = document.createElement('div');
    body.className = 'thread-body';
    body.innerHTML = window.marked.parse(thread.content || '');
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(body, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
      } catch (err) {
        console.error(err);
      }
    }
    container.appendChild(body);
    // Comments section
    const commentsContainer = document.createElement('div');
    commentsContainer.className = 'comments-container';
    commentsContainer.style.marginTop = '1rem';
    const commentsHeader = document.createElement('h4');
    commentsHeader.textContent = 'Comments';
    commentsContainer.appendChild(commentsHeader);
    if (thread.comments.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No comments yet.';
      commentsContainer.appendChild(p);
    } else {
      thread.comments.forEach((c) => {
        const div = document.createElement('div');
        div.className = 'comment-item';
        const authorLine = document.createElement('div');
        authorLine.style.fontSize = '0.85rem';
        authorLine.style.color = '#6e6e73';
        let authHTML = c.authorName;
        if (c.authorRole === 'admin') {
          authHTML += ' <span class="author-label">TA</span>';
        }
        authorLine.innerHTML = `${authHTML} • ${new Date(c.date).toLocaleString()}`;
        div.appendChild(authorLine);
        const cBody = document.createElement('div');
        cBody.innerHTML = window.marked.parse(c.content || '');
        if (typeof window.renderMathInElement === 'function') {
          try {
            window.renderMathInElement(cBody, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
          } catch (err) {
            console.error(err);
          }
        }
        div.appendChild(cBody);
        // Attachment
        if (c.attachmentPath) {
          const link = document.createElement('a');
          const relp = c.attachmentPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
          link.href = '/' + relp;
          link.textContent = 'Attachment';
          link.target = '_blank';
          link.style.display = 'block';
          link.style.marginTop = '0.25rem';
          div.appendChild(link);
        }
        // Admin delete comment
        if (currentUser && currentUser.role === 'admin') {
          const delBtn = document.createElement('button');
          delBtn.textContent = 'Delete';
          delBtn.className = 'small-btn';
          delBtn.style.marginLeft = '0.5rem';
          delBtn.addEventListener('click', async () => {
            if (!confirm('Delete this comment?')) return;
            const resp = await fetch(`/api/forum/${thread.id}/comments/${c.id}`, { method: 'DELETE' });
            if (resp.ok) {
              openThreadPage(thread.id);
            } else {
              const msg = await resp.json();
              alert(msg.error || 'Failed to delete');
            }
          });
          div.appendChild(delBtn);
        }
        commentsContainer.appendChild(div);
      });
    }
    container.appendChild(commentsContainer);
    // Comment form if logged in and not pending
    if (currentUser && !(currentUser.role === 'pendingStudent' || currentUser.approved === false)) {
      const form = document.createElement('div');
      form.className = 'comment-form';
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Add a comment...';
      textarea.rows = 3;
      textarea.style.width = '100%';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,image/*';
      fileInput.style.marginTop = '0.5rem';
      const submit = document.createElement('button');
      submit.textContent = 'Post Comment';
      submit.className = 'primary-btn';
      submit.style.marginTop = '0.5rem';
      submit.addEventListener('click', async () => {
        const contentVal = textarea.value.trim();
        if (!contentVal) return;
        const formData = new FormData();
        formData.append('content', contentVal);
        formData.append('authorName', currentUser.name);
        formData.append('authorEmail', currentUser.email);
        formData.append('authorRole', currentUser.role);
        if (fileInput.files.length) {
          formData.append('file', fileInput.files[0]);
        }
        const resp = await fetch(`/api/forum/${thread.id}/comments`, {
          method: 'POST',
          body: formData,
        });
        if (resp.ok) {
          textarea.value = '';
          fileInput.value = '';
          openThreadPage(thread.id);
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to post comment');
        }
      });
      form.appendChild(textarea);
      form.appendChild(fileInput);
      form.appendChild(submit);
      container.appendChild(form);
    } else {
      const loginMsg = document.createElement('div');
      loginMsg.style.marginTop = '1rem';
      loginMsg.style.fontSize = '0.85rem';
      loginMsg.style.color = '#6e6e73';
      loginMsg.textContent = 'Login to post a comment.';
      container.appendChild(loginMsg);
    }
    // Admin actions (archive/unarchive, delete) on page
    if (currentUser && currentUser.role === 'admin') {
      const adminActions = document.createElement('div');
      adminActions.style.marginTop = '1rem';
      const archiveBtn = document.createElement('button');
      archiveBtn.className = 'secondary-btn';
      archiveBtn.textContent = thread.archived ? 'Unarchive Thread' : 'Archive Thread';
      archiveBtn.addEventListener('click', async () => {
        const resp = await fetch(`/api/forum/${thread.id}/archive`, { method: 'POST' });
        if (resp.ok) {
          loadDiscussions();
          loadHomeThreads();
          openThreadPage(thread.id);
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to update');
        }
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'secondary-btn';
      deleteBtn.textContent = 'Delete Thread';
      deleteBtn.style.marginLeft = '0.5rem';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm('Delete this thread?')) return;
        const resp = await fetch(`/api/forum/${thread.id}`, { method: 'DELETE' });
        if (resp.ok) {
          showSection('discussions-section');
          loadDiscussions();
          loadHomeThreads();
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to delete thread');
        }
      });
      adminActions.appendChild(archiveBtn);
      adminActions.appendChild(deleteBtn);
      container.appendChild(adminActions);
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * Open the assignment detail page for a given assignment. This view shows the
 * assignment PDF, allows students to upload their submission and preview it,
 * and displays grading information and feedback. Admins see a button to
 * grade submissions as before.
 * @param {Object} assn Assignment object (from assignments list)
 */
async function openAssignmentPage(assn) {
  // Hide other pages and nav highlight
  showSection('assignment-page-section');
  setActiveNav(null);
  const container = document.getElementById('assignmentPageContent');
  container.innerHTML = '';
  // Back link
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Back to assignments';
  backBtn.className = 'secondary-btn';
  backBtn.style.marginBottom = '1rem';
  backBtn.addEventListener('click', () => {
    showSection('assignments-section');
    setActiveNav(document.querySelector('nav.nav-links button[data-section="assignments"]'));
  });
  container.appendChild(backBtn);
  // Header with title and due
  const title = document.createElement('h3');
  title.textContent = assn.title;
  container.appendChild(title);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `Due: ${new Date(assn.dueDate).toLocaleString()}`;
  container.appendChild(meta);
  // Description parsed
  const descDiv = document.createElement('div');
  descDiv.innerHTML = window.marked.parse(assn.description || '');
  if (typeof window.renderMathInElement === 'function') {
    try {
      window.renderMathInElement(descDiv, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
    } catch (err) {
      console.error(err);
    }
  }
  container.appendChild(descDiv);
  // Section: view assignment PDF
  if (assn.pdfPath) {
    // Wrap in a styled section for improved aesthetics
    const pdfSection = document.createElement('div');
    pdfSection.className = 'assignment-detail-section';
    const h4 = document.createElement('h4');
    h4.textContent = 'Assignment PDF';
    pdfSection.appendChild(h4);
    // Controls container for pagination and zoom
    const controls = document.createElement('div');
    controls.className = 'pdf-viewer-controls';
    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Prev';
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomInBtn);
    controls.appendChild(pageInfo);
    pdfSection.appendChild(controls);
    // Canvas container
    const pdfViewer = document.createElement('div');
    pdfViewer.className = 'pdf-container';
    const pdfCanvas = document.createElement('canvas');
    pdfViewer.appendChild(pdfCanvas);
    pdfSection.appendChild(pdfViewer);
    container.appendChild(pdfSection);
    // Use pdf.js to display assignment PDF with pagination and zoom
    const relPath = assn.pdfPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
    const url = '/' + relPath;
    let doc = null;
    let pageNum = 1;
    let scale = 1.0;
    async function renderAssignmentPage(num) {
      if (!doc) return;
      const page = await doc.getPage(num);
      const viewport = page.getViewport({ scale });
      pdfCanvas.height = viewport.height;
      pdfCanvas.width = viewport.width;
      const ctx = pdfCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageInfo.textContent = `Page ${pageNum} / ${doc.numPages}`;
    }
    function updateControls() {
      if (!doc) return;
      prevBtn.disabled = pageNum <= 1;
      nextBtn.disabled = pageNum >= doc.numPages;
    }
    if (window.pdfjsLib) {
      pdfjsLib.getDocument(url).promise.then((d) => {
        doc = d;
        renderAssignmentPage(pageNum);
        updateControls();
      });
    }
    prevBtn.addEventListener('click', () => {
      if (pageNum > 1) {
        pageNum--;
        renderAssignmentPage(pageNum);
        updateControls();
      }
    });
    nextBtn.addEventListener('click', () => {
      if (doc && pageNum < doc.numPages) {
        pageNum++;
        renderAssignmentPage(pageNum);
        updateControls();
      }
    });
    zoomInBtn.addEventListener('click', () => {
      scale = Math.min(scale + 0.25, 2.0);
      renderAssignmentPage(pageNum);
    });
    zoomOutBtn.addEventListener('click', () => {
      scale = Math.max(scale - 0.25, 0.5);
      renderAssignmentPage(pageNum);
    });
  }
  // Student submission & grade section
  if (!currentUser || currentUser.role === 'student') {
    // Fetch this student's submission if exists
    let mySub = null;
    try {
      const res = await fetch(`/api/assignments/${assn.id}/submissions`);
      const subs = await res.json();
      if (currentUser) {
        mySub = subs.find((s) => s.studentEmail === currentUser.email);
      }
    } catch (err) {
      console.error('Failed to fetch submission', err);
    }
    // Section container for submission and feedback
    const subSection = document.createElement('div');
    // Use the same styled wrapper as assignment pdf for a cohesive look
    subSection.className = 'assignment-detail-section';
    // Upload part
    const uploadTitle = document.createElement('h4');
    uploadTitle.textContent = 'Submit Your Work';
    subSection.appendChild(uploadTitle);
    // If there is a submission, show status and preview
    if (mySub) {
      const status = document.createElement('div');
      status.style.fontSize = '0.85rem';
      status.style.marginBottom = '0.5rem';
      if (mySub.graded) {
        status.innerHTML = `<strong>Submitted:</strong> ${new Date(mySub.uploadedAt).toLocaleString()}`;
      } else {
        status.innerHTML = `<strong>Submitted:</strong> ${new Date(mySub.uploadedAt).toLocaleString()} (not yet graded)`;
      }
      subSection.appendChild(status);
      // Preview uploaded PDF using pdf.js (first page) with ability to open full preview via click
      const previewDiv = document.createElement('div');
      previewDiv.className = 'pdf-container';
      const canvas = document.createElement('canvas');
      previewDiv.appendChild(canvas);
      subSection.appendChild(previewDiv);
      const fileRel = mySub.filePath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
      const fileUrl = '/' + fileRel;
      let docp = null;
      if (window.pdfjsLib) {
        pdfjsLib.getDocument(fileUrl).promise.then((d) => {
          docp = d;
          d.getPage(1).then((pg) => {
            const vp = pg.getViewport({ scale: 1.0 });
            canvas.width = vp.width;
            canvas.height = vp.height;
            const ctx = canvas.getContext('2d');
            pg.render({ canvasContext: ctx, viewport: vp });
          });
        });
      }
    }
    // Upload input if not graded
      if (!mySub || !mySub.graded) {
      const uploadContainer = document.createElement('div');
      uploadContainer.className = 'upload-container';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/pdf';
      const inputId = `detail-upload-${assn.id}`;
      fileInput.id = inputId;
      const label = document.createElement('label');
      label.className = 'upload-label';
      label.setAttribute('for', inputId);
      label.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Choose PDF';
      const fileNameSpan = document.createElement('span');
      fileNameSpan.className = 'file-name';
      fileNameSpan.textContent = 'No file chosen';
      fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
          fileNameSpan.textContent = fileInput.files[0].name;
        } else {
          fileNameSpan.textContent = 'No file chosen';
        }
      });
      const submitBtn = document.createElement('button');
      submitBtn.className = 'primary-btn';
      submitBtn.textContent = mySub ? 'Replace' : 'Submit';
      submitBtn.addEventListener('click', async () => {
        if (!fileInput.files.length) {
          alert('Please select a PDF.');
          return;
        }
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('studentName', currentUser.name);
        formData.append('studentEmail', currentUser.email);
        formData.append('studentID', currentUser.studentId);
        formData.append('studentNameZh', currentUser.studentNameZh);
        const resp = await fetch(`/api/assignments/${assn.id}/submit`, {
          method: 'POST',
          body: formData,
        });
        if (resp.ok) {
          alert('Submission uploaded successfully.');
          openAssignmentPage(assn);
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Submission failed');
        }
      });
      uploadContainer.appendChild(fileInput);
      uploadContainer.appendChild(label);
      uploadContainer.appendChild(fileNameSpan);
      uploadContainer.appendChild(submitBtn);
      subSection.appendChild(uploadContainer);
    }
    // Grade info if graded
    if (mySub && mySub.graded) {
      const gradeDiv = document.createElement('div');
      gradeDiv.style.marginTop = '1rem';
      gradeDiv.innerHTML = `<strong>Grade:</strong> ${mySub.grade}<br/><strong>Comments:</strong> ${mySub.comments || '—'}`;
      if (mySub.feedbackPath) {
        const link = document.createElement('a');
        const relp = mySub.feedbackPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
        link.href = '/' + relp;
        link.textContent = 'Download Feedback';
        link.target = '_blank';
        gradeDiv.appendChild(document.createElement('br'));
        gradeDiv.appendChild(link);
      }
      subSection.appendChild(gradeDiv);
    }
    container.appendChild(subSection);
  }
  // Admin: show grade submissions list via button
  if (currentUser && currentUser.role === 'admin') {
    const gradeBtn = document.createElement('button');
    gradeBtn.className = 'primary-btn';
    gradeBtn.style.marginTop = '1rem';
    gradeBtn.textContent = 'Grade Submissions';
    gradeBtn.addEventListener('click', () => openGradeModal(assn));
    container.appendChild(gradeBtn);
  }
}

async function loadAnnouncements() {
  const res = await fetch('/api/announcements');
  const data = await res.json();
  const list = document.getElementById('announcementsList');
  list.innerHTML = '';
  if (!data.length) {
    const li = document.createElement('li');
    li.textContent = 'No announcements yet.';
    list.appendChild(li);
    return;
  }
  data.forEach((ann) => {
    const li = document.createElement('li');
    const title = document.createElement('h4');
    title.textContent = ann.title;
    const contentEl = document.createElement('div');
    // Parse Markdown into HTML
    contentEl.innerHTML = window.marked.parse(ann.content || '');
    // Render LaTeX in announcements
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(contentEl, { delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ] });
      } catch (err) {
        console.error('KaTeX rendering error:', err);
      }
    }
    const date = document.createElement('span');
    const d = new Date(ann.date);
    date.textContent = d.toLocaleString();
    date.style.fontSize = '0.75rem';
    date.style.color = '#6e6e73';
    li.appendChild(title);
    li.appendChild(contentEl);
    li.appendChild(date);
    list.appendChild(li);
  });
}

async function loadAssignments() {
  const res = await fetch('/api/assignments');
  const data = await res.json();
  const container = document.getElementById('assignmentsList');
  container.innerHTML = '';
  if (!data.length) {
    const p = document.createElement('p');
    p.textContent = 'No assignments have been posted yet.';
    container.appendChild(p);
    return;
  }
  // For each assignment create a card
  for (const assn of data) {
    const card = document.createElement('div');
    card.className = 'assignment-card';
    const title = document.createElement('h4');
    title.textContent = assn.title;
    const viewBtn = document.createElement('button');
    viewBtn.textContent = 'View Details';
    viewBtn.className = 'small-btn';
    viewBtn.style.marginLeft = '0.5rem';
    viewBtn.addEventListener('click', () => openAssignmentPage(assn));
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Due: ${new Date(assn.dueDate).toLocaleString()}`;
    const desc = document.createElement('div');
    desc.className = 'description';
    // Render Markdown and LaTeX into HTML.  Use marked for Markdown parsing and KaTeX for math.
    const rawDesc = assn.description || '';
    desc.innerHTML = window.marked.parse(rawDesc);
    // Render LaTeX within the description using KaTeX auto-render.  It will ignore non‑math portions.
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(desc, { delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
        ] });
      } catch (err) {
        console.error('KaTeX rendering error:', err);
      }
    }
    card.appendChild(title);
    card.appendChild(viewBtn);
    card.appendChild(meta);
    // If assignment has an associated PDF, provide a download link
    if (assn.pdfPath) {
      const pdfLink = document.createElement('a');
      // Construct relative URL by trimming everything before the uploads folder and normalising separators
      const relPath = assn.pdfPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
      pdfLink.href = '/' + relPath;
      pdfLink.textContent = 'Download Assignment (PDF)';
      pdfLink.className = 'pdf-link';
      pdfLink.style.display = 'block';
      pdfLink.target = '_blank';
      card.appendChild(pdfLink);
    }
    card.appendChild(desc);
    const actions = document.createElement('div');
    actions.className = 'actions';
    // Student submission status
    if (currentUser && currentUser.role === 'student' && currentUser.approved !== false) {
      // fetch submissions for this assignment filtered by student
      const resSub = await fetch(`/api/assignments/${assn.id}/submissions`);
      const subs = await resSub.json();
      const mySub = subs.find((s) => s.studentEmail === currentUser.email);
      const status = document.createElement('div');
      status.style.fontSize = '0.85rem';
      status.style.marginBottom = '0.5rem';
      if (mySub) {
        if (mySub.graded) {
          status.innerHTML = `<strong>Grade: ${mySub.grade}</strong><br/>Comments: ${mySub.comments || '—'}`;
          if (mySub.feedbackPath) {
            const link = document.createElement('a');
            const rel = mySub.feedbackPath.replace(/.*uploads\\/, 'uploads/').replace(/\\/g, '/');
            link.href = '/' + rel;
            link.textContent = 'Download Feedback';
            link.style.marginLeft = '0.5rem';
            link.target = '_blank';
            status.appendChild(document.createElement('br'));
            status.appendChild(link);
          }
        } else {
          status.textContent = `Submitted on ${new Date(mySub.uploadedAt).toLocaleString()}`;
        }
      } else {
        status.textContent = 'Not yet submitted';
      }
      card.appendChild(status);
      // If not graded, allow (re)submission using a custom upload UI
      if (!mySub || !mySub.graded) {
        // Container to group the file input, label and submit button
        const uploadContainer = document.createElement('div');
        uploadContainer.className = 'upload-container';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/pdf';
        // Assign a unique id for label association
        const inputId = `upload-${assn.id}-${Math.floor(Math.random() * 1000000)}`;
        fileInput.id = inputId;
        const label = document.createElement('label');
        label.className = 'upload-label';
        label.setAttribute('for', inputId);
        // Use Font Awesome icon for file upload
        label.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Choose PDF';
        const fileNameSpan = document.createElement('span');
        fileNameSpan.className = 'file-name';
        fileNameSpan.textContent = 'No file chosen';
        // Update displayed file name when selection changes
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length) {
            fileNameSpan.textContent = fileInput.files[0].name;
          } else {
            fileNameSpan.textContent = 'No file chosen';
          }
        });
        const submitBtn = document.createElement('button');
        submitBtn.className = 'primary-btn';
        submitBtn.textContent = mySub ? 'Replace' : 'Submit';
        submitBtn.addEventListener('click', async () => {
          if (!fileInput.files.length) {
            alert('Please select a PDF to submit.');
            return;
          }
          const formData = new FormData();
          formData.append('file', fileInput.files[0]);
          formData.append('studentName', currentUser.name);
          formData.append('studentEmail', currentUser.email);
          formData.append('studentID', currentUser.studentId);
          formData.append('studentNameZh', currentUser.studentNameZh);
          const resp = await fetch(`/api/assignments/${assn.id}/submit`, {
            method: 'POST',
            body: formData,
          });
          if (resp.ok) {
            alert('Submission uploaded successfully.');
            loadAssignments();
          } else {
            const msg = await resp.json();
            alert(msg.error || 'Submission failed');
          }
        });
        uploadContainer.appendChild(fileInput);
        uploadContainer.appendChild(label);
        uploadContainer.appendChild(fileNameSpan);
        uploadContainer.appendChild(submitBtn);
        actions.appendChild(uploadContainer);
      }
    } else if (currentUser && (currentUser.role === 'pendingStudent' || currentUser.approved === false)) {
      // Pending students cannot submit
      const msg = document.createElement('div');
      msg.className = 'guest-message';
      msg.style.fontSize = '0.85rem';
      msg.style.color = '#6e6e73';
      msg.textContent = 'Registration pending: you cannot submit assignments yet.';
      card.appendChild(msg);
    } else if (!currentUser) {
      // Guest: show message to log in to submit
      const msg = document.createElement('div');
      msg.className = 'guest-message';
      msg.style.fontSize = '0.85rem';
      msg.style.color = '#6e6e73';
      msg.textContent = 'Login to submit this assignment.';
      card.appendChild(msg);
    }
    // Admin actions
    if (currentUser && currentUser.role === 'admin') {
      const gradeBtn = document.createElement('button');
      gradeBtn.className = 'primary-btn';
      gradeBtn.textContent = 'Grade Submissions';
      gradeBtn.addEventListener('click', () => {
        openGradeModal(assn);
      });
      actions.appendChild(gradeBtn);
    }
    if (actions.children.length > 0) {
      card.appendChild(actions);
    }
    container.appendChild(card);
  }
}

async function loadResources() {
  const res = await fetch('/api/resources');
  const data = await res.json();
  const container = document.getElementById('resourcesList');
  container.innerHTML = '';
  if (!data.length) {
    const p = document.createElement('p');
    p.textContent = 'No resources available.';
    container.appendChild(p);
    return;
  }
  data.forEach((resItem) => {
    const div = document.createElement('div');
    div.className = 'resource-item';
    const title = document.createElement('h4');
    title.textContent = resItem.title;
    const link = document.createElement('a');
    const fileRel = resItem.filePath.replace(/.*uploads\//, 'uploads/');
    link.href = '/' + fileRel.replace(/\\/g, '/');
    link.textContent = 'Download';
    link.target = '_blank';
    div.appendChild(title);
    div.appendChild(link);
    container.appendChild(div);
  });
}

async function loadExams() {
  const res = await fetch('/api/exams');
  const data = await res.json();
  const container = document.getElementById('examsList');
  container.innerHTML = '';
  if (!data.length) {
    const p = document.createElement('p');
    p.textContent = 'No upcoming exams.';
    container.appendChild(p);
    return;
  }
  data.forEach((exam) => {
    const item = document.createElement('div');
    item.className = 'exam-item';
    const title = document.createElement('h4');
    title.textContent = exam.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Date: ${new Date(exam.date).toLocaleString()}`;
    const description = document.createElement('p');
    description.textContent = exam.description;
    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(description);
    container.appendChild(item);
  });
}

/**
 * Load grade statistics and display in the scores section. For both students and
 * administrators, this shows the average grade and number of graded
 * submissions for each assignment. Students do not see other students’
 * submissions but can compare their performance to the average. Admins
 * see the same table.
 */
async function loadScores() {
  const container = document.getElementById('scoresContent');
  if (!container) return;
  container.innerHTML = '';
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    if (!stats.length) {
      container.textContent = 'No assignments to display yet.';
      return;
    }
    const table = document.createElement('table');
    table.className = 'score-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    trh.innerHTML = '<th>Assignment</th><th>Average</th><th>Count</th>';
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    stats.forEach((item) => {
      const tr = document.createElement('tr');
      const avg = item.average !== null ? Number(item.average).toFixed(2) : 'N/A';
      tr.innerHTML = `<td>${item.title}</td><td>${avg}</td><td>${item.count}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } catch (err) {
    console.error('Failed to load scores', err);
    container.textContent = 'Failed to load grade statistics.';
  }
}

/**
 * Load private messages addressed to the current user and display them in the
 * messages section. Unread messages are highlighted. Clicking on a message
 * toggles the full content and marks it as read. Requires currentUser to be
 * defined.
 */
async function loadMessages() {
  const container = document.getElementById('messageList');
  if (!container || !currentUser) return;
  container.innerHTML = '';
  try {
    const res = await fetch(`/api/messages?email=${encodeURIComponent(currentUser.email)}`);
    if (!res.ok) {
      throw new Error('Failed');
    }
    const msgs = await res.json();
    if (!msgs.length) {
      container.textContent = 'No messages.';
      return;
    }
    msgs.sort((a, b) => new Date(b.date) - new Date(a.date));
    msgs.forEach((msg) => {
      const item = document.createElement('div');
      item.className = 'message-item';
      if (!msg.read) item.classList.add('unread');
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `From: ${msg.fromName} • ${new Date(msg.date).toLocaleString()}`;
      item.appendChild(meta);
      const subject = document.createElement('div');
      subject.style.fontWeight = '600';
      subject.textContent = msg.subject;
      item.appendChild(subject);
      const snippet = document.createElement('div');
      snippet.style.fontSize = '0.85rem';
      snippet.style.color = '#3a3a3c';
      snippet.textContent = msg.content.length > 100 ? msg.content.substring(0, 100) + '…' : msg.content;
      item.appendChild(snippet);
      item.addEventListener('click', async () => {
        // Toggle full content display
        const existing = item.querySelector('.full');
        if (existing) {
          existing.remove();
        } else {
          const full = document.createElement('div');
          full.className = 'full';
          full.style.marginTop = '0.5rem';
          full.style.borderTop = '1px solid #e5e5ea';
          full.style.paddingTop = '0.5rem';
          full.textContent = msg.content;
          item.appendChild(full);
          if (!msg.read) {
            // Mark as read on server
            await fetch(`/api/messages/${msg.id}/read`, { method: 'PUT' });
            msg.read = true;
            item.classList.remove('unread');
            loadNotifications();
          }
        }
      });
      container.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load messages', err);
    container.textContent = 'Failed to load messages.';
  }
}

/**
 * Load pending student registrations and render them with approve/reject buttons.
 */
async function loadPendingStudents() {
  const container = document.getElementById('pendingStudentsList');
  if (!container) return;
  if (!currentUser || currentUser.role !== 'admin') {
    container.innerHTML = '';
    return;
  }
  try {
    const res = await fetch('/api/students/pending');
    const list = await res.json();
    container.innerHTML = '';
    if (!list.length) {
      container.textContent = 'No pending registrations.';
      return;
    }
    list.forEach((s) => {
      const div = document.createElement('div');
      div.className = 'pending-student';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${s.name}</strong> (${s.studentId})<br/><small>${s.email} / ${s.studentNameZh}</small>`;
      const actions = document.createElement('div');
      const approveBtn = document.createElement('button');
      approveBtn.className = 'small-btn';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', async () => {
        if (!confirm('Approve this student?')) return;
        await fetch(`/api/students/${s.id}/approve`, { method: 'POST' });
        alert('Student approved');
        loadPendingStudents();
        loadStudentList();
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'small-btn';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', async () => {
        if (!confirm('Reject this student?')) return;
        await fetch(`/api/students/${s.id}/reject`, { method: 'POST' });
        alert('Student rejected');
        loadPendingStudents();
      });
      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      div.appendChild(info);
      div.appendChild(actions);
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load pending students', err);
    container.textContent = 'Failed to load pending registrations.';
  }
}

/**
 * Load muted students list into the admin panel. Shows currently muted
 * students. Admin can use the form below to mute/unmute additional students.
 */
async function loadStudentList() {
  const container = document.getElementById('studentsList');
  if (!container) return;
  if (!currentUser || currentUser.role !== 'admin') {
    container.innerHTML = '';
    return;
  }
  try {
    const res = await fetch('/api/students/muted');
    const muted = await res.json();
    container.innerHTML = '';
    if (!muted.length) {
      container.textContent = 'No muted students.';
      return;
    }
    muted.forEach((stu) => {
      const div = document.createElement('div');
      div.className = 'student-item';
      div.innerHTML = `<div><strong>${stu.name}</strong> (${stu.studentId})<br/><small>${stu.email}</small></div><div style="color:#ff3b30; font-size:0.85rem;">Muted</div>`;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load muted students', err);
    container.textContent = 'Failed to load student list.';
  }
}

async function loadDiscussions() {
  const res = await fetch('/api/forum');
  const threads = await res.json();
  const container = document.getElementById('discussionList');
  if (!container) return;
  container.innerHTML = '';
  if (!threads.length) {
    const p = document.createElement('p');
    p.textContent = 'No discussion threads yet.';
    container.appendChild(p);
    return;
  }
  threads.forEach((th) => {
    const card = document.createElement('div');
    card.className = 'thread-card';
    const title = document.createElement('h4');
    title.textContent = th.title;
    const meta = document.createElement('div');
    meta.className = 'meta';
    const d = new Date(th.date);
    // Build author string with TA label when applicable
    let authorHTML = th.authorName;
    if (th.authorRole === 'admin') {
      authorHTML += ' <span class="author-label">TA</span>';
    }
    meta.innerHTML = `${authorHTML} • ${d.toLocaleString()} • ${th.commentCount} comments`;
    if (th.archived) {
      const archivedLabel = document.createElement('span');
      archivedLabel.textContent = 'Archived';
      archivedLabel.className = 'archived-label';
      archivedLabel.style.marginLeft = '0.5rem';
      meta.appendChild(archivedLabel);
    }
    card.appendChild(title);
    card.appendChild(meta);
    card.addEventListener('click', () => {
      openThreadPage(th.id);
    });
    container.appendChild(card);
  });
}

async function openThreadModal(threadId) {
  const res = await fetch(`/api/forum/${threadId}`);
  if (!res.ok) {
    alert('Thread not found');
    return;
  }
  const thread = await res.json();
  const modal = document.getElementById('threadModal');
  const content = document.getElementById('threadModalContent');
  content.innerHTML = '';
  // Header with close button
  const header = document.createElement('div');
  header.className = 'modal-header';
  const hTitle = document.createElement('h3');
  hTitle.textContent = thread.title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  header.appendChild(hTitle);
  header.appendChild(closeBtn);
  content.appendChild(header);
  // Author and date
  const meta = document.createElement('div');
  meta.className = 'meta';
  const d = new Date(thread.date);
  // Construct author string with TA label when applicable
  let authorHTML = thread.authorName;
  if (thread.authorRole === 'admin') {
    authorHTML += ' <span class="author-label">TA</span>';
  }
  meta.innerHTML = `${authorHTML} • ${d.toLocaleString()}`;
  if (thread.archived) {
    const arch = document.createElement('span');
    arch.textContent = ' (Archived)';
    arch.style.color = '#ff3b30';
    meta.appendChild(arch);
  }
  content.appendChild(meta);
  // Content body parsed
  const body = document.createElement('div');
  body.className = 'thread-body';
  body.innerHTML = window.marked.parse(thread.content || '');
  if (typeof window.renderMathInElement === 'function') {
    try {
      window.renderMathInElement(body, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
    } catch (err) {
      console.error(err);
    }
  }
  content.appendChild(body);
  // Comments section
  const commentsContainer = document.createElement('div');
  commentsContainer.className = 'comments-container';
  commentsContainer.style.marginTop = '1rem';
  const commentsHeader = document.createElement('h4');
  commentsHeader.textContent = 'Comments';
  commentsContainer.appendChild(commentsHeader);
  if (thread.comments.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No comments yet.';
    commentsContainer.appendChild(p);
  } else {
    thread.comments.forEach((c) => {
      const div = document.createElement('div');
      div.className = 'comment-item';
      const authorLine = document.createElement('div');
      authorLine.style.fontSize = '0.85rem';
      authorLine.style.color = '#6e6e73';
      const dc = new Date(c.date);
      // Build author name with TA label for admin authors
      let authHTML = c.authorName;
      if (c.authorRole === 'admin') {
        authHTML += ' <span class="author-label">TA</span>';
      }
      authorLine.innerHTML = `${authHTML} • ${dc.toLocaleString()}`;
      div.appendChild(authorLine);
      const cBody = document.createElement('div');
      cBody.innerHTML = window.marked.parse(c.content || '');
      if (typeof window.renderMathInElement === 'function') {
        try {
          window.renderMathInElement(cBody, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
        } catch (err) {
          console.error(err);
        }
      }
      div.appendChild(cBody);
      // Admin delete comment
      if (currentUser && currentUser.role === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'small-btn';
        delBtn.style.marginLeft = '0.5rem';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this comment?')) return;
          const resp = await fetch(`/api/forum/${thread.id}/comments/${c.id}`, { method: 'DELETE' });
          if (resp.ok) {
            openThreadModal(thread.id);
          } else {
            const msg = await resp.json();
            alert(msg.error || 'Failed to delete');
          }
        });
        div.appendChild(delBtn);
      }
      commentsContainer.appendChild(div);
    });
  }
  content.appendChild(commentsContainer);
  // Comment form if logged in
  if (currentUser) {
    const form = document.createElement('div');
    form.className = 'comment-form';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Add a comment...';
    textarea.rows = 3;
    textarea.style.width = '100%';
    const submit = document.createElement('button');
    submit.textContent = 'Post Comment';
    submit.className = 'primary-btn';
    submit.style.marginTop = '0.5rem';
    submit.addEventListener('click', async () => {
      const contentValue = textarea.value.trim();
      if (!contentValue) return;
      const resp = await fetch(`/api/forum/${thread.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: contentValue,
          authorName: currentUser.name,
          authorEmail: currentUser.email,
          authorRole: currentUser.role,
        }),
      });
      if (resp.ok) {
        textarea.value = '';
        openThreadModal(thread.id);
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to post comment');
      }
    });
    form.appendChild(textarea);
    form.appendChild(submit);
    content.appendChild(form);
  } else {
    const loginMsg = document.createElement('div');
    loginMsg.style.marginTop = '1rem';
    loginMsg.style.fontSize = '0.85rem';
    loginMsg.style.color = '#6e6e73';
    loginMsg.textContent = 'Login to post a comment.';
    content.appendChild(loginMsg);
  }
  // Admin actions (archive/unarchive, delete thread)
  if (currentUser && currentUser.role === 'admin') {
    const adminActions = document.createElement('div');
    adminActions.style.marginTop = '1rem';
    const archiveBtn = document.createElement('button');
    archiveBtn.className = 'secondary-btn';
    archiveBtn.textContent = thread.archived ? 'Unarchive Thread' : 'Archive Thread';
    archiveBtn.addEventListener('click', async () => {
      const resp = await fetch(`/api/forum/${thread.id}/archive`, { method: 'POST' });
      if (resp.ok) {
        loadDiscussions();
        loadAdminThreads();
        openThreadModal(thread.id);
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to update');
      }
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'secondary-btn';
    deleteBtn.textContent = 'Delete Thread';
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this thread?')) return;
      const resp = await fetch(`/api/forum/${thread.id}`, { method: 'DELETE' });
      if (resp.ok) {
        modal.classList.add('hidden');
        loadDiscussions();
        loadAdminThreads();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to delete thread');
      }
    });
    adminActions.appendChild(archiveBtn);
    adminActions.appendChild(deleteBtn);
    content.appendChild(adminActions);
  }
  modal.classList.remove('hidden');
}

async function loadAdminThreads() {
  const adminList = document.getElementById('adminThreadList');
  if (!adminList) return;
  const res = await fetch('/api/forum?includeArchived=true');
  const threads = await res.json();
  adminList.innerHTML = '';
  if (!threads.length) {
    const p = document.createElement('p');
    p.textContent = 'No threads.';
    adminList.appendChild(p);
    return;
  }
  threads.forEach((th) => {
    const row = document.createElement('div');
    row.className = 'admin-thread-row';
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '0.5rem 0';
    if (th.archived) {
      row.style.opacity = 0.6;
    }
    const info = document.createElement('div');
    info.innerHTML = `<strong>${th.title}</strong> <span style="font-size:0.8rem;color:#6e6e73;">(${new Date(th.date).toLocaleString()})</span> - ${th.commentCount} comments`;
    row.appendChild(info);
    const actions = document.createElement('div');
    const archive = document.createElement('button');
    archive.className = 'small-btn';
    archive.textContent = th.archived ? 'Unarchive' : 'Archive';
    archive.addEventListener('click', async () => {
      const resp = await fetch(`/api/forum/${th.id}/archive`, { method: 'POST' });
      if (resp.ok) {
        loadDiscussions();
        loadAdminThreads();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed');
      }
    });
    const del = document.createElement('button');
    del.className = 'small-btn';
    del.textContent = 'Delete';
    del.style.marginLeft = '0.5rem';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this thread?')) return;
      const resp = await fetch(`/api/forum/${th.id}`, { method: 'DELETE' });
      if (resp.ok) {
        loadDiscussions();
        loadAdminThreads();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to delete');
      }
    });
    const openBtn = document.createElement('button');
    openBtn.className = 'small-btn';
    openBtn.textContent = 'Open';
    openBtn.style.marginLeft = '0.5rem';
    openBtn.addEventListener('click', () => openThreadPage(th.id));
    actions.appendChild(openBtn);
    actions.appendChild(archive);
    actions.appendChild(del);
    row.appendChild(actions);
    adminList.appendChild(row);
  });
}

async function openGradeModal(assignment) {
  const modal = document.getElementById('gradeModal');
  const content = document.getElementById('gradeModalContent');
  content.innerHTML = '';
  modal.classList.remove('hidden');
  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h = document.createElement('h3');
  h.textContent = `Grade – ${assignment.title}`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  header.appendChild(h);
  header.appendChild(closeBtn);
  content.appendChild(header);
  // Fetch submissions
  const res = await fetch(`/api/assignments/${assignment.id}/submissions`);
  const subs = await res.json();
  if (!subs.length) {
    const p = document.createElement('p');
    p.textContent = 'No submissions yet.';
    content.appendChild(p);
    return;
  }
  subs.forEach((sub) => {
    const div = document.createElement('div');
    div.style.marginBottom = '1rem';
    div.style.padding = '0.5rem';
    div.style.backgroundColor = '#f9f9fa';
    div.style.borderRadius = '8px';
    const info = document.createElement('div');
    // Show student name, ID and Chinese name when available
    let extra = '';
    if (sub.studentID) extra += ` (ID: ${sub.studentID})`;
    if (sub.studentNameZh) extra += ` ${sub.studentNameZh}`;
    info.innerHTML = `<strong>${sub.studentName}${extra}</strong> &lt;${sub.studentEmail}&gt;`;
    div.appendChild(info);
    const meta = document.createElement('div');
    meta.style.fontSize = '0.8rem';
    meta.style.color = '#6e6e73';
    meta.textContent = `Submitted: ${new Date(sub.uploadedAt).toLocaleString()}`;
    div.appendChild(meta);
    if (sub.graded) {
      const gradeInfo = document.createElement('div');
      gradeInfo.style.marginTop = '0.25rem';
      gradeInfo.innerHTML = `<strong>Grade:</strong> ${sub.grade}<br/><strong>Comments:</strong> ${sub.comments || '—'}`;
      if (sub.feedbackPath) {
        const link = document.createElement('a');
        const rel = sub.feedbackPath.replace(/.*uploads\\/, 'uploads/').replace(/\\/g, '/');
        link.href = '/' + rel;
        link.textContent = 'Download Feedback';
        link.target = '_blank';
        gradeInfo.appendChild(document.createElement('br'));
        gradeInfo.appendChild(link);
      }
      div.appendChild(gradeInfo);
      const regradeBtn = document.createElement('button');
      regradeBtn.className = 'primary-btn';
      regradeBtn.textContent = 'Regrade';
      regradeBtn.addEventListener('click', () => {
        openGradingInterface(assignment, sub);
      });
      div.appendChild(regradeBtn);
    } else {
      const gradeBtn = document.createElement('button');
      gradeBtn.className = 'primary-btn';
      gradeBtn.textContent = 'Grade';
      gradeBtn.addEventListener('click', () => {
        openGradingInterface(assignment, sub);
      });
      div.appendChild(gradeBtn);
    }
    content.appendChild(div);
  });
}

function openGradingInterface(assignment, submission) {
  const modal = document.getElementById('gradeModal');
  const content = document.getElementById('gradeModalContent');
  content.innerHTML = '';
  // Header with close button
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h = document.createElement('h3');
  h.textContent = `Grading – ${submission.studentName}`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  header.appendChild(h);
  header.appendChild(closeBtn);
  content.appendChild(header);
  // PDF viewer and controls using pdf.js for multi‑page and zoom support
  // Controls container for pagination and zoom
  const controls = document.createElement('div');
  controls.className = 'pdf-viewer-controls';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Prev';
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '–';
  const zoomInBtn = document.createElement('button');
  zoomInBtn.textContent = '+';
  const pageInfo = document.createElement('span');
  pageInfo.className = 'page-info';
  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(zoomOutBtn);
  controls.appendChild(zoomInBtn);
  controls.appendChild(pageInfo);
  content.appendChild(controls);
  // Container for PDF rendering
  const pdfContainer = document.createElement('div');
  pdfContainer.className = 'pdf-container';
  // Canvas for PDF page
  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.id = 'pdfCanvas';
  // Canvas for annotations (overlay)
  const annotationCanvas = document.createElement('canvas');
  annotationCanvas.className = 'pdf-annotation-canvas';
  pdfContainer.appendChild(pdfCanvas);
  pdfContainer.appendChild(annotationCanvas);
  content.appendChild(pdfContainer);
  // Setup drawing on annotation canvas
  setupDrawing(annotationCanvas);
  let pdfDoc = null;
  let currentPage = 1;
  let scale = 1.0;
  // Render a specific page
  function renderPage(num) {
    if (!pdfDoc) return;
    pdfDoc.getPage(num).then((page) => {
      const viewport = page.getViewport({ scale });
      const ctx = pdfCanvas.getContext('2d');
      pdfCanvas.height = viewport.height;
      pdfCanvas.width = viewport.width;
      pdfContainer.style.height = viewport.height + 'px';
      // Render PDF page
      page.render({ canvasContext: ctx, viewport });
      // Match annotation canvas dimensions
      annotationCanvas.width = viewport.width;
      annotationCanvas.height = viewport.height;
      const aCtx = annotationCanvas.getContext('2d');
      aCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
      pageInfo.textContent = `Page ${currentPage} / ${pdfDoc.numPages}`;
    });
  }
  // Load the PDF document via pdf.js
  function loadDocument() {
    let fileUrl = submission.filePath;
    fileUrl = fileUrl.replace(/.*uploads\//, 'uploads/').replace(/\\/g, '/');
    const url = '/' + fileUrl;
    pdfjsLib.getDocument(url).promise.then((doc) => {
      pdfDoc = doc;
      currentPage = 1;
      scale = 1.0;
      renderPage(currentPage);
    });
  }
  // Navigation controls
  prevBtn.addEventListener('click', () => {
    if (!pdfDoc || currentPage <= 1) return;
    currentPage--;
    renderPage(currentPage);
  });
  nextBtn.addEventListener('click', () => {
    if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
    currentPage++;
    renderPage(currentPage);
  });
  zoomOutBtn.addEventListener('click', () => {
    if (scale > 0.5) {
      scale = Math.max(0.5, parseFloat((scale - 0.1).toFixed(2)));
      renderPage(currentPage);
    }
  });
  zoomInBtn.addEventListener('click', () => {
    if (scale < 2.5) {
      scale = Math.min(2.5, parseFloat((scale + 0.1).toFixed(2)));
      renderPage(currentPage);
    }
  });
  // Initialize pdf.js worker and load document
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    loadDocument();
  }
  // Grade form
  const form = document.createElement('div');
  form.className = 'grade-form';
  const gradeLabel = document.createElement('label');
  gradeLabel.textContent = 'Grade (score):';
  const gradeInput = document.createElement('input');
  gradeInput.type = 'number';
  gradeInput.min = '0';
  gradeInput.max = '100';
  gradeInput.value = submission.grade || '';
  const commentLabel = document.createElement('label');
  commentLabel.textContent = 'Comments:';
  const commentInput = document.createElement('textarea');
  commentInput.value = submission.comments || '';
  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear Annotations';
  clearBtn.type = 'button';
  clearBtn.className = 'primary-btn';
  clearBtn.style.backgroundColor = '#ff3b30';
  clearBtn.style.marginTop = '0.5rem';
  clearBtn.addEventListener('click', () => {
    const ctx = annotationCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  });
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Submit Grade';
  submitBtn.className = 'primary-btn';
  submitBtn.addEventListener('click', async () => {
    const gradeValue = gradeInput.value;
    const comments = commentInput.value;
    // Convert annotation canvas to blob
    annotationCanvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('grade', gradeValue);
      formData.append('comments', comments);
      if (blob && blob.size > 0) {
        formData.append('annotation', blob, 'annotation.png');
      }
      const resp = await fetch(`/api/assignments/${assignment.id}/submissions/${submission.id}/grade`, {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        alert('Grade submitted');
        modal.classList.add('hidden');
        loadAssignments();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to submit grade');
      }
    });
  });
  form.appendChild(gradeLabel);
  form.appendChild(gradeInput);
  form.appendChild(commentLabel);
  form.appendChild(commentInput);
  form.appendChild(clearBtn);
  form.appendChild(submitBtn);
  content.appendChild(form);
}

function setupDrawing(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
  let drawing = false;
  let lastX = 0;
  let lastY = 0;
  const getOffset = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x: (x / rect.width) * canvas.width, y: (y / rect.height) * canvas.height };
  };
  const start = (e) => {
    drawing = true;
    const pos = getOffset(e);
    lastX = pos.x;
    lastY = pos.y;
  };
  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const pos = getOffset(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  };
  const end = () => {
    drawing = false;
  };
  // Mouse events
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseout', end);
  // Touch events for mobile
  canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    start(touch);
  });
  canvas.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    draw(touch);
  });
  canvas.addEventListener('touchend', end);
}