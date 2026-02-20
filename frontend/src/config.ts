/**
 * 监控系统前端全局配置文件
 */

export const CONFIG = {
  // 后端 API 基础地址
  // 生产环境建议通过 Vercel 的环境变量 NEXT_PUBLIC_API_URL 进行配置
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'http://120.24.88.39:8020' : 'http://localhost:8020'),
  
  // 状态轮询间隔 (毫秒)
  POLLING_INTERVAL: 5000,
};
