import type { ProofModule } from "./types";

export class ModuleRegistry {
  private modules = new Map<string, ProofModule>();

  register(module: ProofModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module);
  }

  get(moduleId: string): ProofModule | undefined {
    return this.modules.get(moduleId);
  }

  list(): ProofModule[] {
    return Array.from(this.modules.values());
  }
}
