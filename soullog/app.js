// Firebase Configuration & Initialization
import { auth, db } from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInAnonymously,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    ref,
    set,
    push,
    get,
    child,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// === SHARED HELPERS ===

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(date);
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    }).format(date);
}

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

const moodMap = {
    'great': { emoji: '😊', label: 'Great' },
    'good': { emoji: '🙂', label: 'Good' },
    'okay': { emoji: '😐', label: 'Okay' },
    'bad': { emoji: '😔', label: 'Not Good' },
    'terrible': { emoji: '😣', label: 'Rough' }
};

function getMoodEmoji(moodKey) {
    return moodMap[moodKey] ? moodMap[moodKey].emoji : 'Unknown';
}

// === ROUTING & NAVIGATION ===

function navigateTo(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });

    // Auth guards
    const publicViews = ['view-landing', 'view-login', 'view-signup', 'view-about'];
    const user = auth.currentUser;

    if (!user && !publicViews.includes(viewId)) {
        document.getElementById('view-landing').classList.remove('hidden');
        return;
    }

    if (user && (viewId === 'view-landing' || viewId === 'view-login' || viewId === 'view-signup')) {
        document.getElementById('view-dashboard').classList.remove('hidden');
        return;
    }

    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        window.scrollTo(0, 0);

        // Trigger generic load event for the view
        if (viewId === 'view-dashboard') loadDashboard();
        if (viewId === 'view-entries') loadEntries(user.uid);
        if (viewId === 'view-insights') loadInsights(user.uid);
    }
}

// === AUTHENTICATION LOGIC ===

async function handleRegister(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Save User Profile to Realtime Database
        await set(ref(db, 'users/' + user.uid + '/profile'), {
            email: email,
            createdAt: Date.now(),
            nickname: email.split('@')[0] // Default nickname
        });

        // Auth state listener will handle redirect
    } catch (error) {
        showError('signup-error', error.message);
        const btn = document.querySelector('#signup-form button[type="submit"]');
        if (btn) { btn.disabled = false; btn.textContent = "Sign Up"; }
        return { error: error.message };
    }
}

async function handleLogin(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showError('login-error', "Invalid email or password.");
        const btn = document.querySelector('#login-form button[type="submit"]');
        if (btn) { btn.disabled = false; btn.textContent = "Log In"; }
        return { error: error.message };
    }
}

async function handleGuestLogin() {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        showError('login-error', error.message);
        showError('signup-error', error.message);
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout error", error);
    }
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
}

// === JOURNAL CRUD ===

async function createEntry(uid, text, mood) {
    try {
        const newEntryRef = push(child(ref(db), `users/${uid}/journals`));
        const entryId = newEntryRef.key;
        const timestamp = Date.now();

        await set(newEntryRef, {
            id: entryId,
            text: text,
            mood: mood,
            timestamp: timestamp
        });
        return { success: true, id: entryId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function getEntriesData(uid) {
    try {
        const snapshot = await get(child(ref(db), `users/${uid}/journals`));
        if (snapshot.exists()) {
            return Object.values(snapshot.val()).sort((a, b) => b.timestamp - a.timestamp);
        }
        return [];
    } catch (error) {
        console.error(error);
        return [];
    }
}

async function getEntryData(uid, entryId) {
    try {
        const snapshot = await get(child(ref(db), `users/${uid}/journals/${entryId}`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        console.error(error);
        return null;
    }
}

async function updateEntryData(uid, entryId, text, mood) {
    try {
        const updates = {};
        updates[`users/${uid}/journals/${entryId}/text`] = text;
        updates[`users/${uid}/journals/${entryId}/mood`] = mood;
        await update(ref(db), updates);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function deleteEntryData(uid, entryId) {
    try {
        await remove(ref(db, `users/${uid}/journals/${entryId}`));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// === INSIGHTS LOGIC ===

async function calculateMoodTrends(uid) {
    const entries = await getEntriesData(uid);
    if (entries.length === 0) return { totalEntries: 0, moodCounts: {}, topMood: null, streak: 0 };

    const moodCounts = {};
    entries.forEach(e => { if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1; });

    let topMood = null;
    let maxCount = 0;
    for (const [m, c] of Object.entries(moodCounts)) {
        if (c > maxCount) { maxCount = c; topMood = m; }
    }

    // Streak (simplified)
    // ... (Use same streak logic as before if needed, or simple count for now to save space)
    // Re-implementing simplified streak
    const uniqueDates = new Set();
    entries.forEach(e => uniqueDates.add(new Date(e.timestamp).setHours(0, 0, 0, 0)));
    const sortedDates = Array.from(uniqueDates).sort((a, b) => b - a);

    const today = new Date().setHours(0, 0, 0, 0);
    // If most recent is not today/yesterday, streak broken
    if (sortedDates.length > 0 && sortedDates[0] < today - 86400000) return { totalEntries: entries.length, moodCounts, topMood, streak: 0 };

    let streak = 0;
    if (sortedDates.length > 0) {
        streak = 1;
        let currentCheck = sortedDates[0];
        for (let i = 1; i < sortedDates.length; i++) {
            if (currentCheck - sortedDates[i] === 86400000) {
                streak++;
                currentCheck = sortedDates[i];
            } else break;
        }
    }

    return { totalEntries: entries.length, moodCounts, topMood, streak };
}

// === UI LOADERS ===

function loadDashboard() {
    const user = auth.currentUser;
    if (user) {
        document.getElementById('greeting-text').textContent = `${getGreeting()},`;
    }
}

async function loadEntries(uid) {
    const listContainer = document.getElementById('entries-list');
    listContainer.innerHTML = '<p class="text-center text-gentle">Loading entries...</p>';
    const entries = await getEntriesData(uid);

    if (entries.length === 0) {
        listContainer.innerHTML = '<div class="text-center" style="padding: 3rem 0;"><p class="text-gentle mb-md">No entries yet.</p><button onclick="window.navigateTo(\'view-new-entry\')" class="btn btn-primary">Write your first entry</button></div>';
        return;
    }

    listContainer.innerHTML = '';
    entries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'card entry-card fade-in';
        card.style.cursor = 'pointer';
        card.onclick = () => openEntryDetail(entry.id);

        let moodEmoji = getMoodEmoji(entry.mood);
        let textPreview = entry.text ? (entry.text.substring(0, 100) + (entry.text.length > 100 ? '...' : '')) : '(No text)';

        card.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;"><span class="text-small text-gentle">${formatDate(entry.timestamp)} • ${formatTime(entry.timestamp)}</span><span style="font-size: 1.2rem;">${moodEmoji}</span></div><p style="color: var(--text-color); margin-bottom: 0;">${textPreview}</p>`;
        listContainer.appendChild(card);
    });
}

window.openEntryDetail = async (entryId) => {
    navigateTo('view-entry-detail');
    const user = auth.currentUser;
    if (!user) return;

    const viewTextEl = document.getElementById('view-text');
    viewTextEl.innerHTML = 'Loading...';

    const entry = await getEntryData(user.uid, entryId);
    if (!entry) {
        viewTextEl.innerHTML = 'Entry not found.';
        return;
    }

    // Populate View
    document.getElementById('view-date').textContent = `${formatDate(entry.timestamp)} • ${formatTime(entry.timestamp)}`;
    document.getElementById('view-mood-emoji').textContent = getMoodEmoji(entry.mood);
    viewTextEl.innerHTML = entry.text.replace(/\n/g, '<br>');

    // Setup Edit State
    document.getElementById('edit-text').value = entry.text;
    document.querySelectorAll('#view-entry-detail .mood-btn').forEach(b => {
        b.classList.remove('selected');
        if (b.dataset.mood === entry.mood) b.classList.add('selected');
    });

    // Store ID for actions
    document.getElementById('view-entry-detail').dataset.currentId = entryId;
    document.getElementById('view-entry-detail').dataset.originalMood = entry.mood;

    // Reset mode
    toggleEditMode(false);
};

function toggleEditMode(isEdit) {
    if (isEdit) {
        document.getElementById('detail-view-mode').classList.add('hidden');
        document.getElementById('detail-edit-mode').classList.remove('hidden');
    } else {
        document.getElementById('detail-view-mode').classList.remove('hidden');
        document.getElementById('detail-edit-mode').classList.add('hidden');
    }
}

async function loadInsights(uid) {
    const data = await calculateMoodTrends(uid);
    document.getElementById('total-entries').textContent = data.totalEntries;
    document.getElementById('current-streak').textContent = `${data.streak} day${data.streak !== 1 ? 's' : ''}`;
    document.getElementById('top-mood').textContent = data.topMood ? (data.topMood + " " + getMoodEmoji(data.topMood)) : "-";

    const chartContainer = document.getElementById('mood-chart');
    chartContainer.innerHTML = '';

    if (data.totalEntries > 0 && Object.keys(data.moodCounts).length > 0) {
        const moods = ['great', 'good', 'okay', 'bad', 'terrible'];
        moods.forEach(mood => {
            const count = data.moodCounts[mood] || 0;
            const percentage = (count / data.totalEntries) * 100;
            if (percentage > 0) {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; margin-bottom: 0.75rem;';
                row.innerHTML = `<div style="width: 30px; font-size: 1.2rem;">${getMoodEmoji(mood)}</div><div style="flex: 1; height: 12px; background: rgba(0,0,0,0.05); border-radius: 6px; margin: 0 10px; overflow: hidden;"><div style="height: 100%; width: ${percentage}%; background-color: var(--primary-color); border-radius: 6px;"></div></div><div style="width: 30px; text-align: right; font-size: 0.8rem; color: var(--text-muted);">${count}</div>`;
                chartContainer.appendChild(row);
            }
        });
    } else {
        chartContainer.innerHTML = '<p class="text-center text-gentle">Not enough data yet.</p>';
    }
}

// === INITIALIZATION ===

document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Global Navigation function exposed to window for HTML onclicks
    window.navigateTo = navigateTo;

    // Auth Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Logged In
            document.querySelectorAll('.auth-hidden').forEach(el => el.classList.add('hidden'));
            const userEmailEl = document.getElementById('user-email');
            if (userEmailEl) userEmailEl.textContent = user.email || 'Guest';

            // Allow access to private views, if currently on public view, go to dashboard
            const currentView = document.querySelector('.view:not(.hidden)');
            if (currentView && (currentView.id === 'view-landing' || currentView.id === 'view-login' || currentView.id === 'view-signup')) {
                navigateTo('view-dashboard');
            }
        } else {
            // Logged Out
            document.querySelectorAll('.auth-hidden').forEach(el => el.classList.remove('hidden'));
            navigateTo('view-landing');
        }
    });

    // --- EVENT LISTENERS ---

    // Sign Up
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value;
            const pass = document.getElementById('signup-pass').value;
            const confirm = document.getElementById('signup-confirm').value;
            if (pass !== confirm) return showError('signup-error', "Passwords match error.");
            if (pass.length < 6) return showError('signup-error', "Password too short.");

            const btn = signupForm.querySelector('button');
            btn.disabled = true; btn.textContent = "Creating...";
            await handleRegister(email, pass);
        });
    }

    // Login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-pass').value;

            const btn = loginForm.querySelector('button');
            btn.disabled = true; btn.textContent = "Logging in...";
            await handleLogin(email, pass);
        });
    }

    // Guest Logins
    document.querySelectorAll('.guest-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            await handleGuestLogin();
        });
    });

    // Logout
    document.querySelectorAll('.logout-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleLogout();
        });
    });

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', toggleTheme);
        if (document.documentElement.getAttribute('data-theme') === 'dark') themeToggle.checked = true;
    }

    // New Entry UI
    document.querySelectorAll('.mood-btn-select').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn-select').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Save Entry
    const newEntryBtn = document.getElementById('save-entry-btn');
    if (newEntryBtn) {
        newEntryBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            const text = document.getElementById('new-entry-text').value;
            const moodBtn = document.querySelector('.mood-btn-select.selected');
            const mood = moodBtn ? moodBtn.dataset.mood : null;

            newEntryBtn.disabled = true; newEntryBtn.textContent = 'Saving...';
            await createEntry(user.uid, text, mood);

            document.getElementById('new-entry-text').value = ''; // clear
            newEntryBtn.disabled = false; newEntryBtn.textContent = 'Save Entry';
            navigateTo('view-entries');
        });
    }

    // Entry Detail Actions
    document.getElementById('detail-edit-btn').addEventListener('click', () => toggleEditMode(true));
    document.getElementById('detail-cancel-btn').addEventListener('click', () => {
        toggleEditMode(false);
        // Reset text
        const viewText = document.getElementById('view-text');
        // simplistic reset, ideally re-fetch or use cached
    });

    document.getElementById('detail-save-btn').addEventListener('click', async () => {
        const user = auth.currentUser;
        const entryId = document.getElementById('view-entry-detail').dataset.currentId;
        const text = document.getElementById('edit-text').value;
        const moodBtn = document.querySelector('#view-entry-detail .mood-btn.selected');
        const mood = moodBtn ? moodBtn.dataset.mood : document.getElementById('view-entry-detail').dataset.originalMood;

        const btn = document.getElementById('detail-save-btn');
        btn.disabled = true; btn.textContent = 'Saving...';
        await updateEntryData(user.uid, entryId, text, mood);

        btn.disabled = false; btn.textContent = 'Save Changes';
        openEntryDetail(entryId); // Reload view
    });

    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
        if (confirm("Delete this entry?")) {
            const user = auth.currentUser;
            const entryId = document.getElementById('view-entry-detail').dataset.currentId;
            await deleteEntryData(user.uid, entryId);
            navigateTo('view-entries');
        }
    });

    // Quick mood selectors on dashboard
    document.querySelectorAll('.quick-mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateTo('view-new-entry');
            // Pre-select logic
            const mood = btn.dataset.mood;
            setTimeout(() => {
                const targetBtn = document.querySelector(`.mood-btn-select[data-mood="${mood}"]`);
                if (targetBtn) targetBtn.click();
            }, 100);
        });
    });

    // Initial Route Check? Handled by auth listener mostly
});
