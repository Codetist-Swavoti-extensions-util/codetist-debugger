import { stdin, stdout } from 'node:process';

type DapRequest = {
  seq: number;
  type: 'request';
  command: string;
  arguments?: Record<string, unknown>;
};

let inputBuffer = Buffer.alloc(0);
let adapterSequence = 1;
let program = 'sample';
let stopped = false;

function send(message: Record<string, unknown>): void {
  const body = Buffer.from(JSON.stringify({ seq: adapterSequence++, ...message }), 'utf8');
  stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  stdout.write(body);
}

function respond(request: DapRequest, body: Record<string, unknown> = {}): void {
  send({ type: 'response', request_seq: request.seq, command: request.command, success: true, ...body });
}

function event(name: string, body: Record<string, unknown> = {}): void {
  send({ type: 'event', event: name, body });
}

function handleRequest(request: DapRequest): void {
  switch (request.command) {
    case 'initialize':
      respond(request, {
        body: {
          supportsConfigurationDoneRequest: true,
          supportsTerminateRequest: true,
          supportsStepInTargetsRequest: false,
        },
      });
      event('initialized');
      break;
    case 'launch':
      program = typeof request.arguments?.program === 'string' ? request.arguments.program : 'sample';
      respond(request);
      event('output', { category: 'console', output: `Started simulated program: ${program}\n` });
      stopped = true;
      event('stopped', { reason: 'entry', threadId: 1, allThreadsStopped: true });
      break;
    case 'setBreakpoints':
      respond(request, { body: { breakpoints: [] } });
      break;
    case 'configurationDone':
      respond(request);
      break;
    case 'threads':
      respond(request, { body: { threads: [{ id: 1, name: 'main' }] } });
      break;
    case 'stackTrace':
      respond(request, {
        body: {
          stackFrames: [{
            id: 1,
            name: 'main',
            source: { name: program.split(/[\\/]/).pop() || program, path: program },
            line: 1,
            column: 1,
          }],
          totalFrames: 1,
        },
      });
      break;
    case 'scopes':
      respond(request, { body: { scopes: [] } });
      break;
    case 'variables':
      respond(request, { body: { variables: [] } });
      break;
    case 'continue':
    case 'next':
    case 'stepIn':
    case 'stepOut':
      respond(request, { body: { allThreadsContinued: true } });
      event('continued', { threadId: 1, allThreadsContinued: true });
      stopped = true;
      event('stopped', { reason: request.command === 'continue' ? 'step' : request.command, threadId: 1, allThreadsStopped: true });
      break;
    case 'pause':
      respond(request);
      stopped = true;
      event('stopped', { reason: 'pause', threadId: 1, allThreadsStopped: true });
      break;
    case 'disconnect':
    case 'terminate':
      respond(request);
      event('terminated');
      break;
    default:
      send({
        type: 'response',
        request_seq: request.seq,
        command: request.command,
        success: false,
        message: `Unsupported sample DAP request: ${request.command}`,
      });
  }
}

function parseInput(): void {
  while (inputBuffer.length) {
    const headerEnd = inputBuffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = inputBuffer.subarray(0, headerEnd).toString('ascii');
    const lengthMatch = header.match(/(?:^|\r\n)Content-Length:\s*(\d+)/i);
    if (!lengthMatch) {
      inputBuffer = inputBuffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(lengthMatch[1]);
    const frameEnd = headerEnd + 4 + length;
    if (!Number.isSafeInteger(length) || length < 0 || length > 1024 * 1024) {
      throw new Error('Invalid or oversized DAP message.');
    }
    if (inputBuffer.length < frameEnd) return;
    const request = JSON.parse(inputBuffer.subarray(headerEnd + 4, frameEnd).toString('utf8')) as DapRequest;
    inputBuffer = inputBuffer.subarray(frameEnd);
    if (request.type === 'request' && Number.isSafeInteger(request.seq) && typeof request.command === 'string') {
      handleRequest(request);
    }
  }
}

stdin.on('data', chunk => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  parseInput();
});
stdin.on('end', () => {
  if (!stopped) event('terminated');
});
stdin.on('error', error => {
  process.stderr.write(`DAP input error: ${error.message}\n`);
});
