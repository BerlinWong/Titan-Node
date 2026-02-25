import json
import os
from typing import Dict
from models import RigReport, RuleConfig

# 持久化文件路径
STATE_FILE = "rig_status_v1.json"
RULES_FILE = "rules_config.json"

# key: rig_id, value: RigReport
data_store: Dict[str, RigReport] = {}

# key: task_type, value: RuleConfig
rules_store: Dict[str, RuleConfig] = {}

def save_to_disk():
    """将内存数据序列化到磁盘（Vercel环境跳过）"""
    # Vercel Serverless环境是只读的，跳过文件写入
    import os
    if os.environ.get("VERCEL"):
        return  # Vercel环境不写入文件
    
    try:
        serializable_data = {}
        for rid, report in data_store.items():
            report_dict = report.dict()
            # 处理datetime对象的序列化
            if hasattr(report, 'last_report_at') and report.last_report_at:
                report_dict["last_report_at"] = report.last_report_at.isoformat()
            # 处理boards列表中的datetime对象
            if "boards" in report_dict and report_dict["boards"]:
                for board in report_dict["boards"]:
                    if hasattr(board, 'kernel_heartbeat') and board.kernel_heartbeat:
                        board.kernel_heartbeat = board.kernel_heartbeat.isoformat()
                    if hasattr(board, 'cm55_heartbeat') and board.cm55_heartbeat:
                        board.cm55_heartbeat = board.cm55_heartbeat.isoformat()
            serializable_data[rid] = report_dict
            
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(serializable_data, f, ensure_ascii=False, indent=4, default=str)
    except Exception as e:
        print(f"Failed to save state: {e}")

def load_from_disk():
    """从磁盘恢复数据"""
    global data_store
    if not os.path.exists(STATE_FILE):
        return
    
    try:
        from datetime import datetime
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            raw_data = json.load(f)
            new_store = {}
            for rid, item in raw_data.items():
                # 恢复 datetime
                if item.get("last_report_at"):
                    item["last_report_at"] = datetime.fromisoformat(item["last_report_at"])
                new_store[rid] = RigReport(**item)
            data_store = new_store
    except Exception as e:
        print(f"Failed to load state: {e}")

# 初始加载
load_from_disk()

def update_rig_data(report: RigReport):
    from datetime import datetime
    report.last_report_at = datetime.now()
    data_store[report.rig_id] = report
    save_to_disk() # 每次更新都保存

def get_all_rigs():
    from datetime import datetime
    now = datetime.now()
    for report in data_store.values():
        if report.last_report_at:
            report.seconds_since_report = (now - report.last_report_at).total_seconds()
    return list(data_store.values())

def get_rig_by_id(rig_id: str):
    from datetime import datetime
    # 尝试再次加载，防止其它实例更新了磁盘（虽然 Serverless 内存不共享，但文件系统如果是持久卷则有效）
    # 在 Vercel 的 /tmp 下，这仅限于单实例生存期
    report = data_store.get(rig_id)
    if report and report.last_report_at:
        report.seconds_since_report = (datetime.now() - report.last_report_at).total_seconds()
    return report

def delete_rig(rig_id: str) -> bool:
    """从存储中删除指定台架"""
    if rig_id in data_store:
        del data_store[rig_id]
        save_to_disk()
        return True
    return False

# ===== 规则管理功能 =====

def save_rules_to_disk():
    """将规则配置序列化到磁盘（Vercel环境跳过）"""
    # Vercel Serverless环境是只读的，跳过文件写入
    import os
    if os.environ.get("VERCEL"):
        return  # Vercel环境不写入文件
        
    try:
        serializable_rules = {}
        for task_type, rule in rules_store.items():
            rule_dict = rule.dict()
            # 处理datetime对象的序列化
            if hasattr(rule, 'last_updated') and rule.last_updated:
                rule_dict["last_updated"] = rule.last_updated.isoformat()
            serializable_rules[task_type] = rule_dict
            
        with open(RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(serializable_rules, f, ensure_ascii=False, indent=4, default=str)
    except Exception as e:
        print(f"Failed to save rules: {e}")

def load_rules_from_disk():
    """从磁盘恢复规则配置"""
    if os.path.exists(RULES_FILE):
        try:
            with open(RULES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for task_type, rule_dict in data.items():
                    rules_store[task_type] = RuleConfig(**rule_dict)
        except Exception as e:
            print(f"Failed to load rules: {e}")
    
    # 如果没有规则，初始化默认规则
    if not rules_store:
        init_default_rules()

def init_default_rules():
    """初始化默认规则配置"""
    default_rules = {
        "循环启动任务": {
            "task_type": "循环启动任务",
            "rules": {
                "time_calculation": {
                    "method": "reboot_script",
                    "script_pattern": r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*bmx7_ddr_setup_reboot\.sh",
                    "total_hours": 48
                },
                "loop_detection": {
                    "pattern": r"BMX7 DDR Reboot Test: Loop(\d+)"
                },
                "error_patterns": [
                    {"name": "Reboot Error", "pattern": "Switch to Full Training Boot"},
                    {"name": "Reboot Error", "pattern": "Switch to Run Full Training Mode"},
                    {"name": "Reboot Error", "pattern": "2D Training Successfully！"},
                    {"name": "Miscompare Detected", "pattern": "Error: Miscompare"},
                    {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"}
                ],
                "script_error_patterns": [
                    r"Permission denied",
                    r"No such file or directory", 
                    r"Command not found",
                    r"Error executing"
                ],
                "critical_keywords": ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"],
                "hang_detection": {
                    "threshold_seconds": 300,
                    "check_kernel": True,
                    "check_cm55": True
                }
            },
            "version": "1.0"
        },
        "固定时长任务": {
            "task_type": "固定时长任务", 
            "rules": {
                "time_calculation": {
                    "method": "remaining_seconds",
                    "pattern": r"Log: Seconds remaining: (\d+)",
                    "total_hours": 48
                },
                "error_patterns": [
                    {"name": "Miscompare Detected", "pattern": "Error: Miscompare"},
                    {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"}
                ],
                "critical_keywords": ["KERNEL PANIC", "MACHINE CHECK", "REBOOTING", "OUT OF MEMORY", "SEGMENTATION FAULT"],
                "hang_detection": {
                    "threshold_seconds": 300,
                    "check_kernel": True,
                    "check_cm55": True
                }
            },
            "version": "1.0"
        }
    }
    
    for task_type, rule_data in default_rules.items():
        rules_store[task_type] = RuleConfig(**rule_data)
    
    save_rules_to_disk()

def get_rules_by_task_type(task_type: str) -> RuleConfig:
    """获取特定任务类型的规则配置"""
    if task_type not in rules_store:
        raise ValueError(f"No rules found for task type: {task_type}")
    return rules_store[task_type]

def get_all_rules() -> Dict[str, RuleConfig]:
    """获取所有规则配置"""
    return rules_store

def update_rules(task_type: str, rules: RuleConfig) -> bool:
    """更新特定任务类型的规则配置"""
    rules_store[task_type] = rules
    save_rules_to_disk()
    return True

def ensure_default_rules():
    """确保有默认规则配置"""
    import os
    if os.environ.get("VERCEL") and not rules_store:
        # Vercel环境且规则为空，初始化默认规则
        from datetime import datetime
        
        default_rules = {
            "循环启动任务": RuleConfig(
                task_type="循环启动任务",
                rules={
                    "error_patterns": [
                        {"name": "Miscompare Detected", "pattern": "Error: miscompare"},
                        {"name": "Hardware Miscompare", "pattern": "Hardware Error: miscompare"},
                        {"name": "Hardware MISMATCH", "pattern": "Error: MISMATCH"},
                        {"name": "Report Miscompare", "pattern": "Report Error: miscompare"},
                        {"name": "Reboot Error", "pattern": "Switch to Full Training Boot"},
                        {"name": "Reboot Error", "pattern": "Switch to Run Full Training Mode"},
                        {"name": "Reboot Error", "pattern": "2D Training Successfully！"},
                        {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"},
                        {"name": "NPU Mismatch Error", "pattern": "Error: MISMATCH occured druing NPU clgd Test"}
                    ],
                    "loop_detection": {
                        "pattern": "BMX7 DDR Reboot Test: Loop(\\d+)"
                    }
                },
                version="1.4",
                last_updated=datetime.now()
            ),
            "固定时长任务": RuleConfig(
                task_type="固定时长任务",
                rules={
                    "error_patterns": [
                        {"name": "Miscompare Detected", "pattern": "Error: miscompare"},
                        {"name": "Hardware Miscompare", "pattern": "Hardware Error: miscompare"},
                        {"name": "Report Miscompare", "pattern": "Report Error: miscompare"},
                        {"name": "Mismatch Detected", "pattern": "[Error] Mismatch"}
                    ]
                },
                version="1.1",
                last_updated=datetime.now()
            )
        }
        
        for task_type, rule_config in default_rules.items():
            rules_store[task_type] = rule_config

# 初始化时从磁盘加载数据
load_from_disk()
load_rules_from_disk()

# 确保Vercel环境有默认规则
ensure_default_rules()
