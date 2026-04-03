import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app/app.module';
import { HelperNotificationService } from './src/common/helper/services/helper.notification.service';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // Pode ser que tenhamos que passar strict: false para pegar providers injetados globais ou de módulos filhos 
  // caso o modulo Helper não exporte o serviço pro AppModule, mas usualmente app.get com strict: false funciona
  const notificationService = app.get(HelperNotificationService, { strict: false });
  const prisma = new PrismaClient();

  try {
    const emailToTest = 'eltoncavele8@gmail.com';
    console.log(`Buscando usuário com email: ${emailToTest}`);

    // Connect to database
    await prisma.$connect();

    const user = await prisma.user.findUnique({
      where: { email: emailToTest },
    });

    if (!user) {
      console.log(`Usuário com email ${emailToTest} não foi encontrado.`);
      return;
    }

    console.log(`Usuário encontrado: ${user.id} / ${user.firstName}`);
    console.log(`Expo Push Token: ${user.expoPushToken || 'NÃO DEFINIDO'}`);

    // Test Push Notification
    if (user.expoPushToken) {
      console.log('\n--- Testando Push Notification ---');
      const pushResult = await notificationService.sendPush({
        to: user.expoPushToken,
        title: 'Teste de Notificação Push',
        body: 'Esta é uma notificação de teste do Tunduro. Se você recebeu isso, está funcionando!'
      });
      console.log('Push Result:', pushResult);
    } else {
      console.log('\n--- Pulando Teste de Push (Sem Token) ---');
    }

    // Test Email Notification
    console.log('\n--- Testando Email ---');
    const emailResult = await notificationService.sendEmail({
      to: user.email,
      subject: 'Teste de Email Tunduro',
      html: '<h1>Teste de Email Tunduro</h1><p>Se você recebeu esse email, a integração com Resend está funcionando corretamente!</p>',
      text: 'Se você recebeu esse email, a integração com Resend está funcionando corretamente!'
    });
    console.log('Email Result:', emailResult);

  } catch (error) {
    console.error('Erro ao executar teste:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

bootstrap();
