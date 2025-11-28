import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe, Logger, BadRequestException } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());

  const globalPrefix = "api";
  app.setGlobalPrefix(globalPrefix);

  const normalizeDomain = (value: string | undefined | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  };

  const tenantOrigins = [
    "https://myrent.uz",
    "https://www.myrent.uz",
    "https://rizq-baraka.myrent.uz",
    "https://muzaffar-savdo.myrent.uz",
    "https://istiqlol.myrent.uz",
    "https://bogdod.myrent.uz",
    "https://beshariq.myrent.uz",
    "https://beshariq-turon.myrent.uz",
    "https://test.myrent.uz",
  ];

  const otherOrigins = [
    "https://myrent-front.vercel.app",
    "https://myrent-front-2ytj097cp-barkamolvaliy-2769s-projects.vercel.app",
    "http://localhost:5173",
  ];

  const envOrigin = normalizeDomain(process.env.MY_DOMAIN);
  if (envOrigin) tenantOrigins.push(envOrigin);

  const allowedOrigins = Array.from(new Set([...tenantOrigins, ...otherOrigins]));

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      const isTenantOrigin = origin.endsWith(".myrent.uz");
      const isLocalhost =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

      if (allowedOrigins.includes(origin) || isTenantOrigin || isLocalhost) {
        return callback(null, true);
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: "*",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
      transform: true,
      stopAtFirstError: false,
      skipMissingProperties: false,
      exceptionFactory: (errors) => {
        console.log(errors)
        const formattedErrors = errors.map((err) => ({
          field: err.property,
          errors: Object.values(err.constraints || {}),
        }));

        return new BadRequestException({
          message: "Validation failed",
          errors: formattedErrors,
        });
      },
    })
  );

  const config = new DocumentBuilder()
    .setTitle("Bozor API")
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(
    `🚀 Server running at http://localhost:${port}/${globalPrefix}`,
    "Bootstrap"
  );
  Logger.log(
    `📄 Swagger docs available at http://localhost:${port}/${globalPrefix}/docs`,
    "Swagger"
  );
}

bootstrap();
