// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { Span } from '@opentelemetry/api';
import { CompositePropagator, W3CBaggagePropagator } from '@opentelemetry/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { resourceFromAttributes, detectResources } from '@opentelemetry/resources';
import { browserDetector } from '@opentelemetry/opentelemetry-browser-detector';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { initSDK, user } from '@embrace-io/web-sdk';
import SessionGateway from '../../gateways/Session.gateway';
import { SessionIdProcessor } from './SessionIdProcessor';
import { SessionPartFilterProcessor } from './SessionPartFilterProcessor';
import { TraceparentPropagator } from './TraceparentPropagator';
import { markTelemetryReady, setSessionProperty } from './Telemetry';

const DEFAULT_EMBRACE_APP_ID = 'xwoqb';

const {
  NEXT_PUBLIC_OTEL_SERVICE_NAME = '',
  NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = '',
  NEXT_PUBLIC_EMBRACE_APP_ID = '',
  NEXT_PUBLIC_APP_VERSION = '',
  IS_SYNTHETIC_REQUEST = '',
} = typeof window !== 'undefined' ? window.ENV : {};

const FrontendTracer = async () => {
  const { ZoneContextManager } = await import('@opentelemetry/context-zone');

  let resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: NEXT_PUBLIC_OTEL_SERVICE_NAME,
  });
  const detectedResources = detectResources({detectors: [browserDetector]});
  resource = resource.merge(detectedResources);

  const collectorTracesUrl = NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces';
  const contextManager = new ZoneContextManager();
  const propagator = new CompositePropagator({
    propagators: [
      new W3CBaggagePropagator(),
      new TraceparentPropagator()],
  });
  const spanProcessors = [
    new SessionIdProcessor(),
    new SessionPartFilterProcessor(
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: collectorTracesUrl,
        }),
        {
          scheduledDelayMillis: 500,
        }
      )
    ),
  ];
  const fetchInstrumentationConfig = {
    propagateTraceHeaderCorsUrls: /.*/,
    clearTimingResources: true,
    applyCustomAttributesOnSpan(span: Span) {
      span.setAttribute('demo.synthetic_request', IS_SYNTHETIC_REQUEST);
    },
  };

  const sdk = initSDK({
    appID: NEXT_PUBLIC_EMBRACE_APP_ID || DEFAULT_EMBRACE_APP_ID,
    appVersion: NEXT_PUBLIC_APP_VERSION || undefined,
    resource,
    contextManager,
    propagator,
    spanProcessors,
    additionalQueryParamsToScrub: ['order'],
    defaultInstrumentationConfig: {
      network: {
        // Matches URLs on the Embrace config and data hosts, e.g. https://a-<appID>.data.emb-api.com/v2/logs
        ignoreUrls: [collectorTracesUrl, /^https:\/\/[\w.-]+\.emb-api\.com\//],
      },
      '@opentelemetry/instrumentation-fetch': fetchInstrumentationConfig,
      '@opentelemetry/instrumentation-xml-http-request': {
        propagateTraceHeaderCorsUrls: /.*/,
      },
    },
  });

  if (sdk) {
    const { userId, currencyCode } = SessionGateway.getSession();
    user.setUserId(userId);
    setSessionProperty('demo.synthetic_request', IS_SYNTHETIC_REQUEST || 'false');
    setSessionProperty('demo.user_context.selected_currency', currencyCode);
  } else {
    const provider = new WebTracerProvider({ resource, spanProcessors });
    provider.register({ contextManager, propagator });
    registerInstrumentations({
      tracerProvider: provider,
      instrumentations: [
        getWebAutoInstrumentations({
          '@opentelemetry/instrumentation-fetch': fetchInstrumentationConfig,
        }),
      ],
    });
  }

  markTelemetryReady();
};

export default FrontendTracer;
