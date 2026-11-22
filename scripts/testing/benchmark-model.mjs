import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
const configuration = JSON.parse(
  await readFile(new URL('../../.local/config/runtime.json', import.meta.url), 'utf8')
);
if (!configuration.llama_server || !configuration.ai_model)
  throw Error('Prepare the assistant first.');
const nativeRecord = await readFile(
  new URL('../../.local/run/assistant-process.json', import.meta.url),
  'utf8'
).then(JSON.parse, (error) => {
  if (error.code === 'ENOENT') return null;
  throw error;
});
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const child = spawn(
  configuration.llama_server,
  [
    '--model',
    configuration.ai_model,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--ctx-size',
    '16384',
    '--parallel',
    '2',
    '--jinja',
    '--alias',
    'MiniCPM5-2B',
    '--threads',
    '6',
    '--n-gpu-layers',
    '0'
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
);
let log = '';
child.stderr.on('data', (chunk) => {
  log = (log + chunk).slice(-6000);
});
const results = [];
const start = performance.now();
try {
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error('CPU server exited: ' + log);
    try {
      healthy = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
    } catch {}
    if (healthy) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!healthy) throw Error('CPU server did not become ready.');
  const cpuLoadMs = Math.round(performance.now() - start);
  const configuredEndpoint = process.env.AI_BASE_URL;
  const activeBackend =
    configuredEndpoint && new URL(configuredEndpoint).port === '5188' && nativeRecord?.backend
      ? 'native-' + nativeRecord.backend
      : 'configured';
  for (const [backend, base, model] of [
    [activeBackend, configuredEndpoint, process.env.AI_MODEL ?? 'deka-assistant'],
    ['cpu', `http://127.0.0.1:${port}/v1`, 'MiniCPM5-2B']
  ]) {
    if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) continue;
    for (const question of [
      'Сколько будет 17 умножить на 19?',
      'Одним предложением: A LEFT JOIN B сохраняет все строки какой таблицы?'
    ]) {
      const sent = performance.now();
      const response = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Отвечай кратко по-русски, без рассуждений. /no_think' },
            { role: 'user', content: question }
          ],
          stream: false,
          temperature: 0,
          max_tokens: 160,
          reasoning_effort: 'none',
          chat_template_kwargs: { enable_thinking: false }
        }),
        signal: AbortSignal.timeout(90000)
      });
      if (!response.ok) throw Error('Model HTTP ' + response.status);
      const value = await response.json();
      const totalMs = Math.round(performance.now() - sent);
      results.push({
        backend,
        question,
        answer: value.choices?.[0]?.message?.content,
        totalMs,
        completionTokens: value.usage?.completion_tokens,
        generationTokensPerSecond: value.timings?.predicted_per_second ?? null
      });
      console.log(backend + ': ' + totalMs + ' ms');
    }
  }
  const directory = new URL('../../.local/reports/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('model-runtime-check.json', directory),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        cpuLoadMs,
        configuration: { context: 16384, parallel: 2, threads: 6, maxTokens: 160, temperature: 0 },
        note: 'Two short identical questions per backend. This checks runtime availability, not a general performance ranking.',
        results
      },
      null,
      2
    )
  );
} finally {
  if (child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
}
