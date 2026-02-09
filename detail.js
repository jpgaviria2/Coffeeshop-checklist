// Detail page - Show full checklist submission details

// Staff name mapping
const STAFF_NAMES = {
    'd4ed245d98f8867bba709f820e83f65884791076d189e92be0c595f78daf1ccd': 'JP',
    '18885710185087db597d078afd46e4ed5ce001a554694de68b53f94393f7f49f': 'Charlene',
    '6d3907327333dfb1b6f6100f9fdd1c6cbaa50b3acc801cf4cf5d937b838ee80b': 'Diana'
};

window.addEventListener('DOMContentLoaded', () => {
    const eventData = sessionStorage.getItem('checklistDetail');
    
    if (!eventData) {
        document.getElementById('detailContent').innerHTML = '<p style="color: #999;">No checklist data found.</p>';
        return;
    }
    
    const event = JSON.parse(eventData);
    renderDetail(event);
});

function renderDetail(event) {
    const content = JSON.parse(event.content);
    const checklistType = content.checklist;
    const timestamp = new Date(event.created_at * 1000);
    
    // Get submitter name or fallback to pubkey snippet
    const staffName = STAFF_NAMES[event.pubkey] || event.pubkey.substring(0, 8);
    
    const typeLabels = {
        'opening': '🌅 Opening Checklist',
        'closing': '🌙 Closing Checklist',
        'inventory': '📦 Inventory Handover'
    };
    
    // Update header
    document.getElementById('headerTitle').textContent = typeLabels[checklistType] || 'Checklist Detail';
    document.getElementById('detailTitle').textContent = typeLabels[checklistType] || checklistType;
    
    // Update meta
    const meta = document.getElementById('detailMeta');
    meta.innerHTML = `
        <div><strong>Submitted:</strong> ${formatDateTime(timestamp)}</div>
        <div><strong>Staff:</strong> ${staffName}</div>
    `;
    
    // Render content based on type
    const contentDiv = document.getElementById('detailContent');
    
    if (checklistType === 'inventory') {
        renderInventoryDetail(content, contentDiv);
    } else {
        renderChecklistDetail(content, contentDiv);
    }
}

function renderChecklistDetail(content, container) {
    const section = document.createElement('div');
    section.className = 'section';
    
    const title = document.createElement('div');
    title.className = 'section-title';
    title.textContent = `Tasks (${content.completionRate})`;
    
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    
    content.items.forEach(item => {
        const taskDiv = document.createElement('div');
        taskDiv.className = 'task-item';
        
        const checkbox = document.createElement('div');
        checkbox.className = `task-checkbox ${item.completed ? 'completed' : 'incomplete'}`;
        checkbox.textContent = item.completed ? '✓' : '✗';
        
        const text = document.createElement('div');
        text.className = 'task-text';
        text.textContent = item.task;
        
        taskDiv.appendChild(checkbox);
        taskDiv.appendChild(text);
        taskList.appendChild(taskDiv);
    });
    
    section.appendChild(title);
    section.appendChild(taskList);
    container.appendChild(section);
}

function renderInventoryDetail(content, container) {
    const inventory = content.inventory;
    
    // Milk & Dairy section
    if (inventory.milk) {
        const milkItems = [
            { label: '3.5% Milk (jugs)', value: inventory.milk.milk35 },
            { label: '2% Milk (jugs)', value: inventory.milk.milk2 },
            { label: 'Oat Milk (1L)', value: inventory.milk.oatMilk1L },
            { label: 'Soy Milk (1L)', value: inventory.milk.soyMilk1L },
            { label: 'Half & Half 10% (1L)', value: inventory.milk.halfAndHalf },
            { label: 'Whole Milk', value: inventory.milk.whole },
            { label: 'Almond Milk', value: inventory.milk.almond },
            { label: 'Soy Milk', value: inventory.milk.soy }
        ];
        
        const section = createInventorySection('🥛 Milk & Dairy Products', milkItems);
        container.appendChild(section);
    }
    
    // Greek Yogurt
    if (inventory.dairy) {
        const section = createInventorySection('🥛 Dairy', [
            { label: 'Greek Yogurt (3kg)', value: inventory.dairy.greekYogurt3kg }
        ]);
        container.appendChild(section);
    }
    
    // Beans section
    if (inventory.beans) {
        const section = createInventorySection('☕ Coffee Beans', [
            { label: 'Regular Beans (5lb)', value: inventory.beans.regular },
            { label: 'Decaf Beans (5lb)', value: inventory.beans.decaf },
            { label: 'Coffee Bags (1lb)', value: inventory.coffeeBags }
        ]);
        container.appendChild(section);
    }
    
    // Pastries section
    if (inventory.pastries) {
        const section = createInventorySection('🥐 Pastries', [
            { label: 'Ham & Cheese', value: inventory.pastries.hamCheese },
            { label: 'Chocolate', value: inventory.pastries.chocolate },
            { label: 'Plain', value: inventory.pastries.plain },
            { label: 'Banana Bread', value: inventory.pastries.bananaBread },
            { label: 'Lemon Loaf', value: inventory.pastries.lemonLoaf },
            { label: 'Cinnamon Buns', value: inventory.pastries.cinnamonBuns }
        ]);
        container.appendChild(section);
    }
}

function createInventorySection(title, items) {
    const section = document.createElement('div');
    section.className = 'section';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'section-title';
    titleDiv.textContent = title;
    
    const grid = document.createElement('div');
    grid.className = 'inventory-grid';
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-card';
        
        const label = document.createElement('div');
        label.className = 'inventory-label';
        label.textContent = item.label;
        
        const value = document.createElement('div');
        value.className = 'inventory-value';
        value.textContent = item.value !== undefined ? item.value : '0';
        
        card.appendChild(label);
        card.appendChild(value);
        grid.appendChild(card);
    });
    
    section.appendChild(titleDiv);
    section.appendChild(grid);
    
    return section;
}

function formatDateTime(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${dayName}, ${month} ${day}, ${year} at ${displayHours}:${minutes} ${ampm}`;
}

function goBack() {
    window.location.href = 'status.html';
}
