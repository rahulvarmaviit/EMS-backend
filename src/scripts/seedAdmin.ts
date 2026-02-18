// Seed Admin Script
// Purpose: Create initial admin user with proper password hash (Updated)
// Run: npx tsx src/scripts/seedAdmin.ts

import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

async function seedAdmin() {
  const mobileNumber = '+1234567890';
  const password = 'admin123';
  const fullName = 'System Admin';

  try {
    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { mobile_number: mobileNumber }
    });

    if (existing) {
      logger.info('Admin user already exists', { mobileNumber });
      console.log('\n========================================');
      console.log('  Admin user already exists!');
      console.log('========================================');
      console.log(`  Mobile: ${mobileNumber}`);
      console.log(`  Password: ${password}`);
      console.log('========================================\n');
    } else {
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create admin user
      await prisma.user.create({
        data: {
          employee_id: 'ADMIN001',
          mobile_number: mobileNumber,
          password_hash: passwordHash,
          full_name: fullName,
          role: 'ADMIN'
        }
      });

      logger.info('Admin user created successfully', { mobileNumber });
      console.log('\n========================================');
      console.log('  Admin user created successfully!');
      console.log('========================================');
      console.log(`  Mobile: ${mobileNumber}`);
      console.log(`  Password: ${password}`);
      console.log(`  Role: ADMIN`);
      console.log('========================================\n');
    }
  } catch (error) {
    logger.error('Error seeding admin user', { error });
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
