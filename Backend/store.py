import json
import os
from typing import Dict
from models import RigReport

# 持久化文件路径
STATE_FILE = "rig_status_v1.json"

# key: rig_id, value: RigReport
data_store: Dict[str, RigReport] = {}

def save_to_disk():
    """将内存数据序列化到磁盘"""
    try:
        serializable_data = {}
        for rid, report in data_store.items():
            # 转换成 json 兼容格式
            report_dict = report.model_dump()
            # 转换 datetime
            if report_dict.get("last_report_at"):
                report_dict["last_report_at"] = report_dict["last_report_at"].isoformat()
            serializable_data[rid] = report_dict
            
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(serializable_data, f, ensure_ascii=False, indent=4)
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
