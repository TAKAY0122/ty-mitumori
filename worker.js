/**
 * Cloudflare Worker — YOSHIZAKI STUDIO
 *
 * KV binding 設定（Cloudflare ダッシュボード）:
 *   変数名: STORE
 *   KV 名前空間: 任意の名前で作成してバインド
 *
 * 環境変数（任意）:
 *   ADMIN_KEY : 管理者PINコード（未設定時は 'admin1234'）
 *
 * エンドポイント一覧:
 *   GET  /?action=getData            — 料金データ取得（認証不要）
 *   POST /?action=saveData           — 料金データ保存（adminKey必須）
 *   POST /?action=resetData          — 料金データリセット（adminKey必須）
 *   POST /                           — お問い合わせ受付（認証不要）
 *   POST /?action=saveSubmission     — ヒアリング送信保存（認証不要）
 *   GET  /?action=getSubmissions     — ヒアリング一覧取得（adminKey必須）
 *   POST /?action=updateSubmission   — ヒアリング更新（adminKey必須）
 *   POST /?action=deleteSubmission   — ヒアリング削除（adminKey必須）
 *   POST /?action=clearSubmissions   — ヒアリング全削除（adminKey必須）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    const respond = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });

    const getAdminKey = () => env.ADMIN_KEY || 'admin1234';

    // ── GET requests ──────────────────────────
    if (request.method === 'GET') {
      // 料金データ取得（認証不要）
      if (action === 'getData') {
        const data = await env.STORE.get('priceData', { type: 'json' });
        return respond({ data: data || null });
      }

      // ヒアリング一覧取得（adminKey必須）
      if (action === 'getSubmissions') {
        const adminKey = url.searchParams.get('adminKey');
        if (adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        const subs = (await env.STORE.get('submissions', { type: 'json' })) || [];
        return respond({ submissions: subs });
      }

      // PIN 取得（認証不要 — ログイン画面で使用）
      if (action === 'getPin') {
        const pin = await env.STORE.get('adminPin') || getAdminKey();
        return respond({ pin });
      }

      return respond({ error: 'Not found' }, 404);
    }

    // ── POST requests ─────────────────────────
    if (request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch {}

      // お問い合わせ受付（既存エンドポイント、認証不要）
      if (!action) {
        return respond({ ok: true });
      }

      // PIN 変更（旧PINで認証）
      if (action === 'setPin') {
        const currentPin = await env.STORE.get('adminPin') || getAdminKey();
        if (body.oldPin !== currentPin) return respond({ error: 'Unauthorized' }, 401);
        if (!body.newPin || body.newPin.length < 4) return respond({ error: 'PIN too short' }, 400);
        await env.STORE.put('adminPin', body.newPin);
        return respond({ ok: true });
      }

      // 料金データ保存（adminKey必須）
      if (action === 'saveData') {
        if (body.adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        await env.STORE.put('priceData', JSON.stringify(body.data));
        return respond({ ok: true });
      }

      // 料金データリセット（adminKey必須）
      if (action === 'resetData') {
        if (body.adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        await env.STORE.delete('priceData');
        return respond({ ok: true });
      }

      // ヒアリング送信保存（認証不要 — 依頼者が送信）
      if (action === 'saveSubmission') {
        const sub = body.submission;
        if (!sub || !sub.id) return respond({ error: 'Invalid submission' }, 400);
        const subs = (await env.STORE.get('submissions', { type: 'json' })) || [];
        // 重複チェック（同じIDが既にある場合はスキップ）
        if (!subs.find(s => s.id === sub.id)) {
          subs.unshift(sub);
          if (subs.length > 500) subs.splice(500); // 最大500件
          await env.STORE.put('submissions', JSON.stringify(subs));
        }
        return respond({ ok: true });
      }

      // ヒアリング更新（adminKey必須）
      if (action === 'updateSubmission') {
        if (body.adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        const subs = (await env.STORE.get('submissions', { type: 'json' })) || [];
        const idx = subs.findIndex(s => s.id === body.id);
        if (idx === -1) return respond({ error: 'Not found' }, 404);
        Object.assign(subs[idx], body.updates);
        await env.STORE.put('submissions', JSON.stringify(subs));
        return respond({ ok: true });
      }

      // ヒアリング削除（adminKey必須）
      if (action === 'deleteSubmission') {
        if (body.adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        let subs = (await env.STORE.get('submissions', { type: 'json' })) || [];
        subs = subs.filter(s => s.id !== body.id);
        await env.STORE.put('submissions', JSON.stringify(subs));
        return respond({ ok: true });
      }

      // ヒアリング全削除（adminKey必須）
      if (action === 'clearSubmissions') {
        if (body.adminKey !== getAdminKey()) return respond({ error: 'Unauthorized' }, 401);
        await env.STORE.put('submissions', JSON.stringify([]));
        return respond({ ok: true });
      }
    }

    return respond({ error: 'Not found' }, 404);
  },
};
