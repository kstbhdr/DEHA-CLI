import { DehaConfig, RoleConfig, resolveApiKey } from '../config';

/** Agent roles must retain their own endpoint, credentials and model. */
export function configForRole(config: DehaConfig, role: RoleConfig, label?: 'planner' | 'coder' | 'judge'): DehaConfig {
  return {
    ...config,
    provider: role.provider,
    agentRole: label,
    roleOverride: role,
    [role.provider + 'Model']: role.model,
    anthropicApiKey: role.provider === 'claude' ? resolveApiKey(role, config) : config.anthropicApiKey,
    maxTokens: role.maxTokens ?? config.maxTokens,
    toolMaxTokens: role.maxTokens ?? config.toolMaxTokens,
    temperature: role.temperature ?? config.temperature,
    maxToolRounds: role.maxToolRounds ?? config.maxToolRounds,
    maxContextTokens: role.maxContextTokens ?? config.maxContextTokens,
    openrouterProvider: role.openrouterProvider ?? config.openrouterProvider,
    openrouterIgnoreProviders: role.openrouterIgnoreProviders ?? config.openrouterIgnoreProviders,
    openrouterZdr: role.openrouterZdr ?? config.openrouterZdr,
  };
}
