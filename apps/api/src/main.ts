import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { configureApp, logStartup } from './bootstrap';
import { EnvValidationError, type Env, loadEnv } from './config/env';

/**
 * Validates configuration before anything else exists.
 *
 * Running this ahead of `NestFactory.create` is the difference between one clear
 * message and a dependency-resolution stack trace with the real cause buried in
 * it (acceptance case 6).
 */
function loadEnvOrExit(): Env {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const env = loadEnvOrExit();

  const app = await NestFactory.create(AppModule.register(env), {
    logger: env.NODE_ENV === 'production' ? ['error', 'warn', 'log'] : undefined,
    // Nest installs its own body parser with Express's 100kb default, which would
    // silently override the limit configured in `configureApp`. Disabled so there
    // is exactly one body parser and exactly one limit.
    bodyParser: false,
  });

  configureApp(app, env);

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('FITTA API')
      .setDescription('Egyptian-first fitness and nutrition platform')
      .setVersion('0.0.0')
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.PORT);
  logStartup(env);
}

void bootstrap();
