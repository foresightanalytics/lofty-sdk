import type { WithdrawParams } from './types';

// Compile-time consumer checks only. This file is intentionally absent from src/index.ts,
// so tsc checks it while the package entry point never bundles it.
const bank: WithdrawParams = { source: 'rent', destination: 'bank', amount: 50, payoutPayee: 'personal' };
const usdc: WithdrawParams = { source: 'wallet', destination: 'usdc', amount: 25 };

// @ts-expect-error A bank withdrawal must name its payee.
const bankWithoutPayee: WithdrawParams = { source: 'rent', destination: 'bank', amount: 50 };
// @ts-expect-error The payee is personal or business.
const bankWithUnknownPayee: WithdrawParams = { source: 'rent', destination: 'bank', amount: 50, payoutPayee: 'company' };
// @ts-expect-error A USDC withdrawal has no payee.
const usdcWithPayee: WithdrawParams = { source: 'wallet', destination: 'usdc', amount: 25, payoutPayee: 'personal' };

void [bank, usdc, bankWithoutPayee, bankWithUnknownPayee, usdcWithPayee];
