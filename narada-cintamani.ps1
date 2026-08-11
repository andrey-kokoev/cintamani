param(
  [Parameter(Position = 0)]
  [ValidateSet("agent-start")]
  [string]$Command = "agent-start",
  [Alias("AgentId")]
  [string]$Agent,
  [string]$Carrier = "agent-cli",
  [string]$Runtime,
  [switch]$Exec,
  [switch]$DryRun,
  [switch]$Json,
  [switch]$EnableNativeShell,
  [switch]$AgentTuiInteractiveLoop,
  [switch]$AgentTuiProviderExecution,
  [switch]$AgentTuiMcpFabric,
  [int]$AgentTuiMaxSteps,
  [string]$AgentTuiStartingDirective,
  [string]$AgentTuiStartingDirectiveFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Command -ne "agent-start") {
  throw "unsupported_command: $Command"
}

$workspaceRoot = $PSScriptRoot
$siteRoot = if ($env:NARADA_LAUNCH_REGISTRY_SITE_ROOT) {
  $env:NARADA_LAUNCH_REGISTRY_SITE_ROOT
} else {
  $workspaceRoot
}
$userHome = [Environment]::GetFolderPath("UserProfile")
$sourceRoot = if ($env:NARADA_SRC_ROOT) { $env:NARADA_SRC_ROOT } else { Join-Path $userHome "src" }
$naradaProperRoot = if ($env:NARADA_PROPER_ROOT) {
  $env:NARADA_PROPER_ROOT
} elseif ($env:NARADA_ROOT) {
  $env:NARADA_ROOT
} else {
  Join-Path $sourceRoot "narada"
}
$agentStart = Join-Path $naradaProperRoot "packages\agent-start\src\narada-agent-start.ts"
$tsxLoaderPath = Join-Path $naradaProperRoot "node_modules\tsx\dist\loader.mjs"

if (-not (Test-Path -LiteralPath $siteRoot -PathType Container)) {
  throw "cintamani_narada_site_missing: $siteRoot"
}
if (-not (Test-Path -LiteralPath $agentStart -PathType Leaf)) {
  throw "packaged_agent_start_missing: $agentStart"
}
if (-not (Test-Path -LiteralPath $tsxLoaderPath -PathType Leaf)) {
  throw "tsx_loader_missing: $tsxLoaderPath"
}
if (-not $Agent) {
  $Agent = "cintamani.architect"
}

$flags = @(
  $Agent,
  "--target-site-id", "cintamani",
  "--target-site-root", $siteRoot,
  "--site-root", $siteRoot,
  "--workspace-root", $workspaceRoot,
  "--launch-source", "$($MyInvocation.MyCommand.Name) agent-start"
)
if ($Carrier) { $flags += @("--carrier", $Carrier) }
if ($Runtime) { $flags += @("--runtime", $Runtime) }
if ($Exec) { $flags += "--exec" }
if ($DryRun) { $flags += "--dry-run" }
if ($Json) { $flags += "--json" }
if ($EnableNativeShell) { $flags += "--enable-native-shell" }
if ($AgentTuiInteractiveLoop) { $flags += "--agent-tui-interactive-loop" }
if ($AgentTuiProviderExecution) { $flags += "--agent-tui-provider-execution" }
if ($AgentTuiMcpFabric) { $flags += "--agent-tui-mcp-fabric" }
if ($AgentTuiMaxSteps -gt 0) { $flags += @("--agent-tui-max-steps", [string]$AgentTuiMaxSteps) }
if ($AgentTuiStartingDirective) { $flags += @("--agent-tui-starting-directive", $AgentTuiStartingDirective) }
if ($AgentTuiStartingDirectiveFile) { $flags += @("--agent-tui-starting-directive-file", $AgentTuiStartingDirectiveFile) }

$env:NARADA_AGENT_ID = $Agent
$env:NARADA_TARGET_SITE_ROOT = $siteRoot
$env:NARADA_LAUNCH_REGISTRY_SITE_ROOT = $siteRoot
$env:NARADA_WORKSPACE_ROOT = $workspaceRoot
$env:NARADA_SRC_ROOT = $sourceRoot
$tsxLoader = [System.Uri]::new($tsxLoaderPath).AbsoluteUri

Push-Location -LiteralPath $workspaceRoot
try {
  & node --import $tsxLoader $agentStart @flags
} finally {
  Pop-Location
}
exit $LASTEXITCODE
