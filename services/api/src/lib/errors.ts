export class HttpError extends Error {
  constructor(
    public status: number,
    public message: string,
    public requestId?: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function logRequest(data: {
  route: string;
  uploadId?: string;
  ms: number;
  rows?: number;
  status: number;
  error?: string;
  requestId: string;
}) {
  console.log(JSON.stringify(data));
}
