/** Sites/Cloudflare 静态演示入口：只读取已构建的公开文件，不连接本地数据库。 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 公开演示不开放本地 Python API，避免访问者误以为数据会写入真实服务端。
    if (url.pathname.startsWith('/api/')) {
      return Response.json({ok:false, demo:true, message:'公开演示仅使用当前浏览器本地数据。'}, {status:404});
    }
    return env.ASSETS.fetch(request);
  }
};
