import 'dotenv/config';

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { NodeSDK } from '@opentelemetry/sdk-node';

const isTelemetryEnabled = process.env.OTEL_SDK_DISABLED !== 'true';

process.env.OTEL_METRICS_EXPORTER ??= 'none';
process.env.OTEL_LOGS_EXPORTER ??= 'none';

if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'secure-callback-hub',
  traceExporter: new OTLPTraceExporter({
    url:
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
      'http://localhost:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
    }),
    new NestInstrumentation(),
  ],
});

if (isTelemetryEnabled) {
  sdk.start();
}

const shutdown = async () => {
  if (!isTelemetryEnabled) {
    process.exit(0);
  }

  try {
    await sdk.shutdown();
    process.exit(0);
  } catch {
    process.exit(1);
  }
};

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});
