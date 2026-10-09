// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { Context } from '@opentelemetry/api';
import { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-web';

/**
 * Embrace session part spans are long-lived containers for session data that only make sense inside
 * Embrace, so they are kept out of the export to the OpenTelemetry Collector.
 */
export class SessionPartFilterProcessor implements SpanProcessor {
  constructor(private readonly processor: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.processor.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    if (span.attributes['emb.type'] !== 'ux.session_part') {
      this.processor.onEnd(span);
    }
  }

  forceFlush(): Promise<void> {
    return this.processor.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.processor.shutdown();
  }
}
