import { createHash } from 'crypto';
import { inflateRawSync } from 'zlib';
import { cleanCsv, serviceStats, detectIncidents, hourlyFailures } from '@sla/core';
import { transaction } from '../db/client';
import * as queries from '../db/queries';
import { HttpError, logRequest } from '../lib/errors';

const MAX_BODY = 6_000_000; // 6 MB in bytes
const MAX_DECOMPRESSED = 50_000_000; // 50 MB

export async function handleUpload(
  event: any,
  context: any
): Promise<{ statusCode: number; body: string; headers: Record<string, string> }> {
  const requestId = context.requestId || crypto.randomUUID();
  const startMs = Date.now();
  let uploadId: string | undefined;

  try {
    const fileName = (event.headers?.['x-file-name'] || 'unknown.csv') as string;
    const body = event.body || '';
    const isBase64 = event.isBase64Encoded;

    if (!body) throw new HttpError(400, 'Empty request body');

    const buffer = Buffer.from(body, isBase64 ? 'base64' : 'utf8');
    if (buffer.length > MAX_BODY) throw new HttpError(413, 'Request too large (6 MB limit)');

    // Decompress with size guard
    let csvText: string;
    try {
      const decompressed = inflateRawSync(buffer, { maxOutputLength: MAX_DECOMPRESSED });
      csvText = decompressed.toString('utf8');
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, 'Invalid gzip content');
    }

    // Validate UTF-8
    if (!Buffer.from(csvText, 'utf8').equals(Buffer.from(csvText))) {
      throw new HttpError(400, 'Invalid UTF-8 encoding');
    }

    // SHA-256 of the original file
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // Check for duplicate
    const result = await transaction(async (client) => {
      const existing = await queries.findUploadBySha256(client, sha256);
      if (existing) {
        return {
          duplicate: true,
          upload: existing,
        };
      }

      // Clean CSV
      const cleanResult = cleanCsv(csvText);
      if (!cleanResult.ok) {
        throw new HttpError(
          cleanResult.code === 'EMPTY'
            ? 400
            : cleanResult.code === 'MISSING_COLUMNS'
              ? 422
              : cleanResult.code === 'TOO_MANY_ROWS'
                ? 413
                : 400,
          `Cleaning failed: ${cleanResult.code}`,
          requestId
        );
      }

      // Compute stats
      const stats = serviceStats(cleanResult);
      const incidents = detectIncidents(cleanResult);
      const hourly = hourlyFailures(cleanResult);

      // Insert everything in one transaction
      const upload = await queries.insertUpload(client, {
        file_name: fileName,
        file_sha256: sha256,
        range_start: new Date(cleanResult.rangeStart).toISOString(),
        range_end: new Date(cleanResult.rangeEnd).toISOString(),
        interval_min: cleanResult.intervalMin,
        services: cleanResult.services.length,
        rows_total: cleanResult.issues.exactDuplicates + cleanResult.checks.length,
        rows_stored: cleanResult.checks.length,
        rows_merged: cleanResult.issues.mergedRows,
        rows_fixed: cleanResult.issues.epoch +
          cleanResult.issues.offset +
          Object.values(cleanResult.issues.unitConverted).reduce((a: number, b: any) => a + (b || 0), 0) +
          cleanResult.issues.trimmed +
          cleanResult.issues.latencyMissing +
          cleanResult.issues.latencyNegative +
          cleanResult.issues.invalidStatus +
          cleanResult.issues.snapped,
        rows_rejected: cleanResult.rejected.length,
        expected_checks: cleanResult.expectedChecks,
        issues: cleanResult.issues,
      });

      uploadId = upload.id;

      // Insert checks
      const checks = cleanResult.checks.map((c: any) => ({
        service_id: c.serviceId,
        slot_ts: new Date(c.slot).toISOString(),
        status_code: c.status,
        is_valid: c.isValid,
        is_failed: c.isFailed,
        latency_ms: c.latencyMs,
        agents: c.agents,
        region: c.region || null,
        quality_flags: c.flags,
      }));

      await queries.insertChecks(client, upload.id, checks);

      // Insert rejected rows
      const rejected = cleanResult.rejected.map((r: any) => ({
        line_no: r.line,
        raw: r.raw,
        reason: r.reason,
      }));

      if (rejected.length > 0) {
        await queries.insertRejectedRows(client, upload.id, rejected);
      }

      // Insert services
      const services = cleanResult.services.map((s: any) => ({
        service_id: s.id,
        service_name: s.name,
      }));

      await queries.insertServices(client, upload.id, services);

      // Insert service stats
      const statsData = stats.map((s: any) => ({
        service_id: s.serviceId,
        valid: s.valid,
        failed: s.failed,
        present: s.present,
        availability: s.availability,
        downtime_min: s.downtime,
        p50_ms: s.p50Ms,
        p95_ms: s.p95Ms,
        incidents: incidents.filter((i: any) => i.serviceId === s.serviceId).length,
        longest_incident_min: Math.max(
          ...incidents
            .filter((i: any) => i.serviceId === s.serviceId)
            .map((i: any) => Math.round((i.end - i.start) / 60_000))
        ) || null,
      }));

      await queries.insertServiceStats(client, upload.id, statsData);

      // Insert hourly failures
      const hourlyData = hourly.map((h: any) => ({
        service_id: h.serviceId,
        hour_ts: new Date(h.hour).toISOString(),
        checks: h.checks,
        failed: h.failed,
      }));

      await queries.insertHourlyFailures(client, upload.id, hourlyData);

      // Insert incidents
      const incidentsData = incidents.map((i: any) => ({
        service_id: i.serviceId,
        start_ts: new Date(i.start).toISOString(),
        end_ts: new Date(i.end).toISOString(),
        failed: i.failedChecks,
        median_latency_ms: i.medianLatencyMs,
        normal_latency_ms: i.normalLatencyMs,
      }));

      if (incidentsData.length > 0) {
        await queries.insertIncidents(client, upload.id, incidentsData);
      }

      return {
        duplicate: false,
        upload,
        stats,
      };
    });

    const responseStatus = result.duplicate ? 200 : 201;
    const duration = Date.now() - startMs;

    logRequest({
      route: 'POST /uploads',
      uploadId: result.upload.id,
      ms: duration,
      rows: result.upload.rows_stored,
      status: responseStatus,
      requestId,
    });

    return {
      statusCode: responseStatus,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        id: result.upload.id,
        fileName: result.upload.file_name,
        duplicate: result.duplicate,
        rowsStored: result.upload.rows_stored,
        rowsMerged: result.upload.rows_merged,
        rowsFixed: result.upload.rows_fixed,
        rowsRejected: result.upload.rows_rejected,
      }),
    };
  } catch (error: any) {
    const duration = Date.now() - startMs;
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Internal server error';

    logRequest({
      route: 'POST /uploads',
      uploadId,
      ms: duration,
      status,
      error: message,
      requestId,
    });

    return {
      statusCode: status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      },
      body: JSON.stringify({
        error: message,
        requestId,
      }),
    };
  }
}
