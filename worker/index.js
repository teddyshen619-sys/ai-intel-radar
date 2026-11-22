import {
  handleAdminGetMessages,
  handleAdminGetThreads,
  handleAdminPostMessage,
  handleDeleteBookmark,
  handleGetBookmarks,
  handleGetConfig,
  handleGetMe,
  handleGetMessages,
  handleLogout,
  handlePatchProfile,
  handlePostMessage,
  handlePutBookmark,
  handleRequestOtp,
  handleSyncBookmarks,
  handleVerifyOtp,
} from './handlers.js';
import { jsonResponse, verifyOrigin } from './http.js';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * 安全解码单段路由参数，遇到畸形百分号编码时返回 null。
 * @param {string} rawSegment
 * @returns {string | null}
 */
function safeDecodeSegment(rawSegment) {
  try {
    return decodeURIComponent(rawSegment);
  } catch {
    return null;
  }
}

/**
 * 构造 405 Method Not Allowed 响应。
 * @param {string[]} allowedMethods
 * @returns {Response}
 */
function methodNotAllowed(allowedMethods) {
  return jsonResponse(
    { error: '请求方法不被允许 (Method Not Allowed)' },
    405,
    { Allow: allowedMethods.join(', ') },
  );
}

/**
 * 路由并分发所有 `/api/*` 请求。
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {ExecutionContext} ctx
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
async function dispatchApi(request, env, ctx, pathname) {
  const method = request.method.toUpperCase();

  // 所有状态变更方法统一执行 Origin 白名单校验，拦截跨站请求伪造（CSRF）
  if (MUTATING_METHODS.has(method)) {
    const originCheck = verifyOrigin(request, env);
    if (!originCheck.ok) {
      return originCheck.response;
    }
  }

  // 1. GET /api/config
  if (pathname === '/api/config') {
    if (method === 'GET') return handleGetConfig(request, env);
    return methodNotAllowed(['GET']);
  }

  // 2. GET /api/me
  if (pathname === '/api/me') {
    if (method === 'GET') return handleGetMe(request, env);
    return methodNotAllowed(['GET']);
  }

  // 3. POST /api/auth/request-otp
  if (pathname === '/api/auth/request-otp') {
    if (method === 'POST') return handleRequestOtp(request, env, ctx);
    return methodNotAllowed(['POST']);
  }

  // 4. POST /api/auth/verify-otp
  if (pathname === '/api/auth/verify-otp') {
    if (method === 'POST') return handleVerifyOtp(request, env);
    return methodNotAllowed(['POST']);
  }

  // 5. POST /api/auth/logout
  if (pathname === '/api/auth/logout') {
    if (method === 'POST') return handleLogout(request, env);
    return methodNotAllowed(['POST']);
  }

  // 6. PATCH /api/profile
  if (pathname === '/api/profile') {
    if (method === 'PATCH') return handlePatchProfile(request, env);
    return methodNotAllowed(['PATCH']);
  }

  // 7a. GET /api/bookmarks
  if (pathname === '/api/bookmarks') {
    if (method === 'GET') return handleGetBookmarks(request, env);
    return methodNotAllowed(['GET']);
  }

  // 7b. POST /api/bookmarks/sync
  if (pathname === '/api/bookmarks/sync') {
    if (method === 'POST') return handleSyncBookmarks(request, env);
    return methodNotAllowed(['POST']);
  }

  // 7c/7d. PUT | DELETE /api/bookmarks/:itemId
  if (pathname.startsWith('/api/bookmarks/')) {
    const rest = pathname.slice('/api/bookmarks/'.length);
    if (rest && !rest.includes('/')) {
      const itemId = safeDecodeSegment(rest);
      if (!itemId) {
        return jsonResponse({ error: '路径参数编码不合法' }, 400);
      }
      if (method === 'PUT') return handlePutBookmark(request, env, itemId);
      if (method === 'DELETE') return handleDeleteBookmark(request, env, itemId);
      return methodNotAllowed(['PUT', 'DELETE']);
    }
  }

  // 8a/8b. GET | POST /api/messages
  if (pathname === '/api/messages') {
    if (method === 'GET') return handleGetMessages(request, env);
    if (method === 'POST') return handlePostMessage(request, env, ctx);
    return methodNotAllowed(['GET', 'POST']);
  }

  // 8c. GET /api/admin/threads
  if (pathname === '/api/admin/threads') {
    if (method === 'GET') return handleAdminGetThreads(request, env);
    return methodNotAllowed(['GET']);
  }

  // 8d/8e. GET | POST /api/admin/messages/:userId
  if (pathname.startsWith('/api/admin/messages/')) {
    const rest = pathname.slice('/api/admin/messages/'.length);
    if (rest && !rest.includes('/')) {
      const targetUserId = safeDecodeSegment(rest);
      if (!targetUserId) {
        return jsonResponse({ error: '路径参数编码不合法' }, 400);
      }
      if (method === 'GET') return handleAdminGetMessages(request, env, targetUserId);
      if (method === 'POST') return handleAdminPostMessage(request, env, targetUserId);
      return methodNotAllowed(['GET', 'POST']);
    }
  }

  return jsonResponse({ error: '接口不存在 (Not Found)' }, 404);
}

export default {
  /**
   * Cloudflare Workers 原生 ES Module 入口。
   * 静态页面与 `/data/*` 由 `run_worker_first: ["/api/*"]` 直接走边缘缓存，仅 `/api/*` 进入本实例。
   *
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return jsonResponse({ error: '请求 URL 非法' }, 400);
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      try {
        return await dispatchApi(request, env, ctx, url.pathname);
      } catch (err) {
        console.error(
          JSON.stringify({
            message: 'unhandled api exception',
            method: request.method,
            path: url.pathname,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        return jsonResponse({ error: '服务器内部错误，请稍后重试' }, 500);
      }
    }

    // 非 `/api/*` 请求若意外进入 Worker，交回静态资源绑定处理
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
