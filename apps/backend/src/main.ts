import "dotenv/config";
import "reflect-metadata";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";
import { ApiError } from "./common/api-error.js";

// Express's default body-parser limit (100kb) is well under a review revision's payload when
// an operator rejects a large batch of measurements (each id + JSON overhead adds up fast).
// Raised explicitly rather than left to the default.
const REQUEST_BODY_LIMIT = "20mb";

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : (exception as Error).message || "Internal server error";
    const stack = exception instanceof Error ? exception.stack : "";
    // Log the error using NestJS Logger
    this.logger.error(
      `Method: ${request.method} | URL: ${request.url} | Message: ${JSON.stringify(message)}`,
      stack,
    );
    if (exception instanceof ApiError) {
      response.status(exception.statusCode).json({ error: exception.message });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response
        .status(status)
        .json({
          error:
            typeof payload === "string"
              ? payload
              : ((payload as { message?: unknown }).message ??
                "Request failed."),
        });
      return;
    }
    response.status(500).json({ error: "Internal server error." });
  }
}

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "debug", "verbose", "warn", "error"],
    bodyParser: false,
  });
  app.use(json({ limit: REQUEST_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
  app.enableCors({ origin: "*" });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();
