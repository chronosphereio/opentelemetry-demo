// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const { context, propagation, trace, metrics } = require('@opentelemetry/api');
const cardValidator = require('simple-card-validator');
const { v4: uuidv4 } = require('uuid');

const { OpenFeature } = require('@openfeature/server-sdk');
const { FlagdProvider } = require('@openfeature/flagd-provider');
const flagProvider = new FlagdProvider();

const logger = require('./logger');
const tracer = trace.getTracer('payment');
const meter = metrics.getMeter('payment');
const transactionsCounter = meter.createCounter('app.payment.transactions');

const LOYALTY_LEVEL = ['platinum', 'gold', 'silver', 'bronze'];

// Global array to store references and create memory leak
const memoryLeakStore = [];

/** Return random element from given array */
function random(arr) {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}

/** Create memory leak by storing references that never get cleared */
function createMemoryLeak() {
  // Create large objects and store them in global array (~5MB initial)
  const largeObject = {
    data: new Array(5000).fill(0).map((_, i) => ({
      id: i,
      timestamp: Date.now(),
      randomData: Math.random().toString(36).repeat(100),
      nested: {
        level1: {
          level2: {
            level3: {
              deepData: new Array(500).fill('leak')
            }
          }
        }
      }
    })),
    // Create circular reference
    self: null
  };

  // Create circular reference
  largeObject.self = largeObject;

  // Store in global array (never cleared)
  memoryLeakStore.push(largeObject);

  // Create additional memory leaks with timers and event listeners (~150KB per 2 second)
  const leakInterval = setInterval(() => {
    const leakData = {
      intervalId: leakInterval,
      data: new Array(5000).fill(0).map(() => Math.random()),
      timestamp: Date.now(),
      largeString: 'x'.repeat(5000)
    };
    memoryLeakStore.push(leakData);
  }, 2000);

  // Create closure that holds references (~8MB initial)
  const createClosureLeak = () => {
    const closureData = new Array(2000).fill(0).map((_, i) => ({
      id: i,
      closureRef: createClosureLeak, // Reference to self
      largeString: 'x'.repeat(2000)
    }));

    return () => {
      // This function holds references to closureData
      return closureData.length;
    };
  };

  const leakyFunction = createClosureLeak();
  memoryLeakStore.push(leakyFunction);

  // Create more objects with circular references (~2MB initial)
  for (let i = 0; i < 500; i++) {
    const circularObj = {
      id: i,
      data: new Array(200).fill(`leak-${i}`),
      ref: null
    };
    circularObj.ref = circularObj;
    memoryLeakStore.push(circularObj);
  }
}

module.exports.charge = async request => {
  const span = tracer.startSpan('charge');

  await OpenFeature.setProviderAndWait(flagProvider);

  const numberVariant = await OpenFeature.getClient().getNumberValue("paymentFailure", 0);

  if (numberVariant > 0) {
    // n% chance to fail with app.loyalty.level=gold
    if (Math.random() < numberVariant) {
      span.setAttributes({ 'app.loyalty.level': 'gold' });

      // Create memory leak when app.loyalty.level=gold
      createMemoryLeak();

      span.end();

      throw new Error('Payment request failed. Invalid token. app.loyalty.level=gold');
    }
  }

  const {
    creditCardNumber: number,
    creditCardExpirationYear: year,
    creditCardExpirationMonth: month
  } = request.creditCard;
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const lastFourDigits = number.substr(-4);
  const transactionId = uuidv4();

  const card = cardValidator(number);
  const { card_type: cardType, valid } = card.getCardDetails();

  const loyalty_level = random(LOYALTY_LEVEL);

  span.setAttributes({
    'app.payment.card_type': cardType,
    'app.payment.card_valid': valid,
    'app.loyalty.level': loyalty_level
  });

  if (!valid) {
    throw new Error('Credit card info is invalid.');
  }

  if (!['visa', 'mastercard'].includes(cardType)) {
    throw new Error(`Sorry, we cannot process ${cardType} credit cards. Only VISA or MasterCard is accepted.`);
  }

  if ((currentYear * 12 + currentMonth) > (year * 12 + month)) {
    throw new Error(`The credit card (ending ${lastFourDigits}) expired on ${month}/${year}.`);
  }

  // Check baggage for synthetic_request=true, and add charged attribute accordingly
  const baggage = propagation.getBaggage(context.active());
  if (baggage && baggage.getEntry('synthetic_request') && baggage.getEntry('synthetic_request').value === 'true') {
    span.setAttribute('app.payment.charged', false);
  } else {
    span.setAttribute('app.payment.charged', true);
  }

  const { units, nanos, currencyCode } = request.amount;
  logger.info({ transactionId, cardType, lastFourDigits, amount: { units, nanos, currencyCode }, loyalty_level }, 'Transaction complete.');
  transactionsCounter.add(1, { 'app.payment.currency': currencyCode });
  span.end();

  return { transactionId };
};
