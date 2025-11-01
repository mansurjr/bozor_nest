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

  app.enableCors({
    origin: ["https://myrent-front-2ytj097cp-barkamolvaliy-2769s-projects.vercel.app", "https://myrent-front.vercel.app", process.env.MY_DOMAIN!, "http://localhost:5173"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowHeaders: "*",
    credentials: true,
  })

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
