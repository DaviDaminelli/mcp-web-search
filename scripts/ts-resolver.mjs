/**
 * Hook de resolução para rodar os módulos de lib/ direto no Node.
 *
 * O código do app usa imports sem extensão ("../tavily"), que o bundler do
 * Next resolve mas o Node ESM não. Isto tenta acrescentar ".ts" quando a
 * resolução normal falha, sem mexer no código de produção.
 *
 * Uso: node --import ./scripts/ts-resolver.mjs scripts/<script>.mts
 */
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !/\.[mc]?[jt]s$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});
