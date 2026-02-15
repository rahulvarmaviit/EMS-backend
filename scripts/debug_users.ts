
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Listing All Users and Roles ---');
        const users = await prisma.user.findMany({
            select: {
                id: true,
                full_name: true,
                role: true,
                email: true,
                mobile_number: true,
                team: { select: { name: true } }
            }
        });

        console.log('\n--- Simulation: notifyUsersByRole("ADMIN") ---');
        const admins = await prisma.user.findMany({
            where: {
                role: 'ADMIN',
                is_active: true,
            },
            select: {
                id: true,
                full_name: true,
                role: true
            }
        });

        console.log('\n--- Simulation: notifyUsersByRole("EMPLOYEE") ---');
        const employees = await prisma.user.findMany({
            where: {
                role: 'EMPLOYEE',
                is_active: true,
            },
            select: {
                id: true,
                full_name: true,
                role: true
            }
        });

        const output = {
            users,
            targetedAdmins: admins,
            targetedEmployeesCount: employees.length
        };

        fs.writeFileSync('debug_output.json', JSON.stringify(output, null, 2));
        console.log('Debug output written to debug_output.json');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
