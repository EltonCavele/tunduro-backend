import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deviceIds = [
    'bfd3a8d361a0df83744k8j',
    'bffab8539dcfaf575czumb',
    'bfb6ddb12ffc0e2a25yrnx'
  ];

  const court = await prisma.court.findFirst();
  if (!court) {
    console.log('No court found to update.');
    return;
  }

  await prisma.court.update({
    where: { id: court.id },
    data: {
      lightingDeviceId: deviceIds,
      hasLighting: true,
    },
  });

  console.log(`Updated court ${court.id} with device IDs: ${deviceIds.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
