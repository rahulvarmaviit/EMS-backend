
try {
    console.log('Starting test...');
    const sa = require('./service-account.json');
    console.log('Loaded JSON. Keys:', Object.keys(sa).join(', '));

    if (!sa.project_id || !sa.client_email || !sa.private_key) {
        console.log('FAIL: Missing required fields in JSON');
        process.exit(1);
    }

    const admin = require('firebase-admin');
    console.log('Loaded firebase-admin');

    admin.initializeApp({
        credential: admin.credential.cert(sa)
    });
    console.log('SUCCESS: Firebase Init passed');
} catch (e) {
    console.log('FAIL_EXCEPTION:', e.message);
}
