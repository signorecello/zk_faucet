import { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { mock } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MOCK_ADDRESS } from './fixtures';

// A private key for the mock connector (not a real key, just for tests)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export const testConfig = createConfig({
  chains: [mainnet],
  connectors: [
    mock({
      accounts: [MOCK_ADDRESS as `0x${string}`],
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});

function TestWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <WagmiProvider config={testConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: TestWrapper, ...options });
}

export { render };
