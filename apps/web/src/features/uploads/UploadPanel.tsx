// Upload panel (DESIGN.md → Uploads): idle → working (steps) → result, in one panel.
import { useRef, useState } from 'react';
import type { UploadCreated } from '@sla/core';
import { ApiError } from '../../api/client';
import { useUploadFile, type UploadPhase } from '../../api/hooks';
import { Icon } from '../../components/Icon';
import { conversions } from '../../lib/cleaning';
import { fmtMB, nf } from '../../lib/format';
import { navigate } from '../../lib/router';
import { exampleFile, type ExampleKind } from './examples';
import { FileRequirements, UploadError, UploadSuccess } from './UploadResult';

type StepState = 'wait' | 'run' | 'done' | 'fail';
interface Step { title: string; detail: string; state: StepState }

/** The five steps. The server does parse → save in one request, so those finish together when it answers. */
function steps(phase: UploadPhase | 'done' | 'error', file: File, gzipBytes: number | undefined, res: UploadCreated | undefined, error: ApiError | null): Step[] {
  const serverFailed = phase === 'error' && gzipBytes !== undefined;
  const clientFailed = phase === 'error' && gzipBytes === undefined;
  const done = phase === 'done' && res;
  const conv = res ? conversions(res.issues) : undefined;
  return [
    {
      title: 'Read and compress',
      state: clientFailed ? 'fail' : phase === 'compress' ? 'run' : 'done',
      detail: clientFailed ? error?.message ?? '' : phase === 'compress' ? 'Working…' : `${fmtMB(file.size)} → ${fmtMB(gzipBytes ?? 0)} sent to the cleaning function`,
    },
    {
      title: 'Parse and validate',
      state: serverFailed ? 'fail' : done ? 'done' : phase === 'send' ? 'run' : 'wait',
      detail: serverFailed ? error?.message ?? '' : done
        ? `Header OK · ${nf(res.rowsTotal - res.rowsRejected)} rows readable · ${nf(res.rowsRejected)} rejected`
        : phase === 'send' ? 'The cleaning function is checking every row…' : '',
    },
    {
      title: 'Normalise',
      state: done ? 'done' : 'wait',
      detail: done && conv ? (conv.timestamps || conv.latencies
        ? `${nf(conv.timestamps)} timestamps converted to UTC · ${nf(conv.latencies)} latencies converted to ms`
        : 'Already in UTC and ms, nothing to convert') : '',
    },
    {
      title: 'Merge duplicates',
      state: done ? 'done' : 'wait',
      detail: done ? (res.rowsMerged ? `${nf(res.rowsMerged)} duplicate reports merged into ${nf(res.rowsStored)} checks` : `No duplicates · ${nf(res.rowsStored)} checks`) : '',
    },
    {
      title: 'Save to database',
      state: done ? 'done' : 'wait',
      detail: done ? (res.duplicate ? 'Already stored: this exact file was uploaded before' : 'Stored as a new upload') : '',
    },
  ];
}

function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="steps" aria-live="polite">
      {items.map(s => (
        <li key={s.title} className={`step ${s.state}`}>
          <span className="ic" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'fail' ? '✕' : ''}</span>
          <span className="tt">{s.title}<span className="sr-only"> — {s.state === 'run' ? 'in progress' : s.state === 'done' ? 'done' : s.state === 'fail' ? 'failed' : 'waiting'}</span></span>
          {s.detail && <span className="dd">{s.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

export function UploadPanel() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>('compress');
  const [gzipBytes, setGzipBytes] = useState<number | undefined>();
  const [over, setOver] = useState(false);
  const upload = useUploadFile((p, bytes) => { setPhase(p); if (bytes !== undefined) setGzipBytes(bytes); });

  const start = (f: File | undefined) => {
    if (!f || upload.isPending) return;
    setFile(f);
    setPhase('compress');
    setGzipBytes(undefined);
    upload.mutate(f);
  };
  const reset = () => {
    upload.reset();
    setFile(null);
    if (input.current) input.current.value = '';
  };

  if (!file) {
    return (
      <section className="pnl up-idle" aria-label="Upload a CSV">
        <button type="button" className={`drop${over ? ' over' : ''}`} onClick={() => input.current?.click()}
          onDragEnter={e => { e.preventDefault(); setOver(true); }} onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); start(e.dataTransfer.files[0]); }}>
          <span className="icon"><Icon name="upload" size={20} /></span>
          <b>Drop a CSV file here</b>
          <span>or <u>choose a file</u></span>
          <small>.csv · up to 50 MB · one row per health check</small>
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={e => start(e.target.files?.[0])} aria-label="Choose a CSV file" />
        <FileRequirements />
        <div className="examples">
          <span>No file to hand? Try an example:</span>
          {([['valid', 'Valid file'], ['bad-rows', 'File with bad rows'], ['wrong-columns', 'Wrong columns']] as [ExampleKind, string][]).map(([k, label]) => (
            <button key={k} type="button" className="btn" onClick={() => start(exampleFile(k))}>{label}</button>
          ))}
        </div>
      </section>
    );
  }

  const status = upload.isSuccess ? 'done' : upload.isError ? 'error' : phase;
  return (
    <section className="pnl up-work" aria-label={`Uploading ${file.name}`}>
      <div className="filebar"><span><b>{file.name}</b></span><span className="muted">{fmtMB(file.size)}</span></div>
      <Steps items={steps(status, file, gzipBytes, upload.data, upload.error)} />
      {upload.isSuccess && (
        <UploadSuccess result={upload.data} onAgain={reset}
          onOpen={() => navigate({ screen: 'dashboard', upload: upload.data.id })} />
      )}
      {upload.isError && (
        <UploadError fileName={file.name} onAgain={reset}
          error={upload.error instanceof ApiError ? upload.error : new ApiError(0, { error: String(upload.error) })} />
      )}
      {upload.isPending && <p className="up-wait">Large files take a few seconds to clean.</p>}
    </section>
  );
}
