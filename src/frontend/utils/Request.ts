// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { ATTR_ERROR_TYPE, ATTR_HTTP_REQUEST_METHOD, ATTR_HTTP_RESPONSE_STATUS_CODE, ATTR_URL_PATH } from '@opentelemetry/semantic-conventions';
import { ApiError, getErrorType, logRequestFailure } from './telemetry/Telemetry';

interface IRequestParams {
  url: string;
  body?: object;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  queryParams?: Record<string, any>;
  headers?: Record<string, string>;
}

const request = async <T>({
  url = '',
  method = 'GET',
  body,
  queryParams = {},
  headers = {
    'content-type': 'application/json',
  },
}: IRequestParams): Promise<T> => {
  const logFailure = (error: unknown, statusCode?: number) =>
    logRequestFailure(`API request failed: ${method} ${url}`, error, {
      [ATTR_HTTP_REQUEST_METHOD]: method,
      [ATTR_URL_PATH]: url,
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: statusCode,
      [ATTR_ERROR_TYPE]: getErrorType(error),
    });

  let response: Response;
  try {
    response = await fetch(`${url}?${new URLSearchParams(queryParams).toString()}`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  } catch (error) {
    logFailure(error);
    throw error;
  }

  if (!response.ok) {
    const error = new ApiError(response.status, method, url);
    logFailure(error, response.status);
    throw error;
  }

  const responseText = await response.text();

  if (!!responseText) return JSON.parse(responseText);

  return undefined as unknown as T;
};

export default request;
