// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { context } from '@opentelemetry/api';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { log, page, session, trace } from '@embrace-io/web-sdk';
import type { ExtendedSpan } from '@embrace-io/web-sdk';

export type Attributes = Record<string, string | number | boolean | undefined>;
type LogSeverity = 'info' | 'warning' | 'error';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string
  ) {
    super(`${method} ${path} failed with status ${status}`);
    this.name = 'ApiError';
  }
}

let isReady = false;
const pendingCalls: Array<() => void> = [];
const loggedErrors = new WeakSet<object>();

export const markTelemetryReady = () => {
  isReady = true;
  pendingCalls.splice(0).forEach(call => call());
};

const whenReady = (call: () => void) => {
  if (isReady) {
    call();
  } else {
    pendingCalls.push(call);
  }
};

const toEmbraceAttributes = (attributes: Attributes = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)])
  );

export const getErrorType = (error: unknown): string => {
  if (error instanceof ApiError) return String(error.status);
  if (error instanceof Error) return error.name;
  return 'unknown';
};

export const addBreadcrumb = (message: string) => whenReady(() => session.addBreadcrumb(message));

export const setSessionProperty = (key: string, value: string) => whenReady(() => session.addProperty(key, value));

export const logMessage = (message: string, severity: LogSeverity, attributes?: Attributes) =>
  whenReady(() => log.message(message, severity, { attributes: toEmbraceAttributes(attributes) }));

export const logInfo = (message: string, attributes?: Attributes) => logMessage(message, 'info', attributes);
export const logWarning = (message: string, attributes?: Attributes) => logMessage(message, 'warning', attributes);
export const logError = (message: string, attributes?: Attributes) => logMessage(message, 'error', attributes);

export const logException = (error: unknown, attributes?: Attributes) =>
  whenReady(() => log.logException(error, { handled: true, attributes: toEmbraceAttributes(attributes) }));

export const logRequestFailure = (message: string, error: unknown, attributes?: Attributes) => {
  if (error instanceof Object) loggedErrors.add(error);
  logError(message, attributes);
};

export const trackPageView = (path: string, url: string) =>
  whenReady(() => {
    page.setCurrentRoute({ path, url });
    session.addBreadcrumb(`Viewed page ${url}`);
  });

/**
 * Runs a key user flow inside a span so that the network requests it makes become child spans,
 * linking the UI action in Embrace to the backend trace. Request failures are already logged by the
 * request layer, so only unexpected errors are logged here.
 */
export const traceFlow = async <T>(
  name: string,
  attributes: Attributes,
  run: (span: ExtendedSpan) => Promise<T>
): Promise<T> => {
  const span = trace.startSpan(name, { attributes: toEmbraceAttributes(attributes) });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => run(span));
    span.end();
    return result;
  } catch (error) {
    span.setAttribute(ATTR_ERROR_TYPE, getErrorType(error));
    span.fail();
    if (!(error instanceof Object && loggedErrors.has(error))) {
      logException(error, { ...attributes, 'demo.flow.name': name });
    }
    throw error;
  }
};

export const setSpanAttributes = (span: ExtendedSpan, attributes: Attributes) => {
  span.setAttributes(toEmbraceAttributes(attributes));
};
