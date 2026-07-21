import { setupAuthRouter } from './auth.js';

function resolvePanel(role) {
    const map = {
        admin: './admin.html',
        restaurant: './restaurant.html',
        customer: './customer.html',
        delivery_person: './delivery.html'
    };
    return map[role] || './customer.html';
}

if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
}

window.addEventListener('load', () => {
    window.scrollTo(0, 0);
});

document.addEventListener('DOMContentLoaded', () => {
    setupAuthRouter({
        onRoleResolved: (role) => {
            window.location.replace(resolvePanel(role));
        }
    });
});

window.addEventListener('popstate', () => {
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('customer.html') || currentPath.includes('restaurant.html') || currentPath.includes('admin.html') || currentPath.includes('delivery.html')) {
        window.scrollTo(0, 0);
    }
});
