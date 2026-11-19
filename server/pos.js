import { Router } from 'express';
import { currencyFor, buildContext, appPolicyFromEnv } from './posContext.js';

/**
 * Create POS router for operator app context
 * @param {Object} options
 * @param {Database} options.sqlite - SQLite database connection
 * @param {Function} options.getCallerFn - Function to resolve caller from request
 * @returns {Router} Express router
 */
export function createPosRouter({ sqlite, getCallerFn } = {}) {
  const router = Router();
  
  // Use injected or default caller function
  const resolveCaller = getCallerFn || (async () => null);

  /**
   * GET /api/pos/context - Get context for the authenticated user
   */
  router.get('/context', async (req, res) => {
    const caller = await resolveCaller(req);
    
    if (!caller) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    const policy = appPolicyFromEnv();
    
    const context = buildContext({
      sqlite: sqlite,
      caller: caller,
      now: new Date(),
      policy: policy
    });

    res.json(context);
  });

  return router;
}