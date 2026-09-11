export type ProviderId = "codex" | "claude" | "gemini";
export type ModelDefaults = Partial<Record<ProviderId, string>>;
export interface ModelOption {
  id: string;
  name: string;
}
export type RunStatus =
  "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
export interface Provider {
  id: ProviderId;
  name: string;
  path: string;
  version: string;
  available: boolean;
  backend?: "agy";
  error?: string;
  models?: ModelOption[];
  modelsSource?: string;
  modelsError?: string;
  modelsCheckedAt?: number;
  quota?: {
    limitId?: string;
    used: number;
    windowMinutes: number | null;
    reset: number | null;
    checkedAt: number;
  }[];
}
export interface Project {
  id: string;
  name: string;
  path: string;
  wiki: string;
  raw: string;
  outputs: string;
  createdAt: number;
}
export interface Skill {
  id: string;
  name: string;
  description: string;
  version: number;
  instructions: string;
  icon: "book" | "code" | "check";
  verified: Partial<Record<ProviderId, string>>;
  createdAt: number;
}
export interface Usage {
  input: number | null;
  output: number | null;
  cached: number | null;
  total: number | null;
  cost: number | null;
  scope: "direct" | "inclusive" | "unknown";
  source: string;
}
export interface TaskResources {
  reads: string[];
  writes: string[];
}
export interface Run {
  resources?: TaskResources;
  dependsOn?: string[];
  detectedFiles?: string[];
  hadToolActivity?: boolean;
  id: string;
  projectId: string;
  provider: ProviderId;
  model?: string;
  reportedModel?: string;
  teamModels?: ModelDefaults;
  teamModelPins?: ModelDefaults;
  teamCatalog?: Partial<Record<ProviderId, ModelOption[]>>;
  routingReason?: string;
  title: string;
  prompt: string;
  status: RunStatus;
  mode: "terminal" | "skill" | "task" | "team";
  skillId?: string;
  skillName?: string;
  skillVersion?: number;
  parentId?: string;
  automationId?: string;
  automationRunId?: string;
  startedAt: number;
  executionStartedAt?: number;
  lastOutputAt?: number;
  queueReason?: string;
  blockerIds?: string[];
  finishedAt?: number;
  sessionId?: string;
  activity: string;
  output: string;
  answer?: string;
  replyTo?: string;
  usage: Usage;
  error?: string;
  files: string[];
  references: string[];
}
export interface Step {
  provider: ProviderId;
  model?: string;
  skillId: string;
  skillVersion: number;
}
export interface Automation {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  trigger: "schedule" | "file" | "success";
  time: string;
  timezone: string;
  weekdays: number[];
  input: string;
  output: string;
  steps: Step[];
  sourceSkillId?: string;
  lastKey?: string;
  lastResult?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
}
export interface AppSettings {
  paths: Partial<Record<ProviderId, string>>;
  models?: ModelDefaults;
  background: boolean;
  reduceMotion: boolean;
}
export interface State {
  projects: Project[];
  skills: Skill[];
  runs: Run[];
  automations: Automation[];
  providers: Provider[];
  settings: AppSettings;
  dataPath: string;
}
export interface FileEntry {
  path: string;
  name: string;
  directory: boolean;
  size: number;
}
export interface BrowserState {
  projectId: string;
  url: string;
  title: string;
  enabled: boolean;
  activity: string;
  error?: string;
}
export interface RuntimeEvent {
  projectId?: string;
  browser?: BrowserState;
  open?: boolean;
  type: "state" | "terminal" | "ownership" | "browser";
  runId?: string;
  data?: string;
}
export interface Bridge {
  invoke: <T = unknown>(method: string, payload?: unknown) => Promise<T>;
  onEvent: (fn: (event: RuntimeEvent) => void) => () => void;
}
declare global {
  interface Window {
    workroom: Bridge;
  }
}
export const PROVIDER_IDS: ProviderId[] = ["codex", "claude", "gemini"];
export const EMPTY_USAGE: Usage = {
  input: null,
  output: null,
  cached: null,
  total: null,
  cost: null,
  scope: "unknown",
  source: "미확인",
};
