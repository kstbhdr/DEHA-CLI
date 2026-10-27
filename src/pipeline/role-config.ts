import { DehaConfig, RoleConfig, resolveApiKey } from '../config';

/** Agent roles must retain their own endpoint, credentials and model. */
export function configForRole(config: DehaConfig, role: RoleConfig): DehaConfig {
  return {
    ...config,
    provider: role.provider,
    roleOverride: role,
    [role.provider + 'Model']: role.model,
    anthropicApiKey: role.provider === 'claude' ? resolveApiKey(role, config) : config.anthropicApiKey,
    maxTokens: role.maxTokens ?? config.maxTokens,
    toolMaxTokens: role.maxTokens ?? config.toolMaxTokens,
    temperature: role.temperature ?? config.temperature,
    openrouterProvider: role.openrouterProvider ?? config.openrouterProvider,
    openrouterIgnoreProviders: role.openrouterIgnoreProviders ?? config.openrouterIgnoreProviders,
    openrouterZdr: role.openrouterZdr ?? config.openrouterZdr,
  };
}
