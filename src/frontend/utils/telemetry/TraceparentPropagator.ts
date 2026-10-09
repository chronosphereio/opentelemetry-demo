// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { Context, TextMapSetter, defaultTextMapGetter, trace } from '@opentelemetry/api';
import { TRACE_PARENT_HEADER, W3CTraceContextPropagator } from '@opentelemetry/core';

/**
 * The Embrace SDK only records the injected traceparent on network spans when it installs its own
 * propagator, which it skips when a custom one is provided. Recording it here keeps Embrace network
 * spans linked to the backend traces they started.
 */
export class TraceparentPropagator extends W3CTraceContextPropagator {
  inject(context: Context, carrier: unknown, setter: TextMapSetter): void {
    super.inject(context, carrier, setter);

    const span = trace.getSpan(context);
    const traceparent =
      carrier instanceof Headers ? carrier.get(TRACE_PARENT_HEADER) : defaultTextMapGetter.get(carrier, TRACE_PARENT_HEADER);

    if (span && typeof traceparent === 'string') {
      span.setAttribute('emb.w3c_traceparent', traceparent);
    }
  }
}
