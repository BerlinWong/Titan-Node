/**
 * 监控系统前端全局配置文件
 */

export const CONFIG = {
  // 后端 API 基础地址
  // 适配 Vercel：生产环境下如果同域部署，使用空字符串即可；开发环境使用原地址
  API_BASE_URL: process.env.NODE_ENV === 'production' ? '' : 'http://120.24.88.39:8020',
  
  // 状态轮询间隔 (毫秒)
  POLLING_INTERVAL: 5000,
};
