from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List
import store
import models
import urllib.parse
from models import RigReport, RuleConfig

app = FastAPI(title="Rig Monitoring System API")

# 启用 CORS 以支持前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Rig Monitoring System API is running"}

@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "service": "Rig Monitoring System API"}

@app.get("/api/endpoints")
async def list_endpoints():
    """列出所有可用的API端点"""
    return {
        "endpoints": [
            {"method": "GET", "path": "/", "description": "根端点"},
            {"method": "GET", "path": "/health", "description": "健康检查"},
            {"method": "GET", "path": "/api/endpoints", "description": "列出所有端点"},
            {"method": "GET", "path": "/api/status", "description": "获取所有台架状态"},
            {"method": "POST", "path": "/api/report", "description": "上报台架数据"},
            {"method": "DELETE", "path": "/api/status/{rig_id}", "description": "删除特定台架"},
            {"method": "GET", "path": "/api/rules", "description": "获取所有规则配置"},
            {"method": "GET", "path": "/api/rules/{task_type}", "description": "获取特定任务类型规则"},
            {"method": "POST", "path": "/api/rules/{task_type}", "description": "更新特定任务类型规则"}
        ]
    }

@app.post("/api/report")
async def report_status(report: RigReport):
    """接收来自 Agent 的数据上报"""
    store.update_rig_data(report)
    return {"status": "success", "rig_id": report.rig_id}

@app.get("/api/status")
async def get_all_status():
    """获取所有台架的实时状态"""
    return store.get_all_rigs()

@app.get("/api/status/{rig_id}")
async def get_rig_status(rig_id: str):
    """获取特定台架的详细状态"""
    data = store.get_rig_by_id(rig_id)
    if not data:
        raise HTTPException(status_code=404, detail="Rig not found")
    return data

@app.delete("/api/status/{rig_id}")
async def delete_rig(rig_id: str):
    """删除特定台架"""
    success = store.delete_rig(rig_id)
    if not success:
        raise HTTPException(status_code=404, detail="Rig not found")
    return {"status": "success", "message": f"Rig {rig_id} deleted"}

@app.get("/api/rules/{task_type}")
async def get_rules(task_type: str):
    """获取特定任务类型的规则配置"""
    try:
        # 对URL编码的任务类型进行解码
        decoded_task_type = urllib.parse.unquote(task_type)
        rules = store.get_rules_by_task_type(decoded_task_type)
        return rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get rules: {str(e)}")

@app.get("/api/rules")
async def get_all_rules():
    """获取所有规则配置"""
    try:
        all_rules = store.get_all_rules()
        return all_rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get rules: {str(e)}")

@app.post("/api/rules/{task_type}")
async def update_rules(task_type: str, rules: RuleConfig):
    """更新特定任务类型的规则配置"""
    try:
        # 对URL编码的任务类型进行解码
        decoded_task_type = urllib.parse.unquote(task_type)
        success = store.update_rules(decoded_task_type, rules)
        return {"status": "success", "message": f"Rules for {decoded_task_type} updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update rules: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
