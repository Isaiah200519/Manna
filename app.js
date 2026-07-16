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
            window.location.href = resolvePanel(role);
        }
    });
});
