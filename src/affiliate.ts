import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CloudClients } from './clients.js';
import { runTool } from './errors.js';
import { unwrapData } from './http.js';
import { completeToolMetadata } from './monapay.js';

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject => (
  value && typeof value === 'object' ? value as JsonObject : {}
);

const affiliate = (value: unknown): JsonObject => asObject(unwrapData(value));

const LINK_NEXT_STEP = "Chèn link vào README/docs/bài viết của người dùng kèm câu công khai 'link giới thiệu, MONA Cloud chia sẻ doanh thu cho người giới thiệu'. Không tự đăng lên đâu nếu người dùng chưa duyệt.";

export function registerAffiliateTools(server: McpServer, clients: CloudClients) {
  const register = (
    name: string,
    description: string,
    schema: z.ZodObject<any>,
    handler: (args: any) => unknown,
  ) => {
    for (const toolName of [name, name.replace(/^cloud_/, 'vibecloud_')]) {
      const metadata = completeToolMetadata(toolName, undefined, undefined);
      server.registerTool(toolName, {
        title: metadata.title,
        annotations: metadata.annotations,
        description: toolName === name
          ? description
          : `Alias tương thích của ${name}. / Compatibility alias. ${description}`,
        inputSchema: schema,
      }, (args) => runTool(() => handler(args)));
    }
  };

  register(
    'cloud_affiliate_link',
    'Lấy link giới thiệu MONA Cloud và mức chia sẻ doanh thu để người dùng duyệt trước khi đăng. / Get the MONA Cloud referral link and revenue-share rates.',
    z.object({}).strict(),
    async () => {
      const result = affiliate(await clients.vibecloud('/api/me/affiliate'));
      return {
        referral_code: result.referral_code,
        link: result.link,
        console_link: result.console_link,
        tier: result.tier,
        rates: result.rates,
        next_step: LINK_NEXT_STEP,
      };
    },
  );

  register(
    'cloud_affiliate_stats',
    'Đọc thống kê, số dư có thể nhận và các hoa hồng gần nhất. / Read affiliate stats, payout availability and recent commissions.',
    z.object({
      status: z.enum(['pending', 'approved', 'paid', 'reversed', 'flagged']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }).strict(),
    async ({ status, limit }) => {
      const [profileResponse, commissionResponse] = await Promise.all([
        clients.vibecloud('/api/me/affiliate'),
        clients.vibecloud('/api/me/affiliate/commissions', { query: { status, limit } }),
      ]);
      const profile = affiliate(profileResponse);
      const commissionData = affiliate(commissionResponse);
      return {
        stats: profile.stats,
        payout_available_vnd: profile.payout_available_vnd,
        can_request_payout: profile.can_request_payout,
        commissions: Array.isArray(commissionData.commissions) ? commissionData.commissions : [],
        next_step: profile.can_request_payout
          ? 'Có thể yêu cầu thanh toán trong MONA Cloud Console; kiểm tra thông tin nhận tiền trước khi gửi yêu cầu.'
          : 'Theo dõi hoa hồng approved và ngưỡng thanh toán; chưa tự yêu cầu thanh toán thay người dùng.',
      };
    },
  );

  register(
    'cloud_affiliate_claim',
    'Gắn mã giới thiệu vào tài khoản hiện tại trong thời hạn cho phép. / Claim a referral code for the current account.',
    z.object({ code: z.string().trim().min(4).max(16) }).strict(),
    async ({ code }) => {
      const result = affiliate(await clients.vibecloud('/api/me/referral/claim', {
        method: 'POST',
        body: { code },
      }));
      return {
        ...result,
        next_step: typeof result.next_step === 'string'
          ? result.next_step
          : 'Mã giới thiệu đã được ghi nhận; dùng cloud_affiliate_link nếu muốn lấy link của chính tài khoản này.',
      };
    },
  );
}
