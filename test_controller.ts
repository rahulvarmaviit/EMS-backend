import { addTaskComment } from './src/controllers/taskController';
const req = {
    params: { id: 'ebc95177-4267-4a7d-98d9-31339b0dee69' },
    body: { text: 'Testing from script' },
    user: { userId: '8b2ce4f2-396e-47a7-9edf-b822a3c310a1', role: 'EMPLOYEE' }
};
const res = {
    status: (code: any) => {
        console.log('STATUS:', code);
        return {
            json: (data: any) => console.log('JSON:', JSON.stringify(data))
        };
    },
    json: (data: any) => console.log('JSON:', JSON.stringify(data))
};
addTaskComment(req as any, res as any).catch(console.error);
