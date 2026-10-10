import { Resend } from 'resend';
import { AuthError } from './errors.js';

export function createResetEmail({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, frontendUrl, nodeEnv }, Client = Resend) {
  let client;
  function assertConfigured() {
    let url;
    try { url = new URL(frontendUrl); } catch { /* Return only safe configuration error. */ }
    const validOrigin = url && url.origin === frontendUrl && !url.username && !url.password && (url.protocol === 'https:' || (nodeEnv !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)));
    const validFrom = typeof from === 'string' && !/[\r\n]/.test(from) && /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from.trim());
    if (!apiKey?.trim() || !validFrom || !validOrigin || (nodeEnv === 'production' && from.trim().toLowerCase().endsWith('@resend.dev'))) throw new AuthError(503, 'AUTH_EMAIL_UNAVAILABLE', 'Dịch vụ email chưa sẵn sàng.');
  }
  return {
    assertConfigured,
    async send({ email, token }) {
      assertConfigured();
      client ||= new Client(apiKey);
      const link = new URL('/reset-password', frontendUrl);
      link.hash = `token=${token}`;
      try {
        const { error } = await client.emails.send({
          from: `Đặt sân cầu lông Đà Nẵng <${from.trim()}>`, to: [email],
          subject: 'Đặt lại mật khẩu',
          text: `Bạn đã yêu cầu đặt lại mật khẩu. Liên kết dùng một lần, hết hạn sau 15 phút:\n${link.href}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
        });
        if (error) throw new Error('EMAIL_DELIVERY_FAILED');
      } catch { throw new Error('EMAIL_DELIVERY_FAILED'); }
    },
  };
}
