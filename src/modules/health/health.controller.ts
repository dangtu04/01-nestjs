import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { Public } from '@/decorator/customize';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get()
  @Public()
  HealthCheck() {
    return 'Server alive';
  }
}
