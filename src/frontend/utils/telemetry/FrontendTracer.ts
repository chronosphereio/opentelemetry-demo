// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { resourceFromAttributes, detectResources } from '@opentelemetry/resources';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_INSTANCE_ID } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { SessionIdProcessor } from './SessionIdProcessor';

const {
  NEXT_PUBLIC_OTEL_SERVICE_NAME = '',
  NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = '',
  IS_SYNTHETIC_REQUEST = '',
} = typeof window !== 'undefined' ? window.ENV : {};

// use public service to get ip address
let cachedIP: string = '';
async function getIP(): Promise<string> {
  if (cachedIP != '') {
    return cachedIP;
  }
  const response = await fetch('https://api.ipify.org?format=json');
  const data = await response.json();
  cachedIP = data.ip;
  return cachedIP;
}

let resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: NEXT_PUBLIC_OTEL_SERVICE_NAME,
  [ATTR_SERVICE_INSTANCE_ID]:
    typeof window !== 'undefined' ? await getIP() : "unknown ip",
});

const detectedResources = detectResources({ detectors: [browserDetector] });
resource = resource.merge(detectedResources);
// use resource in other files
export const frontendResource = resource;

const FrontendTracer = async () => {
  const { ZoneContextManager } = await import('@opentelemetry/context-zone');

  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new SessionIdProcessor(),
      new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
          }),
          {
            scheduledDelayMillis: 500,
          }
      ),
    ],
  });

  const contextManager = new ZoneContextManager();

  provider.register({
    contextManager,
    propagator: new CompositePropagator({
      propagators: [
        new W3CBaggagePropagator(),
        new W3CTraceContextPropagator()],
    }),
  });

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': {
          propagateTraceHeaderCorsUrls: /.*/,
          clearTimingResources: true,
          applyCustomAttributesOnSpan(span, request, result) {
            span.setAttribute('app.synthetic_request', IS_SYNTHETIC_REQUEST);

            // Capture request headers
            if (request instanceof Request) {
              const cacheControl = request.headers.get('cache-control');
              if (cacheControl) {
                span.setAttribute('http.request.header.cache_control', cacheControl);
              }
              const faultDelay = request.headers.get('x-envoy-fault-delay-request');
              if (faultDelay) {
                span.setAttribute('http.request.header.x_envoy_fault_delay_request', faultDelay);
              }
            }

            // Capture response headers
            if (result instanceof Response) {
              const serviceTime = result.headers.get('x-envoy-upstream-service-time');
              if (serviceTime) {
                span.setAttribute('http.response.header.x_envoy_upstream_service_time', serviceTime);
              }
              const accessControl = result.headers.get('access-control-allow-origin');
              if (accessControl) {
                span.setAttribute('http.response.header.access_control_allow_origin', accessControl);
              }
            }
          },
        },
        '@opentelemetry/instrumentation-user-interaction': {
          eventNames: ["load", "loadeddata", "loadedmetadata", "loadstart"]
        },
      }),
    ],
  });
};

export default FrontendTracer;
