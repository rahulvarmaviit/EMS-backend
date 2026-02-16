import { prisma } from './src/config/database';
import bcrypt from 'bcryptjs';

async function checkUser() {
    const mobile = '1001021001';
    try {
        const user = await prisma.user.findUnique({
            where: { mobile_number: mobile },
        });

        if (user) {
            console.log('User found:', {
                id: user.id,
                mobile: user.mobile_number,
                role: user.role,
                isActive: user.is_active,
                deviceId: user.device_id
            });

            // Check password
            const isMatch = await bcrypt.compare('superadmin', user.password_hash);
            console.log('Password match for "superadmin":', isMatch);
        } else {
            console.log('User not found with mobile:', mobile);
        }
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

checkUser();
