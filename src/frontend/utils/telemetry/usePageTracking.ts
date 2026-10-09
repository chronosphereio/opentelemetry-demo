// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import { useEffect } from 'react';
import Router from 'next/router';
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions';
import { logWarning, trackPageView } from './Telemetry';

const stripQuery = (url: string) => url.split('?')[0];

const trackCurrentPage = () => trackPageView(Router.pathname, stripQuery(Router.asPath));

const onRouteChangeError = (error: Error & { cancelled?: boolean }, url: string) => {
  if (!error.cancelled) {
    logWarning(`Navigation failed: ${stripQuery(url)}`, { [ATTR_ERROR_TYPE]: error.name });
  }
};

const usePageTracking = () => {
  useEffect(() => {
    trackCurrentPage();

    Router.events.on('routeChangeComplete', trackCurrentPage);
    Router.events.on('routeChangeError', onRouteChangeError);

    return () => {
      Router.events.off('routeChangeComplete', trackCurrentPage);
      Router.events.off('routeChangeError', onRouteChangeError);
    };
  }, []);
};

export default usePageTracking;
