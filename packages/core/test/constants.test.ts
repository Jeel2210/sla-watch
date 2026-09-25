import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, LATENCY_UNITS, REQUIRED_COLUMNS, SLA_TARGET } from '../src/index';

describe('constants', () => {
  it('holds the SLA target and required columns from the spec', () => {
    expect(SLA_TARGET).toBe(99.9);
    expect(BATCH_SIZE).toBe(5_000);
    expect(REQUIRED_COLUMNS).toEqual(['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent']);
    expect(LATENCY_UNITS.s).toBe(1000);
    expect(LATENCY_UNITS.ms).toBe(1);
  });
});
