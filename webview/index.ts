type DapMessage = {
  type: 'message' | 'output' | 'error' | 'exit';
  payload: Record<string, unknown>;
  sessionId: number;
};

type ProjectContext = {
  projectType: string;
  activeFilePath: string | null;
  language: string | null;
  lsp: { language: string | null; status: string };
};

declare global {
  interface Window {
    ideAPI: {
      getProjectContext(): Promise<ProjectContext>;
      debug: {
        startSession(type: string, configuration: Record<string, unknown>): Promise<{ sessionId: number }>;
        sendRequest(sessionId: number, request: Record<string, unknown>): Promise<unknown>;
        stopSession(sessionId: number): Promise<unknown>;
      };
      on(event: 'debugMessage', callback: (payload: DapMessage) => void): void;
      on(event: 'projectContextChanged', callback: (payload: ProjectContext) => void): void;
    };
  }
}

const log = document.querySelector<HTMLPreElement>('#log')!;
const contextLabel = document.querySelector<HTMLElement>('#context')!;
const startButton = document.querySelector<HTMLButtonElement>('#start')!;
const stopButton = document.querySelector<HTMLButtonElement>('#stop')!;
let sessionId: number | null = null;
let requestSequence = 1;

function writeLog(value: unknown): void {
  log.textContent += `${typeof value === 'string' ? value : JSON.stringify(value)}\n`;
  log.scrollTop = log.scrollHeight;
}

async function sendRequest(command: string, args: Record<string, unknown> = {}): Promise<void> {
  if (sessionId === null) return;
  const result = await window.ideAPI.debug.sendRequest(sessionId, {
    type: 'request',
    seq: requestSequence++,
    command,
    arguments: args,
  });
  writeLog({ sent: command, result });
}

function waitForEvent(eventName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`Timed out waiting for DAP event: ${eventName}`)), 10000);
    window.ideAPI.on('debugMessage', message => {
      if (
        message.sessionId === sessionId
        && message.type === 'message'
        && message.payload.type === 'event'
        && message.payload.event === eventName
      ) {
        window.clearTimeout(timeout);
        resolve();
      }
    });
  });
}

void window.ideAPI.getProjectContext().then(context => {
  contextLabel.textContent = `Project: ${context.projectType} · Language: ${context.language || 'none'} · LSP: ${context.lsp.status}`;
});

window.ideAPI.on('debugMessage', message => {
  if (message.sessionId !== sessionId) return;
  writeLog(message.payload);
  if (message.type === 'exit' || message.type === 'error') {
    sessionId = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  }
});

window.ideAPI.on('projectContextChanged', context => {
  contextLabel.textContent = `Project: ${context.projectType} · Language: ${context.language || 'none'} · LSP: ${context.lsp.status}`;
});

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  try {
    const context = await window.ideAPI.getProjectContext();
    const started = await window.ideAPI.debug.startSession('codetist-sample', {
      program: context.activeFilePath || 'sample.ts',
    });
    sessionId = started.sessionId;
    stopButton.disabled = false;
    requestSequence = 1;
    const initialized = waitForEvent('initialized');
    await sendRequest('initialize', {
      clientID: 'codetist-debugger-starter',
      adapterID: 'codetist-sample',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsVariableType: true,
    });
    await initialized;
    await sendRequest('launch', { program: context.activeFilePath || 'sample.ts' });
    await sendRequest('threads');
    await sendRequest('stackTrace', { threadId: 1, startFrame: 0, levels: 20 });
  } catch (error) {
    writeLog(error instanceof Error ? error.message : 'Could not start debugger.');
    if (sessionId === null) startButton.disabled = false;
  }
});

stopButton.addEventListener('click', async () => {
  if (sessionId === null) return;
  const currentSession = sessionId;
  try {
    await window.ideAPI.debug.sendRequest(currentSession, {
      type: 'request',
      seq: requestSequence++,
      command: 'disconnect',
      arguments: { restart: false, terminateDebuggee: true },
    });
  } finally {
    await window.ideAPI.debug.stopSession(currentSession);
    sessionId = null;
    startButton.disabled = false;
    stopButton.disabled = true;
  }
});

export {};
