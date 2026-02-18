import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './lib/wallet-config';
import { EpochBar } from './components/EpochBar';
import { StepList } from './components/Steps/StepList';

const queryClient = new QueryClient();

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="app">
          <header className="header">
            <h1>zk_faucet</h1>
            <p>privacy-preserving testnet faucet</p>
          </header>

          <EpochBar />
          <StepList />

          <div className="privacy-banner">
            <svg className="privacy-banner-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span>Your proof is generated entirely in your browser. Private data (address, signature, balance) never leaves your device. The server only receives the ZK proof.</span>
          </div>

          <footer className="footer">
            <p>zk_faucet v0.1.0 — built with Noir, Hono, and Bun</p>
          </footer>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
