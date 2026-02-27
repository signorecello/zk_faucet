import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { StepContainer } from './StepContainer';
import { ConnectStep } from './01-ConnectStep';
import { ProveStep } from './02-ProveStep';
import { ClaimStep } from './03-ClaimStep';
import { useNetworks } from '../../hooks/useNetworks';
import { useClaim } from '../../hooks/useClaim';
import { api } from '../../lib/api';

export function StepList() {
  const { address, isConnected } = useAccount();
  const { networks, modules, loading: networksLoading } = useNetworks();
  const claimHook = useClaim();
  const [balances, setBalances] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getHealth().then((h) => setBalances(h.balances)).catch(() => {});
  }, []);

  const [openStep, setOpenStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [recipient, setRecipient] = useState('');
  const [targetNetwork, setTargetNetwork] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  // Default to first module when modules load
  useEffect(() => {
    if (modules.length > 0 && !selectedModuleId) {
      setSelectedModuleId(modules[0].id);
    }
  }, [modules, selectedModuleId]);

  const selectedModule = modules.find((m) => m.id === selectedModuleId) ?? modules[0];

  const completeStep = useCallback(
    (step: number) => {
      setCompletedSteps((prev) => new Set(prev).add(step));
      setOpenStep(step + 1);
    },
    [],
  );

  // Auto-fill recipient when wallet connects
  const handleConnectContinue = () => {
    if (address && !recipient) {
      setRecipient(address);
    }
    completeStep(1);
  };

  const handleProvingSuccess = useCallback(() => {
    completeStep(2);
  }, [completeStep]);

  const isStep1Complete = completedSteps.has(1);
  const isStep2Complete = completedSteps.has(2);

  // Reset flow if wallet disconnects
  if (!isConnected && (isStep1Complete || openStep > 1)) {
    setOpenStep(1);
    setCompletedSteps(new Set());
    claimHook.reset();
  }

  return (
    <div>
      <StepContainer
        stepNumber={1}
        title="Connect Wallet"
        isOpen={openStep === 1}
        isCompleted={isStep1Complete}
        onToggle={() => setOpenStep(openStep === 1 ? 0 : 1)}
      >
        <ConnectStep
          modules={modules}
          selectedModuleId={selectedModuleId}
          onModuleChange={setSelectedModuleId}
          onContinue={handleConnectContinue}
        />
      </StepContainer>

      <StepContainer
        stepNumber={2}
        title="Generate Proof & Claim"
        isOpen={openStep === 2}
        isCompleted={isStep2Complete}
        onToggle={() => isStep1Complete && setOpenStep(openStep === 2 ? 0 : 2)}
      >
        <ClaimStep
          networks={networks}
          recipient={recipient}
          targetNetwork={targetNetwork}
          onRecipientChange={setRecipient}
          onNetworkChange={setTargetNetwork}
          result={claimHook.result}
          loading={networksLoading}
          balances={balances}
        />
        {!claimHook.result && (
          <div style={{ marginTop: 16 }}>
            <ProveStep
              module={selectedModule}
              recipient={recipient}
              targetNetwork={targetNetwork}
              networks={networks}
              onSuccess={handleProvingSuccess}
              claimHook={claimHook}
            />
          </div>
        )}
      </StepContainer>
    </div>
  );
}
