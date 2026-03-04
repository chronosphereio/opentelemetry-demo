import opentelemetry from '@opentelemetry/api';
import { Metric as WebVitalMetric } from 'web-vitals';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { frontendResource as resource } from './FrontendTracer';

const {
    NEXT_PUBLIC_OTEL_SERVICE_NAME = '',
    NEXT_PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = '',
    IS_SYNTHETIC_REQUEST = '',
} = typeof window !== 'undefined' ? window.ENV : {};

const otlpMetricsEndpoint = NEXT_PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics';

// Create the OTLP Metric Exporter
const metricExporter = new OTLPMetricExporter({
    url: otlpMetricsEndpoint,
    //    headers: { Authorization: 'Bearer xxxxxfakexxxxxxxxxxx' },
});

// Create a MetricProvider and attach the MetricReader
const meterProvider = new MeterProvider({
    resource,
    readers: [
        new PeriodicExportingMetricReader({
            exporter: metricExporter,
            exportIntervalMillis: 10000, // Export metrics every 10 second
        }),
    ],
});

// Set the initialized MeterProvider as global to enable metric collection across the app.
opentelemetry.metrics.setGlobalMeterProvider(meterProvider);

// Get a Meter instance
const meter = meterProvider.getMeter('browser-web-vitals-meter');

// Define Observable Gauges
const clsGauge = meter.createObservableGauge('browser_web_vitals_cls', {
    description: 'Cumulative Layout Shift (CLS)',
});

const inpGauge = meter.createObservableGauge('browser_web_vitals_inp', {
    description: 'Interaction to Next Paint (INP)',
});

const lcpGauge = meter.createObservableGauge('browser_web_vitals_lcp', {
    description: 'Largest Contentful Paint (LCP)',
});

const ttfbGauge = meter.createObservableGauge('browser_web_vitals_ttfb', {
    description: 'Time to First Byte (TTFB)',
});

const fcpGauge = meter.createObservableGauge('browser_web_vitals_fcp', {
    description: 'First Contentful Paint (FCP)',
});


// Function to record web vitals
export function handleWebVitals(metric: WebVitalMetric): void {
    if (typeof window === 'undefined') {
        // Skip processing if not in the browser
        return;
    }

    const { name, value } = metric;

    switch (name) {
        case 'CLS': // Cumulative Layout Shift
            clsGauge.addCallback((observerResult) => observerResult.observe(value));
            break;
        case 'INP': // Interaction to Next Paint
            inpGauge.addCallback((observerResult) => observerResult.observe(value));
            break;
        case 'LCP': // Largest Contentful Paint
            lcpGauge.addCallback((observerResult) => observerResult.observe(value));
            break;
        case 'TTFB': // Time to First Byte
            ttfbGauge.addCallback((observerResult) => observerResult.observe(value));
            break;
        case 'FCP': // First Contentful Paint
            fcpGauge.addCallback((observerResult) => observerResult.observe(value));
            break;
        default:
            console.warn(`Unhandled web vitals metric: ${name}`);
    }
}

export default handleWebVitals;