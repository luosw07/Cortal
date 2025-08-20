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

// In‑memory user session (persisted in localStorage); if null, user is guest.
let currentUser = null;

// JWT token for authenticated requests
let authToken = null;

// Track the current chat conversation partner email for private messaging
let currentConversation = null;

// Store reset token if the user navigates via the reset link. Populated during
// DOMContentLoaded parsing of the URL fragment.
let resetToken = null;

// Override default alert with SweetAlert2 for consistent styling. If Swal is not
// available, fall back to the built‑in alert.
if (typeof Swal !== 'undefined') {
  window.alert = (msg) => {
    Swal.fire({ text: String(msg), icon: 'info', confirmButtonColor: '#007aff' });
  };
  // We deliberately do not override window.confirm because many existing
  // code paths rely on synchronous behaviour. SweetAlert2 confirmations
  // are asynchronous and would require refactoring every usage. If desired,
  // individual confirm dialogs can be replaced with Swal.fire calls.
  /**
   * Show a confirmation dialog using SweetAlert2. Returns a promise that
   * resolves to true if the user confirms, false if cancelled. Falls back
   * to native confirm() if SweetAlert2 is unavailable.
   *
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  window.sweetConfirm = async (message) => {
    if (typeof Swal === 'undefined') {
      return confirm(message);
    }
    const result = await Swal.fire({
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'OK',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#007aff',
    });
    return !!result.isConfirmed;
  };
}

/**
 * Helper to construct Authorization headers when a JWT token is present. Use
 * this in conjunction with fetchAuth() when calling protected API routes.
 */
function authHeaders() {
  const token = authToken || localStorage.getItem('courseToken');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/**
 * Wrapper around fetch() which automatically merges Authorization header if
 * a token is available. Accepts the same parameters as fetch().
 *
 * @param {string} url
 * @param {object} options
 */
function fetchAuth(url, options = {}) {
  const headers = Object.assign({}, options.headers || {}, authHeaders());
  return fetch(url, Object.assign({}, options, { headers }));
}

/**
 * Client-side grade band mapping consistent with server-side gradeBand. Takes a
 * numeric score and returns an object with a label and colour code. This
 * function mirrors the server’s definition for categories A+, A, A-, B, C, D,
 * Failed.
 *
 * @param {number} score
 */
function gradeBandClient(score) {
  const s = Number(score);
  if (s >= 95) return { label: 'A+', color: '#34C759' };
  if (s >= 90) return { label: 'A', color: '#30B158' };
  if (s >= 85) return { label: 'A-', color: '#28A745' };
  if (s >= 80) return { label: 'B', color: '#5AC8FA' };
  if (s >= 70) return { label: 'C', color: '#FFCC00' };
  if (s >= 60) return { label: 'D', color: '#FF9F0A' };
  return { label: 'Failed', color: '#FF3B30' };
}

/**
 * Render a horizontal gauge representing a score. The gauge fills proportionally
 * to the numeric score (0–100) and displays the grade band label with the
 * appropriate colour. Returns a DOM element.
 *
 * @param {number|null} score
 */
function renderGauge(score) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '0.5rem';
  wrapper.style.marginBottom = '0.5rem';
  // Limit the gauge width so that it doesn't span the entire card width. This
  // helps maintain a balanced layout on assignment cards. The wrapper will
  // expand only up to 80% of the parent container.
  // Constrain the gauge wrapper to a reasonable width. Without this, the bar
  // can stretch across the entire card, pushing other elements off screen.
  // Limiting the width ensures the gauge sits neatly above buttons and text.
  wrapper.style.width = '70%';
  wrapper.style.maxWidth = '70%';
  if (score == null) {
    const span = document.createElement('span');
    span.textContent = 'No grades yet';
    wrapper.appendChild(span);
    return wrapper;
  }
  const info = gradeBandClient(score);
  const bar = document.createElement('div');
  // Constrain the bar width so that the gauge does not stretch across the entire card.
  // Instead of flex:1 which makes it fill all available horizontal space, set a
  // maximum width so the grade label sits closer to the gauge. This helps
  // align the gauge within assignment cards and prevents layout overflow.
  // Allow the bar to grow within the wrapper but not exceed 70% of its space.
  bar.style.flex = '0 1 100%';
  bar.style.maxWidth = '100%';
  bar.style.background = '#e5e5ea';
  bar.style.height = '10px';
  bar.style.borderRadius = '999px';
  const fill = document.createElement('div');
  fill.style.height = '10px';
  fill.style.borderRadius = '999px';
  fill.style.background = info.color;
  fill.style.width = Math.min(Math.max(score, 0), 100) + '%';
  bar.appendChild(fill);
  // Limit the gauge width so it doesn’t span the entire card. The bar
  // occupies at most 70% of the horizontal space and will shrink on
  // smaller screens. The remainder of the space is reserved for the label.
  bar.style.flex = '0 0 70%';
  const label = document.createElement('span');
  label.textContent = `${info.label} (${Number(score).toFixed(2)})`;
  label.style.color = info.color;
  label.style.fontWeight = '600';
  wrapper.appendChild(bar);
  wrapper.appendChild(label);
  return wrapper;
}

/**
 * Load overall grade statistics for the current user and update the home page
 * dashboard. Called after login/registration. Hides the card if no grades.
 */
async function loadMyOverall() {
  const card = document.getElementById('homeOverall');
  if (!card) return;
  // Hide the overall grade card for admins
  if (currentUser && currentUser.role !== 'student') {
    card.style.display = 'none';
    return;
  }
  try {
    const resp = await fetchAuth('/api/grades/overall');
    const data = await resp.json();
    card.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'My Overall Grade';
    card.appendChild(title);
    if (data.avg == null) {
      const msg = document.createElement('p');
      msg.textContent = 'No graded submissions yet.';
      card.appendChild(msg);
      card.style.display = 'block';
      return;
    }
    card.appendChild(renderGauge(data.avg));
    const details = document.createElement('p');
    details.style.fontSize = '0.85rem';
    details.textContent = `Graded assignments: ${data.count}`;
    card.appendChild(details);
    card.style.display = 'block';
  } catch (e) {
    console.error('Failed to load overall grade', e);
  }
}

// Setup event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Configure pdf.js for CJK (Chinese/Japanese/Korean) support. Setting cMapUrl,
  // cMapPacked and standardFontDataUrl ensures fonts render correctly for
  // documents with non‑Latin characters. If pdfjsLib is available, apply
  // these options globally. WorkerSrc should already be configured when
  // loading the library.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    pdfjsLib.GlobalWorkerOptions.cMapUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/';
    pdfjsLib.GlobalWorkerOptions.cMapPacked = true;
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/';
  }
  // Restore user and token from localStorage if available
  const storedUser = localStorage.getItem('courseUser');
  const storedToken = localStorage.getItem('courseToken');
  if (storedUser && storedToken) {
    currentUser = JSON.parse(storedUser);
    authToken = storedToken;
    initForLoggedInUser();
  } else {
    initForGuest();
  }

  // Handle password reset link: if the URL hash contains a reset token
  // e.g. #reset?email=xxx@yyy.com&token=abcdef, we pre‑populate the reset
  // password form and navigate to the reset password section. This runs
  // regardless of login state so that a user can reset their password
  // without being logged in. After reset, the user can log in normally.
  try {
    const hash = window.location.hash || '';
    if (hash.startsWith('#reset')) {
      const params = new URLSearchParams(hash.replace(/^#reset\??/, ''));
      const email = params.get('email');
      const token = params.get('token');
      if (email && token) {
        // Fill form fields
        const emailInput = document.getElementById('resetPasswordEmail');
        const tokenInput = document.getElementById('resetTokenInput');
        if (emailInput) emailInput.value = email;
        if (tokenInput) tokenInput.value = token;
        // Navigate to reset password section exclusively
        showSection('reset-password-section');
        setActiveNav(null);
      }
    }
  } catch (err) {
    console.error('Failed to parse reset token from URL', err);
  }

  // Attach navigation handler for all nav buttons
  $$('.nav-links button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      // Always hide the notifications dropdown when switching sections
      const panel = document.getElementById('notificationPanel');
      if (panel) panel.classList.add('hidden');
      showSection(section + '-section');
      setActiveNav(btn);
      // Load additional content when navigating to specific sections
      if (section === 'home') {
        // Refresh home panels when navigating back
        loadAnnouncements();
        loadHomeAssignments();
        loadHomeThreads();
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

  // Load overall grade dashboard if logged in
  if (currentUser) {
    loadMyOverall();
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
      const resp = await fetchAuth('/api/forum', {
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
        const resp = await fetchAuth('/api/messages', {
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

  // Chat: start new conversation
  const startConversationForm = document.getElementById('startConversationForm');
  if (startConversationForm) {
    startConversationForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!currentUser) {
        alert('Please login to start a conversation.');
        return;
      }
      const email = document.getElementById('newConversationEmail').value.trim();
      if (!email) return;
      currentConversation = email;
      document.getElementById('newConversationEmail').value = '';
      // Render a blank conversation; messages will load when refreshed
      renderConversation(email, []);
    });
  }

  // Chat: send message in conversation
  const chatInputForm = document.getElementById('chatInputForm');
  if (chatInputForm) {
    chatInputForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentUser) {
        alert('Please login to send a message.');
        return;
      }
      if (!currentConversation) {
        alert('Please select or start a conversation.');
        return;
      }
      const textarea = document.getElementById('chatInput');
      const content = textarea.value.trim();
      if (!content) return;
      try {
        const body = {
          fromName: currentUser.name,
          fromEmail: currentUser.email,
          toEmail: currentConversation,
          subject: '',
          content,
        };
        const resp = await fetchAuth('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) {
          textarea.value = '';
          await loadMessages();
          // After reload, conversation will re-render with new message
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to send message');
        }
      } catch (err) {
        console.error('Send message error', err);
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
      const ok = await sweetConfirm('Mute this student? They will be unable to post or submit.');
      if (!ok) return;
      await fetchAuth(`/api/students/${encodeURIComponent(sid)}/mute`, { method: 'POST' });
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
      const ok2 = await sweetConfirm('Unmute this student?');
      if (!ok2) return;
      await fetchAuth(`/api/students/${encodeURIComponent(sid)}/unmute`, { method: 'POST' });
      alert('Student unmuted');
      loadStudentList();
    });
  }


  // TA invitation code settings (admin panel)
  const inviteForm = document.getElementById('inviteCodeForm');
  if (inviteForm) {
    inviteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newCode = document.getElementById('taCodeInput').value.trim();
      if (!newCode) {
        alert('Please enter a code');
        return;
      }
      try {
        const resp = await fetchAuth('/api/taCode', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: newCode }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert(data.error || 'Failed to update TA code');
          return;
        }
        // Also update locally for convenience
        localStorage.setItem('taInvitationCode', newCode);
        document.getElementById('currentTaCode').textContent = newCode;
        document.getElementById('taCodeInput').value = '';
        alert('TA invitation code updated');
      } catch (err) {
        console.error('Update TA code error', err);
        alert('An error occurred while updating TA code');
      }
    });
  }

  // Admin forms submissions
  document.getElementById('adminAnnouncementForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#adminAnnouncementTitle').value.trim();
    const content = $('#adminAnnouncementContent').value.trim();
    if (!title || !content) return;
    await fetchAuth('/api/announcements', {
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
    await fetchAuth('/api/assignments', {
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
    await fetchAuth('/api/resources', {
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
    await fetchAuth('/api/exams', {
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
    await fetchAuth('/api/courseInfo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ info }),
    });
    alert('Course information updated');
    loadCourseInfo();
  });

  // Export grades (CSV) button for admins. Download a CSV of all submissions.
  const exportGradesBtn = document.getElementById('exportGradesBtn');
  if (exportGradesBtn) {
    exportGradesBtn.addEventListener('click', async () => {
      try {
        const resp = await fetchAuth('/api/export/grades');
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          alert(err.error || 'Failed to export grades');
          return;
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'grades.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export grades error', err);
        alert('Failed to export grades');
      }
    });
  }

  // Toggle between login and register views for guests
  const showRegisterLink = document.getElementById('showRegisterLink');
  if (showRegisterLink) {
    showRegisterLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('register-section').classList.remove('hidden');
      // Hide any reset sections when showing register
      const reqSec = document.getElementById('reset-request-section');
      const resetSec = document.getElementById('reset-password-section');
      if (reqSec) reqSec.classList.add('hidden');
      if (resetSec) resetSec.classList.add('hidden');
    });
  }
  const showLoginLink = document.getElementById('showLoginLink');
  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-section').classList.add('hidden');
      document.getElementById('login-section').classList.remove('hidden');
      // Hide reset sections when showing login
      const reqSec = document.getElementById('reset-request-section');
      const resetSec = document.getElementById('reset-password-section');
      if (reqSec) reqSec.classList.add('hidden');
      if (resetSec) resetSec.classList.add('hidden');
    });
  }

  // Forgot password / reset navigation
  const showResetRequestLink = document.getElementById('showResetRequestLink');
  if (showResetRequestLink) {
    showResetRequestLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate exclusively to the reset request page. This hides other pages
      // including login/register and home. We clear nav highlight.
      showSection('reset-request-section');
      setActiveNav(null);
    });
  }
  const showResetLink = document.getElementById('showResetLink');
  if (showResetLink) {
    showResetLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate exclusively to the reset password form page
      showSection('reset-password-section');
      setActiveNav(null);
    });
  }
  // Back links for reset pages
  const backReq = document.getElementById('backToLoginFromResetRequest');
  if (backReq) {
    backReq.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate back to the login page exclusively
      showSection('login-section');
      setActiveNav(null);
    });
  }
  const backReset = document.getElementById('backToLoginFromReset');
  if (backReset) {
    backReset.addEventListener('click', (e) => {
      e.preventDefault();
      // Navigate back to the login page exclusively
      showSection('login-section');
      setActiveNav(null);
    });
  }

  // Registration form submission
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const role = document.getElementById('regRole').value;
      const studentId = document.getElementById('regStudentId').value.trim();
      const studentNameZh = document.getElementById('regStudentNameZh').value.trim();
      const inviteCode = document.getElementById('regInvite').value.trim();
      if (!name || !email || !password) {
        alert('Please complete all required fields');
        return;
      }
      if (role === 'student' && (!studentId || !studentNameZh)) {
        alert('Please provide your student ID and Chinese name');
        return;
      }
      try {
        const body = { name, email, password, role, studentId, studentNameZh, inviteCode };
        const resp = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert(data.error || 'Registration failed');
          return;
        }
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('courseToken', authToken);
        localStorage.setItem('courseUser', JSON.stringify(currentUser));
        alert('Registration successful');
        initForLoggedInUser();
      } catch (err) {
        console.error('Registration error', err);
        alert('An error occurred during registration');
      }
    });
  }

  // Password reset request form
  const resetRequestForm = document.getElementById('resetRequestForm');
  if (resetRequestForm) {
    resetRequestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resetRequestEmail').value.trim();
      if (!email) {
        alert('Please enter your email');
        return;
      }
      try {
        const resp = await fetch('/api/auth/requestReset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await resp.json();
        if (resp.ok) {
          alert('If the email exists, a reset link has been sent. Please check your inbox.');
          resetRequestForm.reset();
        } else {
          alert(data.error || 'Failed to request password reset');
        }
      } catch (err) {
        console.error('Password reset request error', err);
        alert('Request failed');
      }
    });
  }

  // Password reset form (after approval)
  const resetPasswordForm = document.getElementById('resetPasswordForm');
  if (resetPasswordForm) {
    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resetPasswordEmail').value.trim();
      const newPass = document.getElementById('newPassword').value;
      const token = document.getElementById('resetTokenInput')?.value.trim();
      if (!email || !newPass || !token) {
        alert('Please enter your email, token and new password');
        return;
      }
      try {
        const resp = await fetch('/api/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword: newPass }),
        });
        const data = await resp.json();
        if (resp.ok) {
          alert('Password reset successfully. Please log in with your new password.');
          // Redirect to login page after reset
          showSection('login-section');
          setActiveNav(null);
          // Clear the URL hash so the token isn't reused
          if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
          }
        } else {
          alert(data.error || 'Failed to reset password');
        }
      } catch (err) {
        console.error('Reset password error', err);
        alert('Reset failed');
      }
    });
  }

  // Login form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      if (!email || !password) {
        alert('Please enter your email and password');
        return;
      }
      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert(data.error || 'Login failed');
          return;
        }
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('courseToken', authToken);
        localStorage.setItem('courseUser', JSON.stringify(currentUser));
        initForLoggedInUser();
      } catch (err) {
        console.error('Login error', err);
        alert('An error occurred during login');
      }
    });
  }

  // Admin navigation: toggle between subsections when admin clicks a tab
  const adminNavButtons = document.querySelectorAll('.admin-nav button');
  if (adminNavButtons.length) {
    adminNavButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        // Highlight active
        adminNavButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-admin-section');
        // Hide all admin subsections
        document.querySelectorAll('.admin-subsection').forEach((sec) => sec.classList.add('hidden'));
        // Show selected subsection
        const activeSec = document.getElementById('admin-' + target);
        if (activeSec) {
          activeSec.classList.remove('hidden');
        }
        // Load specific admin data when navigating
        if (target === 'resets') {
          loadResetRequests();
        } else if (target === 'taCode') {
          loadTaCode();
        } else if (target === 'discussions') {
          loadAdminThreads();
        } else if (target === 'students') {
          loadPendingStudents();
          loadStudentList();
        }
      });
    });
    // Set initial active section to info
    const defaultBtn = document.querySelector('.admin-nav button[data-admin-section="info"]');
    if (defaultBtn) {
      defaultBtn.classList.add('active');
      document.querySelectorAll('.admin-subsection').forEach((sec) => sec.classList.add('hidden'));
      const initialSec = document.getElementById('admin-info');
      if (initialSec) initialSec.classList.remove('hidden');
    }
  }

  // Register role change: toggle student/admin fields
  const regRoleSelect = document.getElementById('regRole');
  if (regRoleSelect) {
    regRoleSelect.addEventListener('change', () => {
      const role = regRoleSelect.value;
      if (role === 'student') {
        document.getElementById('regStudentFields').style.display = 'block';
        document.getElementById('regTaField').classList.add('hidden');
      } else {
        document.getElementById('regStudentFields').style.display = 'none';
        document.getElementById('regTaField').classList.remove('hidden');
      }
    });
  }
});

function initForLoggedInUser() {
  // Hide login and register sections
  const loginSec = document.getElementById('login-section');
  const registerSec = document.getElementById('register-section');
  if (loginSec) loginSec.classList.add('hidden');
  if (registerSec) registerSec.classList.add('hidden');
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
    localStorage.removeItem('courseToken');
    authToken = null;
    currentUser = null;
    initForGuest();
  });
  // Show admin navigation if user is admin
  if (currentUser.role === 'admin') {
    document.getElementById('adminNav').style.display = 'inline-block';
    // Load current TA code from server and update display
    loadTaCode();
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
  loadHomeAssignments();
  loadResources();
  loadExams();
  loadDiscussions();
  loadCourseInfo();
  loadHomeThreads();
  loadHomeAssignments();
  loadNotifications();
  // Load overall grade dashboard for the logged in user
  loadMyOverall();
  // Scores page and private messages have been removed
}

function initForGuest() {
  // Hide login and register sections initially
  const loginSec = document.getElementById('login-section');
  const registerSec = document.getElementById('register-section');
  if (loginSec) loginSec.classList.add('hidden');
  if (registerSec) registerSec.classList.add('hidden');
  // Hide reset request and reset password sections
  const reqSec = document.getElementById('reset-request-section');
  const resetSec = document.getElementById('reset-password-section');
  if (reqSec) reqSec.classList.add('hidden');
  if (resetSec) resetSec.classList.add('hidden');
  // Show navigation
  $('header.navbar').style.display = 'flex';
  // Set user info with login and register links
  const userInfoEl = $('#userInfo');
  userInfoEl.innerHTML = `<span>Guest</span> | <a href="#" id="loginLink" style="color:#007aff; text-decoration:none;">Login</a> | <a href="#" id="registerLink" style="color:#34c759; text-decoration:none;">Register</a>`;
  // Hide admin navigation
  document.getElementById('adminNav').style.display = 'none';
  // Hide thread creation container
  const newThread = document.getElementById('newThreadContainer');
  if (newThread) newThread.classList.add('hidden');
  // Attach login link to show login page exclusively. When clicked we
  // navigate to the login section via showSection() so that only the
  // login form is visible and the underlying home page is hidden. We
  // also clear any active nav highlighting.
  document.getElementById('loginLink').addEventListener('click', (e) => {
    e.preventDefault();
    showSection('login-section');
    setActiveNav(null);
  });
  // Attach register link to show register page exclusively. Using
  // showSection() hides the home page so the register form isn't
  // displayed over other content.
  document.getElementById('registerLink').addEventListener('click', (e) => {
    e.preventDefault();
    showSection('register-section');
    setActiveNav(null);
  });
  // Load content for guest view
  showSection('home-section');
  setActiveNav(document.querySelector('nav.nav-links button[data-section="home"]'));
  loadAnnouncements();
  loadAssignments();
  loadHomeAssignments();
  loadResources();
  loadExams();
  loadDiscussions();
  loadCourseInfo();
  loadHomeThreads();
  loadHomeAssignments();
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
 * Load recent assignments for the home page. This fetches assignments from
 * the server and displays the five most recent ones in a card layout on
 * the home page. Each card shows the title, due date and a truncated
 * description with a single "View" button to open the full assignment
 * page.  Guests and students see the same list; admins can also use
 * this to quickly access the grading view via the assignment page.
 */
async function loadHomeAssignments() {
  const container = document.getElementById('homeAssignmentsList');
  if (!container) return;
  try {
    const res = await fetch('/api/assignments');
    const data = await res.json();
    container.innerHTML = '';
    if (!data.length) {
      const p = document.createElement('p');
      p.textContent = 'No assignments yet.';
      container.appendChild(p);
      return;
    }
    // Sort assignments by due date ascending (upcoming first)
    data.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    // Show up to five assignments
    const toShow = data.slice(0, 5);
    toShow.forEach((assn) => {
      const card = document.createElement('div');
      card.className = 'assignment-card';
      // Left column with details
      const details = document.createElement('div');
      details.className = 'details';
      const title = document.createElement('h4');
      title.textContent = assn.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `Due: ${new Date(assn.dueDate).toLocaleString()}`;
      const desc = document.createElement('div');
      desc.className = 'description';
      const rawDesc = assn.description || '';
      // Parse full markdown for preview and render LaTeX
      desc.innerHTML = window.marked.parse(rawDesc);
      if (typeof window.renderMathInElement === 'function') {
        try {
          window.renderMathInElement(desc, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
        } catch (err) {
          console.error(err);
        }
      }
      details.appendChild(title);
      details.appendChild(meta);
      if (rawDesc) details.appendChild(desc);
      // Right column with actions
      const actions = document.createElement('div');
      actions.className = 'actions';
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn-blue';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAssignmentPage(assn);
      });
      actions.appendChild(viewBtn);
      card.appendChild(details);
      card.appendChild(actions);
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load home assignments', err);
    container.innerHTML = '<p>Failed to load assignments.</p>';
  }
}

/**
 * Load notifications into the dedicated notifications page. This fetches all
 * notifications for the current user and displays them in a card list.
 * Clicking on a notification marks it as read and updates the bell count.
 */
async function loadNotificationDetails() {
  const list = document.getElementById('notificationsList');
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = '<p>Please log in to view notifications.</p>';
    return;
  }
  try {
    const res = await fetch(`/api/notifications?email=${encodeURIComponent(currentUser.email)}`);
    const notes = await res.json();
    list.innerHTML = '';
    if (!notes.length) {
      const p = document.createElement('p');
      p.textContent = 'No notifications.';
      list.appendChild(p);
      return;
    }
    // Sort newest first
    notes.sort((a, b) => new Date(b.date) - new Date(a.date));
    notes.forEach((n) => {
      const item = document.createElement('div');
      item.className = 'notification-item';
      if (!n.read) item.classList.add('unread');
      item.innerHTML = `<div style="font-weight:600;">${n.message}</div><div style="font-size:0.8rem;color:#6e6e73;margin-top:0.25rem;">${new Date(n.date).toLocaleString()}</div>`;
      item.addEventListener('click', async () => {
        // Mark as read first
        if (!n.read) {
          await fetch(`/api/notifications/${n.id}/read`, { method: 'PUT' });
          n.read = true;
          item.classList.remove('unread');
          loadNotifications();
        }
        // If the notification references an assignment, navigate to it
        if (n.assignmentId) {
          try {
            const res = await fetch(`/api/assignments`);
            const asns = await res.json();
            const target = asns.find((a) => a.id === n.assignmentId);
            if (target) {
              openAssignmentPage(target);
            } else {
              alert('Assignment not found');
            }
          } catch (err) {
            console.error(err);
            alert('Failed to load assignment');
          }
        }
      });
      list.appendChild(item);
    });
  } catch (err) {
    console.error('Failed to load notification details', err);
    list.innerHTML = '<p>Failed to load notifications.</p>';
  }
}

/**
 * Load notifications for the current user. Updates the bell icon and fills
 * the notification panel. Clicking a notification marks it as read.
 */
async function loadNotifications() {
  const bell = document.getElementById('notificationsBell');
  const countSpan = document.getElementById('notificationCount');
  // We no longer use the dropdown panel; notifications are viewed via the notifications page
  if (!bell || !countSpan) return;
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
    // No drop‑down: clicking the bell will navigate to the notifications page
    bell.onclick = () => {
      // Navigate to notifications page. There is no separate nav button for notifications.
      showSection('notifications-section');
      // Do not highlight any nav button when viewing notifications
      setActiveNav(null);
      loadNotificationDetails();
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
    // Track which comment is being replied to. When a reply button is clicked,
    // these variables are updated and referenced when submitting the comment.
    let replyToId = null;
    let replyToName = '';
    // Hide other pages and set nav state
    showSection('thread-page-section');
    setActiveNav(null);
    const container = document.getElementById('threadPageContent');
    container.innerHTML = '';
    // Back link
    const backBtn = document.createElement('button');
    backBtn.textContent = '← Back to discussions';
    backBtn.className = 'btn-blue';
    backBtn.style.marginBottom = '1rem';
    backBtn.addEventListener('click', () => {
      showSection('discussions-section');
      setActiveNav(document.querySelector('nav.nav-links button[data-section="discussions"]'));
    });
    container.appendChild(backBtn);
    // Create a card container for the thread header, meta, attachments and body
    const threadCard = document.createElement('div');
    threadCard.className = 'thread-view-card';
    // Header with title
    const header = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = thread.title;
    header.appendChild(h3);
    threadCard.appendChild(header);
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
    threadCard.appendChild(meta);
    // Attachment if exists: provide preview for PDFs and download for all types
    if (thread.attachmentPath) {
      const rel = thread.attachmentPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
      const ext = rel.split('.').pop().toLowerCase();
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.gap = '0.5rem';
      wrapper.style.marginTop = '0.5rem';
      // Preview only for PDF attachments
      if (ext === 'pdf') {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn-blue';
        previewBtn.textContent = 'Preview Attachment';
        previewBtn.addEventListener('click', () => {
          openPdfModal('/' + rel, thread.title + ' Attachment');
        });
        wrapper.appendChild(previewBtn);
      }
      // Download button
      const downloadBtn = document.createElement('a');
      downloadBtn.href = '/' + rel;
      downloadBtn.target = '_blank';
      downloadBtn.className = ext === 'pdf' ? 'btn-green' : 'btn-blue';
      downloadBtn.style.textDecoration = 'none';
      downloadBtn.textContent = 'Download Attachment';
      wrapper.appendChild(downloadBtn);
      threadCard.appendChild(wrapper);
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
    threadCard.appendChild(body);
    container.appendChild(threadCard);
    // Build a map of comments by id to resolve reply targets
    const commentMap = {};
    thread.comments.forEach(cm => {
      commentMap[cm.id] = cm;
    });

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
        // Create a card for each comment
        const card = document.createElement('div');
        card.className = 'comment-item';
        // Meta line (author and date)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'comment-meta';
        let authHTML = c.authorName;
        if (c.authorRole === 'admin') {
          authHTML += ' <span class="author-label">TA</span>';
        }
        metaDiv.innerHTML = `${authHTML} • ${new Date(c.date).toLocaleString()}`;
        card.appendChild(metaDiv);
        // If this comment is a reply, show who it replies to
        if (c.replyTo) {
          const parent = commentMap[c.replyTo];
          const replyLabel = document.createElement('div');
          replyLabel.className = 'reply-label';
          replyLabel.style.fontSize = '0.8rem';
          replyLabel.style.color = '#6e6e73';
          if (parent) {
            replyLabel.textContent = `↳ Reply to ${parent.authorName}`;
          } else {
            replyLabel.textContent = '↳ Reply';
          }
          card.appendChild(replyLabel);
        }
        // Comment body with Markdown and LaTeX
        const bodyDiv = document.createElement('div');
        bodyDiv.innerHTML = window.marked.parse(c.content || '');
        if (typeof window.renderMathInElement === 'function') {
          try {
            window.renderMathInElement(bodyDiv, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
          } catch (err) {
            console.error(err);
          }
        }
        card.appendChild(bodyDiv);
        // Attachment buttons
        if (c.attachmentPath) {
          const relp = c.attachmentPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
          const extc = relp.split('.').pop().toLowerCase();
          const attWrap = document.createElement('div');
          attWrap.style.display = 'flex';
          attWrap.style.gap = '0.5rem';
          attWrap.style.marginTop = '0.25rem';
          if (extc === 'pdf') {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'btn-blue';
            prevBtn.textContent = 'Preview';
            prevBtn.addEventListener('click', () => {
              openPdfModal('/' + relp, 'Comment Attachment');
            });
            attWrap.appendChild(prevBtn);
          }
          const dlBtn = document.createElement('a');
          dlBtn.href = '/' + relp;
          dlBtn.target = '_blank';
          dlBtn.className = extc === 'pdf' ? 'btn-green' : 'btn-blue';
          dlBtn.style.textDecoration = 'none';
          dlBtn.textContent = 'Download';
          attWrap.appendChild(dlBtn);
          card.appendChild(attWrap);
        }
        // Reply button: allow logged‑in, approved users to reply to a specific comment
        if (currentUser && currentUser.approved !== false) {
          const replyBtn = document.createElement('button');
          replyBtn.textContent = 'Reply';
          replyBtn.className = 'btn-blue';
          replyBtn.style.marginTop = '0.5rem';
          replyBtn.addEventListener('click', () => {
            replyToId = c.id;
            replyToName = c.authorName;
            const indicator = document.getElementById('replyIndicator');
            if (indicator) {
              indicator.textContent = `Replying to ${replyToName}`;
              indicator.style.display = 'block';
            }
            const ta = document.getElementById('commentTextarea');
            if (ta) {
              ta.focus();
            }
          });
          card.appendChild(replyBtn);
        }
        // Admin delete button aligned right in actions container
        if (currentUser && currentUser.role === 'admin') {
          const actions = document.createElement('div');
          actions.className = 'comment-actions';
          const delBtn = document.createElement('button');
          delBtn.textContent = 'Delete';
          delBtn.className = 'btn-red';
          delBtn.addEventListener('click', async () => {
    const ok = await sweetConfirm('Delete this comment?');
    if (!ok) return;
            const resp = await fetchAuth(`/api/forum/${thread.id}/comments/${c.id}`, { method: 'DELETE' });
            if (resp.ok) {
              openThreadPage(thread.id);
            } else {
              const msg = await resp.json();
              alert(msg.error || 'Failed to delete');
            }
          });
          actions.appendChild(delBtn);
          card.appendChild(actions);
        }
        commentsContainer.appendChild(card);
      });
    }
    container.appendChild(commentsContainer);
    // Comment form if logged in and not pending
    if (currentUser && !(currentUser.role === 'pendingStudent' || currentUser.approved === false)) {
      // Build comment posting form in a card. Include reply indicator and track replyToId.
      const form = document.createElement('div');
      form.className = 'comment-form assignment-detail-section';
      // Reply indicator: displays which comment is being replied to
      const replyIndicator = document.createElement('div');
      replyIndicator.id = 'replyIndicator';
      replyIndicator.style.display = 'none';
      replyIndicator.style.fontStyle = 'italic';
      replyIndicator.style.marginBottom = '0.25rem';
      form.appendChild(replyIndicator);
      // Comment textarea
      const textarea = document.createElement('textarea');
      textarea.id = 'commentTextarea';
      textarea.placeholder = 'Add a comment...';
      textarea.rows = 3;
      textarea.style.width = '100%';
      // Attachment input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*,image/*';
      fileInput.style.marginTop = '0.5rem';
      // Submit button
      const submit = document.createElement('button');
      submit.textContent = 'Post Comment';
      submit.className = 'btn-blue';
      submit.style.marginTop = '0.5rem';
      submit.addEventListener('click', async () => {
        const contentVal = textarea.value.trim();
        if (!contentVal) return;
        const formData = new FormData();
        formData.append('content', contentVal);
        formData.append('authorName', currentUser.name);
        formData.append('authorEmail', currentUser.email);
        formData.append('authorRole', currentUser.role);
        // Include replyTo if set
        if (typeof replyToId !== 'undefined' && replyToId) {
          formData.append('replyTo', replyToId);
        }
        if (fileInput.files.length) {
          formData.append('file', fileInput.files[0]);
        }
        const resp = await fetchAuth(`/api/forum/${thread.id}/comments`, {
          method: 'POST',
          body: formData,
        });
        if (resp.ok) {
          // Reset form and reply state
          textarea.value = '';
          fileInput.value = '';
          if (typeof replyToId !== 'undefined') {
            replyToId = null;
            replyToName = '';
          }
          replyIndicator.style.display = 'none';
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
      archiveBtn.className = thread.archived ? 'btn-yellow' : 'btn-yellow';
      archiveBtn.textContent = thread.archived ? 'Unarchive Thread' : 'Archive Thread';
      archiveBtn.addEventListener('click', async () => {
        const resp = await fetchAuth(`/api/forum/${thread.id}/archive`, { method: 'POST' });
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
      deleteBtn.className = 'btn-red';
      deleteBtn.textContent = 'Delete Thread';
      deleteBtn.style.marginLeft = '0.5rem';
      deleteBtn.addEventListener('click', async () => {
        const ok = await sweetConfirm('Delete this thread?');
        if (!ok) return;
        const resp = await fetchAuth(`/api/forum/${thread.id}`, { method: 'DELETE' });
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
  backBtn.className = 'btn-blue';
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

  // Assignment dashboard disabled: previously this section displayed submission and grade statistics for the assignment. It has been removed per updated requirements.
  // Description parsed and wrapped in a card for better separation
  const descDiv = document.createElement('div');
  descDiv.innerHTML = window.marked.parse(assn.description || '');
  if (typeof window.renderMathInElement === 'function') {
    try {
      window.renderMathInElement(descDiv, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
    } catch (err) {
      console.error(err);
    }
  }
  const descCard = document.createElement('div');
  descCard.className = 'card';
  descCard.style.marginBottom = '1rem';
  const descHeader = document.createElement('h4');
  descHeader.textContent = 'Description';
  descCard.appendChild(descHeader);
  descCard.appendChild(descDiv);
  container.appendChild(descCard);
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
      // Preview uploaded PDF using pdf.js (first page) and provide a link to
      // open the full PDF with navigation using the modal preview. This avoids
      // duplicating pagination logic here and gives users an easy way to view
      // multiple pages.
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
      // Button to view the full PDF with navigation
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn-blue';
      previewBtn.style.marginTop = '0.5rem';
      previewBtn.textContent = 'Preview Full PDF';
      previewBtn.addEventListener('click', () => {
        openPdfModal(fileUrl, 'My Submission');
      });
      subSection.appendChild(previewBtn);
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
      submitBtn.className = 'btn-blue';
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
        const resp = await fetchAuth(`/api/assignments/${assn.id}/submit`, {
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
    gradeBtn.className = 'btn-blue';
    gradeBtn.style.marginTop = '1rem';
    gradeBtn.textContent = 'Grade Submissions';
    gradeBtn.addEventListener('click', () => {
      // Use dedicated grading page instead of modal
      openAssignmentGradesPage(assn);
    });
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
    // Admin-only delete button for announcements
    if (currentUser && currentUser.role === 'admin') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-red';
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginTop = '0.5rem';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await sweetConfirm('Are you sure you want to delete this announcement?');
        if (!ok) return;
        const resp = await fetchAuth(`/api/announcements/${ann.id}`, { method: 'DELETE' });
        if (resp.ok) {
          loadAnnouncements();
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to delete announcement');
        }
      });
      li.appendChild(deleteBtn);
    }
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
    // Build each assignment card with two columns: details and actions
    for (const assn of data) {
      const card = document.createElement('div');
      card.className = 'assignment-card';
      const details = document.createElement('div');
      details.className = 'details';
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.style.display = 'flex';
      actions.style.flexDirection = 'column';
      actions.style.justifyContent = 'space-between';
      // Title and due date
      const title = document.createElement('h4');
      title.textContent = assn.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `Due: ${new Date(assn.dueDate).toLocaleString()}`;
      // Description parsed
      const desc = document.createElement('div');
      desc.className = 'description';
      const rawDesc = assn.description || '';
      desc.innerHTML = window.marked.parse(rawDesc);
      if (typeof window.renderMathInElement === 'function') {
        try {
          window.renderMathInElement(desc, { delimiters: [ { left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false } ] });
        } catch (err) {
          console.error('KaTeX rendering error:', err);
        }
      }
      details.appendChild(title);
      details.appendChild(meta);
      if (rawDesc) details.appendChild(desc);
      // Status / grade area. Use a column layout so gauge, comments, and
      // feedback button stack vertically and don’t overlap. Place this
      // div in the details column rather than the actions column.
      const statusDiv = document.createElement('div');
      statusDiv.style.fontSize = '0.85rem';
      statusDiv.style.marginTop = '0.5rem';
      statusDiv.style.display = 'flex';
      statusDiv.style.flexDirection = 'column';
      statusDiv.style.gap = '0.25rem';
      // Container for all buttons (bottom row of actions)
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '0.5rem';
      btnRow.style.justifyContent = 'flex-end';
      btnRow.style.flexWrap = 'wrap';
      // Primary action: view details
      const viewBtn = document.createElement('button');
      viewBtn.className = 'btn-blue';
      viewBtn.textContent = 'View Details';
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAssignmentPage(assn);
      });
      btnRow.appendChild(viewBtn);
      // Download assignment PDF
      if (assn.pdfPath) {
        const relPath = assn.pdfPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
        const downloadBtn = document.createElement('a');
        downloadBtn.href = '/' + relPath;
        downloadBtn.target = '_blank';
        downloadBtn.className = 'btn-green';
        downloadBtn.style.textDecoration = 'none';
        downloadBtn.textContent = 'Download PDF';
        btnRow.appendChild(downloadBtn);
      }
      // Student submission status and actions
      if (currentUser && currentUser.role === 'student' && currentUser.approved !== false) {
        try {
          const resSub = await fetch(`/api/assignments/${assn.id}/submissions`);
          const subs = await resSub.json();
          const mySub = subs.find((s) => s.studentEmail === currentUser.email);
          if (mySub) {
            if (mySub.graded) {
              // Clear existing contents
              statusDiv.innerHTML = '';
              // Render gauge for grade (A+..Failed)
              const gauge = renderGauge(mySub.grade);
              statusDiv.appendChild(gauge);
              // Comments
              const cmtDiv = document.createElement('div');
              cmtDiv.innerHTML = `<strong>Comments:</strong> ${mySub.comments || '—'}`;
              cmtDiv.style.marginTop = '0.25rem';
              statusDiv.appendChild(cmtDiv);
              // If feedback is available, provide a download button alongside the other
              // action buttons instead of placing it within the status text. This
              // keeps all actions aligned in the bottom row. Create the button
              // only once per assignment and append it after the PDF download.
              if (mySub.feedbackPath) {
                const feedbackRel = mySub.feedbackPath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
                const fbBtn = document.createElement('a');
                fbBtn.href = '/' + feedbackRel;
                fbBtn.target = '_blank';
                fbBtn.textContent = 'Download Feedback';
                fbBtn.className = 'btn-green';
                // We'll append this button to the action row later, after creating other buttons.
                fbBtn.dataset.isFeedback = 'true';
                // Temporarily store on the assignment object for later retrieval
                assn._feedbackButton = fbBtn;
              }
            } else {
              statusDiv.textContent = `Submitted on ${new Date(mySub.uploadedAt).toLocaleString()}`;
            }
          } else {
            statusDiv.textContent = 'Not yet submitted';
          }
          // If not graded, allow submission or replacement. We build a single
          // upload row containing the file input, label, filename and submit
          // button. This row is appended to the bottom button row. Prevent
          // duplication by constructing only one upload row per assignment.
          if (!mySub || !mySub.graded) {
            const uploadRow = document.createElement('div');
            uploadRow.style.display = 'flex';
            uploadRow.style.alignItems = 'center';
            uploadRow.style.gap = '0.5rem';
            // File input (hidden)
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'application/pdf';
            fileInput.style.display = 'none';
            const inputId = `upload-${assn.id}-${Math.floor(Math.random() * 1000000)}`;
            fileInput.id = inputId;
            // Label acts as styled button
            const label = document.createElement('label');
            label.className = 'btn-grey';
            label.setAttribute('for', inputId);
            label.textContent = 'Choose PDF';
            // Display selected file name
            const fileNameSpan = document.createElement('span');
            fileNameSpan.style.fontSize = '0.85rem';
            fileNameSpan.style.color = '#6e6e73';
            fileNameSpan.textContent = 'No file chosen';
            fileInput.addEventListener('change', () => {
              fileNameSpan.textContent = fileInput.files.length ? fileInput.files[0].name : 'No file chosen';
            });
            // Submit button
            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn-blue';
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
              const resp = await fetchAuth(`/api/assignments/${assn.id}/submit`, {
                method: 'POST',
                body: formData,
              });
              if (resp.ok) {
                alert(mySub ? 'Submission replaced successfully.' : 'Submission uploaded successfully.');
                loadAssignments();
              } else {
                const msg = await resp.json();
                alert(msg.error || 'Submission failed');
              }
            });
            uploadRow.appendChild(fileInput);
            uploadRow.appendChild(label);
            uploadRow.appendChild(fileNameSpan);
            uploadRow.appendChild(submitBtn);
            btnRow.appendChild(uploadRow);
          }
        } catch (err) {
          console.error('Failed to load submission status', err);
        }
      } else if (currentUser && (currentUser.role === 'pendingStudent' || currentUser.approved === false)) {
        statusDiv.textContent = 'Registration pending: you cannot submit assignments yet.';
      } else if (!currentUser) {
        statusDiv.textContent = 'Login to submit this assignment.';
      }
      // Admin actions: grade and delete buttons
      if (currentUser && currentUser.role === 'admin') {
        const gradeBtn = document.createElement('button');
        gradeBtn.className = 'btn-yellow';
        gradeBtn.textContent = 'Grade Submissions';
        gradeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Navigate to the dedicated assignment grades page rather than opening a modal
          openAssignmentGradesPage(assn);
        });
        btnRow.appendChild(gradeBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-red';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = await sweetConfirm('Are you sure you want to delete this assignment?');
          if (!ok) return;
          const resp = await fetchAuth(`/api/assignments/${assn.id}`, { method: 'DELETE' });
          if (resp.ok) {
            loadAssignments();
          } else {
            const msg = await resp.json();
            alert(msg.error || 'Failed to delete assignment');
          }
        });
        btnRow.appendChild(deleteBtn);
      }
      // Append the status information into the details column just before attaching to card
      details.appendChild(statusDiv);
      // Append details and actions to the card
      card.appendChild(details);
      // Move the feedback button (if any) into the button row before appending
      // the row to actions. This ensures that Download Feedback appears in the
      // same horizontal group as View/Download PDF rather than inside the
      // status text. Note: _feedbackButton was attached to the assignment
      // object earlier when detecting graded submissions.
      if (assn && assn._feedbackButton) {
        btnRow.appendChild(assn._feedbackButton);
        delete assn._feedbackButton;
      }
      // Move btnRow into actions now that all buttons have been assembled
      actions.appendChild(btnRow);
      card.appendChild(actions);
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
    const card = document.createElement('div');
    card.className = 'resource-card';
    const title = document.createElement('h4');
    title.textContent = resItem.title;
    card.appendChild(title);
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '0.5rem';
    const fileRel = resItem.filePath.replace(/.*uploads\//, 'uploads/').replace(/\\/g, '/');
    const ext = fileRel.split('.').pop().toLowerCase();
    // Preview button for PDFs
    if (ext === 'pdf') {
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn-blue';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => {
        openPdfModal('/' + fileRel, resItem.title);
      });
      actions.appendChild(previewBtn);
    }
    // Download button
    const downloadBtn = document.createElement('a');
    downloadBtn.href = '/' + fileRel;
    downloadBtn.target = '_blank';
    downloadBtn.className = 'btn-green';
    downloadBtn.style.textDecoration = 'none';
    downloadBtn.textContent = 'Download';
    actions.appendChild(downloadBtn);
    // Admin-only delete button for resources
    if (currentUser && currentUser.role === 'admin') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-red';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await sweetConfirm('Delete this resource?');
        if (!ok) return;
        const resp = await fetchAuth(`/api/resources/${resItem.id}`, { method: 'DELETE' });
        if (resp.ok) {
          loadResources();
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to delete resource');
        }
      });
      actions.appendChild(deleteBtn);
    }
    card.appendChild(actions);
    container.appendChild(card);
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
    // Description parsed with Markdown and LaTeX support
    const description = document.createElement('div');
    const rawDesc = exam.description || '';
    description.innerHTML = window.marked.parse(rawDesc);
    // Render LaTeX if KaTeX is available
    if (typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(description, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
        });
      } catch (err) {
        console.error('KaTeX rendering error in exam', err);
      }
    }
    item.appendChild(title);
    item.appendChild(meta);
    if (rawDesc) item.appendChild(description);
    // Admin-only delete button
    if (currentUser && currentUser.role === 'admin') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-red';
      deleteBtn.textContent = 'Delete';
      deleteBtn.style.marginTop = '0.5rem';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await sweetConfirm('Delete this exam notification?');
        if (!ok) return;
        const resp = await fetchAuth(`/api/exams/${exam.id}`, { method: 'DELETE' });
        if (resp.ok) {
          loadExams();
        } else {
          const msg = await resp.json();
          alert(msg.error || 'Failed to delete exam');
        }
      });
      item.appendChild(deleteBtn);
    }
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
    // Render each assignment statistic as a card with a progress bar showing the average grade
    stats.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'score-card';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title;
      card.appendChild(title);
      const meta = document.createElement('div');
      meta.className = 'meta';
      const avg = item.average !== null ? Number(item.average).toFixed(2) : 'N/A';
      meta.textContent = `Average: ${avg}  |  Submissions: ${item.count}`;
      card.appendChild(meta);
      if (item.average !== null) {
        const bar = document.createElement('div');
        bar.className = 'progress-bar';
        const prog = document.createElement('div');
        prog.className = 'progress';
        // Limit average to [0,100] and compute width
        const pct = Math.max(0, Math.min(100, item.average));
        prog.style.width = pct + '%';
        prog.textContent = `${pct.toFixed(0)}%`;
        bar.appendChild(prog);
        card.appendChild(bar);
      }
      container.appendChild(card);
    });
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
  // Chat based message loading. Group messages into conversations and display them in the sidebar.
  const convList = document.getElementById('conversationList');
  const header = document.getElementById('chatHeader');
  const messagesDiv = document.getElementById('chatMessages');
  if (!convList || !header || !messagesDiv) return;
  if (!currentUser) {
    convList.innerHTML = '';
    header.textContent = '';
    messagesDiv.innerHTML = '<p style="padding:0.5rem;color:#6e6e73;">Login to view messages.</p>';
    return;
  }
  try {
    const res = await fetchAuth(`/api/messages?email=${encodeURIComponent(currentUser.email)}`);
    if (!res.ok) {
      throw new Error('Failed to fetch messages');
    }
    const msgs = await res.json();
    // Group messages by partner email
    const conversations = {};
    msgs.forEach((m) => {
      const partner = m.fromEmail === currentUser.email ? m.toEmail : m.fromEmail;
      if (!conversations[partner]) conversations[partner] = [];
      conversations[partner].push(m);
    });
    // Determine list of conversation partners
    let partners = [];
    let admins = [];
    if (currentUser.role === 'admin') {
      partners = Object.keys(conversations);
    } else {
      // Students: show only admin accounts. Fetch admin list
      try {
        const ra = await fetchAuth('/api/admins');
        if (ra.ok) admins = await ra.json();
      } catch (err) {
        console.error('Failed to fetch admin list', err);
      }
      partners = admins.map((adm) => adm.email);
    }
    // Render conversation list
    convList.innerHTML = '';
    partners.forEach((partner) => {
      const div = document.createElement('div');
      div.className = 'message-item';
      // Determine display name: if in admins list, use name; else show email
      let displayName = partner;
      if (currentUser.role !== 'admin') {
        const adm = (admins || []).find((a) => a.email === partner);
        if (adm) displayName = adm.name;
      } else {
        // For admin user, attempt to show partner's name from users list? We don't have access; show email
        displayName = partner;
      }
      div.innerHTML = `<strong>${displayName}</strong>`;
      // Unread count
      const unreadCount = (conversations[partner] || []).filter((msg) => msg.toEmail === currentUser.email && !msg.read).length;
      if (unreadCount > 0) {
        const badge = document.createElement('span');
        badge.style.backgroundColor = '#ff3b30';
        badge.style.color = '#fff';
        badge.style.borderRadius = '12px';
        badge.style.padding = '0 6px';
        badge.style.fontSize = '0.75rem';
        badge.style.marginLeft = '0.5rem';
        badge.textContent = unreadCount.toString();
        div.appendChild(badge);
      }
      div.style.cursor = 'pointer';
      div.addEventListener('click', () => {
        currentConversation = partner;
        renderConversation(partner, conversations[partner] || []);
      });
      convList.appendChild(div);
    });
    // Hide or show start conversation form based on role
    const startForm = document.getElementById('startConversationForm');
    if (startForm) {
      if (currentUser.role === 'admin') {
        startForm.style.display = 'block';
      } else {
        startForm.style.display = 'none';
      }
    }
    // If no partners, show placeholder
    if (!partners.length) {
      convList.innerHTML = '<p style="font-size:0.85rem; color:#6e6e73;">No conversations yet.</p>';
      header.textContent = '';
      messagesDiv.innerHTML = '<p style="padding:0.5rem;color:#6e6e73;">Select an admin from the list to start chatting.</p>';
      return;
    }
    // Determine current conversation: keep previous selection if exists; else pick first
    let partnerToShow = currentConversation;
    if (!partnerToShow || partners.indexOf(partnerToShow) === -1) {
      partnerToShow = partners[0];
    }
    currentConversation = partnerToShow;
    renderConversation(partnerToShow, conversations[partnerToShow] || []);
  } catch (err) {
    console.error('Failed to load messages', err);
    convList.innerHTML = '<p>Failed to load conversations.</p>';
    header.textContent = '';
    messagesDiv.innerHTML = '<p></p>';
  }
}

/**
 * Render a conversation in the chat view. It displays all messages between
 * the current user and the specified partner in chronological order,
 * differentiating between messages sent by the current user (self) and
 * messages received (other). Unread messages addressed to the current
 * user are marked as read on the server.
 *
 * @param {string} partner The email address of the conversation partner
 * @param {Array} messages Array of message objects for this conversation
 */
async function renderConversation(partner, messages) {
  const header = document.getElementById('chatHeader');
  const messagesDiv = document.getElementById('chatMessages');
  if (!header || !messagesDiv) return;
  currentConversation = partner;
  header.textContent = partner;
  // Clear previous messages
  messagesDiv.innerHTML = '';
  // Sort by date ascending
  messages.sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const msg of messages) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-message';
    if (msg.fromEmail === currentUser.email) {
      bubble.classList.add('self');
    } else {
      bubble.classList.add('other');
    }
    bubble.textContent = msg.content;
    messagesDiv.appendChild(bubble);
    // Mark unread messages addressed to current user as read
    if (msg.toEmail === currentUser.email && !msg.read) {
      try {
        await fetchAuth(`/api/messages/${msg.id}/read`, { method: 'PUT' });
        msg.read = true;
      } catch (err) {
        console.error('Failed to mark message as read', err);
      }
    }
  }
  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  // Reload notifications to update unread count
  loadNotifications();
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
    const res = await fetchAuth('/api/students/pending');
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
        await fetchAuth(`/api/students/${s.id}/approve`, { method: 'POST' });
        alert('Student approved');
        loadPendingStudents();
        loadStudentList();
      });
      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'small-btn';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', async () => {
        if (!confirm('Reject this student?')) return;
        await fetchAuth(`/api/students/${s.id}/reject`, { method: 'POST' });
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
  // Only admins can view the student list
  if (!currentUser || currentUser.role !== 'admin') {
    container.innerHTML = '';
    return;
  }
  try {
    // Fetch full user roster from the server
    const res = await fetchAuth('/api/users');
    const usersList = await res.json();
    container.innerHTML = '';
    if (!Array.isArray(usersList) || !usersList.length) {
      container.textContent = 'No users found.';
      return;
    }
    usersList.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'student-item';
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      const info = document.createElement('div');
      let nameLine = `<strong>${u.name}</strong>`;
      if (u.studentId) nameLine += ` (${u.studentId})`;
      info.innerHTML = `${nameLine}<br/><small>${u.email}</small>`;
      const roleSpan = document.createElement('span');
      // Determine label and colour for role/approval
      if (u.role === 'admin') {
        roleSpan.textContent = 'TA';
        roleSpan.style.color = '#ff9500';
      } else {
        if (u.approved) {
          roleSpan.textContent = 'Student';
          roleSpan.style.color = '#007aff';
        } else {
          roleSpan.textContent = 'Pending';
          roleSpan.style.color = '#ff3b30';
        }
      }
      row.appendChild(info);
      row.appendChild(roleSpan);
      // If the user is a student (not an admin/TA), show a mute/unmute button and status label
      if (u.role !== 'admin') {
        // Display muted status next to the role
        if (u.muted) {
          const mutedLabel = document.createElement('span');
          mutedLabel.textContent = 'Muted';
          mutedLabel.style.color = '#ff3b30';
          mutedLabel.style.marginLeft = '0.5rem';
          row.appendChild(mutedLabel);
        }
        const muteBtn = document.createElement('button');
        // Use different colours: red for mute, green for unmute
        if (u.muted) {
          muteBtn.className = 'btn-green';
          muteBtn.textContent = 'Unmute';
        } else {
          muteBtn.className = 'btn-red';
          muteBtn.textContent = 'Mute';
        }
        muteBtn.style.marginLeft = '1rem';
        muteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Confirm action using native confirm (can be replaced by SweetAlert)
          const action = u.muted ? 'unmute' : 'mute';
          const confirmMsg = u.muted ? 'Unmute this student?' : 'Mute this student? They will be unable to post or submit.';
          const ok = await sweetConfirm(confirmMsg);
          if (!ok) return;
          try {
            const resp = await fetchAuth(`/api/students/${u.studentId}/${action}`, { method: 'POST' });
            if (resp.ok) {
              loadStudentList();
            } else {
              const msg = await resp.json();
              alert(msg.error || 'Action failed');
            }
          } catch (err) {
            console.error(err);
            alert('Action failed');
          }
        });
        row.appendChild(muteBtn);
      }
      container.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load user list', err);
    container.textContent = 'Failed to load user list.';
  }
}

/**
 * Load pending password reset requests for admin. Populates the admin resets
 * subsection with a list of emails and approve buttons. Requires admin
 * authentication.
 */
async function loadResetRequests() {
  const container = document.getElementById('resetRequestsList');
  if (!container) return;
  container.innerHTML = '';
  try {
    const res = await fetchAuth('/api/admin/resetRequests');
    if (!res.ok) {
      throw new Error('Failed to fetch reset requests');
    }
    const requests = await res.json();
    if (!requests.length) {
      container.innerHTML = '<p style="font-size:0.85rem;color:#6e6e73;">No password reset requests.</p>';
      return;
    }
    requests.forEach((req) => {
      const div = document.createElement('div');
      div.className = 'reset-item';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      div.style.padding = '0.5rem 0';
      div.innerHTML = `<span>${req.email}</span>`;
      const approveBtn = document.createElement('button');
      approveBtn.textContent = 'Approve';
      approveBtn.className = 'btn-green';
      approveBtn.addEventListener('click', async () => {
        if (!confirm('Approve reset for ' + req.email + '?')) return;
        try {
          const r = await fetchAuth('/api/admin/resetRequests/' + encodeURIComponent(req.email) + '/approve', { method: 'POST' });
          const data = await r.json();
          if (!r.ok) {
            alert(data.error || 'Approval failed');
          } else {
            alert('Reset approved');
            loadResetRequests();
          }
        } catch (err) {
          console.error('Approve reset error', err);
          alert('Failed to approve');
        }
      });
      div.appendChild(approveBtn);
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Failed to load reset requests', err);
    container.innerHTML = '<p style="font-size:0.85rem;color:#6e6e73;">Failed to load reset requests.</p>';
  }
}

/**
 * Load the current TA invitation code for admins. Fetches from the server
 * and updates the display in the TA code subsection.
 */
async function loadTaCode() {
  try {
    const res = await fetchAuth('/api/taCode');
    if (!res.ok) {
      throw new Error('Failed to fetch TA code');
    }
    const data = await res.json();
    const codeEl = document.getElementById('currentTaCode');
    if (codeEl) {
      codeEl.textContent = data.code;
    }
  } catch (err) {
    console.error('Failed to load TA code', err);
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
        // Use a red button for delete actions to unify style
        delBtn.className = 'btn-red';
        delBtn.style.marginLeft = '0.5rem';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this comment?')) return;
          const resp = await fetchAuth(`/api/forum/${thread.id}/comments/${c.id}`, { method: 'DELETE' });
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
    // Wrap comment form in a card for consistent styling
    const formCard = document.createElement('div');
    formCard.className = 'form-card';
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Add a comment...';
    textarea.rows = 3;
    textarea.style.width = '100%';
    const submit = document.createElement('button');
    submit.textContent = 'Post Comment';
    submit.className = 'btn-blue';
    submit.style.marginTop = '0.5rem';
    submit.addEventListener('click', async () => {
      const contentValue = textarea.value.trim();
      if (!contentValue) return;
      const resp = await fetchAuth(`/api/forum/${thread.id}/comments`, {
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
        openThreadPage(thread.id);
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to post comment');
      }
    });
    formCard.appendChild(textarea);
    formCard.appendChild(submit);
    content.appendChild(formCard);
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
    archiveBtn.className = 'btn-yellow';
    archiveBtn.textContent = thread.archived ? 'Unarchive Thread' : 'Archive Thread';
    archiveBtn.addEventListener('click', async () => {
      const resp = await fetchAuth(`/api/forum/${thread.id}/archive`, { method: 'POST' });
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
    deleteBtn.className = 'btn-red';
    deleteBtn.textContent = 'Delete Thread';
    deleteBtn.style.marginLeft = '0.5rem';
    deleteBtn.addEventListener('click', async () => {
      const ok3 = await sweetConfirm('Delete this thread?');
      if (!ok3) return;
      const resp = await fetchAuth(`/api/forum/${thread.id}`, { method: 'DELETE' });
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
    // Open button – blue for navigation
    const openBtn = document.createElement('button');
    openBtn.className = 'btn-blue';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openThreadPage(th.id));
    // Archive/unarchive button – yellow to indicate caution
    const archive = document.createElement('button');
    archive.className = 'btn-yellow';
    archive.textContent = th.archived ? 'Unarchive' : 'Archive';
    archive.style.marginLeft = '0.5rem';
    archive.addEventListener('click', async () => {
      const resp = await fetchAuth(`/api/forum/${th.id}/archive`, { method: 'POST' });
      if (resp.ok) {
        loadDiscussions();
        loadAdminThreads();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed');
      }
    });
    // Delete button – red for destructive action
    const del = document.createElement('button');
    del.className = 'btn-red';
    del.textContent = 'Delete';
    del.style.marginLeft = '0.5rem';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this thread?')) return;
      const resp = await fetchAuth(`/api/forum/${th.id}`, { method: 'DELETE' });
      if (resp.ok) {
        loadDiscussions();
        loadAdminThreads();
      } else {
        const msg = await resp.json();
        alert(msg.error || 'Failed to delete');
      }
    });
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
  // Split submissions into ungraded and graded lists
  const ungradedSubs = subs.filter((s) => !s.graded);
  const gradedSubs = subs.filter((s) => s.graded);
  // Sort ungraded by submission time ascending so the oldest appear first for grading
  ungradedSubs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
  // Sort graded by submission time descending (most recent graded first)
  gradedSubs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  // Helper to render a submission entry
  function renderSubmission(sub) {
    const div = document.createElement('div');
    div.style.marginBottom = '1rem';
    div.style.padding = '0.5rem';
    div.style.backgroundColor = '#f9f9fa';
    div.style.borderRadius = '8px';
    const info = document.createElement('div');
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
      const gradeContainer = document.createElement('div');
      gradeContainer.style.marginTop = '0.5rem';
      gradeContainer.style.display = 'flex';
      gradeContainer.style.flexDirection = 'column';
      gradeContainer.style.gap = '0.25rem';
      const gaugeElem = renderGauge(Number(sub.grade));
      gradeContainer.appendChild(gaugeElem);
      const commentsDiv = document.createElement('div');
      commentsDiv.style.fontSize = '0.85rem';
      commentsDiv.innerHTML = `<strong>Comments:</strong> ${sub.comments || '—'}`;
      gradeContainer.appendChild(commentsDiv);
      const buttonsRow = document.createElement('div');
      buttonsRow.style.display = 'flex';
      buttonsRow.style.gap = '0.5rem';
      buttonsRow.style.marginTop = '0.5rem';
      if (sub.feedbackPath) {
        const feedbackRel = sub.feedbackPath.replace(/.*uploads\\/, 'uploads/').replace(/\\/g, '/');
        const feedbackLink = document.createElement('a');
        feedbackLink.href = '/' + feedbackRel;
        feedbackLink.textContent = 'Download Feedback';
        feedbackLink.target = '_blank';
        feedbackLink.className = 'btn-blue';
        feedbackLink.style.width = 'fit-content';
        buttonsRow.appendChild(feedbackLink);
      }
      const regradeBtn = document.createElement('button');
      regradeBtn.className = 'btn-yellow';
      regradeBtn.textContent = 'Regrade';
      regradeBtn.addEventListener('click', () => {
        // Use dedicated grading page instead of modal
        openGradeSubmissionPage(assignment, sub);
      });
      buttonsRow.appendChild(regradeBtn);
      gradeContainer.appendChild(buttonsRow);
      div.appendChild(gradeContainer);
    } else {
      const gradeBtn = document.createElement('button');
      gradeBtn.className = 'btn-yellow';
      gradeBtn.textContent = 'Grade';
      gradeBtn.style.marginTop = '0.5rem';
      gradeBtn.addEventListener('click', () => {
        // Use dedicated grading page instead of modal
        openGradeSubmissionPage(assignment, sub);
      });
      div.appendChild(gradeBtn);
    }
    return div;
  }
  // Clear existing content (except header and close button) before adding lists
  // Remove any leftover elements from prior modal use beyond the header
  const existing = Array.from(content.querySelectorAll(':scope > :not(.modal-header)'));
  existing.forEach((el) => el.remove());
  // Render ungraded submissions section
  if (ungradedSubs.length) {
    const ungradedHeader = document.createElement('h4');
    ungradedHeader.textContent = 'Ungraded Submissions';
    ungradedHeader.style.marginTop = '1rem';
    content.appendChild(ungradedHeader);
    ungradedSubs.forEach((sub) => {
      content.appendChild(renderSubmission(sub));
    });
  }
  // Render graded submissions section
  if (gradedSubs.length) {
    const gradedHeader = document.createElement('h4');
    gradedHeader.textContent = 'Graded Submissions';
    gradedHeader.style.marginTop = ungradedSubs.length ? '1rem' : '0';
    content.appendChild(gradedHeader);
    gradedSubs.forEach((sub) => {
      content.appendChild(renderSubmission(sub));
    });
  }
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
  clearBtn.className = 'btn-red';
  clearBtn.style.marginTop = '0.5rem';
  clearBtn.addEventListener('click', () => {
    const ctx = annotationCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
  });
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Submit Grade';
  submitBtn.className = 'btn-blue';
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
      const resp = await fetchAuth(`/api/assignments/${assignment.id}/submissions/${submission.id}/grade`, {
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
  // Expose this grading interface globally. Without explicitly assigning
  // to window, references in dynamically created event handlers (e.g.,
  // assignment grading pages) may not resolve correctly, leading to
  // unresponsive Grade/Regrade buttons. Assigning here ensures the
  // function is available on the global object for later callbacks.
  window.openGradingInterface = openGradingInterface;
}

// Expose the grading interface on the global object immediately after
// definition. If we only assign it inside the function, it is not
// available the first time a Grade/Regrade button is clicked. Setting
// it here ensures that dynamically created event handlers can call
// openGradingInterface even before the modal has been opened once.
window.openGradingInterface = openGradingInterface;

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

//
// Utility to preview any PDF using pdf.js in a modal. Provides pagination and zoom
// controls similar to the assignment page. Used for resource previews and
// discussion attachments.
//
function openPdfModal(url, title = 'PDF Preview') {
  const modal = document.getElementById('pdfModal');
  const content = document.getElementById('pdfModalContent');
  if (!modal || !content) return;
  content.innerHTML = '';
  // Header with title and close button
  const header = document.createElement('div');
  header.className = 'modal-header';
  const h = document.createElement('h3');
  h.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });
  header.appendChild(h);
  header.appendChild(closeBtn);
  content.appendChild(header);
  // Controls for pagination and zoom
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
  content.appendChild(controls);
  // Canvas container
  const viewer = document.createElement('div');
  viewer.className = 'pdf-container';
  const canvasEl = document.createElement('canvas');
  viewer.appendChild(canvasEl);
  content.appendChild(viewer);
  // pdf.js document and state
  let doc = null;
  let pageNum = 1;
  let scale = 1.0;
  async function renderPage(num) {
    if (!doc) return;
    const page = await doc.getPage(num);
    const viewport = page.getViewport({ scale });
    canvasEl.width = viewport.width;
    canvasEl.height = viewport.height;
    const ctx = canvasEl.getContext('2d');
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
      renderPage(pageNum);
      updateControls();
    }).catch((err) => {
      console.error('Failed to load PDF', err);
    });
  }
  prevBtn.addEventListener('click', () => {
    if (pageNum > 1) {
      pageNum--;
      renderPage(pageNum);
      updateControls();
    }
  });
  nextBtn.addEventListener('click', () => {
    if (doc && pageNum < doc.numPages) {
      pageNum++;
      renderPage(pageNum);
      updateControls();
    }
  });
  zoomInBtn.addEventListener('click', () => {
    scale = Math.min(scale + 0.25, 2.0);
    renderPage(pageNum);
  });
  zoomOutBtn.addEventListener('click', () => {
    scale = Math.max(scale - 0.25, 0.5);
    renderPage(pageNum);
  });
  modal.classList.remove('hidden');
}

/**
 * Display a dedicated page for grading a single submission. This page shows
 * the PDF with annotation capability, grade and comment inputs, and a
 * submission form. After grading, the user is returned to the assignment
 * grades page. The back button navigates back to the grades list without
 * losing context.
 *
 * @param {Object} assignment
 * @param {Object} submission
 */
async function openGradeSubmissionPage(assignment, submission) {
  // Navigate to the grade submission section
  showSection('grade-submission-section');
  const backBtn = document.getElementById('backToGradesBtn');
  backBtn.onclick = () => {
    openAssignmentGradesPage(assignment);
  };
  // Update the page title
  const titleEl = document.getElementById('gradeSubmissionTitle');
  titleEl.textContent = `Grading – ${submission.studentName}`;
  const container = document.getElementById('gradeSubmissionContent');
  if (!container) return;
  container.innerHTML = '';
  // Provide a link to download the student's original submission PDF. This
  // enables TAs to download the file for offline review if desired. We
  // convert the stored file path into a relative URL and create an anchor.
  if (submission.filePath) {
    const downloadDiv = document.createElement('div');
    downloadDiv.style.marginBottom = '1rem';
    const fileRel = submission.filePath.replace(/.*uploads[\\/]/, 'uploads/').replace(/\\/g, '/');
    const a = document.createElement('a');
    a.href = '/' + fileRel;
    a.textContent = 'Download Submission PDF';
    a.target = '_blank';
    a.className = 'btn-green';
    downloadDiv.appendChild(a);
    container.appendChild(downloadDiv);
  }
  // Controls for PDF viewer and annotation
  const controls = document.createElement('div');
  controls.className = 'pdf-viewer-controls';
  const prevBtn = document.createElement('button'); prevBtn.textContent = 'Prev';
  const nextBtn = document.createElement('button'); nextBtn.textContent = 'Next';
  const zoomOutBtn = document.createElement('button'); zoomOutBtn.textContent = '–';
  const zoomInBtn = document.createElement('button'); zoomInBtn.textContent = '+';
  const pageInfo = document.createElement('span'); pageInfo.className = 'page-info';
  controls.appendChild(prevBtn);
  controls.appendChild(nextBtn);
  controls.appendChild(zoomOutBtn);
  controls.appendChild(zoomInBtn);
  controls.appendChild(pageInfo);
  container.appendChild(controls);
  const pdfContainer = document.createElement('div'); pdfContainer.className = 'pdf-container';
  const pdfCanvas = document.createElement('canvas');
  const annotCanvas = document.createElement('canvas'); annotCanvas.className = 'pdf-annotation-canvas';
  pdfContainer.appendChild(pdfCanvas);
  pdfContainer.appendChild(annotCanvas);
  container.appendChild(pdfContainer);
  setupDrawing(annotCanvas);
  let pdfDoc = null;
  let currentPage = 1;
  let scale = 1.0;
  function renderPage(num) {
    if (!pdfDoc) return;
    pdfDoc.getPage(num).then((page) => {
      const viewport = page.getViewport({ scale });
      pdfCanvas.height = viewport.height;
      pdfCanvas.width = viewport.width;
      pdfContainer.style.height = viewport.height + 'px';
      const ctx = pdfCanvas.getContext('2d');
      page.render({ canvasContext: ctx, viewport });
      annotCanvas.width = viewport.width;
      annotCanvas.height = viewport.height;
      const aCtx = annotCanvas.getContext('2d');
      aCtx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
      pageInfo.textContent = `Page ${currentPage} / ${pdfDoc.numPages}`;
    });
  }
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
  prevBtn.onclick = () => {
    if (!pdfDoc || currentPage <= 1) return;
    currentPage--;
    renderPage(currentPage);
  };
  nextBtn.onclick = () => {
    if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
    currentPage++;
    renderPage(currentPage);
  };
  zoomOutBtn.onclick = () => {
    if (scale > 0.5) {
      scale = Math.max(0.5, parseFloat((scale - 0.1).toFixed(2)));
      renderPage(currentPage);
    }
  };
  zoomInBtn.onclick = () => {
    if (scale < 2.5) {
      scale = Math.min(2.5, parseFloat((scale + 0.1).toFixed(2)));
      renderPage(currentPage);
    }
  };
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    loadDocument();
  }
  // Grade form container
  const form = document.createElement('div');
  form.className = 'grade-form';
  form.style.marginTop = '1rem';
  const gradeLabel = document.createElement('label'); gradeLabel.textContent = 'Grade (score):';
  const gradeInput = document.createElement('input'); gradeInput.type = 'number'; gradeInput.min = '0'; gradeInput.max = '100'; gradeInput.value = submission.grade || '';
  const commentLabel = document.createElement('label'); commentLabel.textContent = 'Comments:';
  const commentInput = document.createElement('textarea'); commentInput.value = submission.comments || '';
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear Annotations'; clearBtn.type = 'button'; clearBtn.className = 'btn-red';
  clearBtn.onclick = () => {
    const ctx = annotCanvas.getContext('2d');
    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
  };
  const submitBtn = document.createElement('button'); submitBtn.textContent = 'Submit Grade'; submitBtn.className = 'btn-blue';
  submitBtn.onclick = async () => {
    const gradeValue = gradeInput.value;
    const comments = commentInput.value;
    annotCanvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append('grade', gradeValue);
      formData.append('comments', comments);
      if (blob && blob.size > 0) {
        formData.append('annotation', blob, 'annotation.png');
      }
      const resp = await fetchAuth(`/api/assignments/${assignment.id}/submissions/${submission.id}/grade`, { method: 'POST', body: formData });
      if (resp.ok) {
        Swal && Swal.fire({ text: 'Grade submitted', icon: 'success', confirmButtonColor: '#007aff' });
        openAssignmentGradesPage(assignment);
      } else {
        const msg = await resp.json();
        Swal && Swal.fire({ text: msg.error || 'Failed to submit grade', icon: 'error', confirmButtonColor: '#ff3b30' });
      }
    });
  };
  form.appendChild(gradeLabel);
  form.appendChild(gradeInput);
  form.appendChild(commentLabel);
  form.appendChild(commentInput);
  form.appendChild(clearBtn);
  form.appendChild(submitBtn);
  container.appendChild(form);
}

// Expose the grading functions globally so that dynamically created event
// handlers can access them. Without this, some event listeners may not
// resolve the function name in the correct scope.
window.openGradeSubmissionPage = openGradeSubmissionPage;

/**
 * Show a dedicated page for viewing and grading submissions for a single assignment.
 * Ungraded submissions are listed first in chronological order, followed by graded submissions.
 * TAs can click the Grade or Regrade buttons to open the grading interface.
 *
 * @param {Object} assignment
 */
async function openAssignmentGradesPage(assignment) {
  // Switch to the assignment grades section
  showSection('assignment-grades-section');
  // Activate assignments nav button for visual consistency
  const navBtn = document.querySelector('[data-section="assignments"]');
  setActiveNav(navBtn);
  const titleEl = document.getElementById('gradesPageTitle');
  if (titleEl) {
    titleEl.textContent = `Grade Submissions – ${assignment.title}`;
  }
  const listEl = document.getElementById('gradesList');
  if (!listEl) return;
  listEl.innerHTML = '';
  try {
    const res = await fetch(`/api/assignments/${assignment.id}/submissions`);
    const subs = await res.json();
    if (!subs.length) {
      const p = document.createElement('p');
      p.textContent = 'No submissions yet.';
      listEl.appendChild(p);
      return;
    }
    // Split into ungraded and graded lists
    const ungradedSubs = subs.filter((s) => !s.graded);
    const gradedSubs = subs.filter((s) => s.graded);
    ungradedSubs.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    gradedSubs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    // Render helper
    function renderCard(sub) {
      const div = document.createElement('div');
      div.className = 'grade-card';
      div.style.padding = '0.75rem';
      div.style.border = '1px solid #e5e5ea';
      div.style.borderRadius = '8px';
      div.style.marginBottom = '0.75rem';
      const info = document.createElement('div');
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
        const gradeContainer = document.createElement('div');
        gradeContainer.style.marginTop = '0.5rem';
        gradeContainer.style.display = 'flex';
        gradeContainer.style.flexDirection = 'column';
        gradeContainer.style.gap = '0.25rem';
        const gauge = renderGauge(Number(sub.grade));
        gradeContainer.appendChild(gauge);
        const cDiv = document.createElement('div');
        cDiv.style.fontSize = '0.85rem';
        cDiv.innerHTML = `<strong>Comments:</strong> ${sub.comments || '—'}`;
        gradeContainer.appendChild(cDiv);
        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '0.5rem';
        btnRow.style.marginTop = '0.5rem';
        if (sub.feedbackPath) {
          const feedbackRel = sub.feedbackPath.replace(/.*uploads\\/, 'uploads/').replace(/\\/g, '/');
          const fbLink = document.createElement('a');
          fbLink.href = '/' + feedbackRel;
          fbLink.textContent = 'Download Feedback';
          fbLink.target = '_blank';
          fbLink.className = 'btn-green';
          btnRow.appendChild(fbLink);
        }
        const regradeBtn = document.createElement('button');
        regradeBtn.className = 'btn-yellow';
        regradeBtn.textContent = 'Regrade';
        regradeBtn.addEventListener('click', () => {
          // Open dedicated grading page instead of modal
          openGradeSubmissionPage(assignment, sub);
        });
        btnRow.appendChild(regradeBtn);
        gradeContainer.appendChild(btnRow);
        div.appendChild(gradeContainer);
      } else {
        const gBtn = document.createElement('button');
        gBtn.className = 'btn-yellow';
        gBtn.textContent = 'Grade';
        gBtn.style.marginTop = '0.5rem';
        gBtn.addEventListener('click', () => {
          // Open dedicated grading page
          openGradeSubmissionPage(assignment, sub);
        });
        div.appendChild(gBtn);
      }
      return div;
    }
    if (ungradedSubs.length) {
      const hdr = document.createElement('h4');
      hdr.textContent = 'Ungraded Submissions';
      hdr.style.marginTop = '0';
      listEl.appendChild(hdr);
      ungradedSubs.forEach((s) => {
        listEl.appendChild(renderCard(s));
      });
    }
    if (gradedSubs.length) {
      const hdr2 = document.createElement('h4');
      hdr2.textContent = 'Graded Submissions';
      hdr2.style.marginTop = ungradedSubs.length ? '1rem' : '0';
      listEl.appendChild(hdr2);
      gradedSubs.forEach((s) => {
        listEl.appendChild(renderCard(s));
      });
    }
  } catch (err) {
    console.error('Failed to load submissions', err);
    const p = document.createElement('p');
    p.textContent = 'Failed to load submissions.';
    listEl.appendChild(p);
  }
}