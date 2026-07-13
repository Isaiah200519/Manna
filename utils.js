export function formatCurrency(value) {
    return `L$${Number(value || 0).toLocaleString('en-LR')}`;
}

export function formatDate(value) {
    if (!value) return '—';
    const date = value.toDate ? value.toDate() : new Date(value);
    return new Intl.DateTimeFormat('en-LR', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
}

export function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getInitials(name = 'Admin') {
    return name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
}

export function createToast(message, type = 'info') {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    root.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
}

export function confirmDialog(message) {
    return window.confirm(message);
}

export function getImageUrl(filename, fallback = './images/placeholder.png') {
    if (!filename) return fallback;
    const normalized = String(filename).trim();
    if (!normalized) return fallback;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('images/')) return `./${normalized}`;
    return `./images/products/${normalized}`;
}

export function getRestaurantImageUrl(restaurantOrLogo, fallback = './images/placeholder.png') {
    if (!restaurantOrLogo) return fallback;
    const candidate = typeof restaurantOrLogo === 'string' ? restaurantOrLogo : (restaurantOrLogo.logo || restaurantOrLogo.image || restaurantOrLogo.imagePath || restaurantOrLogo.restaurantImage || '');
    const normalized = String(candidate).trim();
    if (!normalized) return fallback;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('images/')) return `./${normalized}`;
    return `./images/restaurants/${normalized}`;
}

export function getRestaurantLogo(logo, fallback = './images/placeholder.png') {
    return getRestaurantImageUrl(logo, fallback);
}

export function slugify(value = '') {
    return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
