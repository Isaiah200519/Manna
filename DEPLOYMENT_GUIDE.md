# MANNA Firebase Deployment Guide

This guide walks through deploying the MANNA frontend to Firebase Hosting and securing the Firestore database with the provided rules.

## 1. Prerequisites
- A Firebase project already created.
- Node.js installed.
- A Google account with access to the Firebase project.
- The Firebase project config already present in the app.

## 2. Install Firebase CLI
If you do not already have the Firebase CLI installed, run:

```bash
npm install -g firebase-tools
```

Verify:

```bash
firebase --version
```

## 3. Sign in to Firebase
Run:

```bash
firebase login
```

This opens a browser window for authentication.

## 4. Initialize Firebase Hosting in the project
From the project folder:

```bash
firebase init hosting
```

Choose the following when prompted:
- Select the Firebase project you created.
- Set the public directory to the project root, usually `.`
- Configure as a single-page app: `N` unless you specifically want SPA routing.
- Do not overwrite your existing HTML files unless asked.

If you already have a Firebase Hosting config, you can skip initialization.

## 5. Prepare the app for deployment
Make sure these files are present in the project root:
- `index.html`
- `customer.html`
- `restaurant.html`
- `admin.html`
- `delivery.html`
- `style.css`
- `customer.css`
- `restaurant.css`
- `admin.css`
- `delivery.css`
- `customer-panel.js`
- `restaurant-panel.js`
- `admin-panel.js`
- `delivery-panel.js`
- `firebase-config.js`
- `utils.js`
- `firestore.rules`

## 6. Deploy the frontend to Firebase Hosting
Run:

```bash
firebase deploy --only hosting
```

This publishes the app to your Firebase Hosting URL.

## 7. Deploy Firestore rules
Run:

```bash
firebase deploy --only firestore:rules
```

This uploads the rules from [firestore.rules](firestore.rules).

## 8. Enable Firebase services in the console
In the Firebase console, confirm these are enabled:
- Authentication
- Firestore Database
- Hosting

## 9. Authentication setup
In Firebase Console > Authentication > Sign-in method, enable:
- Email/Password

You can add more providers later if needed.

## 10. Firestore database setup
In Firebase Console > Firestore Database:
- Create a database in production mode.
- Choose a location near your target users.
- Start with the default rules and then replace them with the rules from [firestore.rules](firestore.rules).

## 11. Test the production app
After deploying:
- Open the Hosting URL.
- Create a customer account.
- Save a delivery location.
- Place an order.
- Confirm the restaurant, delivery, and admin views reflect the order.

## 12. Final production checklist
- HTTPS is enabled.
- Authentication works.
- Firestore rules are active.
- Geolocation works over HTTPS or localhost.
- Orders move correctly through the workflow.
- Admin can oversee the platform.

## 13. Quick deploy launch checklist
Use this checklist to confirm everything is ready for production:
- [ ] Firebase hosting deploy completed successfully.
- [ ] Firestore security rules deployed and verified.
- [ ] Authentication Email/Password sign-in enabled.
- [ ] App pages load from the published hosting URL without 404s.
- [ ] Customer, restaurant, delivery, and admin views sign in correctly.
- [ ] New test order is created and shows up in all workflows.
- [ ] Logos and icon assets display correctly in browser tabs.
- [ ] LocalStorage onboarding experience appears for new users.
- [ ] Support/help modal and in-app messaging are accessible.
- [ ] Production Firebase project is selected (not staging/dev).
- [ ] Hosting URL is secured with HTTPS.
- [ ] Smoke test completed on desktop and mobile browser views.
