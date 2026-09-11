import type { ProviderId } from "../src/shared";
export const INSTALL_URLS: Record<ProviderId, string> = {
  codex: "https://chatgpt.com/codex/install.ps1",
  claude: "https://claude.ai/install.ps1",
  gemini: "https://antigravity.google/cli/install.ps1",
};
export function setupScript(
  provider: ProviderId,
  install: boolean,
  marker: string,
) {
  // All executable text is application-owned. No user path or command is interpolated.
  if (!/^[A-Za-z0-9_-]+$/.test(marker)) throw Error("Invalid setup marker");
  return `$ErrorActionPreference = 'Stop'
Write-Host 'Agent Workroom - ${provider} setup terminal'
${
  install
    ? `Write-Host 'Installing from ${INSTALL_URLS[provider]}'
try { Invoke-RestMethod '${INSTALL_URLS[provider]}' | Invoke-Expression
Write-Host '${marker}'
} catch { Write-Host ('Install failed: ' + $_.Exception.Message) -ForegroundColor Red }`
    : `Write-Host 'CLI detected or manual terminal. Type commands below.'
Write-Host '${marker}'`
}
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Write-Host 'After installation, return to Settings and use Auto connect. Type exit to close.'
`;
}
