// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const { context, propagation, trace, metrics, SpanStatusCode } = require('@opentelemetry/api');
const { ATTR_ERROR_TYPE } = require('@opentelemetry/semantic-conventions');
const cardValidator = require('simple-card-validator');
const { v4: uuidv4 } = require('uuid');

const http = require('http');

const logger = require('./logger');
const tracer = trace.getTracer('payment');
const meter = metrics.getMeter('payment');
const transactionsCounter = meter.createCounter('demo.payment.transactions', {
  unit: '{transaction}',
});

function fetchLoyaltyLevel() {
  const addr = process.env.PROFILE_ADDR;
  const url = `${addr}/loyalty`;
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Profile service returned HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const { loyalty_level } = JSON.parse(data);
          if (!loyalty_level) {
            reject(new Error(`Profile service returned invalid loyalty_level: ${data}`));
            return;
          }
          resolve(loyalty_level);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

module.exports.charge = async request => {
  const span = tracer.startSpan('charge');

  try {
    const baggage = propagation.getBaggage(context.active());
    const syntheticRequest = baggage?.getEntry('synthetic_request')?.value === 'true';

    if (syntheticRequest) {
      span.setAttribute('user_agent.synthetic.type', 'test');
    }

    const {
      creditCardNumber: number,
      creditCardCvv: cvv,
      creditCardExpirationYear: year,
      creditCardExpirationMonth: month
    } = request.creditCard;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const lastFourDigits = number.substr(-4);
    const transactionId = uuidv4();

    const card = cardValidator(number);
    const { card_type: cardType, valid } = card.getCardDetails();

    const loyalty_level = await fetchLoyaltyLevel();
    span.setAttribute('demo.user_context.loyalty_level', loyalty_level);

    span.setAttributes({
      'demo.payment.card_type': cardType,
      'demo.payment.card_valid': valid,
      'demo.payment.card_number': number,
      'demo.payment.card_cvv': cvv
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

    // Do not charge synthetic requests.
    if (syntheticRequest) {
      span.setAttribute('demo.payment.charged', false);
    } else {
      span.setAttribute('demo.payment.charged', true);
    }

    const enduserId = baggage?.getEntry('enduser.id')?.value;
    if (enduserId) {
      span.setAttribute('enduser.id', enduserId);
    }

    const { units, nanos, currencyCode } = request.amount;
    logger.info({ transactionId, cardType, lastFourDigits, amount: { units, nanos, currencyCode }, loyalty_level }, 'Transaction complete.');
    transactionsCounter.add(1, { 'demo.payment.currency': currencyCode });

    return { transactionId };
  } catch (err) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.setAttribute(ATTR_ERROR_TYPE, err.name || 'Error');

    throw err;
  } finally {
    span.end();
  }
};
