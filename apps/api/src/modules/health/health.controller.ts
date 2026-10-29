import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type HealthResponse, type ReadinessResponse } from '@fitta/contracts';
import { type Response } from 'express';

import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Returns 200 whenever the process is running. Checks no dependencies.',
  })
  @ApiOkResponse({ description: 'Process is alive.' })
  getHealth(): HealthResponse {
    return this.health.getLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Verifies PostgreSQL connectivity. Returns 503 when a dependency is unavailable so that ' +
      'load balancers and orchestrators stop routing traffic here.',
  })
  @ApiOkResponse({ description: 'All dependencies reachable.' })
  @ApiResponse({ status: 503, description: 'A dependency is unavailable.' })
  async getReady(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const result = await this.health.getReadiness();

    // The status code is the contract. A 200 carrying `{"status":"degraded"}`
    // keeps an unserviceable instance in the load balancer's rotation, because
    // nothing in that path parses the body.
    res.status(result.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return result;
  }
}
