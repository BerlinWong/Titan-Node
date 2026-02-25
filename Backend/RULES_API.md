# 规则配置 API 文档

## 概述

Titan Node 支持动态规则配置系统，实现了规则与 Agent 的解耦，支持：

- **动态规则更新**：无需重新部署 Agent 即可更新检测逻辑
- **历史错误检测**：Agent 冷启动时全量扫描历史日志
- **循环次数统计**：支持基于全量日志的循环次数统计
- **状态优先级保护**：错误状态不会被其他逻辑覆盖
- **实时监控**：结合历史检测和持续实时监控

## API 端点

### 获取所有规则

```http
GET /api/rules
```

**响应示例：**

```json
{
  "循环启动任务": {
    "task_type": "循环启动任务",
    "rules": {
      "time_calculation": {
        "method": "reboot_script",
        "script_pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\].*bmx7_ddr_setup_reboot\\.sh",
        "total_hours": 48
      },
      "loop_detection": {
        "pattern": "BMX7 DDR Reboot Test: Loop(\\d+)"
      },
      "error_patterns": [
        { "name": "Reboot Error", "pattern": "Switch to Full Training Boot" },
        { "name": "Miscompare Detected", "pattern": "Error: Miscompare" }
      ],
      "critical_keywords": ["KERNEL PANIC", "MACHINE CHECK"],
      "hang_detection": {
        "threshold_seconds": 300,
        "check_kernel": true,
        "check_cm55": true
      }
    },
    "version": "1.0",
    "last_updated": "2024-02-23T18:30:00"
  }
}
```

### 获取特定任务类型规则

```http
GET /api/rules/{task_type}
```

**参数：**

- `task_type`: 任务类型（如：循环启动任务、固定时长任务）

### 更新规则配置

```http
POST /api/rules/{task_type}
```

**请求体：**

```json
{
  "task_type": "循环启动任务",
  "rules": {
    "time_calculation": {
      "method": "reboot_script",
      "script_pattern": "\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})\\].*bmx7_ddr_setup_reboot\\.sh",
      "total_hours": 48
    },
    "error_patterns": [{ "name": "New Error", "pattern": "New error pattern" }]
  },
  "version": "1.1"
}
```

## 规则配置结构

### time_calculation（时间计算）

**reboot_script 方法（循环任务）：**

- `method`: "reboot_script"
- `script_pattern`: 检测脚本执行的正则表达式
- `total_hours`: 总时长（小时）

**remaining_seconds 方法（固定时长任务）：**

- `method`: "remaining_seconds"
- `pattern`: 提取剩余秒数的正则表达式
- `total_hours`: 总时长（小时）

### error_patterns（错误模式）

数组格式，每个错误包含：

- `name`: 错误名称
- `pattern`: 匹配模式

### critical_keywords（严重错误）

字符串数组，包含严重错误关键词

### hang_detection（挂起检测）

- `threshold_seconds`: 挂起检测阈值（秒）
- `check_kernel`: 是否检查 Kernel 挂起
- `check_cm55`: 是否检查 CM55 挂起

### loop_detection（循环检测）

- `pattern`: 提取循环次数的正则表达式

### script_error_patterns（脚本错误）

字符串数组，包含脚本执行错误模式

## Agent 行为

### 规则获取

1. **启动时获取**: Agent 启动时会立即获取规则
2. **定期更新**: 每 5 分钟检查一次规则更新
3. **失败后备**: 如果获取失败，使用内置默认规则

### 缓存机制

- 规则在 Agent 内存中缓存
- 支持版本控制
- 自动定期刷新

## 使用示例

### 添加新的错误检测

```bash
curl -X POST "http://localhost:8000/api/rules/循环启动任务" \
  -H "Content-Type: application/json" \
  -d '{
    "task_type": "循环启动任务",
    "rules": {
      "error_patterns": [
        {"name": "Timeout Error", "pattern": "Connection timeout"},
        {"name": "Memory Error", "pattern": "Out of memory"}
      ]
    },
    "version": "1.1"
  }'
```

### 修改挂起检测阈值

```bash
curl -X POST "http://localhost:8000/api/rules/循环启动任务" \
  -H "Content-Type: application/json" \
  -d '{
    "task_type": "循环启动任务",
    "rules": {
      "hang_detection": {
        "threshold_seconds": 600,
        "check_kernel": true,
        "check_cm55": true
      }
    },
    "version": "1.2"
  }'
```

## 注意事项

1. **正则表达式转义**: JSON 中的正则表达式需要双反斜杠转义
2. **版本管理**: 建议每次更新都递增版本号
3. **规则验证**: 更新规则前建议先测试正则表达式
4. **Agent 重启**: 重大规则变更可能需要重启 Agent 生效
