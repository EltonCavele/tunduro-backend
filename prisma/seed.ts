import 'dotenv/config';

import argon2 from 'argon2';
import { Gender, PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_PREFIX = 'seed-';
const PASSWORD = 'secret123';
const ADMIN_EMAIL = 'admin@seed.tunduro.local';
const EMPLOYEE_EMAIL = 'employee.payments.1@seed.tunduro.local';

const REQUIRED_TABLES = ['users'] as const;

const ids = {
  users: {
    admin: `${SEED_PREFIX}user-admin`,
    employeeOne: `${SEED_PREFIX}user-employee-one`,
  },
};

async function assertSchemaIsReady() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `;

  const existingTables = new Set(rows.map(row => row.table_name));
  const missingTables = REQUIRED_TABLES.filter(
    tableName => !existingTables.has(tableName)
  );

  if (missingTables.length > 0) {
    throw new Error(
      [
        'Database schema is incomplete for this seed.',
        `Missing tables: ${missingTables.join(', ')}`,
        'Apply the Prisma schema first with one of these commands:',
        '  npx prisma migrate deploy',
        '  npx prisma db push',
        'Then run:',
        '  npx prisma db seed',
      ].join('\n')
    );
  }
}

async function cleanupSeedData() {
  await prisma.userOtp.deleteMany({
    where: { id: { startsWith: SEED_PREFIX } },
  });
}

async function ensureAdmin(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isVerified: true,
      phone: '+258840000001',
      gender: Gender.OTHER,
      role: Role.ADMIN,
    },
    create: {
      id: ids.users.admin,
      email: ADMIN_EMAIL,
      password: passwordHash,
      firstName: 'System',
      lastName: 'Admin',
      isVerified: true,
      phone: '+258840000001',
      gender: Gender.OTHER,
      role: Role.ADMIN,
    },
  });
}

async function ensureEmployees(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: EMPLOYEE_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'Payments',
      lastName: 'Employee One',
      isVerified: true,
      phone: '+258840000011',
      gender: Gender.OTHER,
      role: Role.EMPLOYEE,
    },
    create: {
      id: ids.users.employeeOne,
      email: EMPLOYEE_EMAIL,
      password: passwordHash,
      firstName: 'Payments',
      lastName: 'Employee One',
      isVerified: true,
      phone: '+258840000011',
      gender: Gender.OTHER,
      role: Role.EMPLOYEE,
    },
  });
}

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);

  await assertSchemaIsReady();
  await cleanupSeedData();

  await ensureAdmin(passwordHash);
  await ensureEmployees(passwordHash);

  console.log('Seed completed successfully.');
  console.log(`Admin credentials: ${ADMIN_EMAIL} / ${PASSWORD}`);
  console.log(`Employee credentials: ${EMPLOYEE_EMAIL} / ${PASSWORD}`);
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
