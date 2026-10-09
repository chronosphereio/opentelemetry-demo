// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef } from 'react';
import { v4 } from 'uuid';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { Attributes, getErrorType, logMessage } from './Telemetry';

export type JourneyName = 'add_to_cart' | 'checkout';
type JourneyOutcome = 'completed' | 'failed' | 'abandoned';

export interface Journey {
  complete(attributes?: Attributes): void;
  fail(error: unknown, attributes?: Attributes): void;
  abandon(attributes?: Attributes): void;
}

const outcomeSeverity = {
  completed: 'info',
  failed: 'error',
  abandoned: 'warning',
} as const;

const activeJourneys = new Set<Journey>();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => activeJourneys.forEach(journey => journey.abandon()));
}

/**
 * Emits a "Journey started: <name>" log now and exactly one "Journey <outcome>: <name>" log when it ends,
 * so user flows can be defined in Embrace from these start/end markers.
 */
export const startJourney = (name: JourneyName, attributes: Attributes = {}): Journey => {
  const startedAt = Date.now();
  const journeyAttributes: Attributes = {
    ...attributes,
    'demo.journey.name': name,
    'demo.journey.id': v4(),
  };
  let isEnded = false;

  const end = (outcome: JourneyOutcome, endAttributes: Attributes = {}) => {
    if (isEnded) return;
    isEnded = true;
    activeJourneys.delete(journey);

    logMessage(`Journey ${outcome}: ${name}`, outcomeSeverity[outcome], {
      ...journeyAttributes,
      ...endAttributes,
      'demo.journey.outcome': outcome,
      'demo.journey.duration_ms': Date.now() - startedAt,
    });
  };

  const journey: Journey = {
    complete: endAttributes => end('completed', endAttributes),
    fail: (error, endAttributes) => end('failed', { ...endAttributes, [ATTR_ERROR_TYPE]: getErrorType(error) }),
    abandon: endAttributes => end('abandoned', endAttributes),
  };

  activeJourneys.add(journey);
  logMessage(`Journey started: ${name}`, 'info', journeyAttributes);

  return journey;
};

/**
 * Starts a journey while `key` is set and restarts it whenever `key` changes. A journey that has not
 * completed or failed by the time the component unmounts, or `key` changes, is ended as abandoned.
 */
export const useJourney = (name: JourneyName, key: string | undefined, startAttributes: Attributes = {}): Journey => {
  const journeyRef = useRef<Journey | null>(null);
  const startAttributesRef = useRef(startAttributes);

  useEffect(() => {
    startAttributesRef.current = startAttributes;
  });

  useEffect(() => {
    if (!key) return;

    const journey = startJourney(name, startAttributesRef.current);
    journeyRef.current = journey;

    return () => journey.abandon();
  }, [name, key]);

  return useMemo(
    () => ({
      complete: attributes => journeyRef.current?.complete(attributes),
      fail: (error, attributes) => journeyRef.current?.fail(error, attributes),
      abandon: attributes => journeyRef.current?.abandon(attributes),
    }),
    []
  );
};
