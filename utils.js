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

export async function deleteOrder(orderId, firestore, options = {}) {
    if (!orderId || !firestore) return false;
    const { onSuccess, onError, userId, role } = options;
    try {
        const update = { isDeleted: true, updatedAt: new Date() };
        await firestore.collection('orders').doc(orderId).set(update, { merge: true });
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    } catch (error) {
        if (typeof onError === 'function') onError(error);
        return false;
    }
}

export function getAddonImageUrl(filename, fallback = './images/placeholder.png') {
    if (!filename) return fallback;
    const normalized = String(filename).trim();
    if (!normalized) return fallback;
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized.startsWith('./') || normalized.startsWith('../') || normalized.startsWith('/')) return normalized;
    if (normalized.startsWith('images/')) return `./${normalized}`;
    return `./images/adds-on/${normalized}`;
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

export function calculateDistance(lat1, lon1, lat2, lon2) {
    const parsedLat1 = Number(lat1);
    const parsedLon1 = Number(lon1);
    const parsedLat2 = Number(lat2);
    const parsedLon2 = Number(lon2);

    if (![parsedLat1, parsedLon1, parsedLat2, parsedLon2].every(Number.isFinite)) {
        return null;
    }

    const R = 6371;
    const dLat = (parsedLat2 - parsedLat1) * (Math.PI / 180);
    const dLon = (parsedLon2 - parsedLon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(parsedLat1 * (Math.PI / 180)) * Math.cos(parsedLat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(2));
}
