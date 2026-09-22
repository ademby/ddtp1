import {
  Controller,
  Get,
  Header,
  Injectable,
  Logger,
  Param,
  ParseIntPipe,
  StreamableFile,
} from "@nestjs/common";
import { SignalQualityService } from "./signal-quality.service.js";

@Injectable()
@Controller("signal-quality")
export class SignalQualityController {
  private readonly logger: Logger = new Logger(SignalQualityController.name);

  constructor(private readonly signalQuality: SignalQualityService) {}

  @Get("range")
  range() {
    return this.signalQuality.getRange();
  }

  @Get("tiles/:z/:x/:y")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async tile(
    @Param("z", ParseIntPipe) z: number,
    @Param("x", ParseIntPipe) x: number,
    @Param("y", ParseIntPipe) y: number,
  ): Promise<StreamableFile> {
    const grid = await this.signalQuality.getTile({ z, x, y });
    const buffer = Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength);
    return new StreamableFile(buffer, {
      type: "application/octet-stream",
      length: buffer.byteLength,
    });
  }
}
