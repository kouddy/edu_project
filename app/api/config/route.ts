/**
 * GET /api/config — what the grading server is configured with.
 * Names and labels only: providers, per-subject models, registry size, and
 * whether the Pi file configuration is complete. Never keys or secrets.
 */

import { connection, NextResponse } from "next/server";
import { loadPiConfig, providerForAgent, validatePiConfig } from "@/lib/server/pi-config";
import { listProviders } from "@/lib/server/providers";
import { REGISTRY, type AgentId } from "@/lib/server/registry";


export async function GET() {
  // Evaluated per request: provider selection depends on runtime env.
  await connection();
  const config = loadPiConfig();
  const missing = validatePiConfig(config);
  const subjects = Object.entries(config.subjects).map(([agent, manifest]) => ({
    agent,
    displaySubjects: manifest.displaySubjects,
    status: manifest.status,
    schemaVersion: manifest.schemaVersion,
    provider: providerForAgent(config, agent as AgentId),
    model: manifest.model,
  }));
  return NextResponse.json({
    providers: listProviders(),
    subjects,
    registry: {
      sheets: REGISTRY.length,
      withKeys: REGISTRY.filter((e) => e.questions.length > 0).length,
    },
    piConfig: { valid: missing.length === 0, missing },
  });
}
