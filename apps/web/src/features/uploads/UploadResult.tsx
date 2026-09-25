import { REQUIRED_COLUMNS, type UploadCreated } from '@sla/core';
import type { ApiError } from '../../api/client';
import { fixList } from '../../lib/cleaning';
import { fmtDayYear, nf, plural } from '../../lib/format';

/** Fix rows with a bar scaled to the largest fix (also used by the data report). */
export function FixBars({ fixes }: { fixes: { label: string; detail?: string; count: number }[] }) {
  let max = 1;
  for (const f of fixes) if (f.count > max) max = f.count;
  return (
    <div className="fixes">
      {fixes.map(f => (
        <div className="fix" key={f.label}>
          <span>{f.label}</span>
          {f.detail && <small>{f.detail}</small>}
          <span className="n num">{nf(f.count)}</span>
          <span className="fbar"><i style={{ width: `${(100 * f.count) / max}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

export function UploadError({ fileName, error, onAgain }: { fileName: string; error: ApiError; onAgain: () => void }) {
  const { missing, found } = error.body;
  return (
    <div className="up-res">
      <div className="res-head">
        <span className="res-ic bad" aria-hidden="true">✕</span>
        <div><h2>This file couldn’t be processed</h2><p>{fileName} · nothing was saved</p></div>
      </div>
      <div className="errbox res-err" role="alert">
        <b>{error.message}</b>
        {missing && missing.length > 0 && (
          <div>Missing: <span className="cols">{missing.map(c => <span key={c} className="col miss">{c}</span>)}</span></div>
        )}
        {found && found.length > 0 && (
          <div>Columns found: <span className="cols">{found.map(c => <span key={c} className="col">{c}</span>)}</span></div>
        )}
        {error.status === 422 && missing && <div>Export the file again with the columns listed under “What the file needs”, then upload it.</div>}
      </div>
      <div className="actions-row"><button type="button" className="btn primary" onClick={onAgain}>Choose another file</button></div>
    </div>
  );
}

export function UploadSuccess({ result, onOpen, onAgain }: { result: UploadCreated; onOpen: () => void; onAgain: () => void }) {
  const rejected = result.rowsRejected;
  const gaps = result.expectedChecks - result.rowsStored;
  const fixes = fixList(result.issues);
  const title = result.duplicate
    ? 'Already uploaded'
    : rejected ? `Processed with ${plural(rejected, 'rejected row')}` : 'Upload processed';
  return (
    <div className="up-res">
      <div className="res-head">
        <span className={`res-ic ${rejected ? 'warn' : 'ok'}`} aria-hidden="true">{rejected ? '!' : '✓'}</span>
        <div>
          <h2>{title}</h2>
          <p>
            {result.fileName} · {fmtDayYear(result.rangeStart)} – {fmtDayYear(result.rangeEnd)}
            {result.duplicate ? ' · this exact file was uploaded before; showing the stored upload' : ' · saved as a new upload'}
          </p>
        </div>
      </div>
      <div className="nums num">
        <div><b>{nf(result.rowsTotal)}</b><span>rows uploaded</span></div>
        <div><b>{nf(result.rowsStored)}</b><span>checks stored</span></div>
        <div><b>{nf(result.rowsMerged)}</b><span>duplicates merged</span></div>
        <div className={rejected ? 'bad' : ''}><b>{nf(rejected)}</b><span>rows rejected</span></div>
      </div>
      <div className="detected">
        <span>Detected: <b>{plural(result.days, 'day')}</b></span>
        <span><b>{result.services}</b> services</span>
        <span>a check every <b>{result.intervalMin} min</b></span>
        <span>{gaps ? <><b>{nf(gaps)}</b> missing checks</> : 'no missing checks'}</span>
      </div>
      {fixes.length > 0 && <><div className="sech">Fixes applied</div><div className="fixl"><FixBars fixes={fixes} /></div></>}
      {rejected > 0 && (
        <>
          <div className="sech">Rejected rows</div>
          <div className="tbl">
            <table>
              <thead><tr><th>Line</th><th>Reason</th></tr></thead>
              <tbody>{result.rejectedSample.map(r => <tr key={r.line}><td className="m">{r.line}</td><td>{r.reason}</td></tr>)}</tbody>
            </table>
          </div>
          {rejected > result.rejectedSample.length && <div className="more">and {nf(rejected - result.rejectedSample.length)} more</div>}
        </>
      )}
      <div className="actions-row">
        <button type="button" className="btn primary" onClick={onOpen}>Open in dashboard</button>
        <button type="button" className="btn" onClick={onAgain}>Upload another file</button>
      </div>
    </div>
  );
}

/** "What the file needs" — the required columns, straight from the cleaner's list. */
export function FileRequirements() {
  return (
    <div className="req">
      <h3>What the file needs</h3>
      <div className="cols">
        {REQUIRED_COLUMNS.map(c => <span key={c} className="col">{c}</span>)}
        <span className="col opt" title="Optional">region</span>
      </div>
      <p>Timestamps in ISO 8601 (any time zone) or Unix epoch. Latency in ms, s or µs. Any number of days, services and agents. Rows that can’t be read are rejected and listed; the rest are still saved.</p>
    </div>
  );
}
