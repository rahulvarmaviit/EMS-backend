import { generateToken } from './src/middlewares/auth';
import * as http from 'http';

const t = generateToken({ userId: '8b2ce4f2-396e-47a7-9edf-b822a3c310a1', role: 'EMPLOYEE', employee_id: '123', mobile_number: '123' } as any);

const req = http.request({
    method: 'POST',
    hostname: 'localhost',
    port: 5000,
    path: '/api/tasks/ebc95177-4267-4a7d-98d9-31339b0dee69/comments',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + t
    }
}, (res: any) => {
    let d = '';
    res.on('data', (c: any) => d += c);
    res.on('end', () => console.log('API RESPONSE:', res.statusCode, d));
});

req.write(JSON.stringify({ text: 'Hello from script' }));
req.end();
