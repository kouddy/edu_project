/**
 * Server startup: begin the guidance worker (it polls the task
 * stores and generates animations off the request path). The worker
 * is unref'd and env-gated — see lib/server/guidance-worker.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startGuidanceWorker } = await import("./lib/server/guidance-worker");
    startGuidanceWorker();
  }
}
