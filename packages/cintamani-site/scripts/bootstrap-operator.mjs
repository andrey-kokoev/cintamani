import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

assert.ok(process.env.npm_execpath, 'Run this command through pnpm so Wrangler can be resolved')

function usage(message) {
  if (message) process.stderr.write(`${message}\n\n`)
  process.stderr.write(
    'Usage: pnpm operator:bootstrap -- (--local|--remote) --github-login <login> --authority-ref <receipt>\n',
  )
  process.exit(2)
}

const options = { mode: null, githubLogin: null, authorityRef: null }
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]
  if (argument === '--local' || argument === '--remote') {
    if (options.mode) usage('Choose exactly one of --local or --remote')
    options.mode = argument
    continue
  }
  if (argument === '--github-login' || argument === '--authority-ref') {
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--')) usage(`${argument} requires a value`)
    options[argument === '--github-login' ? 'githubLogin' : 'authorityRef'] = value
    index += 1
    continue
  }
  usage(`Unknown argument: ${argument}`)
}

if (!options.mode) usage('Choose --local or --remote explicitly')
if (!options.githubLogin) usage('--github-login is required')
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(options.githubLogin)) {
  usage('--github-login is not a valid GitHub login')
}
if (!options.authorityRef || options.authorityRef.length > 400) {
  usage('--authority-ref must contain 1 to 400 characters')
}

function execute(command) {
  const normalizedCommand = command.replace(/\s+/gu, ' ').trim()
  const result = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'exec',
      'wrangler',
      'd1',
      'execute',
      'PROPOSALS_DB',
      options.mode,
      '--command',
      normalizedCommand,
      '--json',
    ],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
    },
  )
  if (result.error || result.status !== 0) {
    throw new Error(
      `Wrangler D1 command failed: ${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
    )
  }
  const parsed = JSON.parse(result.stdout)
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0].success !== true) {
    throw new Error(`Unexpected Wrangler response: ${result.stdout}`)
  }
  return parsed[0].results
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

const accounts = execute(
  `SELECT account_id, github_login
   FROM public_accounts
   WHERE github_login = ${sql(options.githubLogin)} COLLATE NOCASE`,
)
if (accounts.length !== 1) {
  throw new Error(
    accounts.length === 0
      ? `No D1 account exists for @${options.githubLogin}; the user must sign in once before bootstrap`
      : `More than one D1 account matched @${options.githubLogin}`,
  )
}

const account = accounts[0]
const active = execute(
  `SELECT role_event_id
   FROM current_account_roles
   WHERE account_id = ${sql(account.account_id)} AND role = 'operator'`,
)
if (active.length === 1) {
  process.stdout.write(`@${account.github_login} is already an active operator (${active[0].role_event_id})\n`)
  process.exit(0)
}

const priorEvents = execute(
  "SELECT COUNT(*) AS count FROM account_role_events WHERE role = 'operator'",
)
if (Number(priorEvents[0]?.count) !== 0) {
  throw new Error(
    'The one-time deployment bootstrap has already been consumed; use the operator-authorized role API',
  )
}

const eventId = `role-event-${randomUUID()}`
const current = new Date().toISOString()
execute(
  `INSERT INTO account_role_events (
     role_event_id, account_id, role, action_kind, actor_account_id,
     authority_kind, authority_ref, rationale, source_timestamp, recorded_at
   ) VALUES (
     ${sql(eventId)}, ${sql(account.account_id)}, 'operator', 'granted', NULL,
     'deployment-bootstrap', ${sql(options.authorityRef)},
     'Initial operator bootstrap through the authorized deployment path',
     ${sql(current)}, ${sql(current)}
   )`,
)

const verified = execute(
  `SELECT role_event_id
   FROM current_account_roles
   WHERE account_id = ${sql(account.account_id)} AND role = 'operator'`,
)
if (verified.length !== 1 || verified[0].role_event_id !== eventId) {
  throw new Error('The operator bootstrap insert was not visible in the current-role projection')
}
process.stdout.write(`Granted D1 operator authority to @${account.github_login} (${eventId})\n`)
