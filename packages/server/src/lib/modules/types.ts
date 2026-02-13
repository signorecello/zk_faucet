export interface ProofModule {
  id: string;
  name: string;
  description: string;
  validatePublicInputs(inputs: PublicInputs): Promise<ValidationResult>;
  verifyProof(proof: Uint8Array, publicInputs: PublicInputs): Promise<boolean>;
  currentEpoch(): number;
  epochDurationSeconds: number;
}

export interface PublicInputs {
  stateRoot: string;
  epoch: number;
  minBalance: string;
  nullifier: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}
