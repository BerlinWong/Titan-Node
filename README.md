# Titan Node 分布式台架监控系统

## 项目概述

Titan Node 是一个分布式台架监控系统，由 Agent、Backend、Frontend 三部分组成，支持动态规则配置和历史错误检测，无需重新部署即可更新检测逻辑。

## 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Agent      │    │   Backend     │    │  Frontend    │
│  (数据采集)  │────│  (中心服务)   │────│ (可视化界面)  │
│             │    │               │    │              │
│  • 日志解析  │    │  • FastAPI    │    │  • Next.js    │
│  • 错误检测  │    │  • 规则管理    │    │  • 实时监控  │
│  • 数据上报  │    │  • 数据存储    │    │  • 状态展示  │
│             │    │               │    │              │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                     │                     │
        │ HTTP API            │                     │
        └─────────────────────┘                     │
                                │ WebSocket/SSE   │
                                └────────────────────┘
```
---

## 🏗️ 系统架构

- **Agent (Python)**: 运行在测试机台 (Edge) 上，负责轮询提取增量日志流（Kernel/CM55），提取关键状态并上报。
- **Backend (FastAPI)**: 轻量级异步后端系统，基于 Pydantic 构建数据模型，在内存中维护全局 Rig 与 Board 状态树。
- **Frontend (Next.js)**: 工业级看板，定时轮询 Backend 数据，实现 UI 的动态无刷新渲染。

---

## 🚀 快速开始

### 1. 启动中心后端 (Backend)

确保已安装 Python 3.9+。该后端支持自动持久化（数据存储在本地 `rig_status_v1.json` 中），部署在独立服务器上时，即使重启服务也能恢复状态。

```bash
cd Backend
pip install -r requirements.txt
python3 main.py
```

默认运行在 `http://0.0.0.0:8000`。

### 2. 启动前端看板 (Frontend)

需要 Node.js 20+。

- **本地开发**: 修改 `frontend/src/config.ts` 或在本地创建 `.env.local`。
- **Vercel 部署**: 在 Vercel 控制面板中添加环境变量 `NEXT_PUBLIC_API_URL`（值如 `http://你的服务器IP:8000`），即可实现前端与独立后端的通信。

```bash
cd frontend
npm install
npm run build
# 或者预览模式
npm run dev
```

访问地址: `http://localhost:3000`

### 3. 在测试台架上运行 Agent

在每一台需要被监控的物理测试用例机上运行。
首次运行前，请确认 `Agent/config.json` 中的 `BACKEND_URL` 指向了中心服务器（如：`http://your-server-ip:8000/api/report`），该配置文件默认被 Git 忽略，方便本地独立维护更新。

```bash
cd Agent
python3 agent.py
```

**交互式配置启动**：

1. 指定台架名称（如默认的 `Rig-01`，或当前物理物理机代号）。
2. 输入日志挂载或生成的根目录 (例如 `./logs`)。
3. 可视化选择要监控的特定 Case 测试文件夹。
4. 选择当前执行的任务类型（目前分为核心的两大类：`循环启动任务` 和 `固定时长任务`，判定逻辑各自独立）。

Agent 会开始按设定的时间间隔 (默认为 30s) 不断采集、配对最新的日志内容并向 Backend 上报。

---

## 📂 核心目录结构

```text
Titan-Node/
├── Agent/
│   ├── agent.py               # 分布式边缘采集主程序
│   └── config.json            # (自动生成) Edge 端独立配置文件，防 Git 覆盖
├── Backend/
│   ├── main.py                # FastAPI API 服务入口
│   ├── models.py              # 数据模型定义
│   └── store.py               # 内存状态树管理
├── frontend/
│   ├── src/config.ts          # 前端全局配置中心 (API URL, 刷新频率)
│   ├── src/app/page.tsx       # 全局主大屏 Dashboard
│   └── src/app/rig/           # 包含 / rig 聚合详情 和 /board 单板下钻剖析页
└── logs/                      # 测试日志模拟存放处
```

## 🔧 自定义与扩展

- **新增日志解析逻辑**：如果后续需要提取新型 MCU 日志或更多模块温度，请扩展 `Agent/agent.py` 中的 `parse_logs` 的正则表达式规则。
- **前端配色自定义**：请查阅 `frontend/tailwind.config.ts` 以及位于 `src/app/globals.css` 中的自定义呼吸灯（`animate-breath` / `custom-scrollbar`）设定。

### 💡 教程：如何添加新的测试失败 / 异常判定条件？

由于系统遵循 **边缘计算优先** 的设计，所有复杂的日志提取和异常甄别都直接在 Agent 本地完成，极大地降低了后端的并发压力和网络带宽要求。

前端对异常的展示是完全通用兼容的，你只需修改 **`Agent/agent.py`** 中 `parse_logs()` 函数的几行代码，即可实现全新的报警判定。

**Demo 示例：添加一个超时错误判定**

```python
# 定位到 `parse_logs` 方法内的大约 270 行（通用异常检查区域）

# --- 通用异常检查 ---
if "Error: Miscompare" in tail or "[Error] Mismatch" in tail:
    status_data["status"] = "Error"
    if "Miscompare / Mismatch Detected" not in status_data["errors"]:
        status_data["errors"].append("Miscompare / Mismatch Detected")

# 👇 这是你新增的判定逻辑 Demo
if "Timeout waiting for reply" in tail:
    # 1. 改变板子整体状态触发前端红色报警
    status_data["status"] = "Error"
    # 2. 防止同一个错误在循环解析中被无限添加
    if "Connection Timeout Error (Network)" not in status_data["errors"]:
        # 3. 这段文字会逐一列印在前端大屏详情页的 Failure Reason 栏位中
        status_data["errors"].append("Connection Timeout Error (Network)")

# 👇 如果你想添加针对某一特定任务类型独有的报警，可以通过判断 selected_task_type：
if self.selected_task_type == "循环启动任务":
    if "Switch to Run Full Training Mode" in tail:
        status_data["status"] = "Error"
        if "Unexpected Full Training Mode" not in status_data["errors"]:
            status_data["errors"].append("Unexpected Full Training Mode")
```

只需这样简单的两个 `if`，一旦匹配到对应的日志模式，前端页面的该台架就会自动闪烁红灯光效，详情页内也会罗列出你自定义报出的提示错误词！
