// Shared navigation component — hamburger menu for mobile
// Include this script on every page, then call: initNav('pageName')

function initNav(activePage) {
    const allPages = [
        { id: 'checklists', href: 'index.html', icon: '📋', labelKey: 'nav.checklists', label: 'Checklists' },
        { id: 'status', href: 'status.html', icon: '📊', labelKey: 'nav.status', label: 'Status' },
        { id: 'reports', href: 'reports.html', icon: '📈', labelKey: 'nav.reports', label: 'Reports' },
        { id: 'procedures', href: 'procedures.html', icon: '📖', labelKey: 'nav.procedures', label: 'Procedures' },
        { id: 'storage', href: 'storage.html', icon: '📦', labelKey: 'nav.storage', label: 'Storage' },
        { id: 'prep', href: 'prep.html', icon: '📝', labelKey: 'nav.prep', label: 'Prep Lists' },
        { id: 'waste', href: 'waste.html', icon: '🗑️', labelKey: 'nav.waste', label: 'Waste Tracking' },
        { id: 'inventory', href: 'inventory-master.html', icon: '📦', labelKey: 'nav.inventory', label: 'Inventory' },
        { id: 'dashboard', href: 'dashboard.html', icon: '☕', labelKey: 'nav.dashboard', label: 'Sales Dashboard' },
    ];

    // Filter pages based on role access
    const pages = (typeof STAFF_ROLES !== 'undefined')
        ? allPages.filter(p => STAFF_ROLES.canAccess(p.id))
        : allPages;

    function getLabel(page) {
        if (typeof i18n !== 'undefined') {
            return i18n.t(page.labelKey);
        }
        return page.label;
    }

    const activeItem = pages.find(p => p.id === activePage) || pages[0];

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        .nav-container {
            background: #f8f9fa;
            border-bottom: 2px solid #e0e0e0;
            position: relative;
        }
        .nav-header {
            display: flex;
            align-items: center;
            padding: 10px 15px;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
        }
        .nav-hamburger {
            font-size: 20px;
            margin-right: 10px;
            line-height: 1;
        }
        .nav-current {
            font-weight: 600;
            font-size: 14px;
            color: #667eea;
            flex: 1;
        }
        .nav-arrow {
            font-size: 12px;
            color: #999;
            transition: transform 0.2s;
        }
        .nav-arrow.open {
            transform: rotate(180deg);
        }
        .nav-menu {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border-bottom: 2px solid #e0e0e0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 100;
            max-height: 70vh;
            overflow-y: auto;
        }
        .nav-menu.open {
            display: block;
        }
        .nav-menu a {
            display: flex;
            align-items: center;
            padding: 14px 20px;
            text-decoration: none;
            color: #333;
            font-size: 15px;
            font-weight: 500;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.15s;
        }
        .nav-menu a:last-child {
            border-bottom: none;
        }
        .nav-menu a:hover, .nav-menu a:active {
            background: #f0f2ff;
        }
        .nav-menu a.active {
            color: #667eea;
            font-weight: 700;
            background: #f0f2ff;
        }
        .nav-menu-icon {
            font-size: 18px;
            margin-right: 12px;
            width: 24px;
            text-align: center;
        }
        .nav-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 99;
        }
        .nav-overlay.open {
            display: block;
        }
        /* Language toggle */
        .lang-toggle {
            display: flex;
            align-items: center;
            gap: 0;
            position: absolute;
            right: 15px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 101;
        }
        .lang-toggle-btn {
            padding: 4px 10px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
        }
        .lang-toggle-btn:first-child {
            border-radius: 6px 0 0 6px;
            border-right: 1px solid #667eea;
        }
        .lang-toggle-btn:last-child {
            border-radius: 0 6px 6px 0;
            border-left: 1px solid #667eea;
        }
        .lang-toggle-btn.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
    `;
    document.head.appendChild(style);

    // Find the existing nav element and replace it
    const existingNav = document.querySelector('.nav-bar') || document.querySelector('.nav');
    if (!existingNav) return;

    // Build new nav
    const navContainer = document.createElement('div');
    navContainer.className = 'nav-container';
    navContainer.style.position = 'relative';

    // Overlay (closes menu when tapping outside)
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'navOverlay';

    // Header bar
    const header = document.createElement('div');
    header.className = 'nav-header';
    header.id = 'navHeader';
    header.innerHTML = `
        <span class="nav-hamburger">☰</span>
        <span class="nav-current" id="navCurrentLabel">${activeItem.icon} ${getLabel(activeItem)}</span>
        <span class="nav-arrow" id="navArrow">▼</span>
    `;

    // Language toggle
    const langToggle = document.createElement('div');
    langToggle.className = 'lang-toggle';
    const currentLang = (typeof i18n !== 'undefined') ? i18n.getLang() : (localStorage.getItem('trails-coffee-lang') || 'en');
    langToggle.innerHTML = `
        <button class="lang-toggle-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" onclick="event.stopPropagation(); if(typeof i18n!=='undefined') i18n.switchLang('en');">EN</button>
        <button class="lang-toggle-btn ${currentLang === 'es' ? 'active' : ''}" data-lang="es" onclick="event.stopPropagation(); if(typeof i18n!=='undefined') i18n.switchLang('es');">ES</button>
    `;

    // Dropdown menu
    const menu = document.createElement('div');
    menu.className = 'nav-menu';
    menu.id = 'navMenu';

    function buildMenuItems() {
        menu.innerHTML = '';
        pages.forEach(page => {
            const a = document.createElement('a');
            a.href = page.href;
            if (page.id === activePage) a.className = 'active';
            a.innerHTML = `<span class="nav-menu-icon">${page.icon}</span>${getLabel(page)}`;
            menu.appendChild(a);
        });
    }
    buildMenuItems();

    navContainer.appendChild(header);
    navContainer.appendChild(langToggle);
    navContainer.appendChild(menu);

    // Replace existing nav
    existingNav.parentNode.replaceChild(navContainer, existingNav);

    // Insert overlay at body level
    document.body.appendChild(overlay);

    // Toggle menu
    let isOpen = false;
    function toggleMenu() {
        isOpen = !isOpen;
        menu.classList.toggle('open', isOpen);
        overlay.classList.toggle('open', isOpen);
        document.getElementById('navArrow').classList.toggle('open', isOpen);
    }

    header.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    // Expose nav update function for i18n
    window._i18nUpdateNav = function() {
        const currentLabel = document.getElementById('navCurrentLabel');
        if (currentLabel) {
            currentLabel.innerHTML = activeItem.icon + ' ' + getLabel(activeItem);
        }
        buildMenuItems();
    };
}
