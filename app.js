import { setupAuthRouter } from './auth.js';

function resolvePanel(role) {
    const map = {
        admin: './admin.html',
        restaurant: './restaurant.html',
        customer: './customer.html',
        delivery_person: './delivery.html',
        seller: './seller.html',
        market_admin: './market-admin.html'
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

    const toggleOtherRoles = document.getElementById('toggleOtherRoles');
    const otherRolesMenu = document.getElementById('otherRolesMenu');
    if (toggleOtherRoles && otherRolesMenu) {
        toggleOtherRoles.addEventListener('click', () => {
            otherRolesMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (event) => {
            if (!otherRolesMenu.contains(event.target) && !toggleOtherRoles.contains(event.target)) {
                otherRolesMenu.classList.add('hidden');
            }
        });
    }

});

window.addEventListener('popstate', () => {
    const currentPath = window.location.pathname.toLowerCase();
    if (currentPath.includes('customer.html') || currentPath.includes('restaurant.html') || currentPath.includes('admin.html') || currentPath.includes('delivery.html') || currentPath.includes('seller.html') || currentPath.includes('market-admin.html')) {
        window.scrollTo(0, 0);
    }
});
