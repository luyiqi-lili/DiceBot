import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/tgMessage', () => import('../helpers/mocks').then(m => m.mockTgMessageModule));

import TgMessage from '../../src/lib/tgMessage';
import { handleDndHelp } from '../../src/commands/dndHelp';

/** 构造假的 D1 DB */
function mockDB(rows: any[] = []) {
  const chain = () => ({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
  });
  return { prepare: vi.fn().mockImplementation(chain) };
}

describe('/dnd', () => {
  beforeEach(() => vi.clearAllMocks());

  it('DB 未配置时返回提示', async () => {
    await handleDndHelp({ chatId: -100, threadId: undefined, from: { id: 123 } } as any, {} as any);
    const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
    expect(c.text).toContain('未配置');
  });

  it('发送帮助包含种族/职业/技能表头', async () => {
    const env: any = { DB: mockDB([]) };
    await handleDndHelp({ chatId: -100, threadId: undefined, from: { id: 123 } } as any, env);
    const c = vi.mocked(TgMessage.sendText).mock.calls[0][1];
    expect(c.text).toContain('DND 跑团系统');
    expect(c.text).toContain('🧬');
    expect(c.text).toContain('⚔️');
    expect(c.text).toContain('🏹');
    expect(c.text).toContain('/new');
    expect(c.text).toContain('/cast');
  });
});
