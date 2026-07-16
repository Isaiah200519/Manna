export function resolveRestaurantPaymentDetails(restaurant = {}, cart = {}) {
    const fallbackMethods = ['mobile_money', 'cash'];
    const cartMethods = Array.isArray(cart.restaurantAcceptedPaymentMethods)
        ? cart.restaurantAcceptedPaymentMethods.filter(Boolean)
        : [];
    const restaurantMethods = Array.isArray(restaurant?.acceptedPaymentMethods)
        ? restaurant.acceptedPaymentMethods.filter(Boolean)
        : [];
    const acceptedPaymentMethods = (cartMethods.length ? cartMethods : restaurantMethods.length ? restaurantMethods : fallbackMethods)
        .map((method) => String(method).trim().toLowerCase())
        .filter(Boolean);

    const paymentReceiver = String(
        cart.restaurantPaymentReceiver || restaurant?.mobileMoneyNumber || restaurant?.paymentReceiver || restaurant?.paymentPhone || ''
    ).trim();

    return {
        restaurantMobileMoney: paymentReceiver,
        restaurantPaymentReceiver: paymentReceiver,
        acceptedPaymentMethods: acceptedPaymentMethods.length ? acceptedPaymentMethods : fallbackMethods
    };
}
