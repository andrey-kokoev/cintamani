// Daily launcher for the cintamani.literature-sweep SOP occurrence.
// Invoked by the Windows scheduled task \Narada\CintamaniLiteratureSweepDaily.
// Idempotent per day: the occurrence key is literature-sweep:<YYYYMMDD> (UTC).
// Runs outside any carrier session, so the loader is spawned with
// --standalone-ambient-attachment and carrier admission env vars are stripped.
// Usage: node scripts/literature-sweep-daily.mjs [--dry-run]

import {
  McpProcessClient,
  defaultMcpLoaderNativeEntrypoint,
} from 'file:///C:/Users/andrey/src/mcp-surfaces/packages/shared/mcp-runtime-client/dist/src/index.js';

const SITE_ROOT = 'C:/Users/andrey/src/cintamani';
const SOP_ID = 'cintamani.literature-sweep';
const SCHEDULED_TASK = '\\Narada\\CintamaniLiteratureSweepDaily';

const dryRun = process.argv.includes('--dry-run');
const occurrenceKey = `literature-sweep:${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

const env = { ...process.env, NARADA_SITE_ROOT: SITE_ROOT };
delete env.NARADA_MCP_BINDING_ADMISSION_REQUIRED;
delete env.NARADA_MCP_BINDING_ADMISSION_PATH;
delete env.NARADA_MCP_BINDING_ADMISSION_DIGEST;

const unwrap = (result) => {
  if (result && result.isError === true) {
    const text = Array.isArray(result.content)
      ? result.content.map((item) => (item && item.type === 'text' ? item.text : '')).join('\n')
      : '';
    throw new Error(`mcp_tool_error:${text || 'unknown'}`);
  }
  if (result && typeof result.structuredContent === 'object' && result.structuredContent !== null) {
    return result.structuredContent;
  }
  return result ?? {};
};

const loader = await McpProcessClient.start({
  executable: defaultMcpLoaderNativeEntrypoint(),
  args: [
    '--standalone-ambient-attachment',
    '--allowed-site-root', SITE_ROOT,
    '--allowed-surface-id', 'sop',
  ],
  env,
  clientName: 'cintamani-literature-sweep-launcher',
});

try {
  const attached = unwrap(await loader.callTool('mcp_loader_attach_surface', {
    site_root: SITE_ROOT,
    binding_id: 'cintamani-sop',
    surface_id: 'sop',
  }));
  const connectionId = attached.connection_id;
  if (!connectionId) throw new Error('mcp_loader_attach_surface returned no connection_id');

  const callSop = (toolName, args) => loader.callTool('mcp_loader_call_tool', {
    connection_id: connectionId,
    tool_name: toolName,
    arguments: args,
  }).then(unwrap);

  const imported = await callSop('sop_template_import_yaml', { sop_id: SOP_ID });
  console.log(JSON.stringify({ step: 'import', occurrence_key: occurrenceKey, result: imported }, null, 2));

  if (dryRun) {
    console.log(JSON.stringify({ step: 'dry_run', would_start: { sop_id: SOP_ID, occurrence_key: occurrenceKey } }));
  } else {
    const started = await callSop('sop_run_start', {
      sop_id: SOP_ID,
      occurrence_key: occurrenceKey,
      triggered_by: 'cintamani-scheduler',
      trigger_source_kind: 'schedule',
      trigger_source_ref: `schtask:${SCHEDULED_TASK}`,
    });
    console.log(JSON.stringify({ step: 'run_start', result: started }, null, 2));
  }
} finally {
  await loader.close();
}
