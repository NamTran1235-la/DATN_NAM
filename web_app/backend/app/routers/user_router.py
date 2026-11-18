import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.auth import get_current_user
from app.models import User, UserDeviceConfig, UserDeviceConfigRequest, get_utc_now

logger = logging.getLogger("USER_ROUTER")

router = APIRouter(prefix="/user", tags=["1. Quản lý Tài khoản & Cấu hình Người dùng"])

def resolve_user_id(current_user: dict, session: Session) -> int:
    uid = current_user.get("user_id")
    if uid:
        return int(uid)
    uname = current_user.get("username")
    if uname:
        u = session.exec(select(User).where(User.username == uname)).first()
        if u and u.id:
            return u.id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác định danh tính người dùng"
    )

@router.get(
    "/devices",
    summary="Lấy cấu hình danh sách thiết bị Dashboard của người dùng",
    description="Truy xuất danh sách thiết bị và cờ trạng thái xóa đã đồng bộ trên máy chủ."
)
def get_user_devices(
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    uid = resolve_user_id(current_user, session)
    cfg = session.exec(select(UserDeviceConfig).where(UserDeviceConfig.user_id == uid)).first()
    if not cfg:
        return {
            "success": True,
            "data": {
                "has_config": False,
                "devices": [],
                "deleted_flags": {}
            }
        }
    
    try:
        devices = json.loads(cfg.devices_json or "[]")
    except Exception:
        devices = []
        
    try:
        deleted_flags = json.loads(cfg.deleted_flags_json or "{}")
    except Exception:
        deleted_flags = {}

    return {
        "success": True,
        "data": {
            "has_config": True,
            "devices": devices,
            "deleted_flags": deleted_flags,
            "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None
        }
    }

@router.post(
    "/devices",
    summary="Lưu & đồng bộ cấu hình danh sách thiết bị Dashboard lên máy chủ",
    description="Lưu danh sách thiết bị tùy chỉnh và cờ xóa theo tài khoản để đồng bộ giữa Điện thoại và Laptop."
)
def save_user_devices(
    req: UserDeviceConfigRequest,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    uid = resolve_user_id(current_user, session)
    cfg = session.exec(select(UserDeviceConfig).where(UserDeviceConfig.user_id == uid)).first()
    
    devs_str = json.dumps(req.devices, ensure_ascii=False)
    flags_str = json.dumps(req.deleted_flags or {}, ensure_ascii=False)
    now_utc = get_utc_now()

    if not cfg:
        cfg = UserDeviceConfig(
            user_id=uid,
            devices_json=devs_str,
            deleted_flags_json=flags_str,
            updated_at=now_utc
        )
        session.add(cfg)
    else:
        cfg.devices_json = devs_str
        cfg.deleted_flags_json = flags_str
        cfg.updated_at = now_utc
        session.add(cfg)

    session.commit()
    session.refresh(cfg)
    
    logger.info(f"Đã đồng bộ {len(req.devices)} thiết bị cho tài khoản user_id={uid}")
    return {
        "success": True,
        "message": "Đã lưu cấu hình thiết bị thành công",
        "data": {
            "device_count": len(req.devices),
            "updated_at": cfg.updated_at.isoformat()
        }
    }
