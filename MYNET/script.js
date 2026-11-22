/* RadheNet — Personal Network Manager */

const DEFAULT_CATEGORIES = [
    'Friends',
    'Family',
    'Work',
    'College',
    'Business',
    'Networking',
    'Other'
];

const STORE = {
    contacts: 'radhenet_contacts_v1',
    categories: 'radhenet_categories_v1',
    activity: 'radhenet_activity_v1',
    theme: 'radhenet_theme_v1'
};

const $ = (selector, root = document) =>
    root.querySelector(selector);

const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];


// ===============================
// LOCAL STORAGE
// ===============================

function load(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function save(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage may be full or blocked (private mode); the app keeps working in memory.
    }
}

let contacts = load(STORE.contacts, []);
let categories = load(STORE.categories, [...DEFAULT_CATEGORIES]);
let activities = load(STORE.activity, []);

if (!Array.isArray(contacts)) contacts = [];
if (!Array.isArray(categories) || !categories.length) categories = [...DEFAULT_CATEGORIES];
if (!Array.isArray(activities)) activities = [];

let currentPage = 'dashboard';
let activeDetailId = null;

// Search / filter state for the contacts and favorites pages
const filters = { favoritesOnly: false, query: '', cat: 'all', sort: 'recent' };


// ===============================
// HELPER FUNCTIONS
// ===============================

function uid() {
    return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

function initials(name = '') {
    return name.trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(x => x[0] || '')
        .join('')
        .toUpperCase() || '?';
}

function avatar(contact, extra = '') {
    const content = contact.photo
        ? `<img src="${escapeHTML(contact.photo)}" alt="" onerror="this.remove()">`
        : initials(contact.name);

    return `<div class="contact-avatar ${extra}">${content}</div>`;
}

function dateLabel(value) {
    return new Date(value).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function timeAgo(value) {
    const days = Math.floor(
        (Date.now() - new Date(value).getTime()) / 86400000
    );

    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;

    return dateLabel(value);
}

// Only allow http(s) links or embedded images for profile pictures
function isValidPhoto(url) {
    return /^https?:\/\/\S+$/i.test(url) || /^data:image\/[a-z+.-]+;base64,/i.test(url);
}

function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value;
}


// ===============================
// ACTIVITY AND NOTIFICATIONS
// ===============================

function logActivity(message, icon = '＋') {
    activities.unshift({
        id: uid(),
        message,
        icon,
        date: new Date().toISOString()
    });

    activities = activities.slice(0, 30);

    save(STORE.activity, activities);
}

function toast(message, type = 'success') {
    const el = document.createElement('div');

    el.className = `toast ${type}`;
    el.textContent = message;

    $('#toastRegion').append(el);

    setTimeout(() => el.remove(), 3000);
}


// ===============================
// MODAL FUNCTIONS
// ===============================

function openModal(id) {
    const el = document.getElementById(id);

    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');

    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    const el = document.getElementById(id);

    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');

    if (!$('.modal-backdrop.open')) {
        document.body.style.overflow = '';
    }

    if (id === 'detailModal') activeDetailId = null;
}


// ===============================
// SAVE DATA
// ===============================

function persist() {
    save(STORE.contacts, contacts);
    save(STORE.categories, categories);

    renderStats();
}

function categoryOptions(selected = '') {
    $('#category').innerHTML = categories.map(c => `
        <option ${c === selected ? 'selected' : ''}
                value="${escapeHTML(c)}">
            ${escapeHTML(c)}
        </option>
    `).join('');
}


// ===============================
// NAVIGATION
// ===============================

function showPage(page) {

    // Reset search/filters when moving to a different page
    if (page !== currentPage) {
        filters.query = '';
        filters.cat = 'all';
        filters.sort = 'recent';
    }

    currentPage = page;

    $('#pageTitle').textContent = ({
        dashboard: 'Dashboard',
        contacts: 'All Contacts',
        favorites: 'Favorites',
        categories: 'Categories',
        settings: 'Settings'
    })[page] || 'Dashboard';

    $$('.nav-link').forEach(button => {
        button.classList.toggle(
            'active',
            button.dataset.page === page
        );
    });

    $('#sidebar').classList.remove('open');

    renderPage();
}


// ===============================
// DASHBOARD STATISTICS
// ===============================

function renderStats() {

    // Sidebar counter is always on screen
    setText('#navContactCount', contacts.length);

    // The cards below only exist while the dashboard is shown
    setText('#totalContacts', contacts.length);
    setText('#totalCategories', categories.length);
    setText('#totalFavorites', contacts.filter(c => c.favorite).length);

    const now = new Date();

    setText('#addedMonth', contacts.filter(c => {
        const d = new Date(c.createdAt);

        return d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
    }).length);
}


// ===============================
// EMPTY STATE
// ===============================

function emptyState(title, desc, button = '') {
    return `
        <div class="empty-state">
            <div class="empty-icon">✧</div>

            <strong>${escapeHTML(title)}</strong>

            ${escapeHTML(desc)}

            ${button ? `
                <div style="margin-top:14px">
                    <button class="btn btn-primary" data-add>
                        ${escapeHTML(button)}
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}


// ===============================
// DASHBOARD
// ===============================

function renderDashboard() {

    const recent = [...contacts]
        .sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        )
        .slice(0, 5);

    $('#recentContacts').innerHTML = recent.length
        ? recent.map(c => `
            <div class="contact-row">

                ${avatar(c)}

                <div class="contact-info">
                    <strong>${escapeHTML(c.name)}</strong>

                    <small>
                        ${escapeHTML(
                            c.company ||
                            c.email ||
                            c.phone ||
                            'No additional details'
                        )}
                    </small>
                </div>

                <span class="contact-category">
                    ${escapeHTML(c.category)}
                </span>

                <button class="mini-action"
                        data-view="${escapeHTML(c.id)}"
                        aria-label="View ${escapeHTML(c.name)}">
                    ↗
                </button>

            </div>
        `).join('')
        : emptyState(
            'Your network starts here',
            'Add your first contact to see them here.',
            'Add first contact'
        );


    const counts = categories.map(cat => ({
        cat,
        count: contacts.filter(c => c.category === cat).length
    }));

    const max = Math.max(1, ...counts.map(x => x.count));

    $('#categoryOverview').innerHTML = counts.map(x => `
        <div class="category-line">

            <span>${escapeHTML(x.cat)}</span>

            <div class="bar-track">
                <div class="bar-fill"
                     style="width:${x.count / max * 100}%">
                </div>
            </div>

            <b>${x.count}</b>

        </div>
    `).join('');


    $('#activityList').innerHTML = activities.length
        ? activities.slice(0, 5).map(a => `
            <div class="activity-item">

                <span class="activity-dot">
                    ${escapeHTML(a.icon)}
                </span>

                <p>${escapeHTML(a.message)}</p>

                <time>${timeAgo(a.date)}</time>

            </div>
        `).join('')
        : emptyState(
            'No activity yet',
            'Your contact updates will appear here.'
        );
}


// ===============================
// CONTACT CARD
// ===============================

function contactCard(c) {
    return `
        <article class="person-card">

            <div class="person-card-top">

                ${avatar(c)}

                <button class="favorite-btn
                    ${c.favorite ? 'selected' : ''}"
                    data-favorite="${escapeHTML(c.id)}"
                    title="Toggle favorite"
                    aria-label="Toggle favorite for ${escapeHTML(c.name)}">

                    ${c.favorite ? '♥' : '♡'}

                </button>

            </div>

            <h3>${escapeHTML(c.name)}</h3>

            <p class="role">
                ${escapeHTML(c.company || c.email || 'Personal connection')}
            </p>

            <div class="person-meta">

                <span>
                    ✉ &nbsp;${escapeHTML(c.email || 'No email added')}
                </span>

                <span>
                    ☎ &nbsp;${escapeHTML(c.phone || 'No phone added')}
                </span>

            </div>

            <div class="person-card-bottom">

                <span class="contact-category">
                    ${escapeHTML(c.category)}
                </span>

                <button data-view="${escapeHTML(c.id)}">
                    View profile →
                </button>

            </div>

        </article>
    `;
}


// ===============================
// ALL CONTACTS AND FAVORITES
// ===============================

// Apply search, category filter and sorting
function filteredContacts() {

    let list = contacts.filter(c =>
        !filters.favoritesOnly || c.favorite
    );

    const q = filters.query.trim().toLowerCase();

    if (q) {
        list = list.filter(c =>
            [
                c.name,
                c.phone,
                c.email,
                c.company,
                c.address,
                c.category
            ].some(v => (v || '').toLowerCase().includes(q))
        );
    }

    if (filters.cat !== 'all') {
        list = list.filter(c => c.category === filters.cat);
    }

    return list.sort(
        filters.sort === 'alpha'
            ? (a, b) => a.name.localeCompare(b.name)
            : (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
}

// Re-draw only the grid so the search box keeps focus while typing
function updateContactGrid() {

    const grid = $('#contactGrid');
    if (!grid) return;

    const list = filteredContacts();
    const searching = filters.query.trim() || filters.cat !== 'all';

    grid.innerHTML = list.length
        ? list.map(contactCard).join('')
        : emptyState(
            filters.favoritesOnly && !searching
                ? 'No favorites yet'
                : (searching ? 'No matching contacts' : 'No contacts yet'),

            searching
                ? 'Try another name, phone number, email or category.'
                : (filters.favoritesOnly
                    ? 'Tap the heart on a contact to add them here.'
                    : 'Add a contact to start building your network.'),

            searching || filters.favoritesOnly ? '' : 'Add contact'
        );
}

function renderContacts(favoritesOnly = false) {

    filters.favoritesOnly = favoritesOnly;

    // A deleted category may leave a stale filter behind
    if (filters.cat !== 'all' && !categories.includes(filters.cat)) {
        filters.cat = 'all';
    }

    $('#pageContent').innerHTML = `

        <div class="page-heading">

            <div>
                <h2>${favoritesOnly ? 'Favorites' : 'All contacts'}</h2>

                <p>
                    ${favoritesOnly
                        ? 'The people you want to keep close.'
                        : 'All your personal and professional connections.'}
                </p>
            </div>

            <button class="btn btn-primary" data-add>
                ＋ Add contact
            </button>

        </div>

        <div class="toolbar">

            <input id="listSearch"
                   type="search"
                   value="${escapeHTML(filters.query)}"
                   placeholder="Search name, phone, email..."
                   aria-label="Search contacts">

            <select id="categoryFilter" aria-label="Filter by category">

                <option value="all">All categories</option>

                ${categories.map(c => `
                    <option value="${escapeHTML(c)}"
                        ${filters.cat === c ? 'selected' : ''}>
                        ${escapeHTML(c)}
                    </option>
                `).join('')}

            </select>

            <select id="sortFilter" aria-label="Sort contacts">

                <option value="recent"
                    ${filters.sort === 'recent' ? 'selected' : ''}>
                    Recently added
                </option>

                <option value="alpha"
                    ${filters.sort === 'alpha' ? 'selected' : ''}>
                    Name A–Z
                </option>

            </select>

        </div>

        <div class="contact-grid" id="contactGrid"></div>
    `;

    updateContactGrid();

    $('#listSearch').addEventListener('input', e => {
        filters.query = e.target.value;
        updateContactGrid();
    });

    $('#categoryFilter').onchange = e => {
        filters.cat = e.target.value;
        updateContactGrid();
    };

    $('#sortFilter').onchange = e => {
        filters.sort = e.target.value;
        updateContactGrid();
    };
}


// ===============================
// CATEGORIES
// ===============================

function renderCategories() {

    $('#pageContent').innerHTML = `

        <div class="page-heading">

            <div>
                <h2>Categories</h2>

                <p>
                    Group people in a way that makes sense to you.
                </p>
            </div>

            <button class="btn btn-primary" id="addCategory">
                ＋ Add category
            </button>

        </div>

        <div class="category-cards">

            ${categories.map(cat => `
                <article class="category-card">

                    <span class="category-symbol">▤</span>

                    <div>
                        <strong>${escapeHTML(cat)}</strong>

                        <small>
                            ${contacts.filter(c => c.category === cat).length}
                            contacts
                        </small>
                    </div>

                    <button data-edit-category="${escapeHTML(cat)}"
                            title="Edit category"
                            aria-label="Edit ${escapeHTML(cat)}">
                        ✎
                    </button>

                    <button data-delete-category="${escapeHTML(cat)}"
                            title="Delete category"
                            aria-label="Delete ${escapeHTML(cat)}">
                        ×
                    </button>

                </article>
            `).join('')}

        </div>
    `;

    $('#addCategory').onclick = () => openCategoryForm();
}


// ===============================
// SETTINGS
// ===============================

function renderSettings() {

    $('#pageContent').innerHTML = `

        <div class="page-heading">

            <div>
                <h2>Settings</h2>

                <p>
                    Manage your RadheNet workspace preferences.
                </p>
            </div>

        </div>

        <section class="panel settings-panel">

            <div class="panel-heading">
                <div>
                    <h3>Appearance</h3>

                    <p>Make RadheNet feel right for you.</p>
                </div>
            </div>

            <div class="setting-row">

                <div>
                    <strong>Dark mode</strong>

                    <p>Switch between light and dark appearance.</p>
                </div>

                <input class="switch"
                       type="checkbox"
                       id="settingsTheme"
                       aria-label="Dark mode"
                       ${document.body.classList.contains('dark') ? 'checked' : ''}>

            </div>

            <div class="setting-row">

                <div>
                    <strong>Local data</strong>

                    <p>
                        Your contacts are saved in this browser using LocalStorage.
                    </p>
                </div>

                <span class="live-pill">ON DEVICE</span>

            </div>

            <div class="setting-row">

                <div>
                    <strong>Backup &amp; restore</strong>

                    <p>
                        Download your data as JSON, or restore from a previous backup.
                    </p>
                </div>

                <div class="setting-actions">

                    <button class="btn btn-quiet" id="exportData">
                        Export data
                    </button>

                    <button class="btn btn-quiet" id="importData">
                        Import data
                    </button>

                    <input type="file" id="importFile"
                           accept="application/json,.json" hidden>

                </div>

            </div>

            <div class="setting-row">

                <div>
                    <strong>Delete all contacts</strong>

                    <p>
                        This permanently clears contacts stored in this browser.
                    </p>
                </div>

                <button class="danger-btn" id="clearData">
                    Clear contacts
                </button>

            </div>

        </section>
    `;


    $('#settingsTheme').onchange = toggleTheme;

    $('#exportData').onclick = exportData;

    $('#importData').onclick = () => $('#importFile').click();

    $('#importFile').onchange = e => importData(e.target.files[0]);

    $('#clearData').onclick = () => {

        if (confirm('Delete all contacts? This cannot be undone.')) {

            contacts = [];
            activities = [];

            logActivity('Cleared all contacts', '⌫');

            persist();

            renderPage();

            toast('All contacts cleared');
        }
    };
}


// ===============================
// PAGE RENDERING
// ===============================

function renderPage() {

    if (currentPage === 'dashboard') {

        $('#pageContent').innerHTML = dashboardMarkup;

        renderDashboard();

    } else if (currentPage === 'contacts') {

        renderContacts();

    } else if (currentPage === 'favorites') {

        renderContacts(true);

    } else if (currentPage === 'categories') {

        renderCategories();

    } else if (currentPage === 'settings') {

        renderSettings();
    }

    // Run after the page is drawn so freshly created stat cards get their numbers
    renderStats();
}

// The dashboard layout lives in a <template> inside index.html
const dashboardMarkup = $('#dashboardTemplate').innerHTML;


// ===============================
// ADD / EDIT CONTACT
// ===============================

function openContactForm(contact = null) {

    $('#contactForm').reset();

    $('#contactId').value = contact?.id || '';

    $('#modalTitle').textContent =
        contact ? 'Edit contact' : 'Add a contact';

    $('#saveContactBtn').textContent =
        contact ? 'Save changes' : 'Save contact';

    categoryOptions(contact?.category || categories[0]);

    $('#fullName').value = contact?.name || '';
    $('#phone').value = contact?.phone || '';
    $('#email').value = contact?.email || '';
    $('#company').value = contact?.company || '';
    $('#address').value = contact?.address || '';
    $('#photo').value = contact?.photo || '';
    $('#notes').value = contact?.notes || '';

    $('#isFavorite').checked = !!contact?.favorite;

    openModal('contactModal');

    setTimeout(() => $('#fullName').focus(), 80);
}


// ===============================
// SAVE CONTACT
// ===============================

function saveContact(e) {

    e.preventDefault();

    const id = $('#contactId').value;

    const name = $('#fullName').value.trim();

    if (!name) {
        toast('Please enter a name', 'error');
        $('#fullName').focus();
        return;
    }

    const email = $('#email').value.trim();

    if (
        email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        toast('Please enter a valid email address', 'error');
        $('#email').focus();
        return;
    }

    const phone = $('#phone').value.trim();

    if (phone && !/^[+\d][\d\s().-]{4,}$/.test(phone)) {
        toast('Please enter a valid phone number', 'error');
        $('#phone').focus();
        return;
    }

    const photo = $('#photo').value.trim();

    if (photo && !isValidPhoto(photo)) {
        toast('Picture must be an http(s) link', 'error');
        $('#photo').focus();
        return;
    }

    const old = contacts.find(c => c.id === id);

    const data = {

        // keep note history and any other fields from the existing record
        ...(old || {}),

        id: id || uid(),

        name,

        phone,

        email,

        company: $('#company').value.trim(),

        category: $('#category').value,

        address: $('#address').value.trim(),

        photo,

        notes: $('#notes').value.trim(),

        favorite: $('#isFavorite').checked,

        noteLog: old?.noteLog || [],

        createdAt: old?.createdAt || new Date().toISOString(),

        updatedAt: new Date().toISOString()
    };


    if (old) {

        contacts = contacts.map(c =>
            c.id === id ? data : c
        );

        logActivity(`Updated ${name}'s contact details`, '✎');

    } else {

        contacts.unshift(data);

        logActivity(`Added ${name} to your network`, '＋');
    }

    persist();

    closeModal('contactModal');

    renderPage();

    toast(old ? 'Contact updated' : 'Contact added successfully');
}


// ===============================
// PERSONAL NOTES
// ===============================

// Apply a change to one contact and save it
function updateContact(id, changes) {

    contacts = contacts.map(c =>
        c.id === id
            ? { ...c, ...changes, updatedAt: new Date().toISOString() }
            : c
    );

    persist();
}

function notesMarkup(c) {

    const log = c.noteLog || [];

    if (!log.length) {
        return '<p class="muted" style="margin:12px 0">No conversation notes yet.</p>';
    }

    return `
        <div class="note-list">
            ${log.map(n => `
                <div class="note-item" data-note="${escapeHTML(n.id)}">

                    <p>${escapeHTML(n.text)}</p>

                    <div class="note-meta">

                        <time>${timeAgo(n.date)}</time>

                        <button class="link-btn"
                                data-note-edit="${escapeHTML(n.id)}">
                            Edit
                        </button>

                        <button class="link-btn danger"
                                data-note-delete="${escapeHTML(n.id)}">
                            Delete
                        </button>

                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function startNoteEdit(contactId, noteId) {

    const c = contacts.find(x => x.id === contactId);
    const note = c?.noteLog?.find(n => n.id === noteId);
    const item = $(`.note-item[data-note="${CSS.escape(noteId)}"]`);

    if (!note || !item) return;

    item.innerHTML = `
        <div class="note-edit">

            <textarea rows="3" aria-label="Edit note">${escapeHTML(note.text)}</textarea>

            <div class="note-meta">

                <span style="margin-right:auto"></span>

                <button class="link-btn" data-note-cancel>Cancel</button>

                <button class="btn btn-primary" data-note-save
                        style="padding:7px 14px">
                    Save
                </button>

            </div>
        </div>
    `;

    const area = $('textarea', item);

    area.focus();

    $('[data-note-cancel]', item).onclick = () => showDetail(contactId);

    $('[data-note-save]', item).onclick = () => {

        const text = area.value.trim();

        if (!text) {
            toast('A note cannot be empty', 'error');
            return;
        }

        updateContact(contactId, {
            noteLog: c.noteLog.map(n =>
                n.id === noteId ? { ...n, text, edited: true } : n
            )
        });

        logActivity(`Edited a note for ${c.name}`, '✎');

        showDetail(contactId);

        toast('Note updated');
    };
}

function deleteNote(contactId, noteId) {

    const c = contacts.find(x => x.id === contactId);

    if (!c || !confirm('Delete this note?')) return;

    updateContact(contactId, {
        noteLog: (c.noteLog || []).filter(n => n.id !== noteId)
    });

    logActivity(`Deleted a note for ${c.name}`, '⌫');

    showDetail(contactId);

    toast('Note deleted');
}

function addNote(contactId) {

    const input = $('#detailNoteInput');
    const text = input.value.trim();
    const c = contacts.find(x => x.id === contactId);

    if (!text) {
        toast('Write a note first', 'error');
        input.focus();
        return;
    }

    updateContact(contactId, {
        noteLog: [
            { id: uid(), text, date: new Date().toISOString() },
            ...(c.noteLog || [])
        ]
    });

    logActivity(`Added a note for ${c.name}`, '✎');

    showDetail(contactId);

    toast('Note saved');
}


// ===============================
// CONTACT DETAILS
// ===============================

function showDetail(id) {

    const c = contacts.find(x => x.id === id);

    if (!c) return;

    activeDetailId = id;

    $('#detailHero').innerHTML = `

        <div class="detail-hero">

            ${avatar(c)}

            <h2 id="detailName">
                ${escapeHTML(c.name)}
            </h2>

            <p>
                ${escapeHTML(c.company || c.category)}
            </p>

        </div>
    `;


    $('#detailBody').innerHTML = `

        <div class="detail-content">

            <div class="detail-info-grid">

                <div class="detail-info">
                    <small>PHONE</small>
                    <strong>${escapeHTML(c.phone || 'Not provided')}</strong>
                </div>

                <div class="detail-info">
                    <small>EMAIL</small>
                    <strong>${escapeHTML(c.email || 'Not provided')}</strong>
                </div>

                <div class="detail-info">
                    <small>LOCATION</small>
                    <strong>${escapeHTML(c.address || 'Not provided')}</strong>
                </div>

                <div class="detail-info">
                    <small>CATEGORY</small>
                    <strong>${escapeHTML(c.category)}</strong>
                </div>

                <div class="detail-info">
                    <small>DATE ADDED</small>
                    <strong>${dateLabel(c.createdAt)}</strong>
                </div>

                <div class="detail-info">
                    <small>COMPANY</small>
                    <strong>${escapeHTML(c.company || 'Not provided')}</strong>
                </div>

            </div>


            <div class="detail-section">

                <h4>About ${escapeHTML(c.name.split(' ')[0])}</h4>

                <p>
                    ${escapeHTML(c.notes || 'No personal notes added yet. Use "Edit contact" to add some.')}
                </p>

            </div>


            <div class="detail-section">

                <h4>Conversation notes</h4>

                ${notesMarkup(c)}

                <div class="notes-add">

                    <input id="detailNoteInput"
                           placeholder="Add a conversation note..."
                           aria-label="New note">

                    <button class="btn btn-primary" id="addDetailNote">
                        Add note
                    </button>

                </div>

            </div>


            <div class="detail-actions">

                <button class="btn btn-quiet" id="editDetail">
                    Edit contact
                </button>

                <button class="btn btn-quiet" id="favoriteDetail">
                    ${c.favorite ? '♥ Remove favorite' : '♡ Add favorite'}
                </button>

                <button class="danger-btn" id="deleteDetail">
                    Delete
                </button>

            </div>

        </div>
    `;


    openModal('detailModal');


    $('#editDetail').onclick = () => {

        closeModal('detailModal');

        openContactForm(c);
    };


    $('#favoriteDetail').onclick = () => toggleFavorite(id);

    $('#deleteDetail').onclick = () => deleteContact(id);

    $('#addDetailNote').onclick = () => addNote(id);

    $('#detailNoteInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') addNote(id);
    });

    $$('[data-note-edit]').forEach(btn => {
        btn.onclick = () => startNoteEdit(id, btn.dataset.noteEdit);
    });

    $$('[data-note-delete]').forEach(btn => {
        btn.onclick = () => deleteNote(id, btn.dataset.noteDelete);
    });
}


// ===============================
// FAVORITES
// ===============================

function toggleFavorite(id) {

    const c = contacts.find(x => x.id === id);

    if (!c) return;

    c.favorite = !c.favorite;

    persist();

    logActivity(
        `${c.favorite ? 'Added' : 'Removed'} ${c.name} ${c.favorite ? 'to' : 'from'} favorites`,
        c.favorite ? '♥' : '♡'
    );

    if ($('#detailModal').classList.contains('open')) {

        showDetail(id);
    }

    renderPage();

    toast(
        c.favorite
            ? 'Added to favorites'
            : 'Removed from favorites'
    );
}


// ===============================
// DELETE CONTACT
// ===============================

function deleteContact(id) {

    const c = contacts.find(x => x.id === id);

    if (!c) return;

    if (!confirm(`Delete ${c.name} from your contacts?`)) {
        return;
    }

    contacts = contacts.filter(x => x.id !== id);

    persist();

    logActivity(`Deleted ${c.name} from your network`, '⌫');

    closeModal('detailModal');

    renderPage();

    toast('Contact deleted');
}


// ===============================
// ADD / EDIT CATEGORY
// ===============================

function openCategoryForm(name = '') {

    $('#categoryForm').reset();

    $('#categoryOriginal').value = name;

    $('#categoryName').value = name;

    $('#categoryModalTitle').textContent =
        name ? 'Edit category' : 'Add category';

    openModal('categoryModal');

    setTimeout(() => $('#categoryName').focus(), 80);
}


// ===============================
// SAVE CATEGORY
// ===============================

function saveCategory(e) {

    e.preventDefault();

    const name = $('#categoryName').value.trim();

    const old = $('#categoryOriginal').value;

    if (!name) {
        toast('Enter a category name', 'error');
        return;
    }

    if (
        categories.some(c =>
            c.toLowerCase() === name.toLowerCase() &&
            c !== old
        )
    ) {
        toast('That category already exists', 'error');
        return;
    }


    if (old) {

        categories = categories.map(c =>
            c === old ? name : c
        );

        contacts = contacts.map(c =>
            c.category === old
                ? { ...c, category: name }
                : c
        );

        logActivity(`Renamed category ${old} to ${name}`, '✎');

    } else {

        categories.push(name);

        logActivity(`Created category ${name}`, '＋');
    }

    persist();

    closeModal('categoryModal');

    renderPage();

    toast('Category saved');
}


// ===============================
// DELETE CATEGORY
// ===============================

function deleteCategory(name) {

    const count = contacts.filter(c =>
        c.category === name
    ).length;

    if (!confirm(
        `Delete "${name}"? ${
            count
                ? `${count} contact(s) will be moved to Other.`
                : ''
        }`
    )) {
        return;
    }

    categories = categories.filter(c => c !== name);

    if (!categories.includes('Other')) {
        categories.push('Other');
    }

    contacts = contacts.map(c =>
        c.category === name
            ? { ...c, category: 'Other' }
            : c
    );

    logActivity(`Deleted category ${name}`, '⌫');

    persist();

    renderPage();

    toast('Category deleted');
}


// ===============================
// DARK MODE
// ===============================

function toggleTheme() {

    document.body.classList.toggle('dark');

    const dark = document.body.classList.contains('dark');

    save(STORE.theme, dark ? 'dark' : 'light');

    $('#themeToggle').textContent = dark ? '☀' : '☾';

    const s = $('#settingsTheme');

    if (s) {
        s.checked = dark;
    }
}


// ===============================
// EXPORT / IMPORT
// ===============================

function exportData() {

    const blob = new Blob(
        [
            JSON.stringify(
                { contacts, categories, activities },
                null,
                2
            )
        ],
        { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;

    a.download = 'radhenet-backup.json';

    a.click();

    URL.revokeObjectURL(url);

    toast('Backup exported');
}

function importData(file) {

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {

        try {
            const data = JSON.parse(reader.result);

            if (!Array.isArray(data.contacts)) {
                throw new Error('No contacts found');
            }

            if (!confirm(
                `Import ${data.contacts.length} contact(s)? This replaces your current data.`
            )) {
                return;
            }

            // Keep only well-formed records and fill in missing fields
            contacts = data.contacts
                .filter(c => c && typeof c.name === 'string' && c.name.trim())
                .map(c => ({
                    id: String(c.id || uid()),
                    name: c.name.trim(),
                    phone: c.phone || '',
                    email: c.email || '',
                    company: c.company || '',
                    category: c.category || 'Other',
                    address: c.address || '',
                    photo: isValidPhoto(c.photo || '') ? c.photo : '',
                    notes: c.notes || '',
                    noteLog: Array.isArray(c.noteLog) ? c.noteLog : [],
                    favorite: !!c.favorite,
                    createdAt: c.createdAt || new Date().toISOString(),
                    updatedAt: c.updatedAt || new Date().toISOString()
                }));

            const importedCats = Array.isArray(data.categories)
                ? data.categories.filter(x => typeof x === 'string' && x.trim())
                : [];

            categories = [...new Set([
                ...(importedCats.length ? importedCats : categories),
                ...contacts.map(c => c.category)
            ])];

            if (Array.isArray(data.activities)) {
                activities = data.activities.slice(0, 30);
            }

            logActivity(`Imported ${contacts.length} contacts`, '⇩');

            persist();

            renderPage();

            toast('Backup restored');

        } catch {
            toast('That file is not a valid RadheNet backup', 'error');
        }
    };

    reader.readAsText(file);
}


// ===============================
// GLOBAL SEARCH
// ===============================

function globalSearch(value) {

    if (!value.trim()) return;

    showPage('contacts');

    filters.query = value;

    renderPage();
}


// ===============================
// EVENT LISTENERS
// ===============================

function bindEvents() {

    document.addEventListener('click', e => {

        const page = e.target.closest('[data-page]');

        if (page) {

            e.preventDefault();

            showPage(page.dataset.page);

            return;
        }


        if (e.target.closest('[data-add]')) {

            openContactForm();

            return;
        }


        const view = e.target.closest('[data-view]');

        if (view) {

            showDetail(view.dataset.view);

            return;
        }


        const fav = e.target.closest('[data-favorite]');

        if (fav) {

            toggleFavorite(fav.dataset.favorite);

            return;
        }


        const edit = e.target.closest('[data-edit-category]');

        if (edit) {

            openCategoryForm(edit.dataset.editCategory);

            return;
        }


        const del = e.target.closest('[data-delete-category]');

        if (del) {

            deleteCategory(del.dataset.deleteCategory);

            return;
        }


        const close = e.target.closest('[data-close]');

        if (close) {
            closeModal(close.dataset.close);
        }
    });


    $('#contactForm').addEventListener('submit', saveContact);

    $('#categoryForm').addEventListener('submit', saveCategory);


    $('#quickAdd').onclick = () => openContactForm();

    $('#helpAdd').onclick = () => openContactForm();

    $('#themeToggle').onclick = toggleTheme;


    $('#mobileMenu').onclick = () =>
        $('#sidebar').classList.toggle('open');


    $('#globalSearch').addEventListener('keydown', e => {

        if (e.key === 'Enter') {
            globalSearch(e.target.value);
        }
    });


    // Live-sync the page search while on the contacts / favorites pages
    $('#globalSearch').addEventListener('input', e => {

        if (
            (currentPage === 'contacts' || currentPage === 'favorites') &&
            $('#listSearch')
        ) {
            filters.query = e.target.value;

            $('#listSearch').value = e.target.value;

            updateContactGrid();
        }
    });


    $('#notificationBtn').onclick = () => {

        toast(
            activities.length
                ? `${activities.length} recent activities in your workspace`
                : 'No new notifications'
        );
    };


    document.addEventListener('keydown', e => {

        if (
            (e.metaKey || e.ctrlKey) &&
            e.key.toLowerCase() === 'k'
        ) {
            e.preventDefault();

            $('#globalSearch').focus();
        }

        if (e.key === 'Escape') {

            $$('.modal-backdrop.open').forEach(m =>
                closeModal(m.id)
            );

            $('#sidebar').classList.remove('open');
        }
    });


    $$('.modal-backdrop').forEach(m => {

        m.addEventListener('click', e => {

            if (e.target === m) {
                closeModal(m.id);
            }
        });
    });
}


// ===============================
// INITIALIZE APPLICATION
// ===============================

function init() {

    if (load(STORE.theme, 'light') === 'dark') {
        document.body.classList.add('dark');
    }

    $('#themeToggle').textContent =
        document.body.classList.contains('dark') ? '☀' : '☾';


    $('#todayLabel').textContent =
        new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        }).toUpperCase();


    const hour = new Date().getHours();

    $('#greeting').textContent =
        `Good ${
            hour < 12
                ? 'morning'
                : hour < 18
                    ? 'afternoon'
                    : 'evening'
        }, Radhe 👋`;


    bindEvents();

    renderPage();
}

init();