import { describe, expect, it } from 'vitest';
import { parseDeepSeekBalance } from '../../src/lib/deepseekPremium';

describe('DeepSeek premium balance gate', () => {
	it('requires available topped-up balance and does not treat granted credits as paid balance', () => {
		expect(parseDeepSeekBalance({
			is_available: true,
			balance_infos: [{ currency: 'USD', total_balance: '9', granted_balance: '9', topped_up_balance: '0' }],
		})).toMatchObject({ apiAvailable: true, paidBalanceAvailable: false });

		expect(parseDeepSeekBalance({
			is_available: true,
			balance_infos: [{ currency: 'USD', total_balance: '9', granted_balance: '8', topped_up_balance: '1' }],
		})).toEqual({
			status: 'ok',
			apiAvailable: true,
			paidBalanceAvailable: true,
			currencies: ['USD'],
			balances: [{ currency: 'USD', totalBalance: 9, grantedBalance: 8, toppedUpBalance: 1 }],
		});
	});

	it('fails parsing closed when the provider response is malformed', () => {
		expect(parseDeepSeekBalance({ is_available: 'yes', balance_infos: [] })).toBeNull();
		expect(parseDeepSeekBalance(null)).toBeNull();
	});
});
