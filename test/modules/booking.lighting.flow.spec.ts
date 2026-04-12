import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from 'src/modules/booking/services/booking.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';
import { TuyaClientService } from 'src/modules/lighting/services/tuya-client.service';
import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingModule } from 'src/modules/booking/booking.module';
import { LightingModule } from 'src/modules/lighting/lighting.module';
import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';
import { ConfigModule } from '@nestjs/config';
import { CustomLoggerModule } from 'src/common/logger/logger.module';
import configs from 'src/common/config/index';

describe('Booking Lighting Flow E2E (Simplified)', () => {
  let bookingService: BookingService;
  let lightingOrchestrator: LightingOrchestratorService;
  let tuyaClient: TuyaClientService;
  let db: DatabaseService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: configs,
          isGlobal: true,
        }),
        CustomLoggerModule,
        DatabaseModule,
        HelperModule,
        BookingModule,
        LightingModule,
      ],
    }).compile();

    bookingService = module.get<BookingService>(BookingService);
    lightingOrchestrator = module.get<LightingOrchestratorService>(LightingOrchestratorService);
    tuyaClient = module.get<TuyaClientService>(TuyaClientService);
    db = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  it('should handle full lighting lifecycle: ON when starting, OFF when ending (REAL HARDWARE)', async () => {
    // 1. Setup - NENHUM MOCK AQUI para o hardware real funcionar
    const court = await db.court.findFirst({
        where: { lightingDeviceId: { hasSome: ['bfd3a8d361a0df83744k8j'] } }
    });
    const user = await db.user.findFirst();
    expect(court).toBeDefined();
    expect(user).toBeDefined();

    // Criamos um spy apenas para observação, sem mockar o comportamento (callThrough)
    const sendSwitchSpy = jest.spyOn(tuyaClient, 'sendSwitch');

    const now = new Date();
    // Booking 1: Começa em 3 segundos
    const startTimeOn = new Date(now.getTime() + 3000); 
    const endTimeOn = new Date(startTimeOn.getTime() + 10000); 

    const booking = await db.booking.create({
      data: {
        courtId: court!.id,
        organizerId: user!.id, 
        startAt: startTimeOn,
        endAt: endTimeOn,
        durationMinutes: 1,
        totalPrice: 1,
        currency: 'MZN',
        status: 'CONFIRMED',
        participants: { create: { userId: user!.id, status: 'ACCEPTED', isOrganizer: true } }
      }
    });

    // --- TESTE LIGAR ---
    console.log('Aguardando início do booking para LIGAR HARDWARE REAL...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    const processedOn = await lightingOrchestrator.processAutomaticLighting();
    
    expect(processedOn).toBeGreaterThanOrEqual(1);
    console.log('Comando de LIGAR enviado com sucesso para o hardware.');

    // --- TESTE DESLIGAR ---
    // Atualiza o booking para ter expirado há 30 segundos
    const justExpired = new Date(Date.now() - 30000);
    const wayEarlier = new Date(justExpired.getTime() - 600000);
    await db.booking.update({
        where: { id: booking.id },
        data: { startAt: wayEarlier, endAt: justExpired }
    });

    console.log('Aguardando 2 segundos e rodando orquestrador para DESLIGAR HARDWARE REAL...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const processedOff = await lightingOrchestrator.processAutomaticLighting();
    
    expect(processedOff).toBeGreaterThanOrEqual(1);
    console.log('Comando de DESLIGAR enviado com sucesso para o hardware.');

    // Cleanup
    await db.booking.delete({ where: { id: booking.id } });
    
    // Pequeno delay final para garantir que as conexões fechem
    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 60000);
});
