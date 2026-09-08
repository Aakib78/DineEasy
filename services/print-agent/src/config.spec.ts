import { loadConfigFromEnv } from './config';

const baseEnv = {
  PRINT_AGENT_API_BASE_URL: 'http://192.168.1.10:3000',
  PRINT_AGENT_EMAIL: 'agent@outlet.test',
  PRINT_AGENT_PASSWORD: 'secret',
};

describe('loadConfigFromEnv', () => {
  it('loads the required fields and applies documented defaults for the rest', () => {
    const config = loadConfigFromEnv(baseEnv);
    expect(config.apiBaseUrl).toBe('http://192.168.1.10:3000');
    expect(config.email).toBe('agent@outlet.test');
    expect(config.password).toBe('secret');
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.jobTimeoutMs).toBe(5000);
    expect(config.deviceInfo).toMatch(/^print-agent@/);
  });

  it('strips a trailing slash from the API base URL so paths never double up', () => {
    const config = loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_API_BASE_URL: 'http://host:3000/' });
    expect(config.apiBaseUrl).toBe('http://host:3000');
  });

  it('throws a clear error naming the missing variable', () => {
    const withoutEmail: Record<string, string> = { ...baseEnv };
    delete withoutEmail.PRINT_AGENT_EMAIL;
    expect(() => loadConfigFromEnv(withoutEmail)).toThrow(/PRINT_AGENT_EMAIL/);
  });

  it('respects an explicit poll interval override', () => {
    const config = loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_POLL_INTERVAL_MS: '2000' });
    expect(config.pollIntervalMs).toBe(2000);
  });

  it('rejects a non-numeric poll interval rather than silently falling back', () => {
    expect(() => loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_POLL_INTERVAL_MS: 'soon' })).toThrow(
      /PRINT_AGENT_POLL_INTERVAL_MS/,
    );
  });

  it('rejects a zero or negative poll interval', () => {
    expect(() => loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_POLL_INTERVAL_MS: '0' })).toThrow(
      /positive number/,
    );
    expect(() => loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_POLL_INTERVAL_MS: '-100' })).toThrow(
      /positive number/,
    );
  });

  it('respects an explicit deviceInfo override instead of the derived default', () => {
    const config = loadConfigFromEnv({ ...baseEnv, PRINT_AGENT_DEVICE_INFO: 'Kitchen-PC-1' });
    expect(config.deviceInfo).toBe('Kitchen-PC-1');
  });
});
