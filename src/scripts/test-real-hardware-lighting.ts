import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app/app.module';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';
import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingStatus } from '@prisma/client';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const orchestrator = app.get(LightingOrchestratorService);
  const db = app.get(DatabaseService);

  console.log('--- TESTE REAL DE HARDWARE ---');

  // 1. Buscar o court configurado
  const court = await db.court.findFirst({
    where: { lightingDeviceId: { hasSome: ['bfd3a8d361a0df83744k8j'] } }
  });

  if (!court) {
    console.error('Court não encontrado! Verifique se os IDs dos dispositivos estão corretos no banco.');
    return;
  }

  const user = await db.user.findFirst();
  if (!user) {
    console.error('Nenhum usuário encontrado no sistema.');
    return;
  }

  // 2. Criar reserva para começar em 5 segundos
  const now = new Date();
  const startTime = new Date(now.getTime() + 5000); 
  const endTime = new Date(startTime.getTime() + 600000); // 10 min

  console.log(`Criando reserva real para o court: ${court.name}`);
  console.log(`Início previsto: ${startTime.toISOString()}`);

  const booking = await db.booking.create({
    data: {
      courtId: court.id,
      organizerId: user.id,
      startAt: startTime,
      endAt: endTime,
      durationMinutes: 10,
      totalPrice: 10,
      currency: 'MZN',
      status: BookingStatus.CONFIRMED,
      participants: {
        create: { userId: user.id, status: 'ACCEPTED', isOrganizer: true }
      }
    }
  });

  console.log('Reserva criada! Aguardando 7 segundos...');
  await new Promise(resolve => setTimeout(resolve, 7000));

  console.log('Chamando Orquestrador para ligar as luzes REAIS...');
  try {
    const processed = await orchestrator.processAutomaticLighting();
    console.log(`Sucesso! ${processed} dispositivos processados.`);
    if (processed === 0) {
      console.warn('Atenção: Nenhuma luz foi processada. Verifique se o horário da reserva coincide com o horário do servidor.');
    }
  } catch (error) {
    console.error('Erro ao processar iluminação real:', error.message);
  }

  // Cleanup opcional
  // await db.booking.delete({ where: { id: booking.id } });

  console.log('Teste concluído. Verifique as lâmpadas!');
  await app.close();
}

main().catch(console.error);
