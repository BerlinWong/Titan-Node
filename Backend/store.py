from typing import Dict
from models import RigReport, BoardStatus

# 简单的内存存储，后续可扩展为 Redis 或数据库
# key: rig_id, value: RigReport
data_store: Dict[str, RigReport] = {}

def update_rig_data(report: RigReport):
    from datetime import datetime
    report.last_report_at = datetime.now()
    data_store[report.rig_id] = report

def get_all_rigs():
    from datetime import datetime
    now = datetime.now()
    for report in data_store.values():
        if report.last_report_at:
            report.seconds_since_report = (now - report.last_report_at).total_seconds()
    return list(data_store.values())

def get_rig_by_id(rig_id: str):
    from datetime import datetime
    report = data_store.get(rig_id)
    if report and report.last_report_at:
        report.seconds_since_report = (datetime.now() - report.last_report_at).total_seconds()
    return report
