// Shared navigation component — hamburger menu for mobile
// Include this script on every page, then call: initNav('pageName')

function initNav(activePage) {
    const pages = [
        { id: 'checklists', href: 'index.html', icon: '📋', label: 'Checklists' },
        { id: 'status', href: 'status.html', icon: '📊', label: 'Status' },
        { id: 'reports', href: 'reports.html', icon: '📈', label: 'Reports' },
        { id: 'procedures', href: 'procedures.html', icon: '📖', label: 'Procedures' },
        { id: 'storage', href: 'storage.html', icon: '📦', label: 'Storage' },
        { id: 'prep', href: 'prep.html', icon: '📝', label: 'Prep Lists' },
        { id: 'waste', href: 'waste.html', icon: '🗑️', label: 'Waste Tracking' },
        { id: 'dashboard', href: 'dashboard.html', icon: '☕', label: 'Sales Dashboard' },
    ];

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
    `;
    document.head.appendChild(style);

    // Find the existing nav element and replace it
    const existingNav = document.querySelector('.nav-bar') || document.querySelector('.nav');
    if (!existingNav) return;

    // Build new nav
    const navContainer = document.createElement('div');
    navContainer.className = 'nav-container';

    // Overlay (closes menu when tapping outside)
    const overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'navOverlay';

    // Header bar
    const header = document.createElement('div');
    header.className = 'nav-header';
    header.innerHTML = `
        <span class="nav-hamburger">☰</span>
        <span class="nav-current">${activeItem.icon} ${activeItem.label}</span>
        <span class="nav-arrow" id="navArrow">▼</span>
    `;

    // Dropdown menu
    const menu = document.createElement('div');
    menu.className = 'nav-menu';
    menu.id = 'navMenu';

    pages.forEach(page => {
        const a = document.createElement('a');
        a.href = page.href;
        if (page.id === activePage) a.className = 'active';
        a.innerHTML = `<span class="nav-menu-icon">${page.icon}</span>${page.label}`;
        menu.appendChild(a);
    });

    navContainer.appendChild(header);
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
}
